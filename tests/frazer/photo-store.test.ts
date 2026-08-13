import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPhoto, planPhotoSync } from '@/lib/frazer/photo-store'

afterEach(() => vi.unstubAllGlobals())

describe('fetchPhoto', () => {
  it('returns a buffer on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new TextEncoder().encode('imagebytes').buffer,
    }))
    const buf = await fetchPhoto('https://example.com/a.jpg')
    expect(buf?.toString()).toBe('imagebytes')
  })

  it('returns null on a 404 instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await fetchPhoto('https://example.com/missing.jpg')).toBeNull()
  })

  it('returns null when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    expect(await fetchPhoto('https://example.com/a.jpg')).toBeNull()
  })
})

describe('planPhotoSync', () => {
  it('downloads every photo for a vehicle with none stored', () => {
    const plan = planPhotoSync(['u1', 'u2'], [])
    expect(plan.toFetch).toEqual([
      { url: 'u1', position: 0 },
      { url: 'u2', position: 1 },
    ])
    expect(plan.toDelete).toEqual([])
  })

  it('skips a URL already stored at the same position', () => {
    const plan = planPhotoSync(['u1', 'u2'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
    ])
    expect(plan.toFetch).toEqual([{ url: 'u2', position: 1 }])
    expect(plan.toDelete).toEqual([])
  })

  it('re-fetches a photo whose position changed, because position 0 is the hero', () => {
    const plan = planPhotoSync(['u2', 'u1'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
      { id: 'p2', sourceUrl: 'u2', position: 1 },
    ])
    expect(plan.toReposition).toEqual([
      { id: 'p2', position: 0 },
      { id: 'p1', position: 1 },
    ])
    expect(plan.toFetch).toEqual([])
  })

  it('deletes a stored photo no longer in the feed', () => {
    const plan = planPhotoSync(['u1'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
      { id: 'p2', sourceUrl: 'u2', position: 1 },
    ])
    expect(plan.toDelete).toEqual(['p2'])
  })

  it('never deletes everything when the feed lists no photos', () => {
    // A vehicle losing all photos is far more likely to be a feed glitch
    // than a real edit. Keep what we have.
    const plan = planPhotoSync([], [{ id: 'p1', sourceUrl: 'u1', position: 0 }])
    expect(plan.toDelete).toEqual([])
    expect(plan.toFetch).toEqual([])
  })
})
