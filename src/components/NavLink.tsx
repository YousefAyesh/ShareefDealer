'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * A nav link that marks itself as the current page.
 *
 * `aria-current="page"` is what tells a screen-reader user where they are
 * in the site; the visual underline is the same information for everyone
 * else. Split into its own client component so the header itself stays a
 * server component and ships no JavaScript for the parts that don't need
 * it.
 */
export function NavLink({
  href,
  children,
  className = '',
  activeClassName = '',
}: {
  href: string
  children: React.ReactNode
  className?: string
  activeClassName?: string
}) {
  const pathname = usePathname()
  // A vehicle page (/inventory/2018-ford-f-150-xlt-4412) should still light
  // up "Inventory", so nested routes count as active -- but "/" must match
  // exactly, or it would be active on every page in the site.
  const isActive = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`${className} ${isActive ? activeClassName : ''}`}
    >
      {children}
    </Link>
  )
}
