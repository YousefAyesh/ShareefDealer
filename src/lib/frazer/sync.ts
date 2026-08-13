import { checkFeedSanity } from './guards'
import { normalizeVehicle } from './normalize'
import { planReconciliation, type ExistingVehicle } from './reconcile-plan'
import type { CanonicalVehicle, FeedAdapter } from './types'
import type { ReconcileCounts } from './reconcile-apply'
import type { ReconcilePlan } from './reconcile-plan'

/**
 * What the orchestrator needs from a stored row: the planner's projection,
 * plus whether vPIC has already been decoded for it.
 *
 * `hasVinDecode` lives here rather than in `ExistingVehicle` so that
 * reconcile-plan.ts stays a pure feed-vs-database diff with no knowledge of
 * enrichment. Structural typing lets this pass to planReconciliation as-is.
 */
export type ExistingVehicleRow = ExistingVehicle & { hasVinDecode: boolean }

export type SyncDeps = {
  adapter: FeedAdapter
  fetchFeed: () => Promise<string>
  loadExisting: () => Promise<ExistingVehicleRow[]>
  lastGoodCount: () => Promise<number | null>
  applyPlan: (plan: ReconcilePlan) => Promise<ReconcileCounts>
  syncPhotos: (sourceKey: string, urls: string[]) => Promise<number>
  decorateWithVin: (v: CanonicalVehicle) => Promise<CanonicalVehicle>
}

export type SyncResult = {
  status: 'success' | 'aborted' | 'failed'
  vehiclesSeen: number
  created: number
  updated: number
  markedSold: number
  photosProcessed: number
  abortReason: string | null
  errors: string[]
  rawSnapshot: string | null
}

function emptyResult(): SyncResult {
  return {
    status: 'failed', vehiclesSeen: 0, created: 0, updated: 0,
    markedSold: 0, photosProcessed: 0, abortReason: null,
    errors: [], rawSnapshot: null,
  }
}

export async function runSyncCore(deps: SyncDeps): Promise<SyncResult> {
  const result = emptyResult()

  // 1. Fetch and parse. Any failure aborts before any write.
  let raw: string
  try {
    raw = await deps.fetchFeed()
    result.rawSnapshot = raw
  } catch (err) {
    result.status = 'failed'
    result.errors.push(`Feed fetch failed: ${(err as Error).message}`)
    return result
  }

  let parsed
  try {
    parsed = deps.adapter.parse(raw)
  } catch (err) {
    result.status = 'failed'
    result.errors.push(`Feed parse failed: ${(err as Error).message}`)
    return result
  }

  // 2. Normalize. A bad row is skipped, not fatal.
  const canonical: CanonicalVehicle[] = []
  for (const [i, rawVehicle] of parsed.entries()) {
    const normalized = normalizeVehicle(rawVehicle)
    if (!normalized) {
      result.errors.push(`Row ${i}: skipped — no VIN and no stock number`)
      continue
    }
    canonical.push(normalized)
  }

  // 3. Safety guards. Aborting here leaves the database completely untouched —
  //    note this runs BEFORE loadExisting, so an abort reads nothing at all.
  const guard = checkFeedSanity({
    incomingCount: canonical.length,
    lastGoodCount: await deps.lastGoodCount(),
  })
  if (!guard.ok) {
    result.status = 'aborted'
    result.abortReason = guard.reason
    return result
  }

  // 4. Plan against what is stored. Pure — no network, no writes.
  const existing = await deps.loadExisting()
  const plan = planReconciliation(canonical, existing)

  for (const key of plan.duplicateKeys) {
    result.errors.push(`Duplicate source key in feed, kept first row: ${key}`)
  }

  // 5. Enrich only new vehicles, and changed vehicles with no stored decode.
  //    See the header comment on ordering. Never fatal.
  const noStoredDecode = new Set(
    existing.filter((e) => !e.hasVinDecode).map((e) => e.sourceKey),
  )

  const decodeSafely = async (v: CanonicalVehicle): Promise<CanonicalVehicle> => {
    try {
      return await deps.decorateWithVin(v)
    } catch (err) {
      result.errors.push(`VIN decode failed for ${v.sourceKey}: ${(err as Error).message}`)
      return v
    }
  }

  for (let i = 0; i < plan.toCreate.length; i++) {
    plan.toCreate[i] = await decodeSafely(plan.toCreate[i])
  }
  for (const u of plan.toUpdate) {
    if (noStoredDecode.has(u.vehicle.sourceKey)) {
      u.vehicle = await decodeSafely(u.vehicle)
    }
  }

  // 6. Apply.
  const counts = await deps.applyPlan(plan)
  result.created = counts.created
  result.updated = counts.updated
  result.markedSold = counts.markedSold
  result.vehiclesSeen = plan.toCreate.length + plan.toUpdate.length + plan.unchangedIds.length

  // 7. Photos. A failure for one vehicle never fails the run.
  for (const v of canonical) {
    try {
      result.photosProcessed += await deps.syncPhotos(v.sourceKey, v.photoUrls)
    } catch (err) {
      result.errors.push(`Photo sync failed for ${v.sourceKey}: ${(err as Error).message}`)
    }
  }

  result.status = 'success'
  return result
}
