import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { EmptyState } from '@/components/EmptyState'
import { VehicleRequest } from '@/components/VehicleRequest'
import { InventorySkeleton } from '@/components/InventorySkeleton'
import { FilterChips, InventoryFilters, Pagination, SortForm } from '@/components/InventoryFilters'
import { JsonLd, breadcrumbJsonLd } from '@/components/JsonLd'
import { VehicleCard } from '@/components/VehicleCard'
import { DEALER, SITE_URL } from '@/lib/dealer'
import { getFilterOptions, listVehicles } from '@/lib/inventory'
import { activeFilterChips, parseSearchParams, type RawSearchParams } from '@/lib/search-params'
import { hasActiveFilters as computeHasActiveFilters } from '@/lib/vehicle-filter'
import type { VehicleFilters } from '@/lib/vehicle-types'

const TITLE = 'Inventory'
const DESCRIPTION = `Browse every vehicle on the lot at ${DEALER.name} in ${DEALER.address.city}, ${DEALER.address.state}. Filter by make, model, year, price, mileage, body type and more.`

const CRUMBS = [
  { name: 'Home', href: '/' },
  { name: 'Inventory', href: '/inventory' },
]

/**
 * Canonical strategy for the listing.
 *
 * A filtered view (make=Ford, price_max=12000, a sort order) is the same
 * inventory resliced, so it canonicalises to the bare /inventory and lets
 * Google consolidate the whole facet space onto one URL. Deliberately no
 * `noindex` alongside that canonical: the two are conflicting instructions
 * -- the canonical says "index the target instead", the noindex says "index
 * nothing here" -- and Google's faceted-navigation guidance is to pick the
 * canonical. Combining them risks the noindex propagating to the canonical
 * target, which would drop the real inventory page out of the index.
 *
 * Pagination is different: page 2 is genuinely different vehicles, not a
 * reslice of page 1, so each page self-canonicalises and stays indexable.
 * The pager emits rel="prev"/rel="next" to tie the sequence together.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}): Promise<Metadata> {
  const filters = parseSearchParams(await searchParams)
  const isFiltered = computeHasActiveFilters(filters)

  // Use the *clamped* page, not the requested one: ?page=9 on a two-page
  // lot renders page 2, and canonicalising it to a page that does not exist
  // would point Google at a URL that redirects back to this content. The
  // vehicle read behind this is request-memoized, so it costs no extra
  // query on top of the render below.
  const { page } = await listVehicles(filters)

  const canonicalPath = isFiltered
    ? '/inventory'
    : page > 1
      ? `/inventory?page=${page}`
      : '/inventory'

  return {
    title: page > 1 && !isFiltered ? `${TITLE} — Page ${page}` : TITLE,
    description: DESCRIPTION,
    alternates: { canonical: `${SITE_URL}${canonicalPath}` },
  }
}

/**
 * The parts that need data. Split out so the page shell -- breadcrumbs,
 * heading -- renders immediately and only this streams in behind a
 * skeleton.
 */
async function InventoryResults({ filters }: { filters: VehicleFilters }) {
  const hasFilters = computeHasActiveFilters(filters)
  const [result, options] = await Promise.all([listVehicles(filters), getFilterOptions(filters)])
  const chips = activeFilterChips(filters)

  // Two genuinely different empty states. "Nothing on the lot" is a
  // business fact and the shopper should call; "nothing matches" is the
  // shopper's own filters and they should widen them. Telling someone to
  // call when the real problem is their $3,000 price cap wastes everyone's
  // time.
  const lotIsEmpty = options.totalListable === 0

  const rangeStart = (result.page - 1) * result.pageSize + 1
  const rangeEnd = Math.min(result.page * result.pageSize, result.total)

  return (
    <>
      <p className="-mt-4 mb-6 text-navy/70">
        {lotIsEmpty
          ? 'Restocking now — new arrivals on the way.'
          : `${options.totalListable} ${options.totalListable === 1 ? 'vehicle' : 'vehicles'} on the lot right now.`}
      </p>

      <InventoryFilters filters={filters} options={options} hasActiveFilters={hasFilters} />

      {chips.length > 0 && (
        <div className="mt-4">
          <FilterChips chips={chips} />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-navy/80" role="status">
          {result.total === 0
            ? 'No vehicles found'
            : `Showing ${rangeStart}–${rangeEnd} of ${result.total} ${result.total === 1 ? 'vehicle' : 'vehicles'}`}
        </p>
        {result.total > 0 && <SortForm filters={filters} />}
      </div>

      <div className="mt-6">
        {result.vehicles.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.vehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        ) : lotIsEmpty ? (
          <EmptyState
            title="New inventory coming soon"
            message="We're restocking the lot. Give us a call and we'll let you know what's arriving this week."
            action={{ href: '/', label: 'Back to home' }}
          />
        ) : (
          <EmptyState
            title="No vehicles match those filters"
            message="Try widening your price or mileage range, or clear the filters to see the full lot."
            action={{ href: '/inventory', label: 'Clear filters' }}
          />
        )}
      </div>

      <Pagination filters={filters} page={result.page} pageCount={result.pageCount} />
    </>
  )
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>
}) {
  const filters = parseSearchParams(await searchParams)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <JsonLd data={breadcrumbJsonLd(CRUMBS)} />
      <Breadcrumbs crumbs={CRUMBS} />

      <h1 className="mt-3 mb-6 font-display text-3xl uppercase tracking-tight text-navy">Inventory</h1>

      {/* Keyed on the filters so changing them shows the skeleton again
          rather than leaving the previous results on screen. */}
      <Suspense key={JSON.stringify(filters)} fallback={<InventorySkeleton />}>
        <InventoryResults filters={filters} />
      </Suspense>

      <div className="mt-10">
        <VehicleRequest />
      </div>

      {/* FTC "clear and conspicuous" wants pricing qualifiers near the
          price, not buried in a footer. This repeats the per-vehicle
          disclaimer at the bottom of the list view. */}
      <p className="mt-8 text-xs text-navy/60">
        All prices exclude tax, title, license and dealer fees. Vehicles subject to prior sale. Mileage
        and equipment are believed accurate but not guaranteed — verify with us before purchase.
      </p>
    </div>
  )
}
