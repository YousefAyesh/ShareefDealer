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
  toRestore: string[]
  unchangedIds: string[]
  duplicateKeys: string[]
}

/**
 * Pure diff of feed against database.
 *
 * Rules (spec §4.6):
 *  - unseen source key            -> create
 *  - seen, hash changed           -> update (flag price drops)
 *  - seen, hash identical         -> skip
 *  - in DB as available, absent   -> mark sold
 *  - in DB as sold, present again -> restore (relisting is normal)
 *  - hidden is a manual override  -> never auto-changed
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
