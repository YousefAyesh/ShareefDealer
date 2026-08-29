import { DEALER, SITE_URL, fullAddress, openingHoursSpecification } from '@/lib/dealer'

/**
 * Structured data, rendered as a <script type="application/ld+json">.
 *
 * JSON.stringify escapes nothing that matters for HTML, so a description
 * containing "</script>" would break out of the tag. Escaping the forward
 * slash closes that hole without changing how any JSON parser reads the
 * value.
 */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

/** Strip keys whose value is null/undefined, recursively. Schema.org
 * consumers treat an explicit null as a malformed value, not as absence. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(prune).filter((v) => v != null) as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v == null) continue
      const pruned = prune(v)
      if (pruned == null) continue
      if (Array.isArray(pruned) && pruned.length === 0) continue
      out[k] = pruned
    }
    return out as T
  }
  return value
}

/**
 * The site-wide business identity. This is the record Google reconciles
 * against the dealer's Business Profile to show hours, phone and directions
 * directly in search results, which for a local dealer is a larger share of
 * inbound calls than the website itself.
 *
 * AutoDealer is a subtype of LocalBusiness, so it inherits address, hours
 * and telephone while telling Google specifically what kind of business
 * this is.
 */
export function autoDealerJsonLd() {
  return prune({
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    '@id': `${SITE_URL}/#dealer`,
    name: DEALER.name,
    url: SITE_URL,
    telephone: DEALER.phoneDisplay,
    email: DEALER.email,
    image: `${SITE_URL}/Logo.jpeg`,
    logo: `${SITE_URL}/Logo.jpeg`,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: DEALER.address.street,
      addressLocality: DEALER.address.city,
      addressRegion: DEALER.address.state,
      postalCode: DEALER.address.zip,
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: DEALER.geo.latitude,
      longitude: DEALER.geo.longitude,
    },
    hasMap: DEALER.mapsHref,
    openingHoursSpecification: openingHoursSpecification(),
    sameAs: [DEALER.social.facebook, DEALER.social.instagram, DEALER.social.googleBusiness].filter(Boolean),
    description: `${DEALER.name} is a used vehicle dealership at ${fullAddress}.`,
  })
}

export type Crumb = { name: string; href: string }

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `${SITE_URL}${c.href}`,
    })),
  }
}

export { prune as pruneJsonLd }
