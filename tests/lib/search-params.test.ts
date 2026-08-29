import { describe, expect, it } from 'vitest'
import {
  activeFilterChips,
  buildSearchParams,
  inventoryHref,
  parseSearchParams,
  withFilter,
  withPage,
} from '@/lib/search-params'

describe('parseSearchParams', () => {
  it('defaults to page 1 and the default sort', () => {
    expect(parseSearchParams({})).toEqual({ sort: 'newest', page: 1 })
  })

  it('converts URL dollars to internal cents', () => {
    const f = parseSearchParams({ price_max: '12000' })
    expect(f.maxPriceCents).toBe(1_200_000)
  })

  it('drops junk numbers instead of turning them into filters', () => {
    // parseInt("12abc") would silently yield 12 and quietly return the
    // wrong cars; Number() rejects it outright.
    expect(parseSearchParams({ price_max: '12abc' }).maxPriceCents).toBeUndefined()
    expect(parseSearchParams({ mileage_max: 'lots' }).maxMileage).toBeUndefined()
  })

  it('clamps a negative price to zero rather than passing it through', () => {
    expect(parseSearchParams({ price_min: '-5000' }).minPriceCents).toBe(0)
  })

  it('clamps an absurd page number', () => {
    expect(parseSearchParams({ page: '999999999' }).page).toBe(1000)
  })

  it('clamps an out-of-range year to the allowed window', () => {
    expect(parseSearchParams({ year_min: '1200' }).yearMin).toBe(1900)
    expect(parseSearchParams({ year_max: '9999' }).yearMax).toBe(new Date().getFullYear() + 2)
  })

  it('falls back to the default sort for an unknown sort value', () => {
    expect(parseSearchParams({ sort: 'price_sideways' }).sort).toBe('newest')
  })

  it('takes the first value when a param is repeated', () => {
    expect(parseSearchParams({ make: ['Ford', 'Toyota'] }).make).toBe('Ford')
  })

  it('treats an empty value as no filter at all', () => {
    expect(parseSearchParams({ make: '', body: '   ' })).toEqual({ sort: 'newest', page: 1 })
  })

  it('truncates an overlong keyword rather than passing it to the matcher', () => {
    const f = parseSearchParams({ q: 'x'.repeat(500) })
    expect(f.q?.length).toBe(100)
  })
})

describe('buildSearchParams', () => {
  it('omits defaults so "no filters" is a bare /inventory', () => {
    expect(inventoryHref({ sort: 'newest', page: 1 })).toBe('/inventory')
  })

  it('round-trips a filter set through the URL unchanged', () => {
    const original = parseSearchParams({
      make: 'Ford',
      model: 'F-150',
      price_max: '20000',
      year_min: '2015',
      sort: 'price_asc',
      page: '2',
    })
    const roundTripped = parseSearchParams(
      Object.fromEntries(buildSearchParams(original).entries()),
    )
    expect(roundTripped).toEqual(original)
  })

  it('writes prices back as dollars, not cents', () => {
    const sp = buildSearchParams({ maxPriceCents: 1_200_000 })
    expect(sp.get('price_max')).toBe('12000')
  })
})

describe('withFilter', () => {
  it('resets to page 1 whenever a filter changes', () => {
    // Narrowing 80 results to 6 while stranded on page 3 shows an empty
    // grid, which reads as "no results".
    const current = parseSearchParams({ page: '3', make: 'Ford' })
    expect(withFilter(current, { make: 'Toyota' }).page).toBe(1)
  })
})

describe('withPage', () => {
  it('keeps every filter while changing the page', () => {
    const current = parseSearchParams({ make: 'Ford', price_max: '20000' })
    const next = withPage(current, 2)
    expect(next.make).toBe('Ford')
    expect(next.maxPriceCents).toBe(2_000_000)
    expect(next.page).toBe(2)
  })
})

describe('activeFilterChips', () => {
  it('produces no chips when nothing is filtered', () => {
    expect(activeFilterChips(parseSearchParams({}))).toEqual([])
  })

  it('collapses a two-sided price range into one chip', () => {
    const chips = activeFilterChips(parseSearchParams({ price_min: '5000', price_max: '15000' }))
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toBe('$5,000 – $15,000')
  })

  it('labels a one-sided price range as "Under"', () => {
    const chips = activeFilterChips(parseSearchParams({ price_max: '15000' }))
    expect(chips[0].label).toBe('Under $15,000')
  })

  it('collapses a two-sided year range into one chip', () => {
    const chips = activeFilterChips(parseSearchParams({ year_min: '2015', year_max: '2020' }))
    expect(chips).toHaveLength(1)
    expect(chips[0].label).toBe('2015 – 2020')
  })

  it('clears the model when the make chip is removed', () => {
    // Leaving model=F-150 behind after dropping make=Ford would filter to
    // a model that no longer has a make selected, which is confusing at
    // best and empty at worst.
    const chips = activeFilterChips(parseSearchParams({ make: 'Ford', model: 'F-150' }))
    const makeChip = chips.find((c) => c.label === 'Ford')
    expect(makeChip?.removeHref).toBe('/inventory')
  })

  it('removes only its own filter, leaving the rest in the URL', () => {
    const chips = activeFilterChips(parseSearchParams({ make: 'Ford', body: 'Truck' }))
    const bodyChip = chips.find((c) => c.label === 'Truck')
    expect(bodyChip?.removeHref).toBe('/inventory?make=Ford')
  })
})
