/**
 * The data layer for the public site: reads the checked-in inventory files.
 *
 * There is no database and no external service. A vehicle is one JSON file
 * in inventory/, its photos are the images in public/inventory/<slug>/, and
 * the slug is the filename. Adding a car is adding a file; removing one is
 * removing a file; both are ordinary commits with an ordinary diff, and the
 * whole state of the lot is readable without running anything.
 *
 * That is a deliberate trade. A synced feed keeps itself current and this
 * does not -- the site is exactly as fresh as the last commit. In exchange
 * there is nothing to provision, nothing to pay for, nothing with
 * credentials that can expire, and no state that can drift out of step with
 * what is on the screen. For a lot of a few dozen cars updated by hand, that
 * is the better end of the trade.
 *
 * All filtering, sorting, faceting and pagination lives in the pure
 * vehicle-filter module. This module's only job is turning files into
 * `Vehicle` objects.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cache } from 'react'
import { parseVehicleFile, type VehicleFile } from './inventory-schema'
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

const INVENTORY_DIR = join(process.cwd(), 'inventory')
const PHOTO_DIR = join(process.cwd(), 'public', 'inventory')

/**
 * Every photo is normalised to exactly this by scripts/photos.mjs, so the
 * dimensions are known without opening the files. Keep these two numbers in
 * step with the WIDTH/HEIGHT constants in that script.
 */
const PHOTO_WIDTH = 1600
const PHOTO_HEIGHT = 1200

function titleOf(v: VehicleFile): string {
  return [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')
}

/**
 * The photos for a vehicle, in filename order -- 01.webp first, and that
 * one is the listing card image. A vehicle whose folder is missing or empty
 * gets no photos, and vehicle-filter's isPubliclyListable then keeps it off
 * every listing page: a car nobody can see a picture of is not a car anyone
 * calls about.
 */
function readPhotos(slug: string, title: string): VehiclePhoto[] {
  const dir = join(PHOTO_DIR, slug)
  if (!existsSync(dir)) return []

  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.webp'))
    .sort()
    .map((file, position) => {
      const url = `/inventory/${slug}/${file}`
      return {
        id: `${slug}-${position}`,
        position,
        // One file per photo. next/image derives the smaller sizes it needs
        // at request time and caches them, so there is no reason to store
        // three copies of every picture in git.
        urlThumb: url,
        urlCard: url,
        urlFull: url,
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
        alt: `${title} — photo ${position + 1}`,
      }
    })
}

function toVehicle(slug: string, file: VehicleFile, listedAt: string): Vehicle {
  const title = titleOf(file)
  // Dollars in the file, cents everywhere inside the site.
  const cents = (dollars: number | undefined) => (dollars == null ? null : dollars * 100)

  return {
    id: slug,
    slug,
    vin: file.vin ?? null,
    stockNumber: file.stockNumber ?? null,
    year: file.year,
    make: file.make,
    model: file.model,
    trim: file.trim ?? null,
    bodyStyle: file.bodyStyle ?? null,
    drivetrain: file.drivetrain ?? null,
    transmission: file.transmission ?? null,
    engine: file.engine ?? null,
    fuelType: file.fuelType ?? null,
    doors: file.doors ?? null,
    exteriorColor: file.exteriorColor ?? null,
    interiorColor: file.interiorColor ?? null,
    mileage: file.mileage ?? null,
    priceCents: cents(file.price),
    downPaymentCents: cents(file.downPayment),
    weeklyPaymentCents: cents(file.weeklyPayment),
    description: file.description ?? null,
    features: file.features ?? [],
    status: file.status ?? 'available',
    priceReduced: file.priceReduced ?? false,
    photos: readPhotos(slug, title),
    createdAt: listedAt,
    soldAt: null,
  }
}

export type InventoryProblem = { file: string; errors: string[] }

/**
 * Read and validate every inventory file. Invalid files are reported and
 * skipped rather than thrown, so one malformed car cannot take the whole
 * site down -- `npm run check:inventory` is what turns the same problems
 * into a failed build, before anything reaches production.
 */
export function loadInventory(): { vehicles: Vehicle[]; problems: InventoryProblem[] } {
  if (!existsSync(INVENTORY_DIR)) return { vehicles: [], problems: [] }

  const vehicles: Vehicle[] = []
  const problems: InventoryProblem[] = []

  for (const filename of readdirSync(INVENTORY_DIR).sort()) {
    if (!filename.endsWith('.json')) continue
    const slug = filename.slice(0, -'.json'.length)
    const path = join(INVENTORY_DIR, filename)

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'))
    } catch (error) {
      problems.push({
        file: filename,
        errors: [`not valid JSON — ${(error as Error).message}`],
      })
      continue
    }

    const parsed = parseVehicleFile(raw)
    if (!parsed.ok) {
      problems.push({ file: filename, errors: parsed.errors })
      continue
    }

    // listedAt drives "newest arrivals". Falling back to the file's own
    // modified time means a car added without one still sorts sensibly
    // instead of landing at the epoch, at the cost of moving up the list
    // when edited -- which is why the schema asks for it explicitly.
    const listedAt = parsed.value.listedAt
      ? new Date(`${parsed.value.listedAt}T12:00:00Z`).toISOString()
      : statSync(path).mtime.toISOString()

    vehicles.push(toVehicle(slug, parsed.value, listedAt))
  }

  return { vehicles, problems }
}

/** Memoized for the duration of one request. */
const allVehicles = cache(function allVehicles(): Vehicle[] {
  const { vehicles, problems } = loadInventory()
  for (const problem of problems) {
    console.error(`inventory/${problem.file} skipped:\n  - ${problem.errors.join('\n  - ')}`)
  }
  return vehicles
})

function selectPage(all: Vehicle[], filters: VehicleFilters): InventoryPage {
  const matching = all.filter((v) => isPubliclyListable(v) && matchesFilters(v, filters))
  return paginate(sortVehicles(matching, filters.sort), filters.page)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listVehicles(filters: VehicleFilters = {}): Promise<InventoryPage> {
  return selectPage(allVehicles(), filters)
}

export const getVehicleBySlug = cache(async function getVehicleBySlug(
  slug: string,
): Promise<Vehicle | null> {
  const found = allVehicles().find((v) => v.slug === slug)
  if (!found) return null
  // Hidden is an explicit "not on the site"; no photos means there is
  // nothing to show. Both are 404 rather than a broken-looking page.
  if (found.status === 'hidden') return null
  if (found.photos.length === 0) return null
  return found
})

export async function getNewestArrivals(limit = 6): Promise<Vehicle[]> {
  return sortVehicles(allVehicles().filter(isPubliclyListable), 'newest').slice(0, limit)
}

export async function getSimilarVehicles(vehicle: Vehicle, limit = 3): Promise<Vehicle[]> {
  return pickSimilar(allVehicles(), vehicle, limit)
}

/**
 * Facet counts are computed against the currently active filters, so the
 * caller must pass them in -- see buildFilterOptions for why the counts
 * exclude each field's own filter.
 */
export async function getFilterOptions(filters: VehicleFilters = {}): Promise<FilterOptions> {
  return buildFilterOptions(allVehicles(), filters)
}

/** Every listable vehicle. Used by the sitemap, which needs all of them. */
export async function getAllListableVehicles(): Promise<Vehicle[]> {
  return sortVehicles(allVehicles().filter(isPubliclyListable), 'newest')
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
