import Link from 'next/link'
import { DEALER } from '@/lib/dealer'
import { PhoneIcon, SearchIcon } from '@/components/icons'

/**
 * A used car site 404s constantly by design: every sold vehicle's URL
 * eventually stops resolving, and those URLs live on in texts, Facebook
 * posts and Google's index for months. So this page assumes the visitor was
 * looking for a specific car that is gone, and routes them to the two
 * things that can still help -- the current lot, and the phone.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
      <p className="font-display text-6xl uppercase tracking-tight text-navy/20">404</p>
      <h1 className="mt-4 font-display text-3xl uppercase tracking-tight text-navy">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-4 max-w-md text-navy/80">
        If you were looking at a specific vehicle, it may have sold. Our current lot is always up to
        date — or call us and we&apos;ll tell you what we have like it.
      </p>

      <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <Link
          href="/inventory"
          className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-5 text-base font-bold text-cream hover:bg-red-dark"
        >
          <SearchIcon className="h-5 w-5" />
          Browse Inventory
        </Link>
        <a
          href={DEALER.phoneTel}
          className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-5 text-base font-bold text-navy hover:bg-navy hover:text-cream"
        >
          <PhoneIcon className="h-5 w-5" />
          Call Us
        </a>
      </div>
    </div>
  )
}
