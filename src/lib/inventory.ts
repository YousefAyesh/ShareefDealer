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
 * All filtering, sorting, faceting and pagination lives in the pure
 * vehicle-filter module, which both paths call. This module's only job is
 * getting rows out of somewhere and handing them over.
 *
 * Minimum-photo guard (see docs/superpowers/specs/2026-08-12-dealership-
 * site-design.md §4.7): a vehicle with zero photos never appears on a
 * listing page, and its VDP is treated as not found. It stays ingested so
 * it appears automatically the moment the dealer adds a photo.
 */
import { cache } from 'react'
import { asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/db'
import { vehiclePhotos, vehicles as vehiclesTable } from '@/db/schema'
import { DEMO_VEHICLES } from './demo-inventory'
import {
  buildFilterOptions,
  isPubliclyListable,
  matchesFilters,
  paginate,
  pickSimilar,
  sortVehicles,
} from './vehicle-filter'
import type {
  FilterOptions,
  InventoryPage,
  Vehicle,
  VehicleFilters,
  VehiclePhoto,
} from './vehicle-types'

function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true'
}

/** Filter, sort and slice one page out of a full vehicle set. */
function selectPage(all: Vehicle[], filters: VehicleFilters): InventoryPage {
  const matching = all.filter((v) => isPubliclyListable(v) && matchesFilters(v, filters))
  return paginate(sortVehicles(matching, filters.sort), filters.page)
}

// ---------------------------------------------------------------------------
// Demo path -- reads from the hand-written module, never touches Postgres.
// ---------------------------------------------------------------------------

function demoListVehicles(filters: VehicleFilters): InventoryPage {
  return selectPage(DEMO_VEHICLES, filters)
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

function demoGetFilterOptions(filters: VehicleFilters): FilterOptions {
  return buildFilterOptions(DEMO_VEHICLES, filters)
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

/**
 * Every non-hidden vehicle, with photos attached. Hidden vehicles are an
 * admin-only override and are never fetched for the public site.
 *
 * Wrapped in React's `cache` so that rendering one inventory page -- which
 * needs the vehicle list, the facet counts and the unfiltered total --
 * reads the table once rather than three times.
 */
const fetchPublicVehicles = cache(async function fetchPublicVehicles(): Promise<Vehicle[]> {
  const vehicleRows = await db.select().from(vehiclesTable).where(ne(vehiclesTable.status, 'hidden'))
  if (vehicleRows.length === 0) return []
  const ids = vehicleRows.map((v) => v.id)
  const photoRows = await db.select().from(vehiclePhotos).where(inArray(vehiclePhotos.vehicleId, ids))
  return rowsToVehicles(vehicleRows, photoRows)
})

async function dbListVehicles(filters: VehicleFilters): Promise<InventoryPage> {
  return selectPage(await fetchPublicVehicles(), filters)
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

async function dbGetFilterOptions(filters: VehicleFilters): Promise<FilterOptions> {
  return buildFilterOptions(await fetchPublicVehicles(), filters)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listVehicles(filters: VehicleFilters = {}): Promise<InventoryPage> {
  if (isDemoMode()) return demoListVehicles(filters)
  return dbListVehicles(filters)
}

/**
 * Memoized per request: the vehicle page looks a slug up twice, once in
 * generateMetadata and once in the component, and without this that is two
 * round trips to Postgres for the same row on every vehicle view.
 */
export const getVehicleBySlug = cache(async function getVehicleBySlug(
  slug: string,
): Promise<Vehicle | null> {
  if (isDemoMode()) return demoGetVehicleBySlug(slug)
  return dbGetVehicleBySlug(slug)
})

export async function getNewestArrivals(limit = 6): Promise<Vehicle[]> {
  if (isDemoMode()) return demoGetNewestArrivals(limit)
  return dbGetNewestArrivals(limit)
}

export async function getSimilarVehicles(vehicle: Vehicle, limit = 3): Promise<Vehicle[]> {
  if (isDemoMode()) return demoGetSimilarVehicles(vehicle, limit)
  return dbGetSimilarVehicles(vehicle, limit)
}

/**
 * Facet counts are computed against the currently active filters, so the
 * caller must pass them in -- see buildFilterOptions for why the counts
 * exclude each field's own filter.
 */
export async function getFilterOptions(filters: VehicleFilters = {}): Promise<FilterOptions> {
  if (isDemoMode()) return demoGetFilterOptions(filters)
  return dbGetFilterOptions(filters)
}

/**
 * Slug + last-modified for every publicly listable vehicle. Used only by
 * the sitemap, which needs every URL rather than one page of them.
 */
export async function getAllListableVehicles(): Promise<Vehicle[]> {
  const all = isDemoMode() ? DEMO_VEHICLES : await fetchPublicVehicles()
  return sortVehicles(all.filter(isPubliclyListable), 'newest')
}

export type {
  FacetValue,
  FilterOptions,
  InventoryPage,
  SortOption,
  Vehicle,
  VehicleFilters,
  VehiclePhoto,
} from './vehicle-types'
