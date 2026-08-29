/**
 * Pure vehicle filtering, sorting, faceting and pagination.
 *
 * Deliberately free of any I/O or database import so it can be unit-tested
 * directly and so the demo path and the Postgres path share one
 * implementation -- a vehicle that is filtered out of the demo lot must be
 * filtered out of the real lot for exactly the same reason.
 *
 * The lot for a single independent dealer is tens of vehicles, not
 * millions, so every operation here runs in memory over the full listable
 * set. That buys exact facet counts, which a SQL GROUP BY per field would
 * make considerably more painful for no benefit at this size.
 */
import { colorFamily } from './color'
import type {
  FacetValue,
  FilterOptions,
  InventoryPage,
  NumericRange,
  SortOption,
  Vehicle,
  VehicleFilters,
} from './vehicle-types'

/** Vehicles per page of the inventory grid. */
export const PAGE_SIZE = 24

/**
 * A vehicle with no photos is never shown. A shopper will not call about a
 * car they cannot see, and an empty card reads as a broken site. The
 * vehicle stays ingested, so it appears by itself the moment the dealer
 * adds a photo in Frazer -- no re-sync needed.
 */
export function isPubliclyListable(v: Vehicle): boolean {
  return v.status === 'available' && v.photos.length > 0
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * Collapse blank and out-of-range values to absent. A URL like
 * `?make=&price_max=` arrives whenever a shopper submits the filter form
 * with the default "Any" options selected, and must behave identically to
 * no query string at all.
 */
export function normalizeFilters(filters: VehicleFilters): VehicleFilters {
  const out: VehicleFilters = {}

  const text = (v: string | undefined) => {
    const t = v?.trim()
    return t ? t : undefined
  }
  const num = (v: number | undefined) => (v != null && Number.isFinite(v) ? v : undefined)

  out.q = text(filters.q)
  out.make = text(filters.make)
  out.model = text(filters.model)
  out.bodyStyle = text(filters.bodyStyle)
  out.transmission = text(filters.transmission)
  out.drivetrain = text(filters.drivetrain)
  out.fuelType = text(filters.fuelType)
  out.exteriorColor = text(filters.exteriorColor)
  out.yearMin = num(filters.yearMin)
  out.yearMax = num(filters.yearMax)
  out.minPriceCents = num(filters.minPriceCents)
  out.maxPriceCents = num(filters.maxPriceCents)
  out.maxMileage = num(filters.maxMileage)
  out.sort = filters.sort
  out.page = num(filters.page)

  // A shopper who enters a backwards range (max year 2010, min year 2018)
  // means the range between the two numbers, not an empty result set.
  if (out.yearMin != null && out.yearMax != null && out.yearMin > out.yearMax) {
    ;[out.yearMin, out.yearMax] = [out.yearMax, out.yearMin]
  }
  if (out.minPriceCents != null && out.maxPriceCents != null && out.minPriceCents > out.maxPriceCents) {
    ;[out.minPriceCents, out.maxPriceCents] = [out.maxPriceCents, out.minPriceCents]
  }

  for (const key of Object.keys(out) as (keyof VehicleFilters)[]) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

/** True when any filter other than sort/page is set. */
export function hasActiveFilters(filters: VehicleFilters): boolean {
  const f = normalizeFilters(filters)
  return Object.keys(f).some((k) => k !== 'sort' && k !== 'page')
}

/**
 * The haystack a keyword search runs against. Includes stock number and VIN
 * so a shopper holding a window sticker, or a dealer on the phone reading
 * out a stock number, can paste it straight into the search box.
 */
function searchHaystack(v: Vehicle): string {
  return [
    v.year,
    v.make,
    v.model,
    v.trim,
    v.bodyStyle,
    v.drivetrain,
    v.transmission,
    v.fuelType,
    v.exteriorColor,
    v.interiorColor,
    v.engine,
    v.stockNumber,
    v.vin,
    v.description,
    ...v.features,
  ]
    .filter((p) => p != null && String(p).trim() !== '')
    .join(' ')
    .toLowerCase()
}

function matchesKeyword(v: Vehicle, q: string): boolean {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = searchHaystack(v)
  // AND, not OR: "silverado 4x4" should narrow the list, not widen it.
  return tokens.every((t) => haystack.includes(t))
}

/**
 * A vehicle missing the field a filter constrains is excluded, never
 * included by default. If a shopper asks for 4WD, a vehicle whose
 * drivetrain the feed never populated is not an answer to that question.
 * The same rule applies to price and mileage: "under $10,000" cannot
 * include a car whose price is unknown.
 */
export function matchesFilters(v: Vehicle, rawFilters: VehicleFilters): boolean {
  const f = normalizeFilters(rawFilters)

  if (f.q && !matchesKeyword(v, f.q)) return false
  if (f.make && norm(v.make) !== norm(f.make)) return false
  if (f.model && norm(v.model) !== norm(f.model)) return false
  if (f.bodyStyle && norm(v.bodyStyle) !== norm(f.bodyStyle)) return false
  if (f.transmission && norm(v.transmission) !== norm(f.transmission)) return false
  if (f.drivetrain && norm(v.drivetrain) !== norm(f.drivetrain)) return false
  if (f.fuelType && norm(v.fuelType) !== norm(f.fuelType)) return false
  // Colour is matched on family, not on the raw string: the URL carries
  // "Silver", the vehicle record says "Ingot Silver". See lib/color.ts.
  if (f.exteriorColor && colorFamily(v.exteriorColor) !== f.exteriorColor) return false

  if (f.yearMin != null && (v.year == null || v.year < f.yearMin)) return false
  if (f.yearMax != null && (v.year == null || v.year > f.yearMax)) return false

  // priceCents === 0 means "not priced yet" everywhere else on the site
  // (formatPrice renders it as "Call for Price"), so it must not satisfy a
  // price filter either -- otherwise every unpriced car answers "under
  // $5,000".
  const price = v.priceCents == null || v.priceCents === 0 ? null : v.priceCents
  if (f.minPriceCents != null && (price == null || price < f.minPriceCents)) return false
  if (f.maxPriceCents != null && (price == null || price > f.maxPriceCents)) return false

  if (f.maxMileage != null && (v.mileage == null || v.mileage > f.maxMileage)) return false

  return true
}

function comparePrice(a: Vehicle, b: Vehicle, dir: 1 | -1): number {
  // "Call for Price" vehicles always sort last, in either direction --
  // there is no meaningful position for an unknown price in a
  // price-ordered list, and burying them is better than claiming they are
  // the cheapest thing on the lot.
  const pa = a.priceCents === 0 ? null : a.priceCents
  const pb = b.priceCents === 0 ? null : b.priceCents
  if (pa == null && pb == null) return 0
  if (pa == null) return 1
  if (pb == null) return -1
  return dir * (pa - pb)
}

function compareNullableNumber(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return dir * (a - b)
}

function newestFirst(a: Vehicle, b: Vehicle): number {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
}

export function sortVehicles(list: Vehicle[], sort: SortOption = 'newest'): Vehicle[] {
  const arr = [...list]
  // Every comparator falls back to newest-first so the order is total and
  // stable: two vehicles with the same price must not shuffle between
  // requests, or pagination silently duplicates and drops cars.
  switch (sort) {
    case 'price_asc':
      return arr.sort((a, b) => comparePrice(a, b, 1) || newestFirst(a, b))
    case 'price_desc':
      return arr.sort((a, b) => comparePrice(a, b, -1) || newestFirst(a, b))
    case 'mileage_asc':
      return arr.sort((a, b) => compareNullableNumber(a.mileage, b.mileage, 1) || newestFirst(a, b))
    case 'year_desc':
      return arr.sort((a, b) => compareNullableNumber(a.year, b.year, -1) || newestFirst(a, b))
    case 'year_asc':
      return arr.sort((a, b) => compareNullableNumber(a.year, b.year, 1) || newestFirst(a, b))
    case 'newest':
    default:
      return arr.sort(newestFirst)
  }
}

// ---------------------------------------------------------------------------
// Faceting
// ---------------------------------------------------------------------------

type TextField = 'make' | 'model' | 'bodyStyle' | 'transmission' | 'drivetrain' | 'fuelType' | 'exteriorColor'

/** The value a facet counts by. Colour collapses to its family; everything
 * else is counted as the feed spells it. */
function facetValueOf(v: Vehicle, field: TextField): string | null {
  if (field === 'exteriorColor') return colorFamily(v.exteriorColor)
  const raw = v[field]
  if (raw == null || String(raw).trim() === '') return null
  return String(raw).trim()
}

/**
 * Count the distinct values of one field across the vehicles matching every
 * active filter *except* that field's own. Excluding the field's own filter
 * is what lets a shopper see the other choices still open to them instead
 * of a dropdown where the only option with a non-zero count is the one
 * already selected.
 */
function facetFor(listable: Vehicle[], filters: VehicleFilters, field: TextField): FacetValue[] {
  const others = { ...filters }
  delete others[field]

  const pool = listable.filter((v) => matchesFilters(v, others))
  const counts = new Map<string, { value: string; count: number }>()

  for (const v of pool) {
    const display = facetValueOf(v, field)
    if (display == null) continue
    const key = display.toLowerCase()
    const existing = counts.get(key)
    if (existing) existing.count += 1
    else counts.set(key, { value: display, count: 1 })
  }

  return [...counts.values()].sort((a, b) => a.value.localeCompare(b.value))
}

function rangeOf(values: (number | null)[]): NumericRange | null {
  const nums = values.filter((n): n is number => n != null && Number.isFinite(n))
  if (nums.length === 0) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

export function buildFilterOptions(all: Vehicle[], filters: VehicleFilters = {}): FilterOptions {
  const listable = all.filter(isPubliclyListable)
  const f = normalizeFilters(filters)

  // Ranges describe the whole lot, not the current result set. A price
  // slider that shrinks to the filtered range each time you touch it makes
  // it impossible to widen the search again.
  const prices = listable.map((v) => (v.priceCents === 0 ? null : v.priceCents))

  return {
    makes: facetFor(listable, f, 'make'),
    // Models are additionally scoped to the selected make, so choosing Ford
    // does not leave "Camry" sitting in the model dropdown at zero.
    models: facetFor(listable, f, 'model'),
    bodyStyles: facetFor(listable, f, 'bodyStyle'),
    transmissions: facetFor(listable, f, 'transmission'),
    drivetrains: facetFor(listable, f, 'drivetrain'),
    fuelTypes: facetFor(listable, f, 'fuelType'),
    exteriorColors: facetFor(listable, f, 'exteriorColor'),
    yearRange: rangeOf(listable.map((v) => v.year)),
    priceRangeCents: rangeOf(prices),
    mileageMax: rangeOf(listable.map((v) => v.mileage))?.max ?? null,
    totalListable: listable.length,
  }
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/**
 * Slice one page out of a sorted result set. A page number past the end
 * clamps to the last page rather than rendering an empty grid, which is
 * what a stale bookmark or a crawler following an old link will ask for
 * after the lot turns over.
 */
export function paginate(vehicles: Vehicle[], page = 1, pageSize = PAGE_SIZE): InventoryPage {
  const total = vehicles.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * pageSize
  return {
    vehicles: vehicles.slice(start, start + pageSize),
    total,
    page: current,
    pageCount,
    pageSize,
  }
}

/**
 * Rank other vehicles by how plausible a substitute they are for one the
 * shopper is already looking at. Body style outranks make, because someone
 * on a truck page wants another truck more than they want another Ford.
 */
export function pickSimilar(all: Vehicle[], vehicle: Vehicle, limit: number): Vehicle[] {
  const candidates = all.filter((v) => v.id !== vehicle.id && isPubliclyListable(v))
  const scored = candidates.map((v) => {
    let score = 0
    if (v.bodyStyle && norm(v.bodyStyle) === norm(vehicle.bodyStyle)) score += 3
    if (v.make && norm(v.make) === norm(vehicle.make)) score += 2
    // A car in the same money is a substitute even across body styles.
    if (
      v.priceCents != null &&
      vehicle.priceCents != null &&
      vehicle.priceCents > 0 &&
      Math.abs(v.priceCents - vehicle.priceCents) / vehicle.priceCents <= 0.25
    ) {
      score += 1
    }
    return { v, score }
  })
  scored.sort((a, b) => b.score - a.score || newestFirst(a.v, b.v))
  return scored.slice(0, limit).map((s) => s.v)
}
