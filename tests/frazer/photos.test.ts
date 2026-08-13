import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { processPhoto, PHOTO_SIZES } from '@/lib/frazer/photos'
import { rotatedJpeg, plainJpeg } from '../fixtures/images/make-fixtures'

describe('processPhoto', () => {
  it('produces all three variants as WebP', async () => {
    const out = await processPhoto(await plainJpeg())
    expect(out.variants.map((v) => v.name).sort()).toEqual(['card', 'full', 'thumb'])
    for (const v of out.variants) {
      expect((await sharp(v.buffer).metadata()).format).toBe('webp')
    }
  })

  it('corrects EXIF rotation', async () => {
    // 400x200 tagged orientation 6 must come out taller than it is wide
    const out = await processPhoto(await rotatedJpeg())
    expect(out.height).toBeGreaterThan(out.width)
  })

  it('reports the corrected full-size dimensions', async () => {
    const out = await processPhoto(await plainJpeg(3200, 2400))
    expect(out.width).toBe(PHOTO_SIZES.full)
    expect(out.height).toBe(1200)
  })

  it('does not upscale an image smaller than the target', async () => {
    const out = await processPhoto(await plainJpeg(300, 200))
    expect(out.width).toBe(300)
  })

  it('hashes the source bytes for deduplication', async () => {
    const buf = await plainJpeg()
    const a = await processPhoto(buf)
    const b = await processPhoto(buf)
    expect(a.contentHash).toBe(b.contentHash)
    expect(a.contentHash).toHaveLength(64)
  })

  it('produces different hashes for different images', async () => {
    const a = await processPhoto(await plainJpeg(800, 600))
    const b = await processPhoto(await plainJpeg(801, 600))
    expect(a.contentHash).not.toBe(b.contentHash)
  })

  it('rejects a non-image buffer', async () => {
    await expect(processPhoto(Buffer.from('this is not an image'))).rejects.toThrow()
  })
})
