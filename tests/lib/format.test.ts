import { describe, expect, it } from 'vitest'
import { formatMileage, formatPrice, vehicleTitle } from '@/lib/format'

describe('formatPrice', () => {
  it('formats whole-dollar prices with thousands separators', () => {
    expect(formatPrice(1699500)).toBe('$16,995')
  })

  it('rounds to the nearest dollar', () => {
    expect(formatPrice(999)).toBe('$10')
  })

  it('renders "Call for Price" for null', () => {
    expect(formatPrice(null)).toBe('Call for Price')
  })

  it('renders "Call for Price" for undefined', () => {
    expect(formatPrice(undefined)).toBe('Call for Price')
  })

  it('never renders $0 for a zero price -- treats it like missing', () => {
    expect(formatPrice(0)).toBe('Call for Price')
  })
})

describe('formatMileage', () => {
  it('formats mileage with thousands separators and a unit', () => {
    expect(formatMileage(78450)).toBe('78,450 miles')
  })

  it('renders a fallback message for null', () => {
    expect(formatMileage(null)).toBe('Mileage unavailable')
  })

  it('renders a fallback message for undefined', () => {
    expect(formatMileage(undefined)).toBe('Mileage unavailable')
  })

  it('formats zero mileage as a real value, not a fallback', () => {
    expect(formatMileage(0)).toBe('0 miles')
  })
})

describe('vehicleTitle', () => {
  it('joins year, make, model, trim', () => {
    expect(
      vehicleTitle({ year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT' }),
    ).toBe('2019 Chevrolet Silverado 1500 LT')
  })

  it('drops a null trim gracefully', () => {
    expect(vehicleTitle({ year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: null })).toBe(
      '2019 Chevrolet Silverado 1500',
    )
  })

  it('drops a null year gracefully', () => {
    expect(vehicleTitle({ year: null, make: 'Honda', model: 'Civic', trim: 'LX' })).toBe(
      'Honda Civic LX',
    )
  })

  it('drops multiple nulls gracefully', () => {
    expect(vehicleTitle({ year: null, make: 'Honda', model: null, trim: null })).toBe('Honda')
  })

  it('returns an empty string when everything is null', () => {
    expect(vehicleTitle({ year: null, make: null, model: null, trim: null })).toBe('')
  })
})
