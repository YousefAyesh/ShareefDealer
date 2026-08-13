import { desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { syncRuns, vehicles, vehiclePhotos } from '@/db/schema'
import { xmlAdapter } from './xml-adapter'
import { runSyncCore, type SyncDeps, type SyncResult, type ExistingVehicleRow } from './sync'
import { applyReconciliation } from './reconcile-apply'
import { decodeVin, applyVinDecode } from './vin-decode'
import { fetchPhoto, planPhotoSync, uploadVariants } from './photo-store'
import { processPhoto } from './photos'
import type { CanonicalVehicle } from './types'

const FEED_TIMEOUT_MS = 30000
const FEED_RETRIES = 3

async function fetchFeedWithRetry(): Promise<string> {
  const url = process.env.FRAZER_FEED_URL
  if (!url) throw new Error('FRAZER_FEED_URL is not set')

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= FEED_RETRIES; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err as Error
      if (attempt < FEED_RETRIES) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000))
      }
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError ?? new Error('Feed fetch failed')
}

/** Includes hasVinDecode and photoCount so the orchestrator can gate
 *  enrichment and photo work instead of doing them for every vehicle. */
async function loadExisting(): Promise<ExistingVehicleRow[]> {
  const rows = await db.select({
    id: vehicles.id,
    sourceKey: vehicles.sourceKey,
    sourceHash: vehicles.sourceHash,
    status: vehicles.status,
    priceCents: vehicles.priceCents,
    vinDecoded: vehicles.vinDecoded,
    photoCount: sql<number>`(
      select count(*)::int from ${vehiclePhotos}
      where ${vehiclePhotos.vehicleId} = ${vehicles.id}
    )`,
  }).from(vehicles)

  return rows.map(({ vinDecoded, ...row }) => ({
    ...row,
    hasVinDecode: vinDecoded !== null,
  })) as ExistingVehicleRow[]
}

async function lastGoodCount(): Promise<number | null> {
  const [run] = await db.select({ count: syncRuns.vehiclesSeen })
    .from(syncRuns)
    .where(eq(syncRuns.status, 'success'))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
  return run?.count ?? null
}

/**
 * Decodes one vehicle. Callers decide WHETHER to call this — the orchestrator
 * gates on hasVinDecode so vPIC is hit only for new arrivals and changed
 * vehicles never successfully decoded. Do not call this in a loop over the
 * whole feed: that is ~28,800 requests/day against a free government API.
 */
async function decorateWithVin(v: CanonicalVehicle): Promise<CanonicalVehicle> {
  if (!v.vin) return v
  const decoded = await decodeVin(v.vin)
  if (!decoded) return v
  return { ...applyVinDecode(v, decoded), vinDecoded: decoded }
}

async function syncPhotos(sourceKey: string, urls: string[]): Promise<number> {
  const [vehicle] = await db.select({
    id: vehicles.id, year: vehicles.year, make: vehicles.make, model: vehicles.model,
  }).from(vehicles).where(eq(vehicles.sourceKey, sourceKey)).limit(1)
  if (!vehicle) return 0

  const stored = await db.select({
    id: vehiclePhotos.id,
    sourceUrl: vehiclePhotos.sourceUrl,
    position: vehiclePhotos.position,
  }).from(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, vehicle.id))

  const plan = planPhotoSync(urls, stored)
  const alt = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle photo'
  let processed = 0

  for (const item of plan.toFetch) {
    const buf = await fetchPhoto(item.url)
    if (!buf) continue                       // keep going; retried next run

    // fetchPhoto does not validate content type, so an HTML error page served
    // with HTTP 200 arrives here as a "successful" download. processPhoto
    // throws on it. Treat that exactly like a fetch failure — keep whatever
    // we have and retry next run — or "degrade, never blank" breaks.
    let photo
    try {
      photo = await processPhoto(buf)
    } catch {
      continue
    }

    const uploaded = await uploadVariants(photo)
    await db.insert(vehiclePhotos).values({
      vehicleId: vehicle.id,
      position: item.position,
      contentHash: photo.contentHash,
      sourceUrl: item.url,
      urlThumb: uploaded.thumb,
      urlCard: uploaded.card,
      urlFull: uploaded.full,
      width: photo.width,
      height: photo.height,
      alt,
    }).onConflictDoNothing()
    processed++
  }

  for (const r of plan.toReposition) {
    await db.update(vehiclePhotos).set({ position: r.position }).where(eq(vehiclePhotos.id, r.id))
  }

  if (plan.toDelete.length > 0) {
    await db.delete(vehiclePhotos).where(inArray(vehiclePhotos.id, plan.toDelete))
  }

  return processed
}

export function liveDeps(): SyncDeps {
  return {
    adapter: xmlAdapter,
    fetchFeed: fetchFeedWithRetry,
    loadExisting,
    lastGoodCount,
    applyPlan: applyReconciliation,
    syncPhotos,
    decorateWithVin,
  }
}

/** Runs a sync and records it in sync_runs, whatever the outcome. */
export async function runSyncAndRecord(source: 'xml_feed' | 'manual'): Promise<SyncResult> {
  const [run] = await db.insert(syncRuns)
    .values({ source, status: 'running' })
    .returning({ id: syncRuns.id })

  let result: SyncResult
  try {
    result = await runSyncCore(liveDeps())
  } catch (err) {
    result = {
      status: 'failed', vehiclesSeen: 0, created: 0, updated: 0, markedSold: 0,
      photosProcessed: 0, abortReason: null,
      errors: [`Unhandled: ${(err as Error).message}`], rawSnapshot: null,
    }
  }

  await db.update(syncRuns).set({
    status: result.status,
    finishedAt: new Date(),
    vehiclesSeen: result.vehiclesSeen,
    created: result.created,
    updated: result.updated,
    markedSold: result.markedSold,
    photosProcessed: result.photosProcessed,
    abortReason: result.abortReason,
    errors: result.errors,
  }).where(eq(syncRuns.id, run.id))

  return result
}
