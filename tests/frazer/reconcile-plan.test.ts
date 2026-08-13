import { describe, it, expect } from 'vitest'
import { planReconciliation, type ExistingVehicle } from '@/lib/frazer/reconcile-plan'
import type { CanonicalVehicle } from '@/lib/frazer/types'

function incoming(over: Partial<CanonicalVehicle> = {}): CanonicalVehicle {
  return {
    sourceKey: 'VIN1', sourceKeyType: 'vin', vin: 'VIN1', stockNumber: 'A1',
    slug: 'car-vin1', year: 2019, make: 'Honda', model: 'Civic', trim: 'LX',
    bodyStyle: null, drivetrain: null, transmission: null, engine: null,
    fuelType: null, doors: null, exteriorColor: null, interiorColor: null,
    mileage: 60000, priceCents: 1699500, downPaymentCents: null,
    weeklyPaymentCents: null, description: null, features: [], photoUrls: [],
    sourceHash: 'hash-a', ...over,
  }
}

function existing(over: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: 'id-1', sourceKey: 'VIN1', sourceHash: 'hash-a',
    status: 'available', priceCents: 1699500, ...over,
  }
}

describe('planReconciliation', () => {
  it('creates a vehicle it has never seen', () => {
    const plan = planReconciliation([incoming()], [])
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.toMarkSold).toHaveLength(0)
  })

  it('skips a vehicle whose hash is unchanged', () => {
    const plan = planReconciliation([incoming()], [existing()])
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.unchangedIds).toEqual(['id-1'])
  })

  it('updates a vehicle whose hash changed', () => {
    const plan = planReconciliation([incoming({ sourceHash: 'hash-b' })], [existing()])
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].existingId).toBe('id-1')
  })

  it('flags a price drop', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1599500 })],
      [existing({ priceCents: 1699500 })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(true)
  })

  it('does not flag a price increase', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1799500 })],
      [existing({ priceCents: 1699500 })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(false)
  })

  it('does not flag a price drop when the old price was unknown', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1599500 })],
      [existing({ priceCents: null })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(false)
  })

  it('marks a vehicle missing from the feed as sold', () => {
    const plan = planReconciliation([], [existing()])
    expect(plan.toMarkSold).toEqual(['id-1'])
  })

  it('does not re-mark an already-sold vehicle', () => {
    const plan = planReconciliation([], [existing({ status: 'sold' })])
    expect(plan.toMarkSold).toEqual([])
  })

  it('restores a sold vehicle that reappears in the feed', () => {
    const plan = planReconciliation([incoming()], [existing({ status: 'sold' })])
    expect(plan.toRestore).toEqual(['id-1'])
    expect(plan.toMarkSold).toEqual([])
  })

  it('leaves a hidden vehicle hidden and never marks it sold', () => {
    const plan = planReconciliation([incoming()], [existing({ status: 'hidden' })])
    expect(plan.toRestore).toEqual([])
    expect(plan.toMarkSold).toEqual([])
  })

  it('does not mark a hidden vehicle sold when it leaves the feed', () => {
    const plan = planReconciliation([], [existing({ status: 'hidden' })])
    expect(plan.toMarkSold).toEqual([])
  })

  it('keeps the first of two rows sharing a source key and reports the duplicate', () => {
    const plan = planReconciliation(
      [incoming({ stockNumber: 'A1' }), incoming({ stockNumber: 'A2' })],
      [],
    )
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toCreate[0].stockNumber).toBe('A1')
    expect(plan.duplicateKeys).toEqual(['VIN1'])
  })

  it('handles a mixed feed correctly', () => {
    const plan = planReconciliation(
      [incoming({ sourceKey: 'VIN1', sourceHash: 'hash-b' }), incoming({ sourceKey: 'VIN3' })],
      [existing({ id: 'id-1', sourceKey: 'VIN1' }), existing({ id: 'id-2', sourceKey: 'VIN2' })],
    )
    expect(plan.toUpdate.map((u) => u.existingId)).toEqual(['id-1'])
    expect(plan.toCreate.map((c) => c.sourceKey)).toEqual(['VIN3'])
    expect(plan.toMarkSold).toEqual(['id-2'])
  })
})
