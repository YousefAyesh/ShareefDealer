import { describe, expect, it } from 'vitest'
import { parseVehicleFile } from '@/lib/inventory-schema'

const minimal = { year: 2019, make: 'Jeep', model: 'Cherokee' }

function errorsFor(input: unknown): string[] {
  const result = parseVehicleFile(input)
  return result.ok ? [] : result.errors
}

describe('parseVehicleFile', () => {
  it('accepts the minimum a real listing can have', () => {
    // A car often goes up before every spec is known. Requiring more than
    // this would push whoever is adding it into inventing values.
    expect(parseVehicleFile(minimal).ok).toBe(true)
  })

  it('requires year, make and model, and says so in plain words', () => {
    const errors = errorsFor({})
    expect(errors.join(' ')).toMatch(/year is required/)
    expect(errors.join(' ')).toMatch(/make is required/)
    expect(errors.join(' ')).toMatch(/model is required/)
  })

  it('catches a price written in cents', () => {
    // The single most damaging mistake available: 1899500 meant as $18,995
    // is a hundredfold error published to the public web.
    const errors = errorsFor({ ...minimal, price: 1_899_500 })
    expect(errors.join(' ')).toMatch(/cents by mistake/)
  })

  it('accepts a normal price', () => {
    expect(parseVehicleFile({ ...minimal, price: 18995 }).ok).toBe(true)
  })

  it('rejects a price with decimals, since the file is whole dollars', () => {
    expect(errorsFor({ ...minimal, price: 18995.5 }).join(' ')).toMatch(/whole number/)
  })

  it('rejects a VIN that is not 17 characters', () => {
    expect(errorsFor({ ...minimal, vin: 'TOOSHORT' }).join(' ')).toMatch(/17 characters/)
  })

  it('allows a missing VIN rather than forcing a fake one', () => {
    expect(parseVehicleFile(minimal).ok).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(errorsFor({ ...minimal, status: 'for sale' }).join(' ')).toMatch(/available/)
  })

  it('rejects an implausible year', () => {
    expect(errorsFor({ ...minimal, year: 1600 }).join(' ')).toMatch(/1900 or later/)
    expect(errorsFor({ ...minimal, year: 3000 }).join(' ')).toMatch(/cannot be past/)
  })

  it('rejects a malformed listedAt', () => {
    expect(errorsFor({ ...minimal, listedAt: '29/08/2026' }).join(' ')).toMatch(/2026-08-29/)
  })

  it('names the field in every message so it can be fixed without guessing', () => {
    const errors = errorsFor({ ...minimal, price: 9_999_999, vin: 'X' })
    expect(errors.every((e) => e.includes(':'))).toBe(true)
  })
})
