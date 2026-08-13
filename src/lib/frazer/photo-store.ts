import { put } from '@vercel/blob'
import type { ProcessedPhoto } from './photos'

const FETCH_TIMEOUT_MS = 15000

export type StoredPhoto = {
  id: string
  sourceUrl: string
  position: number
}

export type PhotoSyncPlan = {
  toFetch: { url: string; position: number }[]
  toReposition: { id: string; position: number }[]
  toDelete: string[]
}

/** Returns null on any failure — the caller keeps the existing photo. */
export async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) return null
      return Buffer.from(await res.arrayBuffer())
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/**
 * Diffs the feed's photo list against what is already stored.
 *
 * An empty feed photo list is treated as "no information", not "delete all" —
 * losing every photo is much more likely to be a feed glitch than an edit.
 */
export function planPhotoSync(
  feedUrls: string[],
  stored: StoredPhoto[],
): PhotoSyncPlan {
  if (feedUrls.length === 0) {
    return { toFetch: [], toReposition: [], toDelete: [] }
  }

  const storedByUrl = new Map(stored.map((s) => [s.sourceUrl, s]))
  const plan: PhotoSyncPlan = { toFetch: [], toReposition: [], toDelete: [] }

  feedUrls.forEach((url, position) => {
    const existing = storedByUrl.get(url)
    if (!existing) {
      plan.toFetch.push({ url, position })
    } else if (existing.position !== position) {
      plan.toReposition.push({ id: existing.id, position })
    }
  })

  const feedUrlSet = new Set(feedUrls)
  for (const s of stored) {
    if (!feedUrlSet.has(s.sourceUrl)) plan.toDelete.push(s.id)
  }

  return plan
}

export type UploadedUrls = { thumb: string; card: string; full: string }

/** Content-hash paths mean an identical image is never stored twice. */
export async function uploadVariants(
  photo: ProcessedPhoto,
): Promise<UploadedUrls> {
  const urls: Partial<UploadedUrls> = {}
  for (const variant of photo.variants) {
    const blob = await put(
      `vehicles/${photo.contentHash}/${variant.name}.webp`,
      variant.buffer,
      { access: 'public', contentType: 'image/webp', addRandomSuffix: false },
    )
    urls[variant.name] = blob.url
  }
  return urls as UploadedUrls
}
