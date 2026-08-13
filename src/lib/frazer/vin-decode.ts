import { titleCase } from './normalize'

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin'
const TIMEOUT_MS = 5000

/** vPIC returns these instead of empty strings. */
const PLACEHOLDERS = new Set(['not applicable', 'not available', 'n/a', ''])

export type VinDecodeResult = {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  fuelType: string | null
}

export type DecodableFields = VinDecodeResult

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  return trimmed
}

/**
 * Enrichment only. Returns null on any failure — a sync must never
 * depend on a third-party API being up. Spec §4.4.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  if (!vin || vin.length !== 17) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`${VPIC_URL}/${encodeURIComponent(vin)}?format=json`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return null
    const body = (await res.json()) as { Results?: Record<string, unknown>[] }
    const r = body?.Results?.[0]
    if (!r) return null

    const yearRaw = clean(r.ModelYear)
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null

    return {
      year,
      make: titleCase(clean(r.Make)),
      model: clean(r.Model),
      trim: clean(r.Trim),
      bodyStyle: clean(r.BodyClass),
      drivetrain: clean(r.DriveType),
      fuelType: clean(r.FuelTypePrimary),
    }
  } catch {
    return null
  }
}

/** Feed values always win; decoded values only fill gaps. */
export function applyVinDecode<T extends DecodableFields>(
  fields: T,
  decoded: VinDecodeResult | null,
): T {
  if (!decoded) return fields
  return {
    ...fields,
    year: fields.year ?? decoded.year,
    make: fields.make ?? decoded.make,
    model: fields.model ?? decoded.model,
    trim: fields.trim ?? decoded.trim,
    bodyStyle: fields.bodyStyle ?? decoded.bodyStyle,
    drivetrain: fields.drivetrain ?? decoded.drivetrain,
    fuelType: fields.fuelType ?? decoded.fuelType,
  }
}
