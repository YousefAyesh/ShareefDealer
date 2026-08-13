import Link from 'next/link'
import { DEALER, fullAddress } from '@/lib/dealer'
import { ClockIcon, MapPinIcon, PhoneIcon } from './icons'

export function SiteFooter() {
  return (
    <footer className="bg-navy pb-20 pt-10 text-cream md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-display text-lg uppercase tracking-tight text-cream">{DEALER.name}</p>
          <p className="mt-1 text-sm text-cream/70">{DEALER.tagline}</p>
          <p className="mt-4 text-sm text-cream/70">
            Your job is your credit. We work with real people, not just credit scores.
          </p>
        </div>

        <div className="space-y-2 text-sm">
          <a href={DEALER.mapsHref} className="flex cursor-pointer items-start gap-2 text-cream/90 hover:text-gold">
            <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            {fullAddress}
          </a>
          <a href={DEALER.phoneTel} className="flex cursor-pointer items-center gap-2 text-cream/90 hover:text-gold">
            <PhoneIcon className="h-4 w-4 shrink-0 text-gold" />
            {DEALER.phoneDisplay}
          </a>
          <div className="flex items-start gap-2 text-cream/90">
            <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div>
              {DEALER.hours.map((h) => (
                <div key={h.day} className="flex justify-between gap-4">
                  <span>{h.day}</span>
                  <span className="text-cream/70">{h.hours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <nav aria-label="Footer" className="space-y-2 text-sm">
          <Link href="/inventory" className="block cursor-pointer text-cream/90 hover:text-gold">
            Inventory
          </Link>
          <Link href="/financing" className="block cursor-pointer text-cream/90 hover:text-gold">
            Financing
          </Link>
          <Link href="/visit" className="block cursor-pointer text-cream/90 hover:text-gold">
            Visit Us
          </Link>
          <Link href="/about" className="block cursor-pointer text-cream/90 hover:text-gold">
            About
          </Link>
        </nav>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-cream/15 px-4 pt-6 text-xs text-cream/60 sm:px-6">
        <p>Prices plus tax, title, license and dealer fees. Vehicles subject to prior sale.</p>
        <p className="mt-1">© {new Date().getFullYear()} {DEALER.name}. All rights reserved.</p>
      </div>
    </footer>
  )
}
