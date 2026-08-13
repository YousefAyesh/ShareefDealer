import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { xmlAdapter } from '@/lib/frazer/xml-adapter'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/frazer', name), 'utf-8')

describe('xmlAdapter', () => {
  it('parses every vehicle in the feed', () => {
    const result = xmlAdapter.parse(fixture('normal.xml'))
    expect(result).toHaveLength(3)
  })

  it('maps all fields on a fully populated vehicle', () => {
    const [v] = xmlAdapter.parse(fixture('normal.xml'))
    expect(v).toEqual({
      vin: '1GCUYDED5KZ123456',
      stockNumber: 'A1042',
      year: '2019',
      make: 'Chevrolet',
      model: 'Silverado 1500',
      trim: 'LT',
      bodyStyle: 'Crew Cab Pickup',
      drivetrain: '4WD',
      transmission: 'Automatic',
      engine: '5.3L V8',
      fuelType: 'Gasoline',
      doors: '4',
      exteriorColor: 'Summit White',
      interiorColor: 'Jet Black',
      mileage: '78450',
      price: '24995.00',
      downPayment: '2500.00',
      weeklyPayment: '145.00',
      description: 'Clean truck, runs great.',
      features: ['Backup Camera', 'Bluetooth'],
      photoUrls: [
        'https://example.com/photos/a1042-1.jpg',
        'https://example.com/photos/a1042-2.jpg',
      ],
    })
  })

  it('returns null for absent fields rather than undefined', () => {
    const [, v] = xmlAdapter.parse(fixture('normal.xml'))
    expect(v.drivetrain).toBeNull()
    expect(v.downPayment).toBeNull()
    expect(v.description).toBeNull()
  })

  it('returns an empty array for a vehicle with no photos', () => {
    const [, , v] = xmlAdapter.parse(fixture('normal.xml'))
    expect(v.photoUrls).toEqual([])
    expect(v.features).toEqual([])
  })

  it('normalizes a single photo into an array', () => {
    const [, v] = xmlAdapter.parse(fixture('normal.xml'))
    expect(v.photoUrls).toEqual(['https://example.com/photos/a1043-1.jpg'])
  })

  it('preserves raw values without cleaning them — that is normalize.ts job', () => {
    const [v] = xmlAdapter.parse(fixture('dirty.xml'))
    expect(v.make).toBe('NISSAN')
    expect(v.mileage).toBe('131,220')
    expect(v.vin).toBeNull()
  })

  it('returns an empty array for a feed with no vehicles', () => {
    expect(xmlAdapter.parse('<?xml version="1.0"?><Inventory></Inventory>')).toEqual([])
  })

  it('throws on malformed XML so the run can abort', () => {
    expect(() => xmlAdapter.parse('<Inventory><Vehicle>')).toThrow()
  })

  it('includes both line and column in the malformed-XML error message', () => {
    expect(() => xmlAdapter.parse('<Inventory><Vehicle>')).toThrow(/line 1.*column 1/)
  })

  it('drops attributes rather than corrupting the value into an object', () => {
    const xml = `<?xml version="1.0"?><Inventory><Vehicle><VIN>1GCUYDED5KZ123456</VIN><StockNumber>A1042</StockNumber><Price currency="USD">9995</Price></Vehicle></Inventory>`
    const [v] = xmlAdapter.parse(xml)
    expect(v.price).toBe('9995')
  })

  it('unwraps a #text-wrapped value instead of stringifying it to "[object Object]"', () => {
    // Mixed content -- text alongside a nested element -- is a shape the parser still
    // wraps as { '#text': ..., <child>: ... } even with attributes ignored. This proves
    // str()'s defensive #text unwrap works, so that if a future parser upgrade or config
    // change ever reintroduces a wrapped value elsewhere, it degrades to correct text
    // instead of "[object Object]".
    const xml = `<?xml version="1.0"?><Inventory><Vehicle><VIN>1GCUYDED5KZ123456</VIN><StockNumber>A1042</StockNumber><Description>Great truck <em>low miles</em></Description></Vehicle></Inventory>`
    const [v] = xmlAdapter.parse(xml)
    expect(v.description).toBe('Great truck')
  })

  it('decodes numeric character references (decimal and hex) in text content', () => {
    const xml = `<?xml version="1.0"?><Inventory><Vehicle><VIN>1GCUYDED5KZ123456</VIN><StockNumber>A1042</StockNumber><Description>Owner&#39;s manual, one owner&#x27;s car</Description></Vehicle></Inventory>`
    const [v] = xmlAdapter.parse(xml)
    expect(v.description).toBe("Owner's manual, one owner's car")
  })

  it('throws when the document has no Inventory root at all (e.g. an HTML error page)', () => {
    expect(() => xmlAdapter.parse('<html><body>503 Service Unavailable</body></html>')).toThrow(
      /expected root element <Inventory>.*found <html>/
    )
  })

  it('throws when the document is well-formed XML with the wrong root element', () => {
    expect(() =>
      xmlAdapter.parse('<?xml version="1.0"?><Catalog><Vehicle><VIN>1GCUYDED5KZ123456</VIN></Vehicle></Catalog>')
    ).toThrow(/expected root element <Inventory>.*found <Catalog>/)
  })
})
