import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd, autoDealerJsonLd, breadcrumbJsonLd } from '@/components/JsonLd'
import { CheckCircleIcon, PhoneIcon } from '@/components/icons'
import { DEALER, SITE_URL, fullAddress } from '@/lib/dealer'

export const metadata: Metadata = {
  title: 'About Us',
  description: `About ${DEALER.name} — an independent used vehicle dealership in ${DEALER.address.city}, ${DEALER.address.state}.`,
  alternates: { canonical: `${SITE_URL}/about` },
}

const CRUMBS = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
]

/**
 * CONTENT PLACEHOLDER.
 *
 * The prose below is deliberately generic and factual -- it makes no claim
 * about how long the dealership has been open, how many cars it has sold,
 * or what customers say, because none of that is known yet. Those answers
 * are section 9 of docs/client-intake-questions.md.
 *
 * Do not invent them. An About page is the page a suspicious buyer reads to
 * decide whether the business is real, and a fabricated origin story is
 * exactly the thing that, once noticed, costs the sale. Generic-but-true
 * beats specific-but-invented every time.
 */
const PROMISES = [
  {
    title: 'The whole lot is online',
    body: 'Every vehicle we have for sale is on this site with real photos of that exact car — not stock images, not a car we sold last month.',
  },
  {
    title: 'The price is the price',
    body: 'What you see listed is what the vehicle costs, before tax, title, license and dealer fees. No phantom discounts that require a trade-in you don’t have.',
  },
  {
    title: 'Straight answers',
    body: 'Ask us what we know about a car and we’ll tell you, including what it needs. We’d rather you buy the right one than the first one.',
  },
  {
    title: 'Inspect anything',
    body: 'You’re welcome to take any vehicle to your own mechanic before you buy it. We’ll hand you the keys.',
  },
]

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd data={autoDealerJsonLd()} />
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
      <Breadcrumbs crumbs={CRUMBS} />

      <h1 className="mt-3 font-display text-3xl uppercase tracking-tight text-navy">
        About {DEALER.name}
      </h1>

      <p className="mt-4 text-lg text-navy/80">
        We&apos;re an independent used vehicle dealership at {fullAddress}. We buy carefully, price
        honestly, and put every car we have on this website so you can do most of your shopping
        before you ever talk to us.
      </p>

      <section className="mt-10">
        <h2 className="font-display text-2xl uppercase tracking-tight text-navy">How we do business</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <li key={p.title} className="rounded-lg border border-navy/10 bg-white/40 p-5">
              <h3 className="flex items-start gap-2 font-display text-base uppercase tracking-tight text-navy">
                <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red" />
                {p.title}
              </h3>
              <p className="mt-2 text-sm text-navy/80">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-lg bg-navy p-6 text-cream">
        <h2 className="font-display text-2xl uppercase tracking-tight">Come see for yourself</h2>
        <p className="mt-2 text-cream/80">
          The fastest way to find out whether we&apos;re worth your time is to call and ask about a
          car. We&apos;ll tell you straight whether it&apos;s still here.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={DEALER.phoneTel}
            className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-6 text-base font-bold text-cream hover:bg-red-dark"
          >
            <PhoneIcon className="h-5 w-5" />
            Call {DEALER.phoneDisplay}
          </a>
          <Link
            href="/inventory"
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-md border-2 border-cream px-6 text-base font-bold text-cream hover:bg-cream hover:text-navy"
          >
            Browse Inventory
          </Link>
        </div>
      </section>
    </div>
  )
}
