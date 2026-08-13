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

export type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'mileage_asc'

export type VehicleFilters = {
  make?: string
  bodyStyle?: string
  maxPriceCents?: number
  maxMileage?: number
  sort?: SortOption
}

export type FilterOptions = {
  makes: string[]
  bodyStyles: string[]
}
