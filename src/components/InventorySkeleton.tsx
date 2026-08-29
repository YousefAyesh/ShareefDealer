/**
 * Placeholder for the filter panel and vehicle grid while they load.
 *
 * This deliberately does NOT live in an `inventory/loading.tsx`. A
 * loading.tsx at that segment wraps every nested route in a Suspense
 * boundary -- including /inventory/[slug] -- and a Suspense boundary above
 * a component that calls notFound() means the 200 response shell is already
 * flushed by the time it throws. The result is the 404 page served under a
 * 200 status: a soft 404, on the exact URLs (sold vehicles) that a dealer
 * site produces constantly. Scoping the boundary to the listing page keeps
 * the skeleton without breaking the vehicle pages.
 *
 * The geometry mirrors the real cards -- 4:3 image, three text lines -- so
 * nothing visibly jumps when the vehicles arrive.
 */
export function InventorySkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading inventory…</span>

      <div className="h-56 animate-pulse rounded-lg bg-navy/5" />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-navy/10 bg-white/40">
            <div className="aspect-[4/3] w-full animate-pulse bg-navy/10" />
            <div className="space-y-2 p-3">
              <div className="h-5 w-3/4 animate-pulse rounded bg-navy/10" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-navy/10" />
              <div className="h-8 w-1/2 animate-pulse rounded bg-navy/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
