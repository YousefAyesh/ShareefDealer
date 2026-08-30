/**
 * Dealer identity constants used across the site: header, footer, home page
 * trust strip, VDP and site-wide JSON-LD, and the sticky call bar.
 *
 * ============================================================================
 * THIS FILE IS THE ONE PLACE TO SWAP IN THE REAL BUSINESS DETAILS.
 * ============================================================================
 *
 * Everything below is a deliberate, obviously-fictional placeholder: a 555
 * exchange (reserved by the NANP for fiction, so it can never ring a real
 * person), a `.example` domain (reserved by RFC 2606, so it can never
 * resolve), and a generic frontage-road address. They are fictional on
 * purpose -- a plausible-looking wrong phone number on a live dealer site
 * sends buyers to a stranger, and a plausible-looking wrong address sends
 * them to someone's house.
 *
 * The answers that replace these are questions 1-9 of
 * docs/client-intake-questions.md. Until they land, `assertRealDealerData`
 * below refuses to let the site build for production -- see that function.
 *
 * After editing, verify: `npm run build`.
 */

/**
 * The site's canonical origin, used for canonical tags, Open Graph URLs,
 * JSON-LD @id values and the sitemap.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL   — set this once there is a real domain.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel supplies this automatically
 *      and it is the *stable* production domain, not the per-deployment URL
 *      (VERCEL_URL), which changes on every push and would make canonical
 *      tags point at a deployment that is no longer current.
 *   3. The reserved .example domain, which the placeholder guard rejects.
 *
 * Every consumer is a server component or route handler, so this does not
 * need the NEXT_PUBLIC_ prefix to reach the browser -- it never does.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`

  return 'https://www.roadstarautosales.example'
}

export const SITE_URL = resolveSiteUrl()

export const DEALER = {
  name: 'Roadstar Auto Sales',
  /** Shown under the name in the footer. Keep it short. */
  tagline: 'Quality Used Cars — Austin, Texas',
  phoneDisplay: '(512) 555-0182',
  phoneTel: 'tel:+15125550182',
  /** Set to null if the main line cannot receive texts (intake question 5). */
  smsHref: 'sms:+15125550182' as string | null,
  email: 'info@roadstarautosales.example',
  address: {
    street: '3210 S I-35 Frontage Rd',
    city: 'Austin',
    state: 'TX',
    zip: '78741',
  },
  /**
   * Latitude/longitude for LocalBusiness JSON-LD. Google matches a
   * dealership to its Business Profile partly on this, so it is worth
   * getting exactly right -- right-click the lot in Google Maps and copy
   * the coordinates it shows.
   */
  geo: { latitude: 30.2226, longitude: -97.7386 },
  mapsHref: 'https://maps.google.com/?q=3210+S+I-35+Frontage+Rd,+Austin,+TX+78741',
  /**
   * Most states require the dealer license number to be displayed on any
   * site advertising vehicles for sale (intake question 7). Set to null
   * only if you have confirmed your state does not.
   */
  licenseNumber: 'P000000' as string | null,
  /**
   * IANA timezone. Used to work out which row of `hours` is "today".
   */
  timezone: 'America/Chicago',
  /**
   * One entry per weekday, index 0 = Sunday to match Date#getDay(), so
   * "open today" is a direct index rather than an off-by-one waiting to
   * happen. `null` hours means closed that day.
   */
  hours: [
    { day: 'Sunday', open: null, close: null },
    { day: 'Monday', open: '09:00', close: '19:00' },
    { day: 'Tuesday', open: '09:00', close: '19:00' },
    { day: 'Wednesday', open: '09:00', close: '19:00' },
    { day: 'Thursday', open: '09:00', close: '19:00' },
    { day: 'Friday', open: '09:00', close: '19:00' },
    { day: 'Saturday', open: '09:00', close: '18:00' },
  ] as const,
  /** Intake question 9. Shown next to the hours table. */
  byAppointmentOutsideHours: true,
  social: {
    facebook: null as string | null,
    instagram: null as string | null,
    googleBusiness: null as string | null,
  },
} as const

export const fullAddress = `${DEALER.address.street}, ${DEALER.address.city}, ${DEALER.address.state} ${DEALER.address.zip}`

/** "9:00 AM" from "09:00". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export type DealerDay = {
  day: string
  /** "9:00 AM – 7:00 PM" or "Closed". */
  label: string
  isClosed: boolean
}

export function formatHours(): DealerDay[] {
  return DEALER.hours.map((h) => ({
    day: h.day,
    label: h.open && h.close ? `${formatTime(h.open)} – ${formatTime(h.close)}` : 'Closed',
    isClosed: !h.open || !h.close,
  }))
}

/**
 * Today's hours, in the dealer's timezone rather than the server's. Vercel
 * runs in UTC, so after 6pm Central the server's idea of "today" is already
 * tomorrow and the home page would advertise the wrong hours.
 */
export function hoursToday(now: Date = new Date()): DealerDay {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: DEALER.timezone,
    weekday: 'long',
  }).format(now)
  const all = formatHours()
  return all.find((d) => d.day === weekday) ?? all[0]
}

/** Schema.org openingHoursSpecification, for the LocalBusiness JSON-LD. */
export function openingHoursSpecification() {
  return DEALER.hours
    .filter((h) => h.open && h.close)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${h.day}`,
      opens: h.open,
      closes: h.close,
    }))
}

// ---------------------------------------------------------------------------
// Placeholder guard
// ---------------------------------------------------------------------------

/**
 * Every marker that says "this is still fake data".
 *
 * Read by assertRealDealerData below, which the root layout calls at module
 * scope -- so it runs while Next is building the pages and fails the build
 * there. Deliberately not a separate build script: the one this replaced
 * shelled out to `node --experimental-strip-types`, which needs Node 22.6+
 * and therefore broke the build outright on any host running an older Node.
 */
export function placeholderProblems(): string[] {
  const problems: string[] = []

  if (SITE_URL.includes('.example')) {
    problems.push('SITE_URL is still the reserved .example domain — set NEXT_PUBLIC_SITE_URL or edit src/lib/dealer.ts')
  }
  // 555-01xx is the NANP fictional block. A real dealer number never
  // matches this, so it is a reliable signal rather than a heuristic.
  if (/\b555-?01\d\d\b/.test(DEALER.phoneDisplay) || DEALER.phoneTel.includes('5550')) {
    problems.push('DEALER.phoneDisplay/phoneTel is still the fictional 555-01xx number (intake question 4)')
  }
  if (DEALER.email.includes('.example')) {
    problems.push('DEALER.email is still an .example address (intake question 6)')
  }
  if (DEALER.address.street === '3210 S I-35 Frontage Rd') {
    problems.push('DEALER.address is still the placeholder frontage-road address (intake question 3)')
  }
  if (DEALER.name === 'Roadstar Auto Sales') {
    problems.push('DEALER.name is still the placeholder business name (intake questions 1-2)')
  }
  if (DEALER.licenseNumber === 'P000000') {
    problems.push('DEALER.licenseNumber is still the placeholder (intake question 7)')
  }

  return problems
}

/**
 * Refuse to ship placeholder identity data to production.
 *
 * The failure mode this prevents is specific and expensive: the site goes
 * live, looks finished, and quietly lists a fake phone number and a fake
 * address for a real business selling real cars. That is worse than not
 * launching, so it is a hard build failure rather than a warning someone
 * scrolls past.
 *
 * The trigger is deliberately VERCEL_ENV, not NODE_ENV. `next build` sets
 * NODE_ENV=production for every build, including preview deploys and the
 * builds a developer runs twenty times a day -- keying on it would make the
 * site impossible to build locally until the client answers their intake
 * questions, which is not the tradeoff anyone wants.
 *
 * On a non-Vercel host, set REQUIRE_REAL_DEALER_DATA=true in the production
 * environment to get the same protection.
 */
export function assertRealDealerData(): void {
  const isProductionDeploy =
    process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_REAL_DEALER_DATA === 'true'
  if (!isProductionDeploy) return
  if (process.env.ALLOW_PLACEHOLDER_DEALER === 'true') return

  const problems = placeholderProblems()
  if (problems.length === 0) return

  throw new Error(
    [
      '',
      'Refusing to build for production with placeholder dealer data.',
      '',
      ...problems.map((p) => `  • ${p}`),
      '',
      'Fix these in src/lib/dealer.ts (see docs/client-intake-questions.md §1).',
      'To deploy a staging build anyway, set ALLOW_PLACEHOLDER_DEALER=true.',
      '',
    ].join('\n'),
  )
}
