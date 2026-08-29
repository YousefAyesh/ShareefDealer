/**
 * The single translation layer between the inventory URL and the filter
 * object the data layer understands.
 *
 * Every filter lives in the query string and nowhere else. That is a
 * deliberate SEO and support decision: a filtered result set is a real URL
 * a shopper can bookmark, text to a friend, or read out over the phone,
 * and one a crawler can index. It also means the inventory page needs no
 * client-side JavaScript to filter at all -- a plain <form method="get">
 * produces exactly these URLs.
 *
 * Everything here is defensive. Query strings arrive from crawlers,
 * scrapers, truncated links and hand-editing, so no value is trusted:
 * non-numeric input is dropped, and numbers are clamped to ranges a real
 * vehicle could occupy rather than passed through to the database.
 */
import type { SortOption, VehicleFilters } from './vehicle-types'
import { normalizeFilters } from './vehicle-filter'

export type RawSearchParams = Record<string, string | string[] | undefined>

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'mileage_asc', label: 'Mileage: Low to High' },
  { value: 'year_desc', label: 'Year: Newest First' },
  { value: 'year_asc', label: 'Year: Oldest First' },
]

export const DEFAULT_SORT: SortOption = 'newest'

/** URL parameter names. Short and readable -- these end up in shared links. */
export const PARAM = {
  q: 'q',
  make: 'make',
  model: 'model',
  body: 'body',
  transmission: 'transmission',
  drivetrain: 'drivetrain',
  fuel: 'fuel',
  color: 'color',
  yearMin: 'year_min',
  yearMax: 'year_max',
  priceMin: 'price_min',
  priceMax: 'price_max',
  mileageMax: 'mileage_max',
  sort: 'sort',
  page: 'page',
} as const

// Bounds chosen to cover any vehicle a used lot could plausibly list while
// still rejecting the absurd. The upper year bound allows next-model-year
// cars, which arrive before the calendar catches up.
const MIN_YEAR = 1900
const MAX_YEAR = new Date().getFullYear() + 2
const MAX_PRICE_DOLLARS = 1_000_000
const MAX_MILEAGE = 2_000_000
const MAX_PAGE = 1000
const MAX_TEXT_LENGTH = 100

function first(value: string | string[] | undefined): string | undefined {
  // Repeated params (?make=Ford&make=Toyota) arrive as an array. Take the
  // first rather than joining, which would produce a value matching nothing.
  if (Array.isArray(value)) return value[0]
  return value
}

function readText(params: RawSearchParams, key: string): string | undefined {
  const raw = first(params[key])
  if (raw == null) return undefined
  const trimmed = raw.trim().slice(0, MAX_TEXT_LENGTH)
  return trimmed === '' ? undefined : trimmed
}

function readInt(
  params: RawSearchParams,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const raw = first(params[key])
  if (raw == null || raw.trim() === '') return undefined
  // Number() rather than parseInt(): parseInt("12abc") silently yields 12,
  // which turns a malformed URL into a plausible-looking wrong answer.
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(Math.max(Math.round(n), min), max)
}

function isSortOption(value: string | undefined): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value)
}

export function parseSearchParams(params: RawSearchParams): VehicleFilters {
  const sortRaw = first(params[PARAM.sort])
  const priceMinDollars = readInt(params, PARAM.priceMin, 0, MAX_PRICE_DOLLARS)
  const priceMaxDollars = readInt(params, PARAM.priceMax, 0, MAX_PRICE_DOLLARS)

  return normalizeFilters({
    q: readText(params, PARAM.q),
    make: readText(params, PARAM.make),
    model: readText(params, PARAM.model),
    bodyStyle: readText(params, PARAM.body),
    transmission: readText(params, PARAM.transmission),
    drivetrain: readText(params, PARAM.drivetrain),
    fuelType: readText(params, PARAM.fuel),
    exteriorColor: readText(params, PARAM.color),
    yearMin: readInt(params, PARAM.yearMin, MIN_YEAR, MAX_YEAR),
    yearMax: readInt(params, PARAM.yearMax, MIN_YEAR, MAX_YEAR),
    // Prices are dollars in the URL (shoppers read these) and cents
    // everywhere internally.
    minPriceCents: priceMinDollars != null ? priceMinDollars * 100 : undefined,
    maxPriceCents: priceMaxDollars != null ? priceMaxDollars * 100 : undefined,
    maxMileage: readInt(params, PARAM.mileageMax, 0, MAX_MILEAGE),
    sort: isSortOption(sortRaw) ? sortRaw : DEFAULT_SORT,
    page: readInt(params, PARAM.page, 1, MAX_PAGE) ?? 1,
  })
}

/**
 * Filters back to a query string. Values equal to the default (sort=newest,
 * page=1) are omitted so the canonical form of "no filters" is a bare
 * /inventory rather than a URL full of defaults -- which matters both for
 * how shareable the link looks and for how many near-duplicate URLs a
 * crawler finds.
 */
export function buildSearchParams(filters: VehicleFilters): URLSearchParams {
  const f = normalizeFilters(filters)
  const sp = new URLSearchParams()

  const set = (key: string, value: string | number | undefined) => {
    if (value == null || value === '') return
    sp.set(key, String(value))
  }

  set(PARAM.q, f.q)
  set(PARAM.make, f.make)
  set(PARAM.model, f.model)
  set(PARAM.body, f.bodyStyle)
  set(PARAM.transmission, f.transmission)
  set(PARAM.drivetrain, f.drivetrain)
  set(PARAM.fuel, f.fuelType)
  set(PARAM.color, f.exteriorColor)
  set(PARAM.yearMin, f.yearMin)
  set(PARAM.yearMax, f.yearMax)
  set(PARAM.priceMin, f.minPriceCents != null ? Math.round(f.minPriceCents / 100) : undefined)
  set(PARAM.priceMax, f.maxPriceCents != null ? Math.round(f.maxPriceCents / 100) : undefined)
  set(PARAM.mileageMax, f.maxMileage)
  if (f.sort && f.sort !== DEFAULT_SORT) set(PARAM.sort, f.sort)
  if (f.page != null && f.page > 1) set(PARAM.page, f.page)

  return sp
}

/** An /inventory href for these filters. */
export function inventoryHref(filters: VehicleFilters): string {
  const qs = buildSearchParams(filters).toString()
  return qs ? `/inventory?${qs}` : '/inventory'
}

/**
 * Changing any filter must send the shopper back to page 1. Staying on
 * page 3 while narrowing from 80 results to 6 shows an empty grid and
 * reads as "no results", which is the single most common way a filtered
 * listing loses someone.
 */
export function withFilter(
  filters: VehicleFilters,
  changes: Partial<VehicleFilters>,
): VehicleFilters {
  return normalizeFilters({ ...filters, ...changes, page: 1 })
}

/** Same filters, different page. Used by the pager links. */
export function withPage(filters: VehicleFilters, page: number): VehicleFilters {
  return normalizeFilters({ ...filters, page })
}

export type FilterChip = {
  key: keyof VehicleFilters
  label: string
  /** URL with just this one filter removed. */
  removeHref: string
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`
}

/**
 * One removable chip per active filter. Chips are how a shopper sees what
 * is currently narrowing their results without re-reading every dropdown,
 * and how they undo one constraint without clearing all of them.
 */
export function activeFilterChips(filters: VehicleFilters): FilterChip[] {
  const f = normalizeFilters(filters)
  const chips: FilterChip[] = []

  const push = (key: keyof VehicleFilters, label: string, clear: Partial<VehicleFilters>) => {
    chips.push({ key, label, removeHref: inventoryHref(withFilter(f, clear)) })
  }

  if (f.q) push('q', `“${f.q}”`, { q: undefined })
  if (f.make) push('make', f.make, { make: undefined, model: undefined })
  if (f.model) push('model', f.model, { model: undefined })
  if (f.bodyStyle) push('bodyStyle', f.bodyStyle, { bodyStyle: undefined })
  if (f.transmission) push('transmission', f.transmission, { transmission: undefined })
  if (f.drivetrain) push('drivetrain', f.drivetrain, { drivetrain: undefined })
  if (f.fuelType) push('fuelType', f.fuelType, { fuelType: undefined })
  if (f.exteriorColor) push('exteriorColor', f.exteriorColor, { exteriorColor: undefined })

  // Year and price collapse to one chip when both ends are set, because
  // "2015 – 2020" is one idea to the shopper even though it is two params.
  if (f.yearMin != null && f.yearMax != null) {
    push('yearMin', `${f.yearMin} – ${f.yearMax}`, { yearMin: undefined, yearMax: undefined })
  } else if (f.yearMin != null) {
    push('yearMin', `${f.yearMin} & newer`, { yearMin: undefined })
  } else if (f.yearMax != null) {
    push('yearMax', `${f.yearMax} & older`, { yearMax: undefined })
  }

  if (f.minPriceCents != null && f.maxPriceCents != null) {
    push('minPriceCents', `${money(f.minPriceCents)} – ${money(f.maxPriceCents)}`, {
      minPriceCents: undefined,
      maxPriceCents: undefined,
    })
  } else if (f.minPriceCents != null) {
    push('minPriceCents', `${money(f.minPriceCents)} & up`, { minPriceCents: undefined })
  } else if (f.maxPriceCents != null) {
    push('maxPriceCents', `Under ${money(f.maxPriceCents)}`, { maxPriceCents: undefined })
  }

  if (f.maxMileage != null) {
    push('maxMileage', `Under ${f.maxMileage.toLocaleString('en-US')} mi`, { maxMileage: undefined })
  }

  return chips
}
