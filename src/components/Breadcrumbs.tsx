import Link from 'next/link'
import type { Crumb } from './JsonLd'

/**
 * Visible breadcrumb trail. Paired with breadcrumbJsonLd so the same path
 * appears both to the shopper and in the search result, where it replaces
 * the raw URL under the page title.
 *
 * The last crumb is the current page and is not a link -- linking a page to
 * itself is a known screen-reader annoyance and gains nothing.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-navy/70">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={crumb.href} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-navy/40">
                  /
                </span>
              )}
              {isLast ? (
                <span aria-current="page" className="font-semibold text-navy">
                  {crumb.name}
                </span>
              ) : (
                <Link href={crumb.href} className="cursor-pointer hover:text-red hover:underline">
                  {crumb.name}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
