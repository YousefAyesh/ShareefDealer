import { formatPayment, formatPrice } from '@/lib/format'

type PriceBlockProps = {
  priceCents: number | null
  downPaymentCents: number | null
  weeklyPaymentCents: number | null
  priceReduced?: boolean
  size?: 'default' | 'compact'
}

/**
 * The price, and -- only when the feed actually supplies both figures -- the
 * down payment and weekly payment underneath it.
 *
 * The price leads. Payment terms are supporting detail, shown because the
 * dealer's system published them, not because the site is selling on
 * payment.
 *
 * Nothing here is ever computed. A payment shown on a dealer website is one
 * the dealer is legally held to, so this component renders only exact
 * values already on the record and renders nothing at all when either half
 * is missing. There is deliberately no APR, no term length, and no
 * "estimated payment" -- those would be advertised credit terms, and
 * advertising them triggers Regulation Z disclosure requirements this site
 * makes no attempt to satisfy.
 */
export function PriceBlock({
  priceCents,
  downPaymentCents,
  weeklyPaymentCents,
  priceReduced = false,
  size = 'default',
}: PriceBlockProps) {
  const payment = formatPayment(downPaymentCents, weeklyPaymentCents)
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

      {payment && (
        <p className={`mt-1.5 font-semibold text-navy/75 ${compact ? 'text-xs' : 'text-sm'}`}>
          {payment}
        </p>
      )}
    </div>
  )
}
