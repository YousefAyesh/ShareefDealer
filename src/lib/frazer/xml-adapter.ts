import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { FeedAdapter, RawVehicle } from './types'

const parser = new XMLParser({
  // Nothing in this codebase reads an XML attribute. Dropping them outright means a
  // stray attribute (e.g. <Price currency="USD">9995</Price>) can never corrupt a
  // field into a wrapped { '#text': ..., '@_currency': ... } object.
  ignoreAttributes: true,
  // Keep the parsed document's top-level keys limited to real root elements, so root
  // detection below (see the "expected root element" check) isn't confused by a
  // synthetic '?xml' key.
  ignoreDeclaration: true,
  trimValues: true,
  parseTagValue: false,   // keep everything as strings
  // Decodes numeric character references (&#39;, &#x27;) as well as named entities --
  // a Windows/.NET-generated DMS feed can plausibly emit apostrophes this way.
  htmlEntities: true,
  isArray: (name) => ['Vehicle', 'Photo', 'Feature'].includes(name),
})

/** The only shape we trust the parser's output to have -- everything past this is unknown. */
type FrazerDocument = {
  Inventory?: {
    Vehicle?: unknown[]
  }
}

/**
 * Empty string and whitespace are the same as absent.
 *
 * Defensively unwraps a `{ '#text': ... }` shape. `ignoreAttributes: true` is the
 * primary defense against this (see above), but if a future parser upgrade or config
 * change ever reintroduces a wrapped value some other way, this degrades to the
 * correct text instead of the literal string "[object Object]".
 */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return str((value as Record<string, unknown>)['#text'])
  }
  const s = String(value).trim()
  return s === '' ? null : s
}

function list(container: unknown, key: string): string[] {
  if (!container || typeof container !== 'object') return []
  const items = (container as Record<string, unknown>)[key]
  if (!Array.isArray(items)) return []
  return items.map(str).filter((s): s is string => s !== null)
}

function toRawVehicle(node: Record<string, unknown>): RawVehicle {
  return {
    vin: str(node.VIN),
    stockNumber: str(node.StockNumber),
    year: str(node.Year),
    make: str(node.Make),
    model: str(node.Model),
    trim: str(node.Trim),
    bodyStyle: str(node.BodyStyle),
    drivetrain: str(node.Drivetrain),
    transmission: str(node.Transmission),
    engine: str(node.Engine),
    fuelType: str(node.FuelType),
    doors: str(node.Doors),
    exteriorColor: str(node.ExteriorColor),
    interiorColor: str(node.InteriorColor),
    mileage: str(node.Mileage),
    price: str(node.Price),
    downPayment: str(node.DownPayment),
    weeklyPayment: str(node.WeeklyPayment),
    description: str(node.Description),
    features: list(node.Features, 'Feature'),
    photoUrls: list(node.Photos, 'Photo'),
  }
}

export const xmlAdapter: FeedAdapter = {
  name: 'xml_feed',
  parse(payload: string): RawVehicle[] {
    const validation = XMLValidator.validate(payload)
    if (validation !== true) {
      throw new Error(
        `Malformed XML feed: ${validation.err.msg} (line ${validation.err.line}, column ${validation.err.col})`
      )
    }

    const doc = parser.parse(payload) as FrazerDocument

    // A well-formed document that isn't actually the Frazer feed (an auth failure page,
    // a gateway error page, the wrong feed entirely) must not be mistaken for a real
    // empty lot. Only a genuine <Inventory></Inventory> with no vehicles is that.
    if (!doc || typeof doc !== 'object' || !('Inventory' in doc)) {
      const foundRoot = doc && typeof doc === 'object' ? Object.keys(doc)[0] : undefined
      throw new Error(
        `Malformed XML feed: expected root element <Inventory>, but found ${
          foundRoot ? `<${foundRoot}>` : 'no root element'
        }`
      )
    }

    const vehicles = doc.Inventory?.Vehicle
    if (!Array.isArray(vehicles)) return []
    return vehicles.map((v) => toRawVehicle(v as Record<string, unknown>))
  },
}
