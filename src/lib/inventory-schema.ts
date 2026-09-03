import { z } from 'zod'

/**
 * The shape of an inventory/<slug>.json file.
 *
 * This is the format a person (or an agent acting for one) writes by hand,
 * so it is deliberately not the same as the `Vehicle` type the site renders
 * from. Three differences, each of which removes a way to get it wrong:
 *
 *  - Money is in DOLLARS, not cents. `"price": 18995`. The internal type
 *    uses cents, and a hand-written 1899500 that was meant to be 18995 is a
 *    hundredfold pricing error published to the public web. Dollars are
 *    what a person says out loud, so dollars are what the file holds.
 *
 *  - There is no photos array. Photos are whatever sits in
 *    public/inventory/<slug>/, in filename order. Adding photos is copying
 *    files into a folder; there is no list to keep in sync with the disk,
 *    and therefore no way for the two to disagree.
 *
 *  - There is no id. The filename is the id and the URL slug.
 *
 * Nearly every field is optional, because a real listing is often posted
 * before every detail is known. Only year, make and model are required --
 * without those there is no headline to render and no way to name the car.
 */

const YEAR_MIN = 1900
const YEAR_MAX = new Date().getFullYear() + 2

const money = (label: string) =>
  z
    .number({ message: `${label} must be a number of dollars, e.g. 18995 (no "$", no commas)` })
    .int(`${label} must be a whole number of dollars`)
    .min(0, `${label} cannot be negative`)
    .max(1_000_000, `${label} looks wrong — over $1,000,000. Is it in cents by mistake?`)
    .optional()

export const vehicleFileSchema = z.object({
  year: z
    .number({ message: 'year is required, e.g. 2019' })
    .int()
    .min(YEAR_MIN, `year must be ${YEAR_MIN} or later`)
    .max(YEAR_MAX, `year cannot be past ${YEAR_MAX}`),
  make: z.string({ message: 'make is required, e.g. "Chevrolet"' }).min(1),
  model: z.string({ message: 'model is required, e.g. "Silverado 1500"' }).min(1),

  trim: z.string().optional(),
  stockNumber: z.string().optional(),
  vin: z
    .string()
    .length(17, 'vin must be exactly 17 characters — leave it out if you do not have it')
    .optional(),

  bodyStyle: z.string().optional(),
  drivetrain: z.string().optional(),
  transmission: z.string().optional(),
  engine: z.string().optional(),
  fuelType: z.string().optional(),
  doors: z.number().int().min(1).max(8).optional(),
  exteriorColor: z.string().optional(),
  interiorColor: z.string().optional(),
  mileage: z
    .number()
    .int('mileage must be a whole number')
    .min(0)
    .max(2_000_000, 'mileage looks wrong — over 2,000,000')
    .optional(),

  price: money('price'),

  description: z.string().optional(),
  features: z.array(z.string()).optional(),

  status: z
    .enum(['available', 'sold', 'hidden'], {
      message: 'status must be "available", "sold" or "hidden"',
    })
    .optional(),
  priceReduced: z.boolean().optional(),

  listedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'listedAt must look like 2026-08-29')
    .optional(),
})

export type VehicleFile = z.infer<typeof vehicleFileSchema>

/**
 * Keys that would publish credit terms.
 *
 * This is a cash-only dealership: it does not finance, so no listing may
 * carry a down payment, a periodic payment, a term or a rate. Stating any
 * of those in an advertisement is what triggers Regulation Z's disclosure
 * requirements (12 CFR 1026.24), which this site makes no attempt to
 * satisfy -- and the figures would simply be untrue besides.
 *
 * zod strips unknown keys silently, so a file pasted from the old format
 * would otherwise lose its payment fields without anyone noticing the
 * mismatch. Checking the raw input first makes it a loud, explained
 * failure in `npm run check:inventory` instead.
 */
const CREDIT_TERM_KEYS = [
  'downPayment',
  'weeklyPayment',
  'monthlyPayment',
  'biweeklyPayment',
  'payment',
  'apr',
  'interestRate',
  'termMonths',
  'financing',
] as const

function creditTermProblems(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return []
  const keys = new Set(Object.keys(raw))
  return CREDIT_TERM_KEYS.filter((k) => keys.has(k)).map(
    (k) =>
      `${k}: remove this field. This dealership is cash only, and publishing a payment, rate or term on a listing advertises credit the dealership does not offer. List the price alone.`,
  )
}

export type ParseResult =
  | { ok: true; value: VehicleFile }
  | { ok: false; errors: string[] }

/**
 * Parse one file's contents, turning zod's output into plain sentences.
 * These messages are read by whoever is fixing the file -- often an agent
 * relaying them to a dealer -- so they name the field and say what to do.
 */
export function parseVehicleFile(raw: unknown): ParseResult {
  const credit = creditTermProblems(raw)
  if (credit.length > 0) return { ok: false, errors: credit }

  const result = vehicleFileSchema.safeParse(raw)
  if (result.success) return { ok: true, value: result.data }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
  return { ok: false, errors }
}
