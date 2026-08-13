/**
 * The real data-access layer for the public site. Every exported function
 * starts with the same shape:
 *
 *   if (isDemoMode()) return demoXxx(...)
 *   ...real Postgres query via Drizzle...
 *
 * That single `if` is the entire demo branch -- deliberately not scattered
 * through the function bodies, so it's trivial to delete once the Frazer
 * feed is live: delete the `if` lines, delete demo-inventory.ts, done.
 *
 * Minimum-photo guard (see docs/superpowers/specs/2026-08-12-dealership-
 * site-design.md §4.7): a vehicle with zero photos never appears on a
 * listing page, and its VDP is treated as not found. It stays ingested so
 * it appears automatically the moment the dealer adds a photo.
 */
import { asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/db'
import { vehiclePhotos, vehicles as vehiclesTable } from '@/db/schema'
import { DEMO_VEHICLES } from './demo-inventory'
import type { FilterOptions, SortOption, Vehicle, VehicleFilters, VehiclePhoto } from './vehicle-types'

function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true'
}

// ---------------------------------------------------------------------------
// Shared, pure logic -- used by both the demo path and the real Postgres
// path so filtering/sorting/similarity behave identically no matter where
// the data came from.
// ---------------------------------------------------------------------------

function isPubliclyListable(v: Vehicle): boolean {
  return v.status === 'available' && v.photos.length > 0
}

function matchesFilters(v: Vehicle, filters: VehicleFilters): boolean {
  if (filters.make && v.make?.toLowerCase() !== filters.make.toLowerCase()) return false
  if (filters.bodyStyle && v.bodyStyle?.toLowerCase() !== filters.bodyStyle.toLowerCase()) return false
  if (filters.maxPriceCents != null) {
    if (v.priceCents == null || v.priceCents > filters.maxPriceCents) return false
  }
  if (filters.maxMileage != null) {
    if (v.mileage == null || v.mileage > filters.maxMileage) return false
  }
  return true
}

function comparePrice(a: Vehicle, b: Vehicle, dir: 1 | -1): number {
  // "Call for Price" (null) vehicles always sort last, in either direction --
  // there's no meaningful position for an unknown price in a price-ordered
  // list.
  if (a.priceCents == null && b.priceCents == null) return 0
  if (a.priceCents == null) return 1
  if (b.priceCents == null) return -1
  return dir * (a.priceCents - b.priceCents)
}

function compareMileage(a: Vehicle, b: Vehicle): number {
  if (a.mileage == null && b.mileage == null) return 0
  if (a.mileage == null) return 1
  if (b.mileage == null) return -1
  return a.mileage - b.mileage
}

function sortVehicles(list: Vehicle[], sort: SortOption = 'newest'): Vehicle[] {
  const arr = [...list]
  switch (sort) {
    case 'price_asc':
      return arr.sort((a, b) => comparePrice(a, b, 1))
    case 'price_desc':
      return arr.sort((a, b) => comparePrice(a, b, -1))
    case 'mileage_asc':
      return arr.sort(compareMileage)
    case 'newest':
    default:
      return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
}

function pickSimilar(all: Vehicle[], vehicle: Vehicle, limit: number): Vehicle[] {
  const candidates = all.filter((v) => v.id !== vehicle.id && isPubliclyListable(v))
  const scored = candidates.map((v) => {
    let score = 0
    if (v.bodyStyle && v.bodyStyle === vehicle.bodyStyle) score += 2
    if (v.make && v.make === vehicle.make) score += 1
    return { v, score }
  })
  scored.sort((a, b) => b.score - a.score || new Date(b.v.createdAt).getTime() - new Date(a.v.createdAt).getTime())
  return scored.slice(0, limit).map((s) => s.v)
}

function buildFilterOptions(all: Vehicle[]): FilterOptions {
  const listable = all.filter(isPubliclyListable)
  const makes = Array.from(new Set(listable.map((v) => v.make).filter((m): m is string => Boolean(m)))).sort()
  const bodyStyles = Array.from(
    new Set(listable.map((v) => v.bodyStyle).filter((b): b is string => Boolean(b))),
  ).sort()
  return { makes, bodyStyles }
}

// ---------------------------------------------------------------------------
// Demo path -- reads from the hand-written module, never touches Postgres.
// ---------------------------------------------------------------------------

function demoListVehicles(filters: VehicleFilters): Vehicle[] {
  const matching = DEMO_VEHICLES.filter((v) => isPubliclyListable(v) && matchesFilters(v, filters))
  return sortVehicles(matching, filters.sort)
}

function demoGetVehicleBySlug(slug: string): Vehicle | null {
  const found = DEMO_VEHICLES.find((v) => v.slug === slug)
  if (!found) return null
  if (found.status === 'hidden') return null
  if (found.photos.length === 0) return null
  return found
}

function demoGetNewestArrivals(limit: number): Vehicle[] {
  return sortVehicles(DEMO_VEHICLES.filter(isPubliclyListable), 'newest').slice(0, limit)
}

function demoGetSimilarVehicles(vehicle: Vehicle, limit: number): Vehicle[] {
  return pickSimilar(DEMO_VEHICLES, vehicle, limit)
}

function demoGetFilterOptions(): FilterOptions {
  return buildFilterOptions(DEMO_VEHICLES)
}

// ---------------------------------------------------------------------------
// Real path -- Postgres via the Drizzle setup in src/db.
// ---------------------------------------------------------------------------

type VehicleRow = typeof vehiclesTable.$inferSelect
type PhotoRow = typeof vehiclePhotos.$inferSelect

function rowToPhoto(p: PhotoRow): VehiclePhoto {
  return {
    id: p.id,
    position: p.position,
    urlThumb: p.urlThumb,
    urlCard: p.urlCard,
    urlFull: p.urlFull,
    width: p.width,
    height: p.height,
    alt: p.alt,
  }
}

function rowsToVehicles(vehicleRows: VehicleRow[], photoRows: PhotoRow[]): Vehicle[] {
  const photosByVehicle = new Map<string, PhotoRow[]>()
  for (const p of photoRows) {
    const list = photosByVehicle.get(p.vehicleId) ?? []
    list.push(p)
    photosByVehicle.set(p.vehicleId, list)
  }

  return vehicleRows.map((v) => ({
    id: v.id,
    slug: v.slug,
    vin: v.vin,
    stockNumber: v.stockNumber,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    bodyStyle: v.bodyStyle,
    drivetrain: v.drivetrain,
    transmission: v.transmission,
    engine: v.engine,
    fuelType: v.fuelType,
    doors: v.doors,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    mileage: v.mileage,
    priceCents: v.priceCents,
    downPaymentCents: v.downPaymentCents,
    weeklyPaymentCents: v.weeklyPaymentCents,
    description: v.description,
    features: v.features,
    status: v.status,
    priceReduced: v.priceReduced,
    photos: (photosByVehicle.get(v.id) ?? []).sort((a, b) => a.position - b.position).map(rowToPhoto),
    createdAt: v.createdAt.toISOString(),
    soldAt: v.soldAt ? v.soldAt.toISOString() : null,
  }))
}

/** Every non-hidden vehicle, with photos attached. Hidden vehicles are an
 * admin-only override and are never fetched for the public site. */
async function fetchPublicVehicles(): Promise<Vehicle[]> {
  const vehicleRows = await db.select().from(vehiclesTable).where(ne(vehiclesTable.status, 'hidden'))
  if (vehicleRows.length === 0) return []
  const ids = vehicleRows.map((v) => v.id)
  const photoRows = await db.select().from(vehiclePhotos).where(inArray(vehiclePhotos.vehicleId, ids))
  return rowsToVehicles(vehicleRows, photoRows)
}

async function dbListVehicles(filters: VehicleFilters): Promise<Vehicle[]> {
  const all = await fetchPublicVehicles()
  const matching = all.filter((v) => isPubliclyListable(v) && matchesFilters(v, filters))
  return sortVehicles(matching, filters.sort)
}

async function dbGetVehicleBySlug(slug: string): Promise<Vehicle | null> {
  const rows = await db.select().from(vehiclesTable).where(eq(vehiclesTable.slug, slug)).limit(1)
  const row = rows[0]
  if (!row || row.status === 'hidden') return null
  const photoRows = await db
    .select()
    .from(vehiclePhotos)
    .where(eq(vehiclePhotos.vehicleId, row.id))
    .orderBy(asc(vehiclePhotos.position))
  const [vehicle] = rowsToVehicles([row], photoRows)
  if (!vehicle || vehicle.photos.length === 0) return null
  return vehicle
}

async function dbGetNewestArrivals(limit: number): Promise<Vehicle[]> {
  const all = await fetchPublicVehicles()
  return sortVehicles(all.filter(isPubliclyListable), 'newest').slice(0, limit)
}

async function dbGetSimilarVehicles(vehicle: Vehicle, limit: number): Promise<Vehicle[]> {
  const all = await fetchPublicVehicles()
  return pickSimilar(all, vehicle, limit)
}

async function dbGetFilterOptions(): Promise<FilterOptions> {
  const all = await fetchPublicVehicles()
  return buildFilterOptions(all)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listVehicles(filters: VehicleFilters = {}): Promise<Vehicle[]> {
  if (isDemoMode()) return demoListVehicles(filters)
  return dbListVehicles(filters)
}

export async function getVehicleBySlug(slug: string): Promise<Vehicle | null> {
  if (isDemoMode()) return demoGetVehicleBySlug(slug)
  return dbGetVehicleBySlug(slug)
}

export async function getNewestArrivals(limit = 6): Promise<Vehicle[]> {
  if (isDemoMode()) return demoGetNewestArrivals(limit)
  return dbGetNewestArrivals(limit)
}

export async function getSimilarVehicles(vehicle: Vehicle, limit = 3): Promise<Vehicle[]> {
  if (isDemoMode()) return demoGetSimilarVehicles(vehicle, limit)
  return dbGetSimilarVehicles(vehicle, limit)
}

export async function getFilterOptions(): Promise<FilterOptions> {
  if (isDemoMode()) return demoGetFilterOptions()
  return dbGetFilterOptions()
}

export type { FilterOptions, SortOption, Vehicle, VehicleFilters, VehiclePhoto } from './vehicle-types'
