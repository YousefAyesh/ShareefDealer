import { stableHash } from '@/lib/hash'
import { buildSlug } from '@/lib/slug'
import type { CanonicalVehicle, RawVehicle } from './types'

const VIN_LENGTH = 17
const MIN_YEAR = 1900
const MAX_YEAR = new Date().getFullYear() + 2

/** Zero and negative money are treated as "not provided" — see spec §4.4. */
export function parseMoneyCents(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export function parseIntSafe(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** Only rewrites strings that are entirely uppercase; leaves good input alone. */
export function titleCase(value: string | null): string | null {
  if (!value) return null
  if (value !== value.toUpperCase()) return value
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

function normalizeVin(vin: string | null): string | null {
  if (!vin) return null
  const upper = vin.trim().toUpperCase()
  return upper.length === VIN_LENGTH ? upper : null
}

function normalizeYear(year: string | null): number | null {
  const n = parseIntSafe(year)
  if (n === null || n < MIN_YEAR || n > MAX_YEAR) return null
  return n
}

/** Returns null when the vehicle has no usable identity and must be skipped. */
export function normalizeVehicle(raw: RawVehicle): CanonicalVehicle | null {
  const vin = normalizeVin(raw.vin)
  const stockNumber = raw.stockNumber?.trim() || null

  const sourceKey = vin ?? stockNumber
  if (!sourceKey) return null
  const sourceKeyType: 'vin' | 'stock' = vin ? 'vin' : 'stock'

  const fields = {
    sourceKey,
    sourceKeyType,
    vin,
    stockNumber,
    year: normalizeYear(raw.year),
    make: titleCase(raw.make),
    model: titleCase(raw.model),
    trim: titleCase(raw.trim),
    bodyStyle: titleCase(raw.bodyStyle),
    drivetrain: raw.drivetrain?.trim() ?? null,
    transmission: titleCase(raw.transmission),
    engine: raw.engine?.trim() ?? null,
    fuelType: titleCase(raw.fuelType),
    doors: parseIntSafe(raw.doors),
    exteriorColor: titleCase(raw.exteriorColor),
    interiorColor: titleCase(raw.interiorColor),
    mileage: parseIntSafe(raw.mileage),
    priceCents: parseMoneyCents(raw.price),
    downPaymentCents: parseMoneyCents(raw.downPayment),
    weeklyPaymentCents: parseMoneyCents(raw.weeklyPayment),
    description: raw.description?.trim() ?? null,
    features: raw.features,
    photoUrls: raw.photoUrls,
  }

  return {
    ...fields,
    slug: buildSlug({
      year: fields.year, make: fields.make, model: fields.model,
      trim: fields.trim, sourceKey,
    }),
    sourceHash: stableHash(fields),
  }
}
