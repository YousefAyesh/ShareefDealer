import { describe, expect, it } from 'vitest'
import { COLOR_FAMILIES, colorFamily } from '@/lib/color'

describe('colorFamily', () => {
  it('resolves real manufacturer marketing names', () => {
    // Every one of these appears in the demo lot; all would otherwise be a
    // facet of exactly one car.
    expect(colorFamily('Ingot Silver')).toBe('Silver')
    expect(colorFamily('Summit White')).toBe('White')
    expect(colorFamily('Black Granite')).toBe('Black')
    expect(colorFamily('Magnetic Gray')).toBe('Gray')
    expect(colorFamily('Fresh Powder White')).toBe('White')
    expect(colorFamily('Celestial Silver')).toBe('Silver')
  })

  it('is case-insensitive, since feeds shout', () => {
    expect(colorFamily('SUMMIT WHITE')).toBe('White')
  })

  it('prefers the more specific family when two keywords collide', () => {
    // "Black Granite" contains both "black" and "granite" (a Gray keyword);
    // Black is listed later but "granite" would otherwise claim it, so the
    // ordering has to be deliberate rather than incidental.
    expect(colorFamily('Black Granite')).toBe('Black')
    expect(colorFamily('Burgundy')).toBe('Red')
    expect(colorFamily('Dark Blue Metallic')).toBe('Blue')
  })

  it('returns null rather than guessing at an unrecognised name', () => {
    expect(colorFamily('Nardo')).toBeNull()
    expect(colorFamily('')).toBeNull()
    expect(colorFamily(null)).toBeNull()
  })

  it('only ever returns a listed family', () => {
    for (const raw of ['Ingot Silver', 'Mocha Steel Metallic', 'Ruby Flare Pearl']) {
      const family = colorFamily(raw)
      if (family) expect(COLOR_FAMILIES).toContain(family)
    }
  })
})
