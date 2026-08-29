import Link from 'next/link'
import { PARAM, SORT_OPTIONS, buildSearchParams, inventoryHref } from '@/lib/search-params'
import type { FacetValue, FilterOptions, VehicleFilters } from '@/lib/vehicle-types'
import { SearchIcon } from './icons'

/**
 * The inventory filter panel.
 *
 * A plain <form method="get">, rendered on the server, with no client-side
 * JavaScript at all. Submitting it produces exactly the URLs
 * search-params.ts parses, which means filtered results are shareable,
 * bookmarkable, indexable, and work on a phone with a bad connection
 * before any bundle has loaded. That last point is not hypothetical for
 * this audience.
 *
 * Every option carries its result count, computed against the other active
 * filters, so a shopper can see that picking "Ford" leaves 12 cars before
 * they spend a click finding out.
 */

type Props = {
  filters: VehicleFilters
  options: FilterOptions
  /** Rendered inside the panel so "Clear all" can sit with the controls. */
  hasActiveFilters: boolean
}

const selectClass =
  'min-h-11 w-full cursor-pointer rounded-md border border-navy/20 bg-cream px-2 text-sm text-navy'
const inputClass = 'min-h-11 w-full rounded-md border border-navy/20 bg-cream px-3 text-sm text-navy'
const labelClass = 'flex flex-col gap-1 text-sm font-semibold text-navy'

function FacetSelect({
  name,
  label,
  anyLabel,
  values,
  selected,
}: {
  name: string
  label: string
  anyLabel: string
  values: FacetValue[]
  selected: string | undefined
}) {
  // A filter nobody on the lot can satisfy is noise. If every truck sells,
  // the Drivetrain dropdown disappears rather than offering one empty
  // choice.
  if (values.length === 0) return null

  return (
    <label className={labelClass}>
      {label}
      <select name={name} defaultValue={selected ?? ''} className={selectClass}>
        <option value="">{anyLabel}</option>
        {values.map((v) => (
          // One interpolation, not three: `{v.value} ({v.count})` makes
          // React emit separate text nodes glued with <!-- --> comments
          // inside the <option>, which is valid but ugly in view-source.
          <option key={v.value} value={v.value}>
            {`${v.value} (${v.count})`}
          </option>
        ))}
      </select>
    </label>
  )
}

function YearSelect({
  name,
  label,
  range,
  selected,
}: {
  name: string
  label: string
  range: { min: number; max: number } | null
  selected: number | undefined
}) {
  if (!range) return null
  const years: number[] = []
  for (let y = range.max; y >= range.min; y--) years.push(y)

  return (
    <label className={labelClass}>
      {label}
      <select name={name} defaultValue={selected != null ? String(selected) : ''} className={selectClass}>
        <option value="">Any</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  )
}

export function InventoryFilters({ filters, options, hasActiveFilters }: Props) {
  const priceMin = filters.minPriceCents != null ? Math.round(filters.minPriceCents / 100) : ''
  const priceMax = filters.maxPriceCents != null ? Math.round(filters.maxPriceCents / 100) : ''

  // The mechanical filters matter to a minority of shoppers but matter a
  // lot to them. Collapsed by default via <details> -- no JavaScript, and
  // open by default when one of them is already applied so a shared link
  // never hides the filter it was built around.
  const advancedActive = Boolean(
    filters.transmission || filters.drivetrain || filters.fuelType || filters.exteriorColor,
  )

  return (
    <form
      method="get"
      action="/inventory"
      className="rounded-lg border border-navy/10 bg-white/50 p-4"
      aria-labelledby="filter-heading"
    >
      <h2 id="filter-heading" className="sr-only">
        Filter inventory
      </h2>

      {/* Sort lives in its own form next to the results; carry the current
          choice through this one so applying a filter doesn't silently
          reset the shopper's sort order. */}
      {filters.sort && filters.sort !== 'newest' && (
        <input type="hidden" name={PARAM.sort} value={filters.sort} />
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-semibold text-navy">Search</span>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy/50" />
            <input
              type="search"
              name={PARAM.q}
              defaultValue={filters.q ?? ''}
              placeholder="Make, model, stock # or VIN"
              className={`${inputClass} pl-9`}
            />
          </div>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FacetSelect
          name={PARAM.make}
          label="Make"
          anyLabel="Any make"
          values={options.makes}
          selected={filters.make}
        />
        <FacetSelect
          name={PARAM.model}
          label="Model"
          anyLabel={filters.make ? `Any ${filters.make} model` : 'Any model'}
          values={options.models}
          selected={filters.model}
        />
        <FacetSelect
          name={PARAM.body}
          label="Body type"
          anyLabel="Any body type"
          values={options.bodyStyles}
          selected={filters.bodyStyle}
        />

        <label className={labelClass}>
          Max mileage
          <input
            type="number"
            inputMode="numeric"
            name={PARAM.mileageMax}
            min={0}
            step={5000}
            placeholder="Any mileage"
            defaultValue={filters.maxMileage ?? ''}
            className={inputClass}
          />
        </label>

        <YearSelect name={PARAM.yearMin} label="Year from" range={options.yearRange} selected={filters.yearMin} />
        <YearSelect name={PARAM.yearMax} label="Year to" range={options.yearRange} selected={filters.yearMax} />

        <label className={labelClass}>
          Min price
          <input
            type="number"
            inputMode="numeric"
            name={PARAM.priceMin}
            min={0}
            step={500}
            placeholder="No minimum"
            defaultValue={priceMin}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Max price
          <input
            type="number"
            inputMode="numeric"
            name={PARAM.priceMax}
            min={0}
            step={500}
            placeholder="No maximum"
            defaultValue={priceMax}
            className={inputClass}
          />
        </label>
      </div>

      <details className="mt-3" open={advancedActive}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-bold text-navy hover:text-red">
          More filters
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <FacetSelect
            name={PARAM.transmission}
            label="Transmission"
            anyLabel="Any transmission"
            values={options.transmissions}
            selected={filters.transmission}
          />
          <FacetSelect
            name={PARAM.drivetrain}
            label="Drivetrain"
            anyLabel="Any drivetrain"
            values={options.drivetrains}
            selected={filters.drivetrain}
          />
          <FacetSelect
            name={PARAM.fuel}
            label="Fuel type"
            anyLabel="Any fuel type"
            values={options.fuelTypes}
            selected={filters.fuelType}
          />
          <FacetSelect
            name={PARAM.color}
            label="Exterior color"
            anyLabel="Any color"
            values={options.exteriorColors}
            selected={filters.exteriorColor}
          />
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="min-h-11 cursor-pointer rounded-md bg-red px-6 text-sm font-bold text-cream hover:bg-red-dark"
        >
          Apply Filters
        </button>
        {hasActiveFilters && (
          <Link
            href="/inventory"
            className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-navy/70 underline hover:text-red"
          >
            Clear all filters
          </Link>
        )}
      </div>
    </form>
  )
}

/**
 * The sort control. A separate form from the filter panel, so it sits next
 * to the result count where shoppers look for it, with the active filters
 * carried through as hidden inputs -- otherwise changing the sort would
 * silently drop every filter.
 */
export function SortForm({ filters }: { filters: VehicleFilters }) {
  const carried = buildSearchParams({ ...filters, sort: undefined, page: undefined })

  return (
    <form method="get" action="/inventory" className="flex items-center gap-2 text-sm">
      {[...carried.entries()].map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <label htmlFor="sort" className="shrink-0 font-semibold text-navy/80">
        Sort
      </label>
      <select
        id="sort"
        name={PARAM.sort}
        defaultValue={filters.sort ?? 'newest'}
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
  )
}

/** Removable chips for every active filter. */
export function FilterChips({ chips }: { chips: { key: string; label: string; removeHref: string }[] }) {
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key}>
          <Link
            href={chip.removeHref}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-navy/20 bg-white/70 py-1 pl-3 pr-2 text-sm font-semibold text-navy hover:border-red hover:text-red"
          >
            {chip.label}
            <span aria-hidden="true" className="text-base leading-none">
              ×
            </span>
            <span className="sr-only">Remove filter</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * Numbered pager. Rendered as links rather than buttons so each page is a
 * real URL a crawler can follow -- without it, only the first 24 vehicles
 * on the lot would ever be indexed.
 */
export function Pagination({
  filters,
  page,
  pageCount,
}: {
  filters: VehicleFilters
  page: number
  pageCount: number
}) {
  if (pageCount <= 1) return null

  const href = (p: number) => inventoryHref({ ...filters, page: p })

  // A window around the current page, always including first and last, so
  // the control stays a fixed width no matter how big the lot gets.
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1])
  const visible = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)

  const linkClass =
    'inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-navy/20 px-3 text-sm font-semibold text-navy hover:border-navy'

  return (
    <nav aria-label="Inventory pages" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className={linkClass}>
          ← Prev
        </Link>
      )}

      {visible.map((p, i) => {
        const prev = visible[i - 1]
        const gap = prev != null && p - prev > 1
        return (
          <span key={p} className="flex items-center gap-2">
            {gap && (
              <span aria-hidden="true" className="px-1 text-navy/50">
                …
              </span>
            )}
            {p === page ? (
              <span aria-current="page" className={`${linkClass} border-navy bg-navy text-cream`}>
                {p}
              </span>
            ) : (
              <Link href={href(p)} className={linkClass} aria-label={`Page ${p}`}>
                {p}
              </Link>
            )}
          </span>
        )
      })}

      {page < pageCount && (
        <Link href={href(page + 1)} rel="next" className={linkClass}>
          Next →
        </Link>
      )}
    </nav>
  )
}
