import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd, autoDealerJsonLd, breadcrumbJsonLd } from '@/components/JsonLd'
import { ClockIcon, MapPinIcon, MessageIcon, PhoneIcon } from '@/components/icons'
import { DEALER, SITE_URL, formatHours, fullAddress, hoursToday } from '@/lib/dealer'

export const metadata: Metadata = {
  title: 'Visit Us',
  description: `Directions, hours and contact details for ${DEALER.name} at ${fullAddress}.`,
  alternates: { canonical: `${SITE_URL}/visit` },
}

const CRUMBS = [
  { name: 'Home', href: '/' },
  { name: 'Visit Us', href: '/visit' },
]

/**
 * Revalidated rather than fully static: this page renders "open today" from
 * the current date, and a static build would freeze that on whatever
 * weekday the deploy happened -- telling Saturday shoppers the lot is
 * closed because the site was built on a Sunday. Five minutes is well
 * inside the resolution anyone cares about for opening hours, and it also
 * keeps the inventory shown here roughly in step with the 15-minute sync.
 */
export const revalidate = 300

/**
 * The page a shopper opens right before they get in the car. Everything on
 * it is an action: call, text, navigate, or check whether the lot is open
 * right now. No marketing copy competes for that space.
 */
export default function VisitPage() {
  const hours = formatHours()
  const today = hoursToday()

  // An embedded map needs no API key in this form and loads only when the
  // shopper scrolls to it.
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd data={autoDealerJsonLd()} />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
      <Breadcrumbs crumbs={CRUMBS} />

      <h1 className="mt-3 font-display text-3xl uppercase tracking-tight text-navy">Visit Us</h1>
      <p className="mt-2 max-w-2xl text-navy/80">
        Come see anything on the lot in person. If you&apos;re driving a distance, call ahead and
        we&apos;ll make sure the car is out front and ready when you arrive.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-lg border border-navy/10 bg-white/40 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg uppercase tracking-tight text-navy">
              <MapPinIcon className="h-5 w-5 text-red" />
              Address
            </h2>
            <address className="mt-2 not-italic text-navy/80">
              {DEALER.address.street}
              <br />
              {DEALER.address.city}, {DEALER.address.state} {DEALER.address.zip}
            </address>
            <a
              href={DEALER.mapsHref}
              className="mt-4 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-navy px-5 text-sm font-bold text-cream hover:bg-navy-dark"
            >
              <MapPinIcon className="h-4 w-4" />
              Open in Maps
            </a>
          </section>

          <section className="rounded-lg border border-navy/10 bg-white/40 p-5">
            <h2 className="flex items-center gap-2 font-display text-lg uppercase tracking-tight text-navy">
              <ClockIcon className="h-5 w-5 text-red" />
              Hours
            </h2>
            <p className="mt-2 text-sm font-semibold text-navy">
              {today.isClosed ? `Closed today (${today.day})` : `Open today — ${today.label}`}
            </p>
            <dl className="mt-3 divide-y divide-navy/10">
              {hours.map((h) => (
                <div
                  key={h.day}
                  className={`flex justify-between gap-4 py-2 text-sm ${
                    h.day === today.day ? 'font-bold text-navy' : 'text-navy/80'
                  }`}
                >
                  <dt>{h.day}</dt>
                  <dd className={h.isClosed ? 'text-navy/50' : ''}>{h.label}</dd>
                </div>
              ))}
            </dl>
            {DEALER.byAppointmentOutsideHours && (
              <p className="mt-3 text-sm text-navy/70">
                Need a time outside these hours? Call us — we can usually make it work.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-navy/10 bg-white/40 p-5">
            <h2 className="font-display text-lg uppercase tracking-tight text-navy">Contact</h2>
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
                  href={DEALER.smsHref}
                  className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-4 text-base font-bold text-navy hover:bg-navy hover:text-cream"
                >
                  <MessageIcon className="h-5 w-5" />
                  Text Us
                </a>
              )}
              <a
                href={`mailto:${DEALER.email}`}
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy/30 px-4 text-sm font-semibold text-navy hover:border-navy"
              >
                {DEALER.email}
              </a>
            </div>
          </section>
        </div>

        <div>
          <div className="overflow-hidden rounded-lg border border-navy/10">
            <iframe
              title={`Map showing ${DEALER.name} at ${fullAddress}`}
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[400px] w-full border-0 lg:h-[560px]"
            />
          </div>
          <p className="mt-3 text-sm text-navy/70">
            Looking for something specific?{' '}
            <Link href="/inventory" className="cursor-pointer font-semibold text-red hover:underline">
              Browse the full lot
            </Link>{' '}
            before you come out.
          </p>
        </div>
      </div>
    </div>
  )
}
