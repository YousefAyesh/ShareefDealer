import { checkFeedSanity } from './guards'
import { normalizeVehicle } from './normalize'
import { planReconciliation, type ExistingVehicle } from './reconcile-plan'
import { buildSlug } from '@/lib/slug'
import type { CanonicalVehicle, FeedAdapter } from './types'
import type { ReconcileCounts } from './reconcile-apply'
import type { ReconcilePlan } from './reconcile-plan'

/**
 * Frazer permits duplicate VINs in the feed (a mis-scanned or reused VIN),
 * but each row can still be a distinct physical car with its own stock
 * number. Per spec §6.1, identity is VIN when present AND unique in the
 * feed; when a VIN repeats, every row sharing it that has a usable stock
 * number falls back to being keyed on that stock number instead, so both
 * cars survive under distinct identities rather than one silently vanishing
 * as a "duplicate". A row sharing the VIN with NO stock number has no
 * alternative identity available and is left as-is — planReconciliation
 * will drop all but the first row per source key and report the rest in
 * `duplicateKeys`.
 *
 * `sourceHash` is deliberately left untouched by re-keying: it fingerprints
 * feed content, and which identity we chose to key on is our decision, not
 * something the feed did. The `slug` DOES need to be rebuilt, since it's
 * derived from `sourceKey`.
 */
export function resolveDuplicateVins(canonical: CanonicalVehicle[]): CanonicalVehicle[] {
  const vinCounts = new Map<string, number>()
  for (const v of canonical) {
    if (v.sourceKeyType !== 'vin') continue
    vinCounts.set(v.sourceKey, (vinCounts.get(v.sourceKey) ?? 0) + 1)
  }

  return canonical.map((v) => {
    if (v.sourceKeyType !== 'vin') return v
    if ((vinCounts.get(v.sourceKey) ?? 0) <= 1) return v
    if (!v.stockNumber) return v // no usable alternative identity; left for the planner to drop

    return {
      ...v,
      sourceKey: v.stockNumber,
      sourceKeyType: 'stock',
      slug: buildSlug({
        year: v.year, make: v.make, model: v.model, trim: v.trim, sourceKey: v.stockNumber,
      }),
    }
  })
}

/**
 * What the orchestrator needs from a stored row: the planner's projection,
 * plus whether vPIC has already been decoded for it.
 *
 * `hasVinDecode` lives here rather than in `ExistingVehicle` so that
 * reconcile-plan.ts stays a pure feed-vs-database diff with no knowledge of
 * enrichment. Structural typing lets this pass to planReconciliation as-is.
 */
export type ExistingVehicleRow = ExistingVehicle & {
  hasVinDecode: boolean
  /** Count of photo rows currently stored for this vehicle. See step 7 below. */
  photoCount: number
}

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
  /** Vehicles whose photo work was skipped this run because the photo
   *  budget was exhausted. See PHOTO_BUDGET_PER_RUN. Not a failure -- these
   *  are picked up automatically next run via the changed-or-incomplete gate. */
  photosDeferred: number
  abortReason: string | null
  errors: string[]
  rawSnapshot: string | null
}

function emptyResult(): SyncResult {
  return {
    status: 'failed', vehiclesSeen: 0, created: 0, updated: 0,
    markedSold: 0, photosProcessed: 0, photosDeferred: 0, abortReason: null,
    errors: [], rawSnapshot: null,
  }
}

/**
 * Ceiling on photos processed (downloaded, EXIF-corrected, resized to 3
 * variants, WebP-encoded, uploaded) in a single invocation.
 *
 * maxDuration is 300s. Serial photo work runs roughly 1.5s/photo (download
 * + processing + blob upload), so 40 photos costs ~60s, leaving ~240s of
 * headroom for the feed fetch, VIN decode calls, and the reconciliation
 * transaction -- comfortable margin against a hard kill. An initial
 * backfill of ~300 vehicles x ~10 photos exceeds this many times over in a
 * single run; the excess is deferred to subsequent runs rather than
 * chasing a serial pipeline that would otherwise run ~75 minutes and get
 * killed mid-transaction. See FIX 4 in the review notes.
 */
export const PHOTO_BUDGET_PER_RUN = 40

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
  const normalized: CanonicalVehicle[] = []
  for (const [i, rawVehicle] of parsed.entries()) {
    const n = normalizeVehicle(rawVehicle)
    if (!n) {
      result.errors.push(`Row ${i}: skipped — no VIN and no stock number`)
      continue
    }
    normalized.push(n)
  }

  // 2b. Re-key vehicles that share a VIN with another row onto their stock
  //     number, per spec §6.1 (VIN is identity only when unique in the
  //     feed). Must run before the guard and the planner, both of which key
  //     off sourceKey. See resolveDuplicateVins for the full rationale.
  const canonical = resolveDuplicateVins(normalized)

  // 3. Safety guards. Aborting here leaves the database completely untouched —
  //    note this runs BEFORE loadExisting, so an abort reads nothing at all.
  //
  //    incomingCount MUST be the count of DISTINCT source keys, not
  //    canonical.length. lastGoodCount reads syncRuns.vehiclesSeen from the
  //    last successful run, which is computed AFTER duplicate removal (see
  //    step 6 below). Comparing a raw, duplicate-inflated row count against
  //    a deduped baseline understates shrink — duplicates can never make
  //    the apparent count look smaller, only bigger — so a real collapse
  //    (100 -> 55 vehicles) hidden behind a feed glitch that lists survivors
  //    twice (~110 raw rows) would sail through the guard it exists to be
  //    caught by. Keep both sides of this comparison in the same unit.
  const uniqueIncoming = new Set(canonical.map((v) => v.sourceKey)).size
  const guard = checkFeedSanity({
    incomingCount: uniqueIncoming,
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

  // 7. Photos. Sync only vehicles that need it, never the whole feed every
  //    run — each syncPhotos call costs a DB lookup of the vehicle plus its
  //    stored photos before planPhotoSync can even tell nothing changed, and
  //    at 300 vehicles x 96 runs/day that's tens of thousands of queries to
  //    learn nothing. A vehicle needs its photos synced when EITHER:
  //
  //      (a) it is new or changed (toCreate / toUpdate), OR
  //      (b) it is unchanged but its stored photo count is behind what the
  //          feed lists for it — a previous photo download failed.
  //
  //    Neither half alone is sufficient:
  //      - "(a) only" misses the retry case. `photoUrls` is part of the
  //        hashed field set, so a vehicle whose download failed has an
  //        UNCHANGED hash next run (the feed didn't change, only our copy
  //        is incomplete) and would be skipped forever under (a) alone. A
  //        vehicle with too few photos is excluded from listing pages by
  //        the minimum-photo rule, so "never retried" means a car that
  //        silently never appears on the site — the exact "blank instead
  //        of degraded" failure this pipeline exists to avoid.
  //      - "(b) only" would mean re-checking photoCount against the feed
  //        for every unchanged vehicle every run — the same per-run
  //        DB-hammering problem this gating exists to eliminate, just
  //        moved from vPIC to Postgres.
  //
  //    Do not simplify this to "only changed vehicles" — that reintroduces
  //    the never-retry bug.
  const canonicalByKey = new Map(canonical.map((v) => [v.sourceKey, v]))

  const needsPhotoSync = new Set<string>([
    ...plan.toCreate.map((v) => v.sourceKey),
    ...plan.toUpdate.map((u) => u.vehicle.sourceKey),
  ])

  for (const e of existing) {
    if (needsPhotoSync.has(e.sourceKey)) continue // already covered by (a)
    const feedVehicle = canonicalByKey.get(e.sourceKey)
    if (!feedVehicle) continue // no longer in the feed; nothing to sync
    if (e.photoCount < feedVehicle.photoUrls.length) {
      needsPhotoSync.add(e.sourceKey)
    }
  }

  // A failure for one vehicle never fails the run. Once PHOTO_BUDGET_PER_RUN
  // is reached, remaining vehicles are deferred rather than started -- this
  // is what keeps a large backfill from running serially for over an hour
  // and getting hard-killed mid-invocation. See PHOTO_BUDGET_PER_RUN above.
  let budgetExhausted = false
  for (const v of canonical) {
    if (!needsPhotoSync.has(v.sourceKey)) continue
    if (budgetExhausted) {
      result.photosDeferred++
      continue
    }
    try {
      result.photosProcessed += await deps.syncPhotos(v.sourceKey, v.photoUrls)
    } catch (err) {
      result.errors.push(`Photo sync failed for ${v.sourceKey}: ${(err as Error).message}`)
    }
    if (result.photosProcessed >= PHOTO_BUDGET_PER_RUN) {
      budgetExhausted = true
    }
  }

  if (result.photosDeferred > 0) {
    result.errors.push(
      `Photo budget reached; ${result.photosDeferred} vehicles deferred to the next run`,
    )
  }

  // Deferral is normal operation during backfill, not a failure -- the run
  // still completes successfully even when photo work was capped.
  result.status = 'success'
  return result
}
