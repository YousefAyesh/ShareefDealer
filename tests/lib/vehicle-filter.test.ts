import { describe, expect, it } from 'vitest'
import {
  buildFilterOptions,
  hasActiveFilters,
  isPubliclyListable,
  matchesFilters,
  normalizeFilters,
  paginate,
  pickSimilar,
  sortVehicles,
} from '@/lib/vehicle-filter'
import type { Vehicle, VehiclePhoto } from '@/lib/vehicle-types'

const photo: VehiclePhoto = {
  id: 'p1',
  position: 0,
  urlThumb: '/t.webp',
  urlCard: '/c.webp',
  urlFull: '/f.webp',
  width: 1600,
  height: 1200,
  alt: 'photo',
}

let seq = 0
function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  seq += 1
  return {
    id: `v${seq}`,
    slug: `slug-${seq}`,
    vin: null,
    stockNumber: null,
    year: 2018,
    make: 'Ford',
    model: 'F-150',
    trim: 'XLT',
    bodyStyle: 'Truck',
    drivetrain: '4WD',
    transmission: 'Automatic',
    engine: '5.0L V8',
    fuelType: 'Gasoline',
    doors: 4,
    exteriorColor: 'White',
    interiorColor: 'Gray',
    mileage: 90_000,
    priceCents: 1_800_000,
    downPaymentCents: null,
    weeklyPaymentCents: null,
    description: null,
    features: [],
    status: 'available',
    priceReduced: false,
    photos: [photo],
    createdAt: '2026-08-01T00:00:00.000Z',
    soldAt: null,
    ...overrides,
  }
}

describe('isPubliclyListable', () => {
  it('hides a vehicle with no photos', () => {
    expect(isPubliclyListable(vehicle({ photos: [] }))).toBe(false)
  })

  it('hides sold and hidden vehicles', () => {
    expect(isPubliclyListable(vehicle({ status: 'sold' }))).toBe(false)
    expect(isPubliclyListable(vehicle({ status: 'hidden' }))).toBe(false)
  })

  it('shows an available vehicle with at least one photo', () => {
    expect(isPubliclyListable(vehicle())).toBe(true)
  })
})

describe('normalizeFilters', () => {
  it('drops blank and whitespace-only text so ?make= means no filter', () => {
    expect(normalizeFilters({ make: '', model: '   ' })).toEqual({})
  })

  it('drops non-finite numbers rather than passing NaN through', () => {
    expect(normalizeFilters({ maxMileage: Number.NaN, yearMin: Number.POSITIVE_INFINITY })).toEqual({})
  })

  it('swaps a backwards year range instead of returning nothing', () => {
    expect(normalizeFilters({ yearMin: 2020, yearMax: 2010 })).toEqual({ yearMin: 2010, yearMax: 2020 })
  })

  it('swaps a backwards price range', () => {
    const out = normalizeFilters({ minPriceCents: 2_000_000, maxPriceCents: 500_000 })
    expect(out).toEqual({ minPriceCents: 500_000, maxPriceCents: 2_000_000 })
  })
})

describe('hasActiveFilters', () => {
  it('ignores sort and page', () => {
    expect(hasActiveFilters({ sort: 'price_asc', page: 3 })).toBe(false)
  })

  it('detects a real filter', () => {
    expect(hasActiveFilters({ make: 'Ford', sort: 'newest' })).toBe(true)
  })
})

describe('matchesFilters', () => {
  it('matches text fields case-insensitively', () => {
    // Real Frazer feeds mix "CHEVROLET", "Chevrolet" and "chevrolet".
    const v = vehicle({ make: 'CHEVROLET' })
    expect(matchesFilters(v, { make: 'chevrolet' })).toBe(true)
  })

  it('excludes a vehicle whose field the feed never populated', () => {
    const v = vehicle({ drivetrain: null })
    expect(matchesFilters(v, { drivetrain: '4WD' })).toBe(false)
  })

  it('treats a zero price as unpriced, not as free', () => {
    const v = vehicle({ priceCents: 0 })
    expect(matchesFilters(v, { maxPriceCents: 500_000 })).toBe(false)
  })

  it('excludes an unpriced vehicle from any price filter', () => {
    const v = vehicle({ priceCents: null })
    expect(matchesFilters(v, { maxPriceCents: 10_000_000 })).toBe(false)
    expect(matchesFilters(v, { minPriceCents: 1 })).toBe(false)
  })

  it('applies an inclusive year range', () => {
    expect(matchesFilters(vehicle({ year: 2018 }), { yearMin: 2018, yearMax: 2018 })).toBe(true)
    expect(matchesFilters(vehicle({ year: 2017 }), { yearMin: 2018 })).toBe(false)
  })

  it('requires every keyword token to match, not just one', () => {
    const v = vehicle({ make: 'Ford', model: 'F-150', features: ['Backup Camera'] })
    expect(matchesFilters(v, { q: 'ford f-150' })).toBe(true)
    expect(matchesFilters(v, { q: 'ford tacoma' })).toBe(false)
  })

  it('searches stock number and VIN so a window sticker can be pasted in', () => {
    const v = vehicle({ stockNumber: '4412', vin: '1FTEW1EP7JFA12345' })
    expect(matchesFilters(v, { q: '4412' })).toBe(true)
    expect(matchesFilters(v, { q: '1FTEW1EP7JFA12345' })).toBe(true)
  })
})

describe('sortVehicles', () => {
  it('sorts unpriced vehicles last in both directions', () => {
    const cheap = vehicle({ priceCents: 500_000 })
    const dear = vehicle({ priceCents: 3_000_000 })
    const unpriced = vehicle({ priceCents: null })
    const list = [unpriced, dear, cheap]

    expect(sortVehicles(list, 'price_asc').at(-1)).toBe(unpriced)
    expect(sortVehicles(list, 'price_desc').at(-1)).toBe(unpriced)
  })

  it('treats a zero price as unpriced when sorting', () => {
    const zero = vehicle({ priceCents: 0 })
    const real = vehicle({ priceCents: 100_000 })
    expect(sortVehicles([zero, real], 'price_asc')[0]).toBe(real)
  })

  it('breaks ties deterministically so pagination cannot duplicate a vehicle', () => {
    const a = vehicle({ priceCents: 1_000_000, createdAt: '2026-08-01T00:00:00.000Z' })
    const b = vehicle({ priceCents: 1_000_000, createdAt: '2026-08-05T00:00:00.000Z' })
    const once = sortVehicles([a, b], 'price_asc').map((v) => v.id)
    const again = sortVehicles([b, a], 'price_asc').map((v) => v.id)
    expect(once).toEqual(again)
    expect(once[0]).toBe(b.id) // newer first on a tie
  })

  it('does not mutate its input', () => {
    const list = [vehicle({ priceCents: 300 }), vehicle({ priceCents: 100 })]
    const before = list.map((v) => v.id)
    sortVehicles(list, 'price_asc')
    expect(list.map((v) => v.id)).toEqual(before)
  })
})

describe('buildFilterOptions', () => {
  const lot = [
    vehicle({ make: 'Ford', model: 'F-150', bodyStyle: 'Truck', year: 2018, priceCents: 2_000_000 }),
    vehicle({ make: 'Ford', model: 'Escape', bodyStyle: 'SUV', year: 2016, priceCents: 1_100_000 }),
    vehicle({ make: 'Toyota', model: 'Camry', bodyStyle: 'Sedan', year: 2020, priceCents: 1_700_000 }),
    vehicle({ make: 'Toyota', model: 'Camry', bodyStyle: 'Sedan', year: 2019, priceCents: 1_500_000 }),
    vehicle({ make: 'Honda', model: 'Civic', bodyStyle: 'Sedan', status: 'sold' }),
  ]

  it('excludes non-listable vehicles from every facet', () => {
    const opts = buildFilterOptions(lot)
    expect(opts.makes.map((m) => m.value)).toEqual(['Ford', 'Toyota'])
    expect(opts.totalListable).toBe(4)
  })

  it('counts each value', () => {
    const opts = buildFilterOptions(lot)
    expect(opts.makes.find((m) => m.value === 'Toyota')?.count).toBe(2)
  })

  it('scopes models to the selected make', () => {
    const opts = buildFilterOptions(lot, { make: 'Ford' })
    expect(opts.models.map((m) => m.value).sort()).toEqual(['Escape', 'F-150'])
  })

  it('still counts every make while a make is selected, so switching is possible', () => {
    // This is the whole point of excluding a field's own filter from its
    // facet: with make=Ford chosen, Toyota must still show its real count.
    const opts = buildFilterOptions(lot, { make: 'Ford' })
    expect(opts.makes.find((m) => m.value === 'Toyota')?.count).toBe(2)
  })

  it('reports year and price ranges across the whole listable lot', () => {
    const opts = buildFilterOptions(lot)
    expect(opts.yearRange).toEqual({ min: 2016, max: 2020 })
    expect(opts.priceRangeCents).toEqual({ min: 1_100_000, max: 2_000_000 })
  })

  it('returns null ranges for an empty lot rather than throwing', () => {
    const opts = buildFilterOptions([])
    expect(opts.yearRange).toBeNull()
    expect(opts.priceRangeCents).toBeNull()
    expect(opts.totalListable).toBe(0)
  })
})

describe('paginate', () => {
  const many = Array.from({ length: 30 }, () => vehicle())

  it('slices the requested page', () => {
    const p = paginate(many, 2, 24)
    expect(p.vehicles).toHaveLength(6)
    expect(p.page).toBe(2)
    expect(p.pageCount).toBe(2)
    expect(p.total).toBe(30)
  })

  it('clamps a page past the end to the last page instead of showing nothing', () => {
    // A stale bookmark or an old crawler link asks for page 9 of 2.
    const p = paginate(many, 9, 24)
    expect(p.page).toBe(2)
    expect(p.vehicles).toHaveLength(6)
  })

  it('clamps a zero or negative page to 1', () => {
    expect(paginate(many, 0, 24).page).toBe(1)
    expect(paginate(many, -5, 24).page).toBe(1)
  })

  it('reports one page for an empty result set', () => {
    const p = paginate([], 1, 24)
    expect(p.pageCount).toBe(1)
    expect(p.total).toBe(0)
  })
})

describe('pickSimilar', () => {
  it('never returns the vehicle itself', () => {
    const v = vehicle()
    expect(pickSimilar([v], v, 3)).toEqual([])
  })

  it('prefers the same body style over the same make', () => {
    const subject = vehicle({ make: 'Ford', bodyStyle: 'Truck', priceCents: 2_000_000 })
    const sameMakeDifferentBody = vehicle({ make: 'Ford', bodyStyle: 'Sedan', priceCents: 900_000 })
    const differentMakeSameBody = vehicle({ make: 'Ram', bodyStyle: 'Truck', priceCents: 900_000 })

    const [first] = pickSimilar(
      [subject, sameMakeDifferentBody, differentMakeSameBody],
      subject,
      2,
    )
    expect(first.id).toBe(differentMakeSameBody.id)
  })

  it('excludes sold and photoless vehicles', () => {
    const subject = vehicle()
    const sold = vehicle({ status: 'sold' })
    const noPhotos = vehicle({ photos: [] })
    expect(pickSimilar([subject, sold, noPhotos], subject, 5)).toEqual([])
  })
})

describe('exterior colour filtering', () => {
  it('facets on colour family, not on the manufacturer marketing name', () => {
    // Without this, "Ingot Silver", "Classic Silver" and "Brilliant Silver"
    // are three separate filter options with a count of 1 each, and nobody
    // searching for a silver car finds any of them.
    const lot = [
      vehicle({ exteriorColor: 'Ingot Silver' }),
      vehicle({ exteriorColor: 'Classic Silver' }),
      vehicle({ exteriorColor: 'Summit White' }),
    ]
    const opts = buildFilterOptions(lot)
    expect(opts.exteriorColors).toEqual([
      { value: 'Silver', count: 2 },
      { value: 'White', count: 1 },
    ])
  })

  it('matches a vehicle whose raw colour resolves to the requested family', () => {
    const v = vehicle({ exteriorColor: 'Ingot Silver' })
    expect(matchesFilters(v, { exteriorColor: 'Silver' })).toBe(true)
    expect(matchesFilters(v, { exteriorColor: 'White' })).toBe(false)
  })

  it('excludes a vehicle whose colour resolves to no family', () => {
    const v = vehicle({ exteriorColor: 'Nardo' })
    expect(matchesFilters(v, { exteriorColor: 'Gray' })).toBe(false)
    expect(buildFilterOptions([v]).exteriorColors).toEqual([])
  })
})
