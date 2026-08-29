import { describe, expect, it } from 'vitest'
import { loadInventory } from '@/lib/inventory'

/**
 * Validates the REAL inventory/ folder, not fixtures.
 *
 * This is the check that stands between a typo and the public web. It runs
 * in `npm test` and again in `prebuild`, so a malformed vehicle file fails
 * the build rather than quietly vanishing from the site -- which is what
 * the runtime does deliberately, to keep one bad car from taking down the
 * whole lot.
 *
 * It is a test rather than a standalone script because vitest already
 * understands the TypeScript and the `@/` alias, so the validation logic
 * stays in one place instead of being reimplemented in a build script that
 * can drift away from it.
 */
describe('inventory files', () => {
  const { vehicles, problems } = loadInventory()

  it('are all valid', () => {
    if (problems.length > 0) {
      const report = problems
        .map((p) => `\ninventory/${p.file}\n${p.errors.map((e) => `  - ${e}`).join('\n')}`)
        .join('\n')
      throw new Error(`${problems.length} inventory file(s) have problems:\n${report}\n\nSee CLAUDE.md for the file format.\n`)
    }
    expect(problems).toEqual([])
  })

  it('have unique stock numbers where set', () => {
    // Two cars sharing a stock number means someone copied a file and
    // forgot to edit it -- and the dealer will pull up the wrong car when a
    // customer reads the number over the phone.
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const v of vehicles) {
      if (!v.stockNumber) continue
      const previous = seen.get(v.stockNumber)
      if (previous) clashes.push(`${v.stockNumber}: ${previous} and ${v.slug}`)
      else seen.set(v.stockNumber, v.slug)
    }
    expect(clashes).toEqual([])
  })

  it('have unique VINs where set', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const v of vehicles) {
      if (!v.vin) continue
      const previous = seen.get(v.vin)
      if (previous) clashes.push(`${v.vin}: ${previous} and ${v.slug}`)
      else seen.set(v.vin, v.slug)
    }
    expect(clashes).toEqual([])
  })

  it('has at least one vehicle visible to the public', () => {
    // An empty lot renders a legitimate "restocking" state, but it is far
    // more often a sign that photos never got added or a path is wrong.
    const listable = vehicles.filter((v) => v.status === 'available' && v.photos.length > 0)
    expect(listable.length).toBeGreaterThan(0)
  })
})
