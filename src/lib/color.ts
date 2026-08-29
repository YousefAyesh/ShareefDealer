/**
 * Collapse a manufacturer's marketing colour name to the colour a shopper
 * would actually name.
 *
 * Feeds carry names like "Ingot Silver", "Summit White", "Black Granite"
 * and "Mocha Steel Metallic". Faceting on those raw strings produces a
 * dropdown where every entry has a count of exactly 1 -- technically a
 * filter, practically useless, because nobody searching for a silver car
 * knows Ford calls it "Ingot Silver".
 *
 * So the filter works on families while the vehicle page keeps showing the
 * real name: a shopper picks "Silver" and the spec sheet still says "Ingot
 * Silver", which is what's on the title and what they'll be asked about at
 * the DMV.
 */

/**
 * The first family whose keyword appears wins, so the list order encodes
 * precedence. Finish words ("pearl", "metallic") are deliberately absent:
 * they say how the paint reflects light, not what colour it is, and
 * including "pearl" under White would file "Ruby Flare Pearl" as a white
 * car.
 */
const FAMILIES: { family: string; keywords: string[] }[] = [
  // Ordering is load-bearing. "Black Granite" contains "granite", which is
  // a Gray keyword, so Black has to be tested first or Chevrolet's black
  // paint lands in the Gray bucket. Same reason White precedes Silver.
  { family: 'Black', keywords: ['black', 'ebony', 'onyx', 'midnight', 'obsidian'] },
  { family: 'White', keywords: ['white', 'ivory', 'snow', 'frost'] },
  { family: 'Silver', keywords: ['silver', 'platinum', 'titanium', 'billet', 'aluminum'] },
  { family: 'Gray', keywords: ['gray', 'grey', 'graphite', 'charcoal', 'gunmetal', 'steel', 'slate', 'granite', 'magnetic'] },
  { family: 'Red', keywords: ['red', 'burgundy', 'maroon', 'crimson', 'ruby', 'cherry', 'scarlet', 'garnet'] },
  { family: 'Blue', keywords: ['blue', 'navy', 'sapphire', 'indigo', 'cobalt', 'teal', 'aqua'] },
  { family: 'Green', keywords: ['green', 'emerald', 'olive', 'jade', 'forest'] },
  { family: 'Brown', keywords: ['brown', 'bronze', 'mocha', 'espresso', 'coffee', 'chestnut', 'copper', 'sienna'] },
  { family: 'Beige', keywords: ['beige', 'tan', 'sand', 'khaki', 'cream', 'champagne', 'almond', 'taupe'] },
  { family: 'Gold', keywords: ['gold'] },
  { family: 'Orange', keywords: ['orange', 'amber'] },
  { family: 'Yellow', keywords: ['yellow'] },
  { family: 'Purple', keywords: ['purple', 'violet', 'plum'] },
]

/** Every family a filter dropdown may offer, in a stable display order. */
export const COLOR_FAMILIES = FAMILIES.map((f) => f.family)

/**
 * The family for a raw colour name, or null when nothing matches -- an
 * unrecognised colour is left out of the filter rather than bucketed into
 * a wrong family, since a wrong bucket is worse than an absent one.
 */
export function colorFamily(raw: string | null | undefined): string | null {
  if (!raw) return null
  const value = raw.toLowerCase()
  for (const { family, keywords } of FAMILIES) {
    if (keywords.some((k) => value.includes(k))) return family
  }
  return null
}
