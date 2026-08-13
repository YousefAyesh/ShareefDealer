import sharp from 'sharp'

/** A 400x200 landscape image tagged EXIF orientation 6, which means
 *  "rotate 90° clockwise on display" — so a correct reader outputs 200x400. */
export async function rotatedJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
}

export async function plainJpeg(width = 1600, height = 1200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 30, g: 90, b: 200 } },
  }).jpeg().toBuffer()
}
