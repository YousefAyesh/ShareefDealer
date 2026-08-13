import { describe, it, expect } from 'vitest'
import { normalizeVehicle, parseMoneyCents, parseIntSafe, titleCase } from '@/lib/frazer/normalize'
import type { RawVehicle } from '@/lib/frazer/types'

const base: RawVehicle = {
  vin: '1GCUYDED5KZ123456', stockNumber: 'A1042', year: '2019',
  make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
  bodyStyle: null, drivetrain: null, transmission: null, engine: null,
  fuelType: null, doors: null, exteriorColor: null, interiorColor: null,
  mileage: '78450', price: '24995.00', downPayment: null, weeklyPayment: null,
  description: null, features: [], photoUrls: [],
}

describe('parseMoneyCents', () => {
  it('parses a plain decimal', () => expect(parseMoneyCents('24995.00')).toBe(2499500))
  it('parses currency symbols and commas', () => expect(parseMoneyCents('$9,495')).toBe(949500))
  it('treats zero as absent — never render $0', () => expect(parseMoneyCents('0')).toBeNull())
  it('treats blank as absent', () => expect(parseMoneyCents(null)).toBeNull())
  it('treats garbage as absent', () => expect(parseMoneyCents('call')).toBeNull())
  it('rejects negatives', () => expect(parseMoneyCents('-500')).toBeNull())
  it('rounds half-cents', () => expect(parseMoneyCents('10.005')).toBe(1001))
})

describe('parseIntSafe', () => {
  it('strips commas', () => expect(parseIntSafe('131,220')).toBe(131220))
  it('returns null for garbage', () => expect(parseIntSafe('N/A')).toBeNull())
  it('allows zero (a new car has 0 miles)', () => expect(parseIntSafe('0')).toBe(0))
  it('rejects negatives', () => expect(parseIntSafe('-5')).toBeNull())
})

describe('titleCase', () => {
  it('fixes ALL CAPS', () => expect(titleCase('NISSAN ALTIMA')).toBe('Nissan Altima'))
  it('leaves mixed case alone', () => expect(titleCase('Silverado 1500')).toBe('Silverado 1500'))
  it('returns null for null', () => expect(titleCase(null)).toBeNull())

  // Automotive trims/makes are full of short uppercase acronyms. A token of
  // 3 chars or fewer, or one containing a digit, is preserved as-is rather
  // than being title-cased.
  it('preserves a 2-char uppercase trim token', () => expect(titleCase('LT')).toBe('LT'))
  it('preserves a 3-char uppercase trim token', () => expect(titleCase('XLE')).toBe('XLE'))
  it('preserves short acronym tokens but title-cases a real word among them', () =>
    // GMC (3 chars) and SLT (3 chars) are preserved; SIERRA (6 chars, no digit) is title-cased.
    expect(titleCase('GMC SIERRA SLT')).toBe('GMC Sierra SLT'))
  it('preserves an alphanumeric token because it contains a digit', () =>
    expect(titleCase('SR5')).toBe('SR5'))
  it('preserves a drivetrain-style alphanumeric token', () => expect(titleCase('4WD')).toBe('4WD'))
  it('preserves a hyphenated alphanumeric token', () => expect(titleCase('F-150')).toBe('F-150'))
  it('title-cases every token when all are 4+ chars and digit-free', () =>
    expect(titleCase('CREW CAB PICKUP')).toBe('Crew CAB Pickup'))
})

describe('normalizeVehicle', () => {
  it('produces a canonical vehicle keyed on VIN', () => {
    const v = normalizeVehicle(base)!
    expect(v.sourceKey).toBe('1GCUYDED5KZ123456')
    expect(v.sourceKeyType).toBe('vin')
    expect(v.priceCents).toBe(2499500)
    expect(v.mileage).toBe(78450)
    expect(v.year).toBe(2019)
  })

  it('falls back to stock number when VIN is blank', () => {
    const v = normalizeVehicle({ ...base, vin: null, stockNumber: 'W-77' })!
    expect(v.sourceKey).toBe('W-77')
    expect(v.sourceKeyType).toBe('stock')
    expect(v.vin).toBeNull()
  })

  it('rejects a vehicle with neither VIN nor stock number', () => {
    expect(normalizeVehicle({ ...base, vin: null, stockNumber: null })).toBeNull()
  })

  it('uppercases VIN and rejects VINs of the wrong length', () => {
    expect(normalizeVehicle({ ...base, vin: '1gcuyded5kz123456' })!.vin)
      .toBe('1GCUYDED5KZ123456')
    // 10 chars is not a VIN — fall back to stock number
    const short = normalizeVehicle({ ...base, vin: '1GCUYDED5K' })!
    expect(short.sourceKeyType).toBe('stock')
    expect(short.vin).toBeNull()
  })

  it('title-cases ALL CAPS make and model', () => {
    const v = normalizeVehicle({ ...base, make: 'NISSAN', model: 'ALTIMA' })!
    expect(v.make).toBe('Nissan')
    expect(v.model).toBe('Altima')
  })

  it('rejects an implausible year', () => {
    expect(normalizeVehicle({ ...base, year: '19' })!.year).toBeNull()
    expect(normalizeVehicle({ ...base, year: '2019' })!.year).toBe(2019)
  })

  it('generates a slug', () => {
    expect(normalizeVehicle(base)!.slug).toBe('2019-chevrolet-silverado-1500-lt-kz123456')
  })

  it('produces the same hash for identical input', () => {
    expect(normalizeVehicle(base)!.sourceHash).toBe(normalizeVehicle(base)!.sourceHash)
  })

  it('changes the hash when the price changes', () => {
    const a = normalizeVehicle(base)!
    const b = normalizeVehicle({ ...base, price: '23995.00' })!
    expect(a.sourceHash).not.toBe(b.sourceHash)
  })

  it('changes the hash when photos change', () => {
    const a = normalizeVehicle(base)!
    const b = normalizeVehicle({ ...base, photoUrls: ['https://x/1.jpg'] })!
    expect(a.sourceHash).not.toBe(b.sourceHash)
  })
})
