'use client'

import Image from 'next/image'
import { useCallback, useRef, useState } from 'react'
import type { VehiclePhoto } from '@/lib/vehicle-types'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

/**
 * Hero image with a thumbnail strip. Tapping or arrowing through a
 * thumbnail swaps the hero -- a plain state change, no carousel animation.
 *
 * Accessibility notes, because the obvious markup here is wrong:
 *
 *  - The previous version used role="tablist"/role="tab" with no
 *    corresponding tabpanel. That is an invalid ARIA pattern and it made a
 *    screen reader announce photo buttons as tabs controlling something
 *    that did not exist. These are just buttons in a labelled group.
 *  - The active thumbnail is marked with aria-pressed rather than
 *    aria-selected, which is what a toggle button actually supports.
 *  - The hero swap is announced through a live region, so a screen reader
 *    user gets confirmation that pressing a thumbnail did something.
 *
 * Keyboard: Left/Right arrows move between photos from anywhere in the
 * strip, matching what a sighted mouse user gets from the prev/next
 * buttons.
 */
export function VehicleGallery({ photos, title }: { photos: VehiclePhoto[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)
  const active = photos[activeIndex] ?? photos[0]

  const go = useCallback(
    (next: number) => {
      if (photos.length === 0) return
      // Wrap in both directions: reaching the last photo and pressing Next
      // returning to the first is what every gallery this audience has used
      // does.
      const wrapped = (next + photos.length) % photos.length
      setActiveIndex(wrapped)
      const button = stripRef.current?.querySelectorAll('button')[wrapped]
      if (button instanceof HTMLElement) button.focus()
    },
    [photos.length],
  )

  if (!active) return null

  const multiple = photos.length > 1

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
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="h-full w-full object-cover"
        />

        {multiple && (
          <>
            <button
              type="button"
              onClick={() => go(activeIndex - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-cream/90 text-navy hover:bg-cream"
            >
              <ChevronLeftIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => go(activeIndex + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-cream/90 text-navy hover:bg-cream"
            >
              <ChevronRightIcon className="h-6 w-6" />
            </button>
            <p className="absolute bottom-2 right-2 rounded-full bg-navy/80 px-3 py-1 text-xs font-semibold text-cream">
              {activeIndex + 1} / {photos.length}
            </p>
          </>
        )}
      </div>

      {/* Announces the swap without moving focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        Photo {activeIndex + 1} of {photos.length}
      </p>

      {multiple && (
        <div
          ref={stripRef}
          role="group"
          aria-label={`${title} photos`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              go(activeIndex + 1)
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              go(activeIndex - 1)
            }
          }}
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
        >
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              aria-pressed={i === activeIndex}
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
