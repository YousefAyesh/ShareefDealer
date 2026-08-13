import { describe, it, expect } from 'vitest'
import { toVehicleRow, SOLD_PAGE_RETENTION_DAYS } from '@/lib/frazer/reconcile-apply'
import type { CanonicalVehicle } from '@/lib/frazer/types'

const canonical: CanonicalVehicle = {
  sourceKey: 'VIN1', sourceKeyType: 'vin', vin: 'VIN1', stockNumber: 'A1',
  slug: 'car-vin1', year: 2019, make: 'Honda', model: 'Civic', trim: 'LX',
  bodyStyle: 'Sedan', drivetrain: 'FWD', transmission: 'Automatic',
  engine: '2.0L', fuelType: 'Gasoline', doors: 4,
  exteriorColor: 'Silver', interiorColor: 'Black', mileage: 60000,
  priceCents: 1699500, downPaymentCents: 250000, weeklyPaymentCents: 8900,
  description: 'Nice car', features: ['Bluetooth'],
  photoUrls: ['https://x/1.jpg'], sourceHash: 'hash-a',
}

describe('toVehicleRow', () => {
  it('maps every canonical field onto the row', () => {
    const row = toVehicleRow(canonical, { priceReduced: false })
    expect(row.sourceKey).toBe('VIN1')
    expect(row.priceCents).toBe(1699500)
    expect(row.weeklyPaymentCents).toBe(8900)
    expect(row.features).toEqual(['Bluetooth'])
    expect(row.slug).toBe('car-vin1')
  })

  it('does not put photoUrls on the vehicle row — photos are their own table', () => {
    expect(toVehicleRow(canonical, { priceReduced: false })).not.toHaveProperty('photoUrls')
  })

  it('carries sourceKeyType through', () => {
    expect(toVehicleRow(canonical, { priceReduced: false }).sourceKeyType).toBe('vin')
  })

  it('carries the price-reduced flag through', () => {
    expect(toVehicleRow(canonical, { priceReduced: true }).priceReduced).toBe(true)
  })

  it('never sets status — hidden is a manual override the sync must not touch', () => {
    expect(toVehicleRow(canonical, { priceReduced: false })).not.toHaveProperty('status')
  })

  it('refreshes lastSeenAt', () => {
    const before = Date.now()
    const row = toVehicleRow(canonical, { priceReduced: false })
    expect(row.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('documents the sold-page retention window', () => {
    expect(SOLD_PAGE_RETENTION_DAYS).toBe(30)
  })
})
