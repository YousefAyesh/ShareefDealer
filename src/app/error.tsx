'use client'

import { useEffect } from 'react'
import { DEALER } from '@/lib/dealer'

/**
 * Route-level error boundary.
 *
 * The visitor is shown the phone number and nothing else technical. `error`
 * carries a digest rather than a message in production -- Next redacts
 * server errors before they reach the browser -- so there is nothing useful
 * to display even if we wanted to, and showing a stack trace to a car
 * shopper only makes the business look broken.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24">
      <h1 className="font-display text-3xl uppercase tracking-tight text-navy">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-navy/80">
        Sorry — that page didn&apos;t load. Try again, and if it keeps happening give us a call and
        we&apos;ll help you directly.
      </p>

      <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="min-h-12 flex-1 cursor-pointer rounded-md bg-red px-5 text-base font-bold text-cream hover:bg-red-dark"
        >
          Try again
        </button>
        <a
          href={DEALER.phoneTel}
          className="flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-md border-2 border-navy px-5 text-base font-bold text-navy hover:bg-navy hover:text-cream"
        >
          Call {DEALER.phoneDisplay}
        </a>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-xs text-navy/50">Reference: {error.digest}</p>
      )}
    </div>
  )
}
