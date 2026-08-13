/**
 * Whatever came out of the feed. Every field is a string or null because
 * nothing from the feed is trusted until normalize.ts validates it.
 */
export type RawVehicle = {
  vin: string | null
  stockNumber: string | null
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  transmission: string | null
  engine: string | null
  fuelType: string | null
  doors: string | null
  exteriorColor: string | null
  interiorColor: string | null
  mileage: string | null
  price: string | null
  downPayment: string | null
  weeklyPayment: string | null
  description: string | null
  features: string[]
  photoUrls: string[]
}

/** Validated, typed, normalized. This is what the rest of the system uses. */
export type CanonicalVehicle = {
  sourceKey: string
  sourceKeyType: 'vin' | 'stock'
  vin: string | null
  stockNumber: string | null
  slug: string
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
  photoUrls: string[]
  sourceHash: string
  /** Raw vPIC response, attached by decorateWithVin in a later task. Not hashed. */
  vinDecoded?: Record<string, unknown> | null
}

/** Every transport (XML feed, SFTP CSV, manual upload) implements this. */
export type FeedAdapter = {
  name: 'xml_feed' | 'sftp' | 'manual'
  parse(payload: string): RawVehicle[]
}
