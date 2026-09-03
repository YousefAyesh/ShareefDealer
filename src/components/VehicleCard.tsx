import Image from 'next/image'
import Link from 'next/link'
import { formatMileage, vehicleTitle } from '@/lib/format'
import type { Vehicle } from '@/lib/vehicle-types'
import { PriceBlock } from './PriceBlock'

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const hero = vehicle.photos[0]
  const title = vehicleTitle(vehicle)
  const isSold = vehicle.status === 'sold'

  return (
    <Link
      href={`/inventory/${vehicle.slug}`}
      className="group block cursor-pointer overflow-hidden rounded-lg border border-navy/10 bg-white/40 shadow-sm hover:shadow-md focus-visible:shadow-md"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-navy">
        {hero ? (
          <Image
            src={hero.urlCard}
            alt={hero.alt}
            width={hero.width}
            height={hero.height}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : null}
        {isSold && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy/70">
            <span className="rounded-sm border-2 border-cream px-4 py-1.5 font-display text-xl uppercase tracking-widest text-cream">
              Sold
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2 p-3">
        <h3 className="font-display text-base uppercase leading-tight tracking-tight text-navy">{title}</h3>
        <p className="text-sm text-navy/70">{formatMileage(vehicle.mileage)}</p>
        <PriceBlock
          priceCents={vehicle.priceCents}
          priceReduced={vehicle.priceReduced}
          size="compact"
        />
      </div>
    </Link>
  )
}
