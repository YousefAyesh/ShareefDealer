import { describe, it, expect, vi, afterEach } from 'vitest'
import { decodeVin, applyVinDecode } from '@/lib/frazer/vin-decode'

afterEach(() => vi.unstubAllGlobals())

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => body,
  }))
}

describe('decodeVin', () => {
  it('returns decoded fields on success', async () => {
    mockFetchOnce({ Results: [{
      ModelYear: '2019', Make: 'CHEVROLET', Model: 'Silverado 1500',
      Trim: 'LT', BodyClass: 'Pickup', DriveType: '4WD', FuelTypePrimary: 'Gasoline',
    }] })
    const result = await decodeVin('1GCUYDED5KZ123456')
    expect(result).toEqual({
      year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
      bodyStyle: 'Pickup', drivetrain: '4WD', fuelType: 'Gasoline',
    })
  })

  it('returns null when the API errors', async () => {
    mockFetchOnce({}, false)
    expect(await decodeVin('1GCUYDED5KZ123456')).toBeNull()
  })

  it('returns null when the network throws — never blocks a sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await decodeVin('1GCUYDED5KZ123456')).toBeNull()
  })

  it('returns null for a malformed VIN without calling the network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await decodeVin('TOOSHORT')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ignores vPIC placeholder values', async () => {
    mockFetchOnce({ Results: [{
      ModelYear: '2019', Make: 'HONDA', Model: 'Civic',
      Trim: 'Not Applicable', BodyClass: '', DriveType: 'Not Applicable',
    }] })
    const result = await decodeVin('2HGFC2F59KH512345')
    expect(result?.trim).toBeNull()
    expect(result?.bodyStyle).toBeNull()
    expect(result?.drivetrain).toBeNull()
  })

  it('clears the abort timer even when fetch rejects — no leaked timers on a flaky vPIC', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    await decodeVin('1GCUYDED5KZ123456')
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('applyVinDecode', () => {
  const decoded = {
    year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
    bodyStyle: 'Pickup', drivetrain: '4WD', fuelType: 'Gasoline',
  }

  it('fills only fields the feed left blank', () => {
    const merged = applyVinDecode(
      { year: null, make: 'CHEVY', model: null, trim: null, bodyStyle: null, drivetrain: null, fuelType: null },
      decoded,
    )
    expect(merged.year).toBe(2019)
    expect(merged.make).toBe('CHEVY')     // feed value wins
    expect(merged.bodyStyle).toBe('Pickup')
  })

  it('is a no-op when decoding failed', () => {
    const original = { year: null, make: 'Honda', model: 'Civic', trim: null, bodyStyle: null, drivetrain: null, fuelType: null }
    expect(applyVinDecode(original, null)).toEqual(original)
  })
})
