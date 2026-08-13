import type { Metadata } from 'next'
import Link from 'next/link'
import { VehicleCard } from '@/components/VehicleCard'
import { EmptyState } from '@/components/EmptyState'
import { getFilterOptions, listVehicles } from '@/lib/inventory'
import type { SortOption } from '@/lib/vehicle-types'

export const metadata: Metadata = {
  title: 'Inventory',
  description: 'Browse the full lot at Roadstar Auto Sales in Austin, TX. Filter by make, body type, price and mileage.',
}

type SearchParams = {
  make?: string
  body?: string
  price_max?: string
  mileage_max?: string
  sort?: string
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest Arrivals' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'mileage_asc', label: 'Mileage: Low to High' },
]

function isSortOption(value: string | undefined): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value)
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const sort: SortOption = isSortOption(params.sort) ? params.sort : 'newest'
  const priceMaxDollars = params.price_max ? Number(params.price_max) : undefined
  const mileageMax = params.mileage_max ? Number(params.mileage_max) : undefined

  const filters = {
    make: params.make || undefined,
    bodyStyle: params.body || undefined,
    maxPriceCents:
      priceMaxDollars != null && Number.isFinite(priceMaxDollars) ? Math.round(priceMaxDollars * 100) : undefined,
    maxMileage: mileageMax != null && Number.isFinite(mileageMax) ? Math.round(mileageMax) : undefined,
    sort,
  }

  const hasActiveFilters = Boolean(filters.make || filters.bodyStyle || filters.maxPriceCents || filters.maxMileage)

  const [vehicles, filterOptions, allAvailable] = await Promise.all([
    listVehicles(filters),
    getFilterOptions(),
    hasActiveFilters ? listVehicles({}) : Promise.resolve(null),
  ])

  // Two distinct empty states: the lot itself is empty (no inventory at
  // all), vs. filters simply don't match anything currently on the lot.
  const lotIsEmpty = hasActiveFilters ? allAvailable?.length === 0 : vehicles.length === 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl uppercase tracking-tight text-navy">Inventory</h1>

      <form method="get" action="/inventory" className="mt-6 grid grid-cols-2 gap-3 rounded-lg border border-navy/10 bg-white/40 p-4 sm:grid-cols-4 sm:gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-navy">
          Make
          <select
            name="make"
            defaultValue={params.make || ''}
            className="min-h-11 cursor-pointer rounded-md border border-navy/20 bg-cream px-2 text-sm text-navy"
          >
            <option value="">Any make</option>
            {filterOptions.makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-semibold text-navy">
          Body type
          <select
            name="body"
            defaultValue={params.body || ''}
            className="min-h-11 cursor-pointer rounded-md border border-navy/20 bg-cream px-2 text-sm text-navy"
          >
            <option value="">Any body type</option>
            {filterOptions.bodyStyles.map((body) => (
              <option key={body} value={body}>
                {body}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-semibold text-navy">
          Max price
          <input
            type="number"
            name="price_max"
            min={0}
            step={500}
            placeholder="Any price"
            defaultValue={params.price_max || ''}
            className="min-h-11 rounded-md border border-navy/20 bg-cream px-2 text-sm text-navy"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-semibold text-navy">
          Max mileage
          <input
            type="number"
            name="mileage_max"
            min={0}
            step={5000}
            placeholder="Any mileage"
            defaultValue={params.mileage_max || ''}
            className="min-h-11 rounded-md border border-navy/20 bg-cream px-2 text-sm text-navy"
          />
        </label>

        <div className="col-span-2 flex items-end gap-2 sm:col-span-4">
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-md bg-red px-5 text-sm font-bold text-cream hover:bg-red-dark"
          >
            Apply Filters
          </button>
          {hasActiveFilters && (
            <Link
              href="/inventory"
              className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-navy/70 hover:text-red"
            >
              Clear all
            </Link>
          )}
        </div>
      </form>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-navy/80">
          {vehicles.length} {vehicles.length === 1 ? 'vehicle' : 'vehicles'} found
        </p>

        <form method="get" action="/inventory" className="flex items-center gap-2 text-sm">
          {params.make && <input type="hidden" name="make" value={params.make} />}
          {params.body && <input type="hidden" name="body" value={params.body} />}
          {params.price_max && <input type="hidden" name="price_max" value={params.price_max} />}
          {params.mileage_max && <input type="hidden" name="mileage_max" value={params.mileage_max} />}
          <label htmlFor="sort" className="font-semibold text-navy/80">
            Sort
          </label>
          <select
            id="sort"
            name="sort"
            defaultValue={sort}
            className="min-h-11 cursor-pointer rounded-md border border-navy/20 bg-cream px-2 text-navy"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 cursor-pointer rounded-md border border-navy/20 px-3 font-semibold text-navy hover:border-navy"
          >
            Go
          </button>
        </form>
      </div>

      <div className="mt-6">
        {vehicles.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((vehicle) => (
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
            message="Try widening your price or mileage range, or clear all filters to see the full lot."
            action={{ href: '/inventory', label: 'Clear filters' }}
          />
        )}
      </div>
    </div>
  )
}
