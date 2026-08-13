import { formatPayment, formatPrice } from '@/lib/format'

type PriceBlockProps = {
  priceCents: number | null
  downPaymentCents: number | null
  weeklyPaymentCents: number | null
  priceReduced?: boolean
  size?: 'default' | 'compact'
}

/**
 * BHPH shoppers buy on down payment and weekly payment, not sticker price.
 * When both figures exist, they lead in gold-on-navy; total price is
 * secondary. When they don't, price alone is shown, full-size. Price is
 * never computed here -- only ever the exact value on the record.
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

  if (payment) {
    const [downPart, weekPart] = payment.split(' · ')
    return (
      <div className={`rounded-md bg-navy ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
        <div className={`flex items-baseline gap-2 font-display uppercase tracking-tight text-cream ${compact ? 'text-base' : 'text-2xl sm:text-3xl'}`}>
          <span>{downPart}</span>
          <span className="text-gold">·</span>
          <span>{weekPart}</span>
        </div>
        <div className={`mt-1 flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
          <span className="text-gold/90">Total price:</span>
          <span className="font-semibold text-cream/90">{price}</span>
          {priceReduced && (
            <span className="rounded-sm bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
              Price Reduced
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`font-display uppercase tracking-tight text-navy ${compact ? 'text-xl' : 'text-3xl sm:text-4xl'}`}>
        {price}
      </span>
      {priceReduced && (
        <span className="rounded-sm bg-red px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream">
          Price Reduced
        </span>
      )}
    </div>
  )
}
