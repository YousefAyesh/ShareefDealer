import { describe, it, expect, vi } from 'vitest'
import { runSyncCore } from '@/lib/frazer/sync'
import { xmlAdapter } from '@/lib/frazer/xml-adapter'
import { normalizeVehicle } from '@/lib/frazer/normalize'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

  it('skips unusable rows and completes the run', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('dirty.xml')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    // dirty.xml has 3 rows; two share a VIN, so one is dropped as a duplicate
    expect(result.vehiclesSeen).toBe(2)
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true)
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
})
