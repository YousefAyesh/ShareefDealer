import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { JsonLd, autoDealerJsonLd } from '@/components/JsonLd'
import { VehicleCard } from '@/components/VehicleCard'
import { VehicleRequest } from '@/components/VehicleRequest'
import { CheckCircleIcon, ClockIcon, MapPinIcon, PhoneIcon, SearchIcon } from '@/components/icons'
import { DEALER, SITE_URL, fullAddress, hoursToday } from '@/lib/dealer'
import { getNewestArrivals } from '@/lib/inventory'

export const metadata: Metadata = {
  alternates: { canonical: SITE_URL },
}

/**
 * Revalidated rather than fully static: this page renders "open today" from
 * the current date, and a static build would freeze that on whatever
 * weekday the deploy happened -- telling Saturday shoppers the lot is
 * closed because the site was built on a Sunday. Five minutes is well
 * inside the resolution anyone cares about for opening hours, and it also
 * keeps the inventory shown here roughly in step with the 15-minute sync.
 */
export const revalidate = 300

const BODY_TYPES = [
  { label: 'Trucks', value: 'Truck' },
  { label: 'SUVs', value: 'SUV' },
  { label: 'Sedans', value: 'Sedan' },
]

const PRICE_BANDS = [
  { label: 'Under $10,000', value: '10000' },
  { label: 'Under $15,000', value: '15000' },
  { label: 'Under $20,000', value: '20000' },
]

export default async function HomePage() {
  const newest = await getNewestArrivals(6)
  const today = hoursToday()

  return (
    <>
      <JsonLd data={autoDealerJsonLd()} />

      {/* Hero */}
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/Logo.jpeg"
              alt=""
              width={120}
              height={120}
              priority
              className="h-24 w-24 rounded-md sm:h-28 sm:w-28"
            />
            <h1 className="mt-5 max-w-2xl font-display text-4xl uppercase leading-[1.05] tracking-tight text-navy sm:text-5xl">
              Quality used cars in {DEALER.address.city}
            </h1>
            <p className="mt-4 max-w-xl text-lg text-navy/80">
              Hand-picked trucks, SUVs and sedans, priced up front. Every car on our lot is on this
              site, with real photos and the real price — come see it or call and we&apos;ll hold it
              for you.
            </p>

            <div className="mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <a
                href={DEALER.phoneTel}
                className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-5 text-base font-bold text-cream hover:bg-red-dark"
              >
                <PhoneIcon className="h-5 w-5" />
                Call {DEALER.phoneDisplay}
              </a>
              <Link
                href="/inventory"
                className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-5 text-base font-bold text-navy hover:bg-navy hover:text-cream"
              >
                <SearchIcon className="h-5 w-5" />
                Browse Inventory
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Search entry point. A real form, so a shopper who knows what they
          want can type it here instead of learning the filter panel. */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <form method="get" action="/inventory" className="mx-auto flex max-w-xl gap-2">
          <label htmlFor="home-search" className="sr-only">
            Search inventory
          </label>
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/50" />
            <input
              id="home-search"
              type="search"
              name="q"
              placeholder="Search by make, model or stock #"
              className="min-h-12 w-full rounded-md border border-navy/20 bg-white/60 pl-9 pr-3 text-navy"
            />
          </div>
          <button
            type="submit"
            className="min-h-12 shrink-0 cursor-pointer rounded-md bg-navy px-5 text-sm font-bold text-cream hover:bg-navy-dark"
          >
            Search
          </button>
        </form>
      </section>

      {/* Quick filters */}
      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-navy/70">Shop by type</h2>
            <div className="flex flex-wrap gap-2">
              {BODY_TYPES.map((bt) => (
                <Link
                  key={bt.value}
                  href={`/inventory?body=${encodeURIComponent(bt.value)}`}
                  className="min-h-11 cursor-pointer rounded-full border border-navy/20 bg-white/50 px-4 py-2 text-sm font-semibold text-navy hover:border-navy hover:bg-navy hover:text-cream"
                >
                  {bt.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-navy/70">Shop by price</h2>
            <div className="flex flex-wrap gap-2">
              {PRICE_BANDS.map((pb) => (
                <Link
                  key={pb.value}
                  href={`/inventory?price_max=${pb.value}`}
                  className="min-h-11 cursor-pointer rounded-full border border-navy/20 bg-white/50 px-4 py-2 text-sm font-semibold text-navy hover:border-navy hover:bg-navy hover:text-cream"
                >
                  {pb.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Newest arrivals */}
      <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl uppercase tracking-tight text-navy">Newest Arrivals</h2>
          <Link href="/inventory" className="cursor-pointer text-sm font-bold text-red hover:text-red-dark">
            View all inventory →
          </Link>
        </div>
        {newest.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {newest.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        ) : (
          <p className="text-navy/70">
            New inventory is on the way — call us and we&apos;ll tell you what&apos;s coming in.
          </p>
        )}
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <VehicleRequest />
      </div>

      {/* Trust strip */}
      <section className="bg-navy py-10 text-cream">
        <h2 className="sr-only">Visit us</h2>
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:grid-cols-3 sm:px-6">
          <div className="flex items-start gap-3">
            <MapPinIcon className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
            <div>
              <p className="font-display text-sm uppercase tracking-wide text-cream">
                {DEALER.address.city}, {DEALER.address.state}
              </p>
              <a href={DEALER.mapsHref} className="mt-1 block cursor-pointer text-sm text-cream/70 hover:text-gold">
                {fullAddress}
              </a>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ClockIcon className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
            <div>
              <p className="font-display text-sm uppercase tracking-wide text-cream">
                {today.isClosed ? 'Closed Today' : 'Open Today'}
              </p>
              <p className="mt-1 text-sm text-cream/70">
                {today.day}: {today.label}
              </p>
              <Link href="/visit" className="mt-1 inline-block cursor-pointer text-sm text-gold hover:underline">
                All hours & directions →
              </Link>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-gold" />
            <div>
              <p className="font-display text-sm uppercase tracking-wide text-cream">Cash Price, Up Front</p>
              <p className="mt-1 text-sm text-cream/70">
                Our full lot is online with real photos and the price on the windshield — no bait
                listings. We sell for cash and do not offer financing.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
