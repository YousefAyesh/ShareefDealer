/**
 * Pure display formatters for vehicle data. No I/O, no DB access.
 *
 * These formatters never compute or estimate a number that isn't already on
 * the record. There is deliberately no payment formatter: this dealership
 * is cash only, so a listing shows the price and nothing else. See
 * CREDIT_TERM_KEYS in inventory-schema.ts.
 */

export function formatPrice(cents: number | null | undefined): string {
  // A blank or zero price must never render as "$0" -- treat it the same
  // as missing. Real vehicles are never free; a 0 here means the dealer
  // hasn't priced the car yet.
  if (cents == null || cents === 0) return 'Call for Price'
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}

export function formatMileage(mi: number | null | undefined): string {
  if (mi == null) return 'Mileage unavailable'
  return `${mi.toLocaleString('en-US')} miles`
}

export type VehicleTitleInput = {
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
}

export function vehicleTitle(v: VehicleTitleInput): string {
  return [v.year, v.make, v.model, v.trim]
    .filter((part): part is string | number => part != null && String(part).trim() !== '')
    .map(String)
    .join(' ')
}
