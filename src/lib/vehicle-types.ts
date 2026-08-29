/**
 * The shape the site renders from -- shared between the real Postgres-backed
 * data-access layer (src/lib/inventory.ts) and the hand-written demo data
 * (src/lib/demo-inventory.ts) so both can be swapped behind the same
 * function signatures.
 */

export type VehiclePhoto = {
  id: string
  position: number
  urlThumb: string
  urlCard: string
  urlFull: string
  width: number
  height: number
  alt: string
}

export type VehicleStatus = 'available' | 'sold' | 'hidden'

export type Vehicle = {
  id: string
  slug: string
  vin: string | null
  stockNumber: string | null

  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  transmission: string | null
  engine: string | null
  fuelType: string | null
  doors: number | null
  exteriorColor: string | null
  interiorColor: string | null
  mileage: number | null

  priceCents: number | null
  downPaymentCents: number | null
  weeklyPaymentCents: number | null

  description: string | null
  features: string[]

  status: VehicleStatus
  priceReduced: boolean

  photos: VehiclePhoto[]

  createdAt: string
  soldAt: string | null
}

export type SortOption =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'mileage_asc'
  | 'year_desc'
  | 'year_asc'

/**
 * Every filter the inventory page can apply. All optional: an absent key
 * means "no constraint on this field", which is not the same as an empty
 * string -- see normalizeFilters in vehicle-filter.ts, which collapses
 * blank/whitespace values to absent so `?make=` behaves like no filter.
 *
 * The text fields (make, model, bodyStyle, ...) are matched
 * case-insensitively against the vehicle record, because Frazer feeds are
 * inconsistent about casing: "CHEVROLET", "Chevrolet" and "chevrolet" all
 * appear in real data.
 */
export type VehicleFilters = {
  /** Free-text keyword. Every whitespace-separated token must match. */
  q?: string
  make?: string
  model?: string
  bodyStyle?: string
  transmission?: string
  drivetrain?: string
  fuelType?: string
  exteriorColor?: string
  yearMin?: number
  yearMax?: number
  minPriceCents?: number
  maxPriceCents?: number
  maxMileage?: number
  sort?: SortOption
  /** 1-based. */
  page?: number
}

/** One selectable value in a filter dropdown, with its result count. */
export type FacetValue = {
  /** The exact value to put in the URL. */
  value: string
  /** How many vehicles would match if this value were selected. */
  count: number
}

export type NumericRange = { min: number; max: number }

/**
 * The options offered by each filter control, counted against the vehicles
 * that match every *other* active filter. That is what makes the counts
 * useful rather than decorative: with `make=Ford` selected, the Model
 * dropdown counts only Fords, but the Make dropdown still counts every
 * make, so the shopper can see what switching to Toyota would give them.
 */
export type FilterOptions = {
  makes: FacetValue[]
  models: FacetValue[]
  bodyStyles: FacetValue[]
  transmissions: FacetValue[]
  drivetrains: FacetValue[]
  fuelTypes: FacetValue[]
  exteriorColors: FacetValue[]
  /** Null when the lot is empty or no vehicle has the field populated. */
  yearRange: NumericRange | null
  priceRangeCents: NumericRange | null
  mileageMax: number | null
  /** Vehicles publicly listable right now, before any filter is applied. */
  totalListable: number
}

/** One page of results, plus everything the page chrome needs to render. */
export type InventoryPage = {
  vehicles: Vehicle[]
  /** Total matches across all pages, not just this one. */
  total: number
  page: number
  pageCount: number
  pageSize: number
}
