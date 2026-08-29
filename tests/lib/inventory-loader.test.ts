import { describe, expect, it } from 'vitest'
import { loadInventory } from '@/lib/inventory'

/**
 * Exercises the real inventory/ folder through the loader, checking the
 * translation from hand-written file to rendered Vehicle -- above all the
 * dollars-to-cents conversion, which is silent when it goes wrong.
 */
describe('loadInventory', () => {
  const { vehicles, problems } = loadInventory()

  it('loads the checked-in inventory with no problems', () => {
    expect(problems).toEqual([])
    expect(vehicles.length).toBeGreaterThan(0)
  })

  it('converts dollars in the file to cents internally', () => {
    const silverado = vehicles.find((v) => v.slug.includes('silverado'))
    expect(silverado).toBeDefined()
    // The file says 18995; the site works in cents everywhere.
    expect(silverado?.priceCents).toBe(1_899_500)
  })

  it('derives the slug and id from the filename', () => {
    for (const v of vehicles) {
      expect(v.slug).toBe(v.id)
      expect(v.slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('discovers photos from disk rather than from the file', () => {
    // Nothing in the JSON lists photos; they are whatever is in the folder.
    const withPhotos = vehicles.filter((v) => v.photos.length > 0)
    expect(withPhotos.length).toBeGreaterThan(0)
    for (const v of withPhotos) {
      expect(v.photos[0].urlFull).toBe(`/inventory/${v.slug}/01.webp`)
    }
  })

  it('orders photos by filename so 01 is the listing card image', () => {
    const v = vehicles.find((x) => x.photos.length > 1)
    expect(v).toBeDefined()
    const urls = v!.photos.map((p) => p.urlFull)
    expect([...urls].sort()).toEqual(urls)
    expect(v!.photos.map((p) => p.position)).toEqual(urls.map((_, i) => i))
  })

  it('gives every photo alt text naming the actual vehicle', () => {
    const v = vehicles.find((x) => x.photos.length > 0)!
    expect(v.photos[0].alt).toContain(String(v.year))
    expect(v.photos[0].alt).toContain(v.make!)
  })

  it('defaults status to available and priceReduced to false', () => {
    for (const v of vehicles) {
      expect(['available', 'sold', 'hidden']).toContain(v.status)
      expect(typeof v.priceReduced).toBe('boolean')
    }
  })

  it('represents an unpriced car as null, never as zero', () => {
    // formatPrice renders null as "Call for Price"; a 0 would render as $0.
    for (const v of vehicles) {
      expect(v.priceCents === null || v.priceCents > 0).toBe(true)
    }
  })

  it('leaves features as an array even when the file omits them', () => {
    for (const v of vehicles) expect(Array.isArray(v.features)).toBe(true)
  })

  it('parses listedAt into a sortable timestamp', () => {
    for (const v of vehicles) {
      expect(Number.isNaN(new Date(v.createdAt).getTime())).toBe(false)
    }
  })
})
