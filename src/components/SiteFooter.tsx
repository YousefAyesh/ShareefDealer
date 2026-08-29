import Link from 'next/link'
import { DEALER, formatHours, fullAddress } from '@/lib/dealer'
import { ClockIcon, MapPinIcon, PhoneIcon } from './icons'

const SHOP_LINKS = [
  { href: '/inventory', label: 'All Inventory' },
  { href: '/inventory?body=Truck', label: 'Trucks' },
  { href: '/inventory?body=SUV', label: 'SUVs' },
  { href: '/inventory?body=Sedan', label: 'Sedans' },
]

const SITE_LINKS = [
  { href: '/visit', label: 'Visit Us' },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/accessibility', label: 'Accessibility' },
]

export function SiteFooter() {
  const hours = formatHours()

  return (
    <footer className="bg-navy pb-20 pt-10 text-cream md:pb-10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-4">
        <div>
          <p className="font-display text-lg uppercase tracking-tight text-cream">{DEALER.name}</p>
          <p className="mt-1 text-sm text-cream/70">{DEALER.tagline}</p>
          {DEALER.licenseNumber && (
            <p className="mt-4 text-xs text-cream/60">Dealer License #{DEALER.licenseNumber}</p>
          )}
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="font-display text-sm uppercase tracking-wide text-gold">Find Us</h2>
          <a
            href={DEALER.mapsHref}
            className="flex cursor-pointer items-start gap-2 text-cream/90 hover:text-gold"
          >
            <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>{fullAddress}</span>
          </a>
          <a href={DEALER.phoneTel} className="flex cursor-pointer items-center gap-2 text-cream/90 hover:text-gold">
            <PhoneIcon className="h-4 w-4 shrink-0 text-gold" />
            {DEALER.phoneDisplay}
          </a>
          <a href={`mailto:${DEALER.email}`} className="block cursor-pointer text-cream/90 hover:text-gold">
            {DEALER.email}
          </a>
        </div>

        <div className="text-sm">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm uppercase tracking-wide text-gold">
            <ClockIcon className="h-4 w-4 shrink-0" />
            Hours
          </h2>
          <dl>
            {hours.map((h) => (
              <div key={h.day} className="flex justify-between gap-4 py-0.5">
                <dt className="text-cream/90">{h.day}</dt>
                <dd className={h.isClosed ? 'text-cream/50' : 'text-cream/70'}>{h.label}</dd>
              </div>
            ))}
          </dl>
          {DEALER.byAppointmentOutsideHours && (
            <p className="mt-2 text-xs text-cream/60">Other times by appointment — just call.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 text-sm md:grid-cols-1">
          <nav aria-label="Shop">
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-gold">Shop</h2>
            <ul className="space-y-2">
              {SHOP_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="cursor-pointer text-cream/90 hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Site" className="md:mt-6">
            <h2 className="mb-3 font-display text-sm uppercase tracking-wide text-gold md:sr-only">Site</h2>
            <ul className="space-y-2">
              {SITE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="cursor-pointer text-cream/90 hover:text-gold">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-6xl border-t border-cream/15 px-4 pt-6 text-xs text-cream/60 sm:px-6">
        <p>
          All prices exclude tax, title, license and dealer fees. Vehicles are subject to prior sale.
          Vehicle information, including mileage and equipment, is believed accurate but is not
          guaranteed — please verify any detail that matters to your decision before purchase.
        </p>
        <p className="mt-2">
          © {new Date().getFullYear()} {DEALER.name}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
