import type { CanonicalVehicle } from './types'

export type VehicleStatus = 'available' | 'sold' | 'hidden'

/** The minimal projection of a DB row the planner needs. */
export type ExistingVehicle = {
  id: string
  sourceKey: string
  sourceHash: string
  status: VehicleStatus
  priceCents: number | null
}

export type VehicleUpdate = {
  existingId: string
  vehicle: CanonicalVehicle
  priceReduced: boolean
}

export type ReconcilePlan = {
  toCreate: CanonicalVehicle[]
  toUpdate: VehicleUpdate[]
  toMarkSold: string[]
  /**
   * IDs whose status must be flipped from 'sold' back to 'available'.
   * Authoritative for STATUS. An id can appear here AND in `unchangedIds`
   * at the same time — see the note on `unchangedIds` below. A consumer
   * must apply every id in `toRestore` regardless of whether it also shows
   * up in `unchangedIds`, or a relisted vehicle stays stuck as sold.
   */
  toRestore: string[]
  /**
   * IDs whose CONTENT columns (price, mileage, photos, etc.) do not need
   * rewriting because the source hash is unchanged. This says nothing
   * about status. `toRestore` and `unchangedIds` are orthogonal axes
   * (status vs. content) and routinely overlap: a sold vehicle that
   * reappears in the feed with an identical hash lands in BOTH lists —
   * its content is unchanged, but its status still must move from 'sold'
   * to 'available'. Do NOT treat membership here as "skip this row
   * entirely"; only skip the content update, never the status change.
   */
  unchangedIds: string[]
  duplicateKeys: string[]
}

/**
 * Pure diff of feed against database.
 *
 * Rules (spec §4.6):
 *  - unseen source key            -> create
 *  - seen, hash changed           -> update (flag price drops)
 *  - seen, hash identical         -> content skip (see below — not a full skip)
 *  - in DB as available, absent   -> mark sold
 *  - in DB as sold, present again -> restore (relisting is normal)
 *  - hidden is a manual override  -> never auto-changed
 *
 * IMPORTANT — `toRestore` and `unchangedIds` are NOT mutually exclusive.
 * "seen, hash identical -> skip" only means the CONTENT columns don't need
 * rewriting; it says nothing about status. A sold vehicle that reappears
 * in the feed with an unchanged hash is pushed onto BOTH `toRestore` (its
 * status must move from 'sold' to 'available') and `unchangedIds` (its
 * content columns don't need rewriting). Callers must apply `toRestore`
 * unconditionally — treating `unchangedIds` as "ignore this row" leaves a
 * relisted vehicle stuck at status 'sold' forever, invisible on the site
 * despite being back on the lot.
 */
export function planReconciliation(
  incoming: CanonicalVehicle[],
  existing: ExistingVehicle[],
): ReconcilePlan {
  const existingByKey = new Map(existing.map((e) => [e.sourceKey, e]))

  const plan: ReconcilePlan = {
    toCreate: [], toUpdate: [], toMarkSold: [],
    toRestore: [], unchangedIds: [], duplicateKeys: [],
  }

  const seenKeys = new Set<string>()

  for (const v of incoming) {
    if (seenKeys.has(v.sourceKey)) {
      // Frazer permits duplicate VINs. First row wins; the rest are reported.
      if (!plan.duplicateKeys.includes(v.sourceKey)) plan.duplicateKeys.push(v.sourceKey)
      continue
    }
    seenKeys.add(v.sourceKey)

    const match = existingByKey.get(v.sourceKey)

    if (!match) {
      plan.toCreate.push(v)
      continue
    }

    if (match.status === 'sold') plan.toRestore.push(match.id)

    if (match.sourceHash === v.sourceHash) {
      plan.unchangedIds.push(match.id)
      continue
    }

    plan.toUpdate.push({
      existingId: match.id,
      vehicle: v,
      priceReduced:
        match.priceCents !== null &&
        v.priceCents !== null &&
        v.priceCents < match.priceCents,
    })
  }

  for (const e of existing) {
    if (seenKeys.has(e.sourceKey)) continue
    if (e.status === 'available') plan.toMarkSold.push(e.id)
  }

  return plan
}
