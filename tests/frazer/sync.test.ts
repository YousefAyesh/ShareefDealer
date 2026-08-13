import { describe, it, expect, vi } from 'vitest'
import { runSyncCore, resolveDuplicateVins } from '@/lib/frazer/sync'
import { xmlAdapter } from '@/lib/frazer/xml-adapter'
import { normalizeVehicle } from '@/lib/frazer/normalize'
import type { CanonicalVehicle } from '@/lib/frazer/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function canonicalVehicle(over: Partial<CanonicalVehicle> = {}): CanonicalVehicle {
  return {
    sourceKey: 'VIN1', sourceKeyType: 'vin', vin: 'VIN1', stockNumber: 'A1',
    slug: 'car-vin1', year: 2019, make: 'Honda', model: 'Civic', trim: 'LX',
    bodyStyle: null, drivetrain: null, transmission: null, engine: null,
    fuelType: null, doors: null, exteriorColor: null, interiorColor: null,
    mileage: 60000, priceCents: 1699500, downPaymentCents: null,
    weeklyPaymentCents: null, description: null, features: [], photoUrls: [],
    sourceHash: 'hash-a', ...over,
  }
}

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/frazer', name), 'utf-8')

/** The canonical vehicles normal.xml actually produces, for building matching DB rows. */
function canonicalFromNormal() {
  return xmlAdapter.parse(fixture('normal.xml'))
    .map(normalizeVehicle)
    .filter((v): v is NonNullable<typeof v> => v !== null)
}

function rowsMatching(opts: { hasVinDecode: boolean }) {
  return canonicalFromNormal().map((v, i) => ({
    id: `id-${i}`,
    sourceKey: v.sourceKey,
    sourceHash: v.sourceHash,
    status: 'available' as const,
    priceCents: v.priceCents,
    hasVinDecode: opts.hasVinDecode,
    photoCount: v.photoUrls.length,
  }))
}

function rowsStale(opts: { hasVinDecode: boolean }) {
  return rowsMatching(opts).map((r) => ({ ...r, sourceHash: 'stale-hash' }))
}

function deps(over: Partial<Parameters<typeof runSyncCore>[0]> = {}) {
  return {
    adapter: xmlAdapter,
    fetchFeed: vi.fn().mockResolvedValue(fixture('normal.xml')),
    loadExisting: vi.fn().mockResolvedValue([]),
    lastGoodCount: vi.fn().mockResolvedValue(null),
    applyPlan: vi.fn().mockResolvedValue({ created: 3, updated: 0, markedSold: 0, restored: 0 }),
    syncPhotos: vi.fn().mockResolvedValue(4),
    decorateWithVin: vi.fn().mockImplementation(async (v) => v),
    ...over,
  }
}

describe('runSyncCore', () => {
  it('completes successfully on a healthy feed', async () => {
    const d = deps()
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.vehiclesSeen).toBe(3)
    expect(result.created).toBe(3)
    expect(d.applyPlan).toHaveBeenCalledOnce()
  })

  it('aborts without writing when the feed is empty', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('empty.xml')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toMatch(/empty/i)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('aborts without writing when the feed shrank catastrophically', async () => {
    const d = deps({ lastGoodCount: vi.fn().mockResolvedValue(40) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toMatch(/shrank/i)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('aborts on a catastrophic shrink even when every row in the feed is duplicated — the guard must compare deduped counts, not raw row counts', async () => {
    // duplicated.xml lists 3 distinct VINs, each repeated twice (6 raw rows).
    // Real (deduped) shrink from a lastGoodCount of 5 is (5-3)/5 = 40%, at
    // the abort threshold. Comparing against the raw row count of 6 instead
    // would look like growth and wrongly let this through.
    const d = deps({
      fetchFeed: vi.fn().mockResolvedValue(fixture('duplicated.xml')),
      lastGoodCount: vi.fn().mockResolvedValue(5),
    })
    const result = await runSyncCore(d)
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toMatch(/shrank/i)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('does not read the database before the guards pass', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('empty.xml')) })
    await runSyncCore(d)
    expect(d.loadExisting).not.toHaveBeenCalled()
  })

  it('fails without writing when the feed is unreachable', async () => {
    const d = deps({ fetchFeed: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('failed')
    expect(result.errors[0]).toMatch(/ETIMEDOUT/)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('fails without writing when the XML is malformed', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue('<Inventory><Vehicle>') })
    const result = await runSyncCore(d)
    expect(result.status).toBe('failed')
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('resolves a duplicate VIN via stock number so all rows with a usable identity survive', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('dirty.xml')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    // dirty.xml has 3 rows: one with no VIN (falls back to stock number
    // W-77), and two sharing VIN 3N1AB7AP0FY123456 but with distinct stock
    // numbers A1050/A1051. resolveDuplicateVins re-keys the latter two onto
    // their stock numbers, so all three have a usable, distinct identity —
    // none is dropped as a duplicate.
    expect(result.vehiclesSeen).toBe(3)
    expect(result.created).toBe(3)
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(false)
  })

  it('continues the run when photo syncing throws for one vehicle', async () => {
    const d = deps({
      syncPhotos: vi.fn()
        .mockRejectedValueOnce(new Error('blob down'))
        .mockResolvedValue(2),
    })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.errors.some((e) => /blob down/.test(e))).toBe(true)
  })

  it('decodes VINs for brand new vehicles', async () => {
    const d = deps()
    await runSyncCore(d)
    expect(d.decorateWithVin).toHaveBeenCalledTimes(3)
  })

  it('does not decode unchanged vehicles — vPIC is a free API we must not hammer', async () => {
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rowsMatching({ hasVinDecode: false })) })
    await runSyncCore(d)
    expect(d.decorateWithVin).not.toHaveBeenCalled()
  })

  it('decodes a changed vehicle that has no stored decode', async () => {
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rowsStale({ hasVinDecode: false })) })
    await runSyncCore(d)
    expect(d.decorateWithVin).toHaveBeenCalledTimes(3)
  })

  it('does not re-decode a changed vehicle that already has a stored decode', async () => {
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rowsStale({ hasVinDecode: true })) })
    await runSyncCore(d)
    expect(d.decorateWithVin).not.toHaveBeenCalled()
  })

  it('does not fail the run when VIN decoding throws', async () => {
    const d = deps({ decorateWithVin: vi.fn().mockRejectedValue(new Error('vpic down')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.errors.some((e) => /vpic down/.test(e))).toBe(true)
  })

  it('syncs photos for new vehicles', async () => {
    const d = deps() // loadExisting is empty, so all 3 feed vehicles are new
    await runSyncCore(d)
    expect(d.syncPhotos).toHaveBeenCalledTimes(3)
  })

  it('syncs photos for changed vehicles', async () => {
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rowsStale({ hasVinDecode: true })) })
    await runSyncCore(d)
    expect(d.syncPhotos).toHaveBeenCalledTimes(3)
  })

  it('does not sync photos for unchanged vehicles whose stored photo count matches the feed — including a vehicle with zero feed photos', async () => {
    // rowsMatching derives photoCount from each vehicle's real photoUrls.length,
    // so this covers A1044 (0 feed photos, 0 stored) as well as A1042/A1043.
    // 0 < 0 is false, so a zero-photo vehicle must fall out as "complete", not
    // be mistaken for "incomplete" and retried forever.
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rowsMatching({ hasVinDecode: true })) })
    await runSyncCore(d)
    expect(d.syncPhotos).not.toHaveBeenCalled()
  })

  it('retries photo sync for an unchanged vehicle with fewer stored photos than the feed lists', async () => {
    const rows = rowsMatching({ hasVinDecode: true })
    // A1042 (index 0) lists 2 photos in the feed; simulate only 1 having made it to storage.
    const incomplete = rows[0]
    rows[0] = { ...incomplete, photoCount: incomplete.photoCount - 1 }
    const d = deps({ loadExisting: vi.fn().mockResolvedValue(rows) })
    await runSyncCore(d)
    expect(d.syncPhotos).toHaveBeenCalledTimes(1)
    expect(d.syncPhotos).toHaveBeenCalledWith(incomplete.sourceKey, expect.any(Array))
  })

  it('stops processing photos once the per-run budget is exhausted and reports how many vehicles were deferred', async () => {
    // normal.xml has 3 vehicles, all new (need photo sync). Each syncPhotos
    // call "processes" 20 photos, so vehicle 1 brings the running total to
    // 20 (under the 40 budget, keep going), vehicle 2 brings it to 40 (at
    // the budget, stop), and vehicle 3 must be deferred rather than synced.
    const d = deps({ syncPhotos: vi.fn().mockResolvedValue(20) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(d.syncPhotos).toHaveBeenCalledTimes(2)
    expect(result.photosDeferred).toBe(1)
    expect(result.errors.some((e) => /budget/i.test(e) && /1/.test(e))).toBe(true)
  })

  it('defers nothing when photo work is under the budget', async () => {
    const d = deps() // default mock processes 4 photos/call across 3 vehicles = 12, well under 40
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.photosDeferred).toBe(0)
    expect(result.errors.some((e) => /budget/i.test(e))).toBe(false)
  })
})

describe('resolveDuplicateVins', () => {
  it('re-keys two vehicles sharing a VIN to their distinct stock numbers so both survive', () => {
    const a = canonicalVehicle({
      sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1050',
      slug: 'nissan-sentra-vin1050',
    })
    const b = canonicalVehicle({
      sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1051',
      slug: 'nissan-sentra-vin1051',
    })

    const [resolvedA, resolvedB] = resolveDuplicateVins([a, b])

    expect(resolvedA.sourceKey).toBe('A1050')
    expect(resolvedA.sourceKeyType).toBe('stock')
    expect(resolvedB.sourceKey).toBe('A1051')
    expect(resolvedB.sourceKeyType).toBe('stock')
    expect(resolvedA.sourceKey).not.toBe(resolvedB.sourceKey)
    expect(resolvedA.slug).not.toBe(resolvedB.slug)
  })

  it('keeps the VIN populated on a re-keyed vehicle even though it is no longer the identity', () => {
    const a = canonicalVehicle({ sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1050' })
    const b = canonicalVehicle({ sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1051' })

    const [resolvedA] = resolveDuplicateVins([a, b])

    expect(resolvedA.vin).toBe('SHAREDVIN')
  })

  it('does not change sourceHash when re-keying — it fingerprints feed content, not our identity decision', () => {
    const a = canonicalVehicle({
      sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1050',
      sourceHash: 'original-hash-a',
    })
    const b = canonicalVehicle({
      sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1051',
      sourceHash: 'original-hash-b',
    })

    const [resolvedA, resolvedB] = resolveDuplicateVins([a, b])

    expect(resolvedA.sourceHash).toBe('original-hash-a')
    expect(resolvedB.sourceHash).toBe('original-hash-b')
  })

  it('leaves a vehicle with a duplicate VIN and no stock number unchanged, for the planner to drop', () => {
    const a = canonicalVehicle({ sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: 'A1050' })
    const b = canonicalVehicle({ sourceKey: 'SHAREDVIN', sourceKeyType: 'vin', vin: 'SHAREDVIN', stockNumber: null })

    const [resolvedA, resolvedB] = resolveDuplicateVins([a, b])

    expect(resolvedA.sourceKey).toBe('A1050')
    expect(resolvedB.sourceKey).toBe('SHAREDVIN')
    expect(resolvedB.sourceKeyType).toBe('vin')
  })

  it('passes a feed with no duplicate VINs through untouched', () => {
    const a = canonicalVehicle({ sourceKey: 'VIN-A', sourceKeyType: 'vin', vin: 'VIN-A', stockNumber: 'S1' })
    const b = canonicalVehicle({ sourceKey: 'VIN-B', sourceKeyType: 'vin', vin: 'VIN-B', stockNumber: 'S2' })
    const c = canonicalVehicle({ sourceKey: 'S3', sourceKeyType: 'stock', vin: null, stockNumber: 'S3' })

    const resolved = resolveDuplicateVins([a, b, c])

    expect(resolved).toEqual([a, b, c])
  })
})
