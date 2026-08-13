import sharp from 'sharp'
import { sha256Hex } from '@/lib/hash'

export const PHOTO_SIZES = { thumb: 320, card: 800, full: 1600 } as const
export type PhotoVariantName = keyof typeof PHOTO_SIZES

const WEBP_QUALITY = 82

export type PhotoVariant = {
  name: PhotoVariantName
  buffer: Buffer
  width: number
}

export type ProcessedPhoto = {
  contentHash: string
  width: number
  height: number
  variants: PhotoVariant[]
}

/**
 * Hash the ORIGINAL bytes (dedupe key), then EXIF-correct and resize.
 *
 * .rotate() with no argument applies the EXIF orientation tag and strips it,
 * which is what stops Sidekick phone photos from displaying sideways.
 *
 * IMPORTANT: sharp's metadata() on a lazy `.rotate()` pipeline reports the
 * STORED (pre-rotation) width/height plus an `orientation` field — it does
 * NOT report display dimensions, because `.rotate()` only takes effect when
 * the pipeline is actually executed (toBuffer/toFile). The reliable source
 * of display dimensions is metadata().autoOrient, which sharp computes from
 * the orientation tag regardless of whether `.rotate()` was called. Using
 * plain meta.width/meta.height here would silently store swapped (wrong)
 * dimensions for every portrait phone photo.
 */
export async function processPhoto(source: Buffer): Promise<ProcessedPhoto> {
  const contentHash = sha256Hex(source)

  const meta = await sharp(source).metadata()
  // TRAP: .rotate() is a lazy pipeline op — it only takes effect when the
  // pipeline is executed (toBuffer/toFile). Calling metadata() on an
  // un-executed `sharp(source).rotate()` pipeline reports the STORED
  // (pre-rotation) width/height plus a raw `orientation` field, NOT the
  // display dimensions. Using meta.width/meta.height directly here would
  // silently store swapped (wrong) dimensions for every portrait phone
  // photo. `autoOrient` is computed from the orientation tag regardless of
  // whether `.rotate()` was called, so it's the reliable source of display
  // dimensions. Do not "simplify" this back to meta.width/meta.height.
  const displayWidth = meta.autoOrient?.width ?? meta.width
  const displayHeight = meta.autoOrient?.height ?? meta.height
  if (!displayWidth || !displayHeight) {
    throw new Error('Unreadable image: no dimensions')
  }

  const variants: PhotoVariant[] = []
  for (const name of Object.keys(PHOTO_SIZES) as PhotoVariantName[]) {
    const target = Math.min(PHOTO_SIZES[name], displayWidth)
    const buffer = await sharp(source)
      .rotate()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    variants.push({ name, buffer, width: target })
  }

  const fullWidth = Math.min(PHOTO_SIZES.full, displayWidth)
  const fullHeight = Math.round((displayHeight / displayWidth) * fullWidth)

  return { contentHash, width: fullWidth, height: fullHeight, variants }
}
