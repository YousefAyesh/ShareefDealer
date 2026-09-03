import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd, breadcrumbJsonLd, pruneJsonLd } from '@/components/JsonLd'
import { PriceBlock } from '@/components/PriceBlock'
import { VehicleCard } from '@/components/VehicleCard'
import { VehicleGallery } from '@/components/VehicleGallery'
import { MapPinIcon, MessageIcon, PhoneIcon } from '@/components/icons'
import { DEALER, SITE_URL } from '@/lib/dealer'
import { formatMileage, formatPrice, vehicleTitle } from '@/lib/format'
import { getSimilarVehicles, getVehicleBySlug } from '@/lib/inventory'
import type { Vehicle } from '@/lib/vehicle-types'

type PageProps = { params: Promise<{ slug: string }> }

/** Inventory turns over on a 15-minute sync; revalidating on the same order
 * keeps a sold car from sitting on a cached page for hours. */
export const revalidate = 300

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const vehicle = await getVehicleBySlug(slug)

  // notFound() belongs here, not only in the component below.
  //
  // The page streams, so by the time the component runs the response status
  // has already been committed as 200 and a notFound() thrown there renders
  // the 404 page under a 200 status -- a soft 404, which Google indexes as
  // a real page. Every sold vehicle's URL eventually hits this path, so on
  // a dealer site that is not a rare edge case; it is the steady state.
  //
  // generateMetadata runs before the shell is flushed, so throwing here
  // produces a genuine 404. getVehicleBySlug is request-memoized, so this
  // costs no extra query.
  if (!vehicle) notFound()

  const title = vehicleTitle(vehicle)
  const url = `${SITE_URL}/inventory/${vehicle.slug}`
  const isSold = vehicle.status === 'sold'

  const description = isSold
    ? `${title} — sold. See similar vehicles in stock now at ${DEALER.name} in ${DEALER.address.city}, ${DEALER.address.state}.`
    : `${title} for sale at ${DEALER.name} in ${DEALER.address.city}, ${DEALER.address.state}. ${formatMileage(vehicle.mileage)}, ${formatPrice(vehicle.priceCents)}. Photos, full specs and directions.`

  const heroImage = vehicle.photos[0]

  return {
    title,
    description,
    alternates: { canonical: url },
    // A sold car keeps its page -- inbound links and shoppers who saved it
    // still land somewhere useful -- but it drops out of the index rather
    // than competing with the cars actually for sale.
    robots: isSold ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${title} | ${DEALER.name}`,
      description,
      url,
      type: 'website',
      images: heroImage
        ? [{ url: heroImage.urlFull, width: heroImage.width, height: heroImage.height, alt: heroImage.alt }]
        : undefined,
    },
    twitter: {
      card: heroImage ? 'summary_large_image' : 'summary',
      title,
      description,
      images: heroImage ? [heroImage.urlFull] : undefined,
    },
  }
}

/**
 * Absolute URLs for photos. Blob-hosted photos are already absolute; the
 * demo photos are site-relative and would otherwise be emitted into JSON-LD
 * as unresolvable paths.
 */
function absolutePhotoUrl(url: string): string {
  return url.startsWith('http') ? url : `${SITE_URL}${url}`
}

function buildVehicleJsonLd(vehicle: Vehicle) {
  const title = vehicleTitle(vehicle)
  const url = `${SITE_URL}/inventory/${vehicle.slug}`

  // priceCents === 0 means "not priced yet" throughout the site, so it must
  // not become a $0.00 Offer -- Google reads that literally and shows a
  // free car.
  const price = vehicle.priceCents != null && vehicle.priceCents > 0 ? vehicle.priceCents : null

  const offers =
    price != null
      ? {
          '@type': 'Offer',
          url,
          priceCurrency: 'USD',
          price: (price / 100).toFixed(2),
          availability:
            vehicle.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
          itemCondition: 'https://schema.org/UsedCondition',
          seller: { '@id': `${SITE_URL}/#dealer` },
        }
      : undefined

  return pruneJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: title,
    url,
    description: vehicle.description ?? undefined,
    vehicleIdentificationNumber: vehicle.vin ?? undefined,
    sku: vehicle.stockNumber ?? undefined,
    brand: vehicle.make ? { '@type': 'Brand', name: vehicle.make } : undefined,
    model: vehicle.model ?? undefined,
    vehicleModelDate: vehicle.year ?? undefined,
    productionDate: vehicle.year ?? undefined,
    vehicleConfiguration: vehicle.trim ?? undefined,
    bodyType: vehicle.bodyStyle ?? undefined,
    driveWheelConfiguration: vehicle.drivetrain ?? undefined,
    vehicleTransmission: vehicle.transmission ?? undefined,
    fuelType: vehicle.fuelType ?? undefined,
    numberOfDoors: vehicle.doors ?? undefined,
    color: vehicle.exteriorColor ?? undefined,
    vehicleInteriorColor: vehicle.interiorColor ?? undefined,
    mileageFromOdometer:
      vehicle.mileage != null
        ? { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'SMI' }
        : undefined,
    image: vehicle.photos.map((p) => absolutePhotoUrl(p.urlFull)),
    offers,
  })
}

const SPEC_ROWS: { label: string; value: (v: Vehicle) => string | number | null }[] = [
  { label: 'Year', value: (v) => v.year },
  { label: 'Make', value: (v) => v.make },
  { label: 'Model', value: (v) => v.model },
  { label: 'Trim', value: (v) => v.trim },
  { label: 'Mileage', value: (v) => (v.mileage != null ? formatMileage(v.mileage) : null) },
  { label: 'Body Style', value: (v) => v.bodyStyle },
  { label: 'Drivetrain', value: (v) => v.drivetrain },
  { label: 'Transmission', value: (v) => v.transmission },
  { label: 'Engine', value: (v) => v.engine },
  { label: 'Fuel Type', value: (v) => v.fuelType },
  { label: 'Doors', value: (v) => v.doors },
  { label: 'Exterior Color', value: (v) => v.exteriorColor },
  { label: 'Interior Color', value: (v) => v.interiorColor },
  { label: 'Stock #', value: (v) => v.stockNumber },
  { label: 'VIN', value: (v) => v.vin },
]

export default async function VehicleDetailPage({ params }: PageProps) {
  const { slug } = await params
  const vehicle = await getVehicleBySlug(slug)
  if (!vehicle) notFound()

  const similar = await getSimilarVehicles(vehicle, 3)
  const title = vehicleTitle(vehicle)
  const isSold = vehicle.status === 'sold'
  const reference = vehicle.stockNumber ?? vehicle.vin

  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Inventory', href: '/inventory' },
    { name: title, href: `/inventory/${vehicle.slug}` },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd data={buildVehicleJsonLd(vehicle)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />

      <Breadcrumbs crumbs={crumbs} />

      {isSold && (
        <div className="mt-4 rounded-md bg-navy px-4 py-3 text-center">
          <span className="font-display text-lg uppercase tracking-widest text-cream">
            This Vehicle Has Sold
          </span>
          <span className="ml-2 text-sm text-cream/70">— check similar vehicles below</span>
        </div>
      )}

      {/*
        Three grid children, explicitly placed, so the title/price block is
        written once rather than duplicated into a mobile copy and a desktop
        copy. The old two-column split rendered <h1> twice -- only one was
        ever visible, since the other was display:none, but it is still two
        titles in the document and two things to keep in sync.

        Mobile (single column) reads: photos, title and price, call buttons,
        then specs. Desktop puts the title, price and buttons in a sticky
        right rail beside the photos, with the specs below them on the left.
      */}
      <div className="mt-4 grid gap-x-8 gap-y-6 lg:grid-cols-[3fr_2fr]">
        <div className="lg:col-start-1 lg:row-start-1">
          <VehicleGallery photos={vehicle.photos} title={title} />
        </div>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="space-y-4 lg:sticky lg:top-20">
            <div>
              <h1 className="font-display text-2xl uppercase tracking-tight text-navy">{title}</h1>
              <p className="mt-1 text-navy/70">{formatMileage(vehicle.mileage)}</p>
              <div className="mt-3">
                <PriceBlock
                  priceCents={vehicle.priceCents}
                  priceReduced={vehicle.priceReduced}
                />
                <p className="mt-2 text-xs text-navy/60">
                  Price excludes tax, title, license and dealer fees. Subject to prior sale.
                </p>
                <p className="mt-1.5 text-xs font-semibold text-navy/75">
                  Cash only — we do not offer financing.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-navy/10 bg-white/40 p-4">
              <h2 className="font-display text-base uppercase tracking-tight text-navy">
                {isSold ? 'Looking for something similar?' : 'Check Availability'}
              </h2>
              <div className="mt-3 flex flex-col gap-2">
                <a
                  href={DEALER.phoneTel}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-4 text-base font-bold text-cream hover:bg-red-dark"
                >
                  <PhoneIcon className="h-5 w-5" />
                  Call {DEALER.phoneDisplay}
                </a>
                {DEALER.smsHref && (
                  <a
                    href={
                      // Pre-fill the message with the stock number. It saves
                      // the shopper a step and it means the dealer knows
                      // which car the text is about before replying.
                      reference
                        ? `${DEALER.smsHref}?&body=${encodeURIComponent(`Hi — is stock #${reference} (${title}) still available?`)}`
                        : DEALER.smsHref
                    }
                    className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-4 text-base font-bold text-navy hover:bg-navy hover:text-cream"
                  >
                    <MessageIcon className="h-5 w-5" />
                    Text Us About This Car
                  </a>
                )}
                <a
                  href={DEALER.mapsHref}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy/30 px-4 text-sm font-semibold text-navy hover:border-navy"
                >
                  <MapPinIcon className="h-5 w-5" />
                  Get Directions
                </a>
              </div>
              {reference && (
                <p className="mt-3 text-xs text-navy/60">Mention stock #{reference} when you call.</p>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-start-1 lg:row-start-2">
          <section>
            <h2 className="font-display text-xl uppercase tracking-tight text-navy">Specs</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-navy/10 bg-white/40 p-4 sm:grid-cols-2">
              {SPEC_ROWS.map((row) => {
                const value = row.value(vehicle)
                if (value == null || value === '') return null
                return (
                  <div
                    key={row.label}
                    className="flex justify-between gap-4 border-b border-navy/5 py-1.5 text-sm last:border-0"
                  >
                    <dt className="font-semibold text-navy/70">{row.label}</dt>
                    <dd className={`text-right text-navy ${row.label === 'VIN' ? 'font-mono' : ''}`}>{value}</dd>
                  </div>
                )
              })}
            </dl>
          </section>

          {vehicle.features.length > 0 && (
            <section className="mt-8">
              <h2 className="font-display text-xl uppercase tracking-tight text-navy">Features</h2>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {vehicle.features.map((feature) => (
                  <li key={feature} className="rounded-md bg-white/50 px-3 py-2 text-sm text-navy">
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vehicle.description && (
            <section className="mt-8">
              <h2 className="font-display text-xl uppercase tracking-tight text-navy">Description</h2>
              <p className="mt-3 whitespace-pre-line text-navy/80">{vehicle.description}</p>
            </section>
          )}

          <p className="mt-8 text-xs text-navy/60">
            Price excludes tax, title, license and dealer fees. Vehicle subject to prior sale. Mileage,
            options and equipment listed above are believed accurate but are not guaranteed — please
            verify anything that matters to your decision before you buy. Vehicles are sold used, and
            we recommend an independent inspection.
          </p>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display text-2xl uppercase tracking-tight text-navy">Similar Vehicles</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {similar.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
