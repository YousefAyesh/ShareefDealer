import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PriceBlock } from '@/components/PriceBlock'
import { VehicleCard } from '@/components/VehicleCard'
import { VehicleGallery } from '@/components/VehicleGallery'
import { MapPinIcon, MessageIcon, PhoneIcon } from '@/components/icons'
import { DEALER, SITE_URL } from '@/lib/dealer'
import { formatMileage, formatPrice, vehicleTitle } from '@/lib/format'
import { getSimilarVehicles, getVehicleBySlug } from '@/lib/inventory'
import type { Vehicle } from '@/lib/vehicle-types'

type PageProps = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const vehicle = await getVehicleBySlug(slug)
  if (!vehicle) return { title: 'Vehicle Not Found' }

  const title = vehicleTitle(vehicle)
  const description = `${title} — ${formatMileage(vehicle.mileage)}, ${formatPrice(vehicle.priceCents)}. ${
    vehicle.status === 'sold' ? 'This vehicle has sold. ' : ''
  }See photos, specs and financing terms at Roadstar Auto Sales in Austin, TX.`
  const heroImage = vehicle.photos[0]

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Roadstar Auto Sales`,
      description,
      images: heroImage ? [{ url: heroImage.urlFull, width: heroImage.width, height: heroImage.height, alt: heroImage.alt }] : undefined,
    },
  }
}

function buildVehicleJsonLd(vehicle: Vehicle) {
  const title = vehicleTitle(vehicle)
  const url = `${SITE_URL}/inventory/${vehicle.slug}`

  const offers =
    vehicle.priceCents != null
      ? {
          '@type': 'Offer',
          url,
          priceCurrency: 'USD',
          price: (vehicle.priceCents / 100).toFixed(2),
          availability: vehicle.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
          itemCondition: 'https://schema.org/UsedCondition',
        }
      : undefined

  return {
    '@context': 'https://schema.org',
    '@type': 'Vehicle',
    name: title,
    url,
    vehicleIdentificationNumber: vehicle.vin ?? undefined,
    brand: vehicle.make ? { '@type': 'Brand', name: vehicle.make } : undefined,
    model: vehicle.model ?? undefined,
    vehicleModelDate: vehicle.year ?? undefined,
    vehicleConfiguration: vehicle.trim ?? undefined,
    bodyType: vehicle.bodyStyle ?? undefined,
    driveWheelConfiguration: vehicle.drivetrain ?? undefined,
    vehicleTransmission: vehicle.transmission ?? undefined,
    fuelType: vehicle.fuelType ?? undefined,
    numberOfDoors: vehicle.doors ?? undefined,
    color: vehicle.exteriorColor ?? undefined,
    mileageFromOdometer:
      vehicle.mileage != null ? { '@type': 'QuantitativeValue', value: vehicle.mileage, unitCode: 'SMI' } : undefined,
    image: vehicle.photos.map((p) => `${SITE_URL}${p.urlFull}`),
    offers,
  }
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
  const jsonLd = buildVehicleJsonLd(vehicle)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {isSold && (
        <div className="mb-4 rounded-md bg-navy px-4 py-3 text-center">
          <span className="font-display text-lg uppercase tracking-widest text-cream">This Vehicle Has Sold</span>
          <span className="ml-2 text-sm text-cream/70">— check similar vehicles below</span>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <div>
          <VehicleGallery photos={vehicle.photos} title={title} />

          <div className="mt-6 lg:hidden">
            <h1 className="font-display text-2xl uppercase tracking-tight text-navy">{title}</h1>
            <div className="mt-3">
              <PriceBlock
                priceCents={vehicle.priceCents}
                downPaymentCents={vehicle.downPaymentCents}
                weeklyPaymentCents={vehicle.weeklyPaymentCents}
                priceReduced={vehicle.priceReduced}
              />
            </div>
          </div>

          <section className="mt-8">
            <h2 className="font-display text-xl uppercase tracking-tight text-navy">Specs</h2>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border border-navy/10 bg-white/40 p-4 sm:grid-cols-2">
              {SPEC_ROWS.map((row) => {
                const value = row.value(vehicle)
                if (value == null || value === '') return null
                return (
                  <div key={row.label} className="flex justify-between gap-4 border-b border-navy/5 py-1.5 text-sm last:border-0">
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
              <p className="mt-3 text-navy/80">{vehicle.description}</p>
            </section>
          )}

          <p className="mt-8 text-xs text-navy/60">
            Price plus tax, title, license and dealer fees. Vehicle subject to prior sale.
          </p>
        </div>

        <div>
          <div className="sticky top-20 space-y-4">
            <div className="hidden lg:block">
              <h1 className="font-display text-2xl uppercase tracking-tight text-navy">{title}</h1>
              <div className="mt-3">
                <PriceBlock
                  priceCents={vehicle.priceCents}
                  downPaymentCents={vehicle.downPaymentCents}
                  weeklyPaymentCents={vehicle.weeklyPaymentCents}
                  priceReduced={vehicle.priceReduced}
                />
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
                <a
                  href={DEALER.smsHref}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-4 text-base font-bold text-navy hover:bg-navy hover:text-cream"
                >
                  <MessageIcon className="h-5 w-5" />
                  Text Us About This Car
                </a>
                <a
                  href={DEALER.mapsHref}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy/30 px-4 text-sm font-semibold text-navy hover:border-navy"
                >
                  <MapPinIcon className="h-5 w-5" />
                  Get Directions
                </a>
              </div>
              <p className="mt-3 text-xs text-navy/60">
                Mention stock #{vehicle.stockNumber ?? vehicle.vin} when you call.
              </p>
            </div>
          </div>
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
