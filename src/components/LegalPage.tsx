import { Breadcrumbs } from './Breadcrumbs'
import { JsonLd, breadcrumbJsonLd } from './JsonLd'

/**
 * Shared chrome for the policy pages. Narrow measure and generous line
 * height: these are the only pages on the site anyone reads in paragraphs.
 */
export function LegalPage({
  title,
  lastUpdated,
  href,
  children,
}: {
  title: string
  /** ISO date. Rendered long-form; policies are dated or they mean nothing. */
  lastUpdated: string
  href: string
  children: React.ReactNode
}) {
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: title, href },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <Breadcrumbs crumbs={crumbs} />

      <h1 className="mt-3 font-display text-3xl uppercase tracking-tight text-navy">{title}</h1>
      <p className="mt-2 text-sm text-navy/60">
        Last updated{' '}
        <time dateTime={lastUpdated}>
          {new Date(`${lastUpdated}T00:00:00Z`).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </time>
      </p>

      <div className="mt-8 space-y-6 leading-relaxed text-navy/85 [&_a]:font-semibold [&_a]:text-red [&_a]:underline [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:uppercase [&_h2]:tracking-tight [&_h2]:text-navy [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </div>
  )
}
