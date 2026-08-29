/**
 * Pure display formatters for vehicle data. No I/O, no DB access.
 *
 * These formatters never compute or estimate a number that isn't already on
 * the record. A payment shown on a dealer site is one the dealer is legally
 * held to, so formatPayment returns null unless the feed supplied both the
 * down payment and the periodic payment -- it will not derive one from the
 * other, or from the price.
 */

export function formatPrice(cents: number | null | undefined): string {
  // A blank or zero price must never render as "$0" -- treat it the same
  // as missing. Real vehicles are never free; a 0 here means the dealer
  // hasn't priced the car yet.
  if (cents == null || cents === 0) return 'Call for Price'
  const dollars = Math.round(cents / 100)
  return `$${dollars.toLocaleString('en-US')}`
}

export function formatPayment(
  downCents: number | null | undefined,
  weeklyCents: number | null | undefined,
): string | null {
  if (downCents == null || weeklyCents == null) return null
  const down = Math.round(downCents / 100)
  const weekly = Math.round(weeklyCents / 100)
  return `$${down.toLocaleString('en-US')} down · $${weekly.toLocaleString('en-US')}/week`
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
