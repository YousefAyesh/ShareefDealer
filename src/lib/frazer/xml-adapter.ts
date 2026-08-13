import { XMLParser, XMLValidator } from 'fast-xml-parser'
import type { FeedAdapter, RawVehicle } from './types'

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  parseTagValue: false,   // keep everything as strings
  isArray: (name) => ['Vehicle', 'Photo', 'Feature'].includes(name),
})

/** Empty string and whitespace are the same as absent. */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null
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
      throw new Error(`Malformed XML feed: ${validation.err.msg} (line ${validation.err.line})`)
    }
    const doc = parser.parse(payload) as Record<string, any>
    const vehicles = doc?.Inventory?.Vehicle
    if (!Array.isArray(vehicles)) return []
    return vehicles.map(toRawVehicle)
  },
}
