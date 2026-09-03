import { formatPrice } from '@/lib/format'

type PriceBlockProps = {
  priceCents: number | null
  priceReduced?: boolean
  size?: 'default' | 'compact'
}

/**
 * The cash price, and nothing else.
 *
 * This dealership is cash only. There is deliberately no down payment, no
 * weekly or monthly payment, no APR, no term length and no "estimated
 * payment" -- all of those are advertised credit terms, and stating one in
 * an advertisement triggers Regulation Z disclosure requirements (12 CFR
 * 1026.24) that this site makes no attempt to satisfy. They would also be
 * false, because no credit is on offer.
 *
 * Nothing here is ever computed from the price. If the figure is not on the
 * record, nothing renders.
 */
export function PriceBlock({ priceCents, priceReduced = false, size = 'default' }: PriceBlockProps) {
  const price = formatPrice(priceCents)
  const compact = size === 'compact'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`font-display uppercase leading-none tracking-tight text-navy ${
            compact ? 'text-xl' : 'text-3xl sm:text-4xl'
          }`}
        >
          {price}
        </span>
        {priceReduced && (
          <span className="rounded-sm bg-red px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream">
            Price Reduced
          </span>
        )}
      </div>
    </div>
  )
}
