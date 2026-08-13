import { describe, it, expect } from 'vitest'
import { buildSlug } from '@/lib/slug'

describe('buildSlug', () => {
  it('builds a readable slug from vehicle fields plus a key suffix', () => {
    const slug = buildSlug({
      year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
      sourceKey: '1GCUYDED5KZ123456',
    })
    expect(slug).toBe('2019-chevrolet-silverado-1500-lt-kz123456')
  })

  it('omits missing fields without leaving double dashes', () => {
    const slug = buildSlug({
      year: null, make: 'Honda', model: 'Civic', trim: null, sourceKey: 'STOCK-42',
    })
    expect(slug).toBe('honda-civic-stock-42')
  })

  it('strips punctuation that would break a URL', () => {
    const slug = buildSlug({
      year: 2020, make: 'Mercedes-Benz', model: 'C/300', trim: '4MATIC®',
      sourceKey: 'WDD1234',
    })
    expect(slug).toBe('2020-mercedes-benz-c-300-4matic-wdd1234')
  })

  it('is stable for the same input', () => {
    const input = { year: 2019, make: 'Ford', model: 'F-150', trim: 'XL', sourceKey: 'ABC12345' }
    expect(buildSlug(input)).toBe(buildSlug(input))
  })
})
