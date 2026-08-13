import Image from 'next/image'
import Link from 'next/link'
import { DEALER } from '@/lib/dealer'
import { PhoneIcon, MenuIcon } from './icons'

const NAV_LINKS = [
  { href: '/inventory', label: 'Inventory' },
  { href: '/financing', label: 'Financing' },
  { href: '/visit', label: 'Visit Us' },
  { href: '/about', label: 'About' },
]

/**
 * Cream/light surface header -- the logo is a JPEG with a cream background
 * baked in (no transparency), so it must sit on a cream surface, never
 * navy, or it looks like a pasted sticker.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-header border-b border-navy/10 bg-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-2 rounded-sm cursor-pointer"
          aria-label={`${DEALER.name} — home`}
        >
          <Image
            src="/Logo.jpeg"
            alt={`${DEALER.name} logo`}
            width={56}
            height={56}
            priority
            className="h-12 w-12 shrink-0 rounded-sm sm:h-14 sm:w-14"
          />
          <span className="hidden font-display text-lg uppercase leading-none tracking-tight text-navy sm:inline">
            {DEALER.name}
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="cursor-pointer text-sm font-semibold text-navy hover:text-red"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={DEALER.phoneTel}
            className="hidden min-h-11 cursor-pointer items-center gap-2 rounded-md bg-red px-4 py-2.5 text-sm font-bold text-cream hover:bg-red-dark sm:flex"
          >
            <PhoneIcon className="h-4 w-4" />
            {DEALER.phoneDisplay}
          </a>
          <a
            href={DEALER.phoneTel}
            aria-label={`Call ${DEALER.name} at ${DEALER.phoneDisplay}`}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md bg-red text-cream hover:bg-red-dark sm:hidden"
          >
            <PhoneIcon className="h-5 w-5" />
          </a>

          <details className="relative md:hidden">
            <summary
              className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-navy/20 text-navy [&::-webkit-details-marker]:hidden"
              aria-label="Open menu"
            >
              <MenuIcon className="h-5 w-5" />
            </summary>
            <nav
              aria-label="Primary"
              className="absolute right-0 top-full mt-2 w-48 rounded-md border border-navy/10 bg-cream py-2 shadow-lg"
            >
              <ul>
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block cursor-pointer px-4 py-2.5 text-sm font-semibold text-navy hover:bg-navy/5"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  )
}
