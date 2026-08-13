// Generates branded placeholder JPEGs for the demo inventory into
// public/demo/. There are no real vehicle photos (no Frazer feed, no lot
// visit yet) -- these stand in so the site looks deliberate, not broken,
// while DEMO_MODE is on.
//
// Run: node scripts/make-demo-photos.mjs
//
// IMPORTANT: this list must stay in sync with the vehicle slugs in
// src/lib/demo-inventory.ts (same slug, same photo count per vehicle: 3).
// If you add/rename a demo vehicle there, update it here too.
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'public', 'demo')

const WIDTH = 1600
const HEIGHT = 1200

const NAVY = '#182848'
const CREAM = '#F5F1E6'
const GOLD = '#D0A048'

const ANGLES = ['EXTERIOR — FRONT', 'EXTERIOR — SIDE', 'INTERIOR']

const VEHICLES = [
  { slug: '2019-chevrolet-silverado-1500-lt-kg482910', year: 2019, make: 'Chevrolet', model: 'Silverado 1500' },
  { slug: '2018-ford-f-150-xlt-cfa73201', year: 2018, make: 'Ford', model: 'F-150' },
  { slug: '2017-honda-civic-lx-hh512044', year: 2017, make: 'Honda', model: 'Civic' },
  { slug: '2016-nissan-altima-s-gc198832', year: 2016, make: 'Nissan', model: 'Altima' },
  { slug: '2015-chevrolet-malibu-lt-hf231987', year: 2015, make: 'Chevrolet', model: 'Malibu' },
  { slug: '2014-chevrolet-equinox-lt-ej145522', year: 2014, make: 'Chevrolet', model: 'Equinox' },
  { slug: '2016-toyota-camry-le-gu678412', year: 2016, make: 'Toyota', model: 'Camry' },
  { slug: '2017-nissan-sentra-sv-hy345291', year: 2017, make: 'Nissan', model: 'Sentra' },
  { slug: '2018-ford-escape-se-jub29104', year: 2018, make: 'Ford', model: 'Escape' },
  { slug: '2019-toyota-corolla-le-kp112087', year: 2019, make: 'Toyota', model: 'Corolla' },
  { slug: '2013-chevrolet-tahoe-lt-dr298761', year: 2013, make: 'Chevrolet', model: 'Tahoe' },
  { slug: '2015-chevrolet-impala-lt-71234567', year: 2015, make: 'Chevrolet', model: 'Impala' },
]

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
}

function buildSvg({ year, make, model, angle, seed }) {
  const title = escapeXml(`${year} ${make}`)
  const modelText = escapeXml(model)
  const angleText = escapeXml(angle)

  // A few large, low-opacity circles behind the text so every photo in a
  // vehicle's set looks distinct instead of being an identical card three
  // times over -- position varies deterministically per photo via `seed`.
  const cx1 = 200 + ((seed * 37) % 500)
  const cy1 = 200 + ((seed * 53) % 400)
  const cx2 = WIDTH - 250 - ((seed * 71) % 500)
  const cy2 = HEIGHT - 200 - ((seed * 29) % 300)

  return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${NAVY}" />
  <circle cx="${cx1}" cy="${cy1}" r="260" fill="${CREAM}" opacity="0.04" />
  <circle cx="${cx2}" cy="${cy2}" r="320" fill="${GOLD}" opacity="0.06" />

  <rect x="48" y="48" width="${WIDTH - 96}" height="${HEIGHT - 96}" fill="none" stroke="${GOLD}" stroke-width="4" opacity="0.55" />

  <text x="${WIDTH / 2}" y="${HEIGHT / 2 - 150}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="42"
        letter-spacing="6" fill="${GOLD}">${angleText}</text>

  <line x1="${WIDTH / 2 - 220}" y1="${HEIGHT / 2 - 90}" x2="${WIDTH / 2 + 220}" y2="${HEIGHT / 2 - 90}" stroke="${GOLD}" stroke-width="5" />

  <text x="${WIDTH / 2}" y="${HEIGHT / 2 + 10}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="96"
        letter-spacing="2" fill="${CREAM}">${title}</text>
  <text x="${WIDTH / 2}" y="${HEIGHT / 2 + 100}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="72"
        letter-spacing="2" fill="${CREAM}">${modelText}</text>

  <line x1="${WIDTH / 2 - 220}" y1="${HEIGHT / 2 + 150}" x2="${WIDTH / 2 + 220}" y2="${HEIGHT / 2 + 150}" stroke="${GOLD}" stroke-width="5" />

  <text x="${WIDTH / 2}" y="${HEIGHT - 90}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="30"
        letter-spacing="4" fill="${GOLD}">ROADSTAR AUTO SALES — AUSTIN, TX</text>
</svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  let count = 0
  for (const vehicle of VEHICLES) {
    for (let position = 0; position < ANGLES.length; position += 1) {
      const svg = buildSvg({
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        angle: ANGLES[position],
        seed: count + position,
      })
      const outPath = path.join(OUT_DIR, `${vehicle.slug}-${position}.jpg`)
      await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(outPath)
      count += 1
    }
  }

  console.log(`Wrote ${count} demo photos to ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
