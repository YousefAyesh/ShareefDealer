'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { VehiclePhoto } from '@/lib/vehicle-types'

/**
 * Hero image first (position 0), thumbnail strip below. Tapping a thumbnail
 * swaps the hero -- a simple opacity change, no carousel/parallax motion.
 */
export function VehicleGallery({ photos, title }: { photos: VehiclePhoto[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const active = photos[activeIndex] ?? photos[0]

  if (!active) return null

  return (
    <div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-navy sm:aspect-[16/10]">
        <Image
          key={active.id}
          src={active.urlFull}
          alt={active.alt}
          width={active.width}
          height={active.height}
          priority
          className="h-full w-full object-cover"
        />
      </div>

      {photos.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={`${title} photos`}>
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              role="tab"
              aria-selected={i === activeIndex}
              aria-label={`Show photo ${i + 1} of ${photos.length}`}
              onClick={() => setActiveIndex(i)}
              className={`h-16 w-20 shrink-0 cursor-pointer overflow-hidden rounded-md border-2 ${
                i === activeIndex ? 'border-red' : 'border-transparent opacity-80 hover:opacity-100'
              }`}
            >
              <Image
                src={photo.urlThumb}
                alt=""
                width={160}
                height={120}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
