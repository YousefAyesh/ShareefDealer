#!/usr/bin/env node
/**
 * Install photos for one vehicle.
 *
 *   node scripts/photos.mjs <slug> <file-or-folder>...
 *   node scripts/photos.mjs <slug> uploads --replace
 *
 * Every source image is auto-rotated, cropped to a consistent 1600x1200,
 * converted to WebP and written to public/inventory/<slug>/01.webp,
 * 02.webp, ... in the order given. The site shows them in that order, so
 * the first one is the photo that appears on the listing card -- lead with
 * a three-quarter front shot.
 *
 * Three things this does that matter:
 *
 *  1. STRIPS EXIF. Phone photos carry GPS coordinates. A dealer
 *     photographing cars on the lot is fine; one photographing a trade-in
 *     on his driveway is publishing his home address to anyone who opens
 *     the file in an EXIF viewer. sharp drops all metadata unless asked
 *     otherwise, and this never asks otherwise.
 *
 *  2. Applies EXIF rotation first (.rotate()), so photos taken sideways on
 *     a phone are not stored sideways. Stripping metadata without doing
 *     this first is how a car ends up on its roof.
 *
 *  3. Normalises to one size, so a 12MB phone JPEG becomes a ~180KB WebP.
 *     That is the difference between a repo that stays a manageable size
 *     and one that does not, and between a car page that loads on a phone
 *     on cellular and one that does not.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'

const WIDTH = 1600
const HEIGHT = 1200
const QUALITY = 82
const SOURCE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff'])

function fail(message) {
  console.error(`\n  ✗ ${message}\n`)
  process.exit(1)
}

const args = process.argv.slice(2)
const replace = args.includes('--replace')
const [slug, ...sources] = args.filter((a) => a !== '--replace')

if (!slug || sources.length === 0) {
  fail(
    'Usage: node scripts/photos.mjs <slug> <file-or-folder>... [--replace]\n' +
      '    e.g. node scripts/photos.mjs 2019-jeep-cherokee-latitude-kw123456 uploads',
  )
}

if (!existsSync(join('inventory', `${slug}.json`))) {
  fail(
    `No inventory/${slug}.json — create the vehicle file first, so the photos\n` +
      '    have something to attach to and the slug is guaranteed to match.',
  )
}

// Expand folders into their image files; keep explicit files as given.
const files = []
for (const source of sources) {
  if (!existsSync(source)) fail(`Not found: ${source}`)
  if (statSync(source).isDirectory()) {
    files.push(
      ...readdirSync(source)
        .filter((f) => SOURCE_EXT.has(extname(f).toLowerCase()))
        .sort()
        .map((f) => join(source, f)),
    )
  } else {
    files.push(source)
  }
}

if (files.length === 0) fail('No image files found in those sources.')

const outDir = join('public', 'inventory', slug)
if (replace && existsSync(outDir)) rmSync(outDir, { recursive: true })
mkdirSync(outDir, { recursive: true })

// Continue numbering after whatever is already there, so adding two more
// photos later does not overwrite the first two.
const existing = existsSync(outDir)
  ? readdirSync(outDir).filter((f) => f.endsWith('.webp')).length
  : 0

let index = existing
let totalBytes = 0

for (const file of files) {
  index += 1
  const name = `${String(index).padStart(2, '0')}.webp`
  const dest = join(outDir, name)

  try {
    const info = await sharp(file)
      .rotate() // apply EXIF orientation before metadata is dropped
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
      .webp({ quality: QUALITY })
      .toFile(dest)

    totalBytes += info.size
    const before = statSync(file).size
    const pct = Math.round((1 - info.size / before) * 100)
    console.log(
      `  ${basename(file).padEnd(28)} -> ${name}  ` +
        `${(before / 1024 / 1024).toFixed(1)}MB -> ${Math.round(info.size / 1024)}KB (-${pct}%)`,
    )
  } catch (error) {
    const hint =
      extname(file).toLowerCase().startsWith('.hei')
        ? '\n    HEIC needs a libvips build with HEIF support. On an iPhone, set\n' +
          '    Settings > Camera > Formats > Most Compatible to get JPEGs instead.'
        : ''
    fail(`Could not process ${file}: ${error.message}${hint}`)
  }
}

console.log(
  `\n  ${files.length} photo(s) -> ${outDir}  (${Math.round(totalBytes / 1024)}KB total)\n` +
    `  Photo 01 is the listing card image.\n`,
)
