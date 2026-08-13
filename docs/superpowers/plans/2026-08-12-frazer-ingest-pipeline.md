# Frazer Ingest Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pipeline that pulls vehicle inventory out of the dealer's Frazer DMS, normalizes it, processes its photos, and keeps a Postgres database continuously in sync — safely, so a bad feed can never blank the live site.

**Architecture:** Transport-agnostic adapters turn whatever Frazer emits into a `RawVehicle`, a normalizer turns that into a validated `CanonicalVehicle`, and a pure reconciliation planner diffs incoming vehicles against the database to produce a list of creates, updates, and sold-markings. All decision logic lives in pure functions so it can be tested without a database or network. Thin IO wrappers handle Postgres, HTTP, and blob storage. A Vercel Cron job runs the orchestrator every 15 minutes.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Drizzle ORM, Postgres, Vitest, `sharp` (image processing), `fast-xml-parser`, `zod`, Vercel Blob.

**Scope note:** This plan covers ingest only. The public site (SRP, VDP, filters, SEO, lead forms) is a separate plan that consumes the `vehicles` table this plan produces. The `leads` table is created here because it belongs in the same migration, but nothing reads or writes it until the site plan.

---

## Critical context for the implementer

**You do not have the real Frazer feed yet.** The dealer has no inventory and the feed URL has not been provisioned (tracked as question 24 in `docs/client-intake-questions.md`). Every fixture in this plan is **synthetic** — built to a plausible Frazer-shaped XML structure, not a verified one.

This is deliberate and it is safe, because the adapter is the *only* module that touches feed field names. When the real feed arrives, you replace the fixture, fix the field mapping in one file, and every other test still passes unchanged. Do not spread feed field names into other modules — that is the single most important structural rule in this plan.

**Money is stored as integer cents.** Never floats. `price_cents`, `down_payment_cents`, `weekly_payment_cents`.

**Nothing in this plan estimates a payment.** If Frazer does not supply a payment figure, it stays null forever. See spec §5.5 — a quoted payment is a legal commitment.

---

## File structure

```
src/
  db/
    schema.ts                  Drizzle table definitions
    index.ts                   db client singleton
  lib/
    frazer/
      types.ts                 RawVehicle, CanonicalVehicle, adapter contract
      xml-adapter.ts           XML feed text -> RawVehicle[]      (only file that knows feed field names)
      normalize.ts             RawVehicle -> CanonicalVehicle
      vin-decode.ts            NHTSA vPIC enrichment (non-blocking)
      guards.ts                poison-pill safety checks          (pure)
      reconcile-plan.ts        diff incoming vs existing          (pure)
      reconcile-apply.ts       execute the plan against Postgres
      photos.ts                download, EXIF-correct, resize, WebP
      photo-store.ts           blob upload + DB persistence
      sync.ts                  orchestrator
    hash.ts                    content hashing
    slug.ts                    vehicle slug generation
  app/
    api/cron/sync/route.ts     scheduled entry point
    admin/sync/page.tsx        run history + manual trigger
tests/
  fixtures/frazer/
    normal.xml                 12 vehicles, realistic mess
    empty.xml                  0 vehicles
    shrunk.xml                 5 vehicles
    dirty.xml                  blank VIN, dup VIN, $0 price, ALL CAPS
  fixtures/images/
    rotated.jpg                EXIF orientation 6
```

Files that change together live together — everything that understands Frazer lives under `src/lib/frazer/`.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.mts`, `.env.example`

- [ ] **Step 1: Scaffold Next.js**

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
```

Answer "No" if asked to overwrite existing files — `docs/` must survive.

- [ ] **Step 2: Install dependencies**

```bash
npm install drizzle-orm postgres fast-xml-parser zod sharp @vercel/blob
npm install -D drizzle-kit vitest @vitest/coverage-v8 dotenv
```

- [ ] **Step 3: Create `vitest.config.mts`**

The `.mts` extension is deliberate. Vite will make native ESM config loading the default in a future major; without it, a routine dependency bump breaks test running with no code change. `.mts` also means `__dirname` is unavailable, hence `import.meta.dirname`.

```typescript
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
```

- [ ] **Step 4: Add test script to `package.json`**

Add to the `"scripts"` object:

```json
"test": "vitest run",
"test:watch": "vitest",
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate"
```

- [ ] **Step 5: Create `.env.example`**

```bash
DATABASE_URL="postgres://user:pass@host/db"
BLOB_READ_WRITE_TOKEN=""
FRAZER_FEED_URL=""
CRON_SECRET=""
ADMIN_PASSWORD=""
```

- [ ] **Step 6: Verify the toolchain runs**

Run: `npx vitest run --passWithNoTests`
Expected: `No test files found, exiting with code 0`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project with Vitest and Drizzle"
```

---

## Task 2: Database schema

**Files:**
- Create: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`

- [ ] **Step 1: Create `drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit'
import 'dotenv/config'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 2: Create `src/db/schema.ts`**

Three conventions applied throughout, each for a reason:

- **`.$type<'a' | 'b'>()` on every enum-ish text column.** The allowed values must be enforced by the compiler, not by a comment — thirteen later tasks read this file to learn them. Deliberately *not* `pgEnum`: adding a status later would mean an `ALTER TYPE` migration.
- **`{ withTimezone: true }` on every timestamp.** These all record an instant that happened. Bare `timestamp` is `timestamp without time zone`, a naive number with no offset; the server runs UTC and the dealer reads these in US local time.
- **Array-return index callback.** `drizzle-orm@0.45.2` marks the object-return form deprecated.

```typescript
import {
  pgTable, text, integer, timestamp, boolean, jsonb, uuid, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Identity. sourceKey is what we matched on; see reconcile-plan.ts.
  sourceKey: text('source_key').notNull(),
  sourceKeyType: text('source_key_type').$type<'vin' | 'stock'>().notNull(),
  vin: text('vin'),
  stockNumber: text('stock_number'),
  slug: text('slug').notNull(),

  year: integer('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  bodyStyle: text('body_style'),
  drivetrain: text('drivetrain'),
  transmission: text('transmission'),
  engine: text('engine'),
  fuelType: text('fuel_type'),
  doors: integer('doors'),
  exteriorColor: text('exterior_color'),
  interiorColor: text('interior_color'),
  mileage: integer('mileage'),

  priceCents: integer('price_cents'),
  downPaymentCents: integer('down_payment_cents'),
  weeklyPaymentCents: integer('weekly_payment_cents'),

  description: text('description'),
  features: jsonb('features').$type<string[]>().notNull().default([]),

  status: text('status').$type<'available' | 'sold' | 'hidden'>().notNull().default('available'),
  priceReduced: boolean('price_reduced').notNull().default(false),

  sourceHash: text('source_hash').notNull(),
  vinDecoded: jsonb('vin_decoded').$type<Record<string, string>>(),

  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  soldAt: timestamp('sold_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vehicles_source_key_idx').on(t.sourceKey),
  uniqueIndex('vehicles_slug_idx').on(t.slug),
  index('vehicles_status_idx').on(t.status),
])

export const vehiclePhotos = pgTable('vehicle_photos', {
  id: uuid('id').defaultRandom().primaryKey(),
  vehicleId: uuid('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  contentHash: text('content_hash').notNull(),
  urlThumb: text('url_thumb').notNull(),
  urlCard: text('url_card').notNull(),
  urlFull: text('url_full').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  alt: text('alt').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vehicle_photos_vehicle_hash_idx').on(t.vehicleId, t.contentHash),
])

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').$type<'xml_feed' | 'sftp' | 'manual'>().notNull(),
  status: text('status').$type<'running' | 'success' | 'aborted' | 'failed'>().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  vehiclesSeen: integer('vehicles_seen').notNull().default(0),
  created: integer('created').notNull().default(0),
  updated: integer('updated').notNull().default(0),
  markedSold: integer('marked_sold').notNull().default(0),
  photosProcessed: integer('photos_processed').notNull().default(0),
  abortReason: text('abort_reason'),
  rawSnapshotRef: text('raw_snapshot_ref'),
  errors: jsonb('errors').$type<string[]>().notNull().default([]),
})

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  message: text('message'),
  sourcePage: text('source_page'),
  utm: jsonb('utm').$type<Record<string, string>>(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  status: text('status').$type<'new' | 'contacted' | 'closed'>().notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 3: Create `src/db/index.ts`**

Three things this file must get right, all serverless concerns:

- **`max: 1`.** A Vercel lambda serves one request at a time, so a pool of 10 (the postgres.js default) only consumes slots a pooler then has to serve.
- **`prepare: false`.** Required for transaction-mode poolers such as PgBouncer.
- **A `globalThis` cache in development only.** Next.js Fast Refresh re-evaluates this module on every save, and nearly everything imports it — without the guard, local iteration leaks a connection pool per save until Postgres refuses new clients.

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined
}

const client = globalForDb.client ?? postgres(connectionString, { prepare: false, max: 1 })
if (process.env.NODE_ENV !== 'production') globalForDb.client = client

export const db = drizzle(client, { schema })
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: a new SQL file appears in `drizzle/`, output ends with something like `[✓] Your SQL migration file ➜ drizzle/0000_....sql`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add database schema for vehicles, photos, sync runs, and leads"
```

---

## Task 3: Content hashing and slug generation

Two small pure utilities everything downstream depends on.

**Files:**
- Create: `src/lib/hash.ts`, `src/lib/slug.ts`
- Test: `tests/lib/hash.test.ts`, `tests/lib/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { sha256Hex, stableHash } from '@/lib/hash'

describe('sha256Hex', () => {
  it('hashes a buffer deterministically', () => {
    const a = sha256Hex(Buffer.from('hello'))
    const b = sha256Hex(Buffer.from('hello'))
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('produces different hashes for different content', () => {
    expect(sha256Hex(Buffer.from('a'))).not.toBe(sha256Hex(Buffer.from('b')))
  })
})

describe('stableHash', () => {
  it('ignores key order', () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }))
  })

  it('changes when a value changes', () => {
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }))
  })

  it('treats nested objects consistently', () => {
    expect(stableHash({ a: { x: 1, y: 2 } })).toBe(stableHash({ a: { y: 2, x: 1 } }))
  })
})
```

Create `tests/lib/slug.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSlug } from '@/lib/slug'

describe('buildSlug', () => {
  it('builds a readable slug from vehicle fields plus a key suffix', () => {
    const slug = buildSlug({
      year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
      sourceKey: '1GCUYDED5KZ123456',
    })
    expect(slug).toBe('2019-chevrolet-silverado-1500-lt-kz123456')
  })

  it('omits missing fields without leaving double dashes', () => {
    const slug = buildSlug({
      year: null, make: 'Honda', model: 'Civic', trim: null, sourceKey: 'STOCK-42',
    })
    expect(slug).toBe('honda-civic-stock-42')
  })

  it('strips punctuation that would break a URL', () => {
    const slug = buildSlug({
      year: 2020, make: 'Mercedes-Benz', model: 'C/300', trim: '4MATIC®',
      sourceKey: 'WDD1234',
    })
    expect(slug).toBe('2020-mercedes-benz-c-300-4matic-wdd1234')
  })

  it('is stable for the same input', () => {
    const input = { year: 2019, make: 'Ford', model: 'F-150', trim: 'XL', sourceKey: 'ABC12345' }
    expect(buildSlug(input)).toBe(buildSlug(input))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/`
Expected: FAIL — `Failed to resolve import "@/lib/hash"`

- [ ] **Step 3: Implement `src/lib/hash.ts`**

```typescript
import { createHash } from 'node:crypto'

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex')
}

/** Order-independent hash of a plain object, used for change detection. */
export function stableHash(obj: unknown): string {
  return sha256Hex(canonicalize(obj))
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`)
  return `{${entries.join(',')}}`
}
```

- [ ] **Step 4: Implement `src/lib/slug.ts`**

```typescript
export type SlugInput = {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  sourceKey: string
}

/** Last 8 characters of the source key, lowercased — enough to disambiguate. */
function keySuffix(sourceKey: string): string {
  return sourceKey.slice(-8).toLowerCase()
}

export function buildSlug(input: SlugInput): string {
  const parts = [
    input.year ? String(input.year) : null,
    input.make,
    input.model,
    input.trim,
    keySuffix(input.sourceKey),
  ].filter((p): p is string => Boolean(p && p.trim()))

  return parts
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/`
Expected: PASS, 9 tests (5 in `hash.test.ts`, 4 in `slug.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/lib/hash.ts src/lib/slug.ts tests/lib/
git commit -m "feat: add content hashing and vehicle slug generation"
```

---

## Task 4: Canonical types

No tests — this task defines the contract every later task compiles against.

**Files:**
- Create: `src/lib/frazer/types.ts`

- [ ] **Step 1: Create `src/lib/frazer/types.ts`**

```typescript
/**
 * Whatever came out of the feed. Every field is a string or null because
 * nothing from the feed is trusted until normalize.ts validates it.
 */
export type RawVehicle = {
  vin: string | null
  stockNumber: string | null
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  transmission: string | null
  engine: string | null
  fuelType: string | null
  doors: string | null
  exteriorColor: string | null
  interiorColor: string | null
  mileage: string | null
  price: string | null
  downPayment: string | null
  weeklyPayment: string | null
  description: string | null
  features: string[]
  photoUrls: string[]
}

/** Validated, typed, normalized. This is what the rest of the system uses. */
export type CanonicalVehicle = {
  sourceKey: string
  sourceKeyType: 'vin' | 'stock'
  vin: string | null
  stockNumber: string | null
  slug: string
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  transmission: string | null
  engine: string | null
  fuelType: string | null
  doors: number | null
  exteriorColor: string | null
  interiorColor: string | null
  mileage: number | null
  priceCents: number | null
  downPaymentCents: number | null
  weeklyPaymentCents: number | null
  description: string | null
  features: string[]
  photoUrls: string[]
  sourceHash: string
  /** Raw vPIC response, attached by decorateWithVin in Task 14. Not hashed. */
  vinDecoded?: Record<string, unknown> | null
}

/** Every transport (XML feed, SFTP CSV, manual upload) implements this. */
export type FeedAdapter = {
  name: 'xml_feed' | 'sftp' | 'manual'
  parse(payload: string): RawVehicle[]
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/frazer/types.ts
git commit -m "feat: define RawVehicle and CanonicalVehicle contracts"
```

---

## Task 5: XML adapter (golden-file tests)

The highest-value test suite in the plan. This is the only module that knows Frazer's field names.

**Files:**
- Create: `src/lib/frazer/xml-adapter.ts`, `tests/fixtures/frazer/normal.xml`, `tests/fixtures/frazer/dirty.xml`
- Test: `tests/frazer/xml-adapter.test.ts`

- [ ] **Step 1: Create the fixture `tests/fixtures/frazer/normal.xml`**

Synthetic — see "Critical context" above. Three vehicles is enough to prove the shape.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Inventory>
  <Vehicle>
    <VIN>1GCUYDED5KZ123456</VIN>
    <StockNumber>A1042</StockNumber>
    <Year>2019</Year>
    <Make>Chevrolet</Make>
    <Model>Silverado 1500</Model>
    <Trim>LT</Trim>
    <BodyStyle>Crew Cab Pickup</BodyStyle>
    <Drivetrain>4WD</Drivetrain>
    <Transmission>Automatic</Transmission>
    <Engine>5.3L V8</Engine>
    <FuelType>Gasoline</FuelType>
    <Doors>4</Doors>
    <ExteriorColor>Summit White</ExteriorColor>
    <InteriorColor>Jet Black</InteriorColor>
    <Mileage>78450</Mileage>
    <Price>24995.00</Price>
    <DownPayment>2500.00</DownPayment>
    <WeeklyPayment>145.00</WeeklyPayment>
    <Description>Clean truck, runs great.</Description>
    <Features>
      <Feature>Backup Camera</Feature>
      <Feature>Bluetooth</Feature>
    </Features>
    <Photos>
      <Photo>https://example.com/photos/a1042-1.jpg</Photo>
      <Photo>https://example.com/photos/a1042-2.jpg</Photo>
    </Photos>
  </Vehicle>
  <Vehicle>
    <VIN>2HGFC2F59KH512345</VIN>
    <StockNumber>A1043</StockNumber>
    <Year>2019</Year>
    <Make>Honda</Make>
    <Model>Civic</Model>
    <Trim>LX</Trim>
    <BodyStyle>Sedan</BodyStyle>
    <Mileage>62100</Mileage>
    <Price>16995.00</Price>
    <Photos>
      <Photo>https://example.com/photos/a1043-1.jpg</Photo>
    </Photos>
  </Vehicle>
  <Vehicle>
    <VIN>1FTEW1EP7JFA12345</VIN>
    <StockNumber>A1044</StockNumber>
    <Year>2018</Year>
    <Make>Ford</Make>
    <Model>F-150</Model>
    <Trim>XLT</Trim>
    <Mileage>94300</Mileage>
    <Price>22500.00</Price>
    <Photos></Photos>
  </Vehicle>
</Inventory>
```

- [ ] **Step 2: Create the fixture `tests/fixtures/frazer/dirty.xml`**

Every real-world mess we know Frazer permits, in one file.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Inventory>
  <Vehicle>
    <VIN></VIN>
    <StockNumber>W-77</StockNumber>
    <Year>2015</Year>
    <Make>NISSAN</Make>
    <Model>ALTIMA</Model>
    <Mileage>131,220</Mileage>
    <Price>0</Price>
    <Description>RUNS AND DRIVES. AS-IS.</Description>
    <Photos><Photo>https://example.com/photos/w77-1.jpg</Photo></Photos>
  </Vehicle>
  <Vehicle>
    <VIN>3N1AB7AP0FY123456</VIN>
    <StockNumber>A1050</StockNumber>
    <Year>2015</Year>
    <Make>Nissan</Make>
    <Model>Sentra</Model>
    <Mileage>88000</Mileage>
    <Price>$9,495</Price>
    <Photos><Photo>https://example.com/photos/a1050-1.jpg</Photo></Photos>
  </Vehicle>
  <Vehicle>
    <VIN>3N1AB7AP0FY123456</VIN>
    <StockNumber>A1051</StockNumber>
    <Year>2015</Year>
    <Make>Nissan</Make>
    <Model>Sentra</Model>
    <Mileage>88000</Mileage>
    <Price>9495</Price>
    <Photos><Photo>https://example.com/photos/a1051-1.jpg</Photo></Photos>
  </Vehicle>
</Inventory>
```

- [ ] **Step 3: Write the failing test**

Create `tests/frazer/xml-adapter.test.ts`:

```typescript
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
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/frazer/xml-adapter.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/frazer/xml-adapter"`

- [ ] **Step 5: Implement `src/lib/frazer/xml-adapter.ts`**

```typescript
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/frazer/xml-adapter.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/frazer/xml-adapter.ts tests/frazer/xml-adapter.test.ts tests/fixtures/frazer/
git commit -m "feat: add Frazer XML feed adapter with golden-file tests"
```

---

## Task 6: Normalizer

Turns messy `RawVehicle` into validated `CanonicalVehicle`. Pure function, no IO.

**Files:**
- Create: `src/lib/frazer/normalize.ts`
- Test: `tests/frazer/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeVehicle, parseMoneyCents, parseIntSafe, titleCase } from '@/lib/frazer/normalize'
import type { RawVehicle } from '@/lib/frazer/types'

const base: RawVehicle = {
  vin: '1GCUYDED5KZ123456', stockNumber: 'A1042', year: '2019',
  make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
  bodyStyle: null, drivetrain: null, transmission: null, engine: null,
  fuelType: null, doors: null, exteriorColor: null, interiorColor: null,
  mileage: '78450', price: '24995.00', downPayment: null, weeklyPayment: null,
  description: null, features: [], photoUrls: [],
}

describe('parseMoneyCents', () => {
  it('parses a plain decimal', () => expect(parseMoneyCents('24995.00')).toBe(2499500))
  it('parses currency symbols and commas', () => expect(parseMoneyCents('$9,495')).toBe(949500))
  it('treats zero as absent — never render $0', () => expect(parseMoneyCents('0')).toBeNull())
  it('treats blank as absent', () => expect(parseMoneyCents(null)).toBeNull())
  it('treats garbage as absent', () => expect(parseMoneyCents('call')).toBeNull())
  it('rejects negatives', () => expect(parseMoneyCents('-500')).toBeNull())
  it('rounds half-cents', () => expect(parseMoneyCents('10.005')).toBe(1001))
})

describe('parseIntSafe', () => {
  it('strips commas', () => expect(parseIntSafe('131,220')).toBe(131220))
  it('returns null for garbage', () => expect(parseIntSafe('N/A')).toBeNull())
  it('allows zero (a new car has 0 miles)', () => expect(parseIntSafe('0')).toBe(0))
  it('rejects negatives', () => expect(parseIntSafe('-5')).toBeNull())
})

describe('titleCase', () => {
  it('fixes ALL CAPS', () => expect(titleCase('NISSAN ALTIMA')).toBe('Nissan Altima'))
  it('leaves mixed case alone', () => expect(titleCase('Silverado 1500')).toBe('Silverado 1500'))
  it('returns null for null', () => expect(titleCase(null)).toBeNull())
})

describe('normalizeVehicle', () => {
  it('produces a canonical vehicle keyed on VIN', () => {
    const v = normalizeVehicle(base)!
    expect(v.sourceKey).toBe('1GCUYDED5KZ123456')
    expect(v.sourceKeyType).toBe('vin')
    expect(v.priceCents).toBe(2499500)
    expect(v.mileage).toBe(78450)
    expect(v.year).toBe(2019)
  })

  it('falls back to stock number when VIN is blank', () => {
    const v = normalizeVehicle({ ...base, vin: null, stockNumber: 'W-77' })!
    expect(v.sourceKey).toBe('W-77')
    expect(v.sourceKeyType).toBe('stock')
    expect(v.vin).toBeNull()
  })

  it('rejects a vehicle with neither VIN nor stock number', () => {
    expect(normalizeVehicle({ ...base, vin: null, stockNumber: null })).toBeNull()
  })

  it('uppercases VIN and rejects VINs of the wrong length', () => {
    expect(normalizeVehicle({ ...base, vin: '1gcuyded5kz123456' })!.vin)
      .toBe('1GCUYDED5KZ123456')
    // 10 chars is not a VIN — fall back to stock number
    const short = normalizeVehicle({ ...base, vin: '1GCUYDED5K' })!
    expect(short.sourceKeyType).toBe('stock')
    expect(short.vin).toBeNull()
  })

  it('title-cases ALL CAPS make and model', () => {
    const v = normalizeVehicle({ ...base, make: 'NISSAN', model: 'ALTIMA' })!
    expect(v.make).toBe('Nissan')
    expect(v.model).toBe('Altima')
  })

  it('rejects an implausible year', () => {
    expect(normalizeVehicle({ ...base, year: '19' })!.year).toBeNull()
    expect(normalizeVehicle({ ...base, year: '2019' })!.year).toBe(2019)
  })

  it('generates a slug', () => {
    expect(normalizeVehicle(base)!.slug).toBe('2019-chevrolet-silverado-1500-lt-kz123456')
  })

  it('produces the same hash for identical input', () => {
    expect(normalizeVehicle(base)!.sourceHash).toBe(normalizeVehicle(base)!.sourceHash)
  })

  it('changes the hash when the price changes', () => {
    const a = normalizeVehicle(base)!
    const b = normalizeVehicle({ ...base, price: '23995.00' })!
    expect(a.sourceHash).not.toBe(b.sourceHash)
  })

  it('changes the hash when photos change', () => {
    const a = normalizeVehicle(base)!
    const b = normalizeVehicle({ ...base, photoUrls: ['https://x/1.jpg'] })!
    expect(a.sourceHash).not.toBe(b.sourceHash)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/normalize.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/normalize`

- [ ] **Step 3: Implement `src/lib/frazer/normalize.ts`**

```typescript
import { stableHash } from '@/lib/hash'
import { buildSlug } from '@/lib/slug'
import type { CanonicalVehicle, RawVehicle } from './types'

const VIN_LENGTH = 17
const MIN_YEAR = 1900
const MAX_YEAR = new Date().getFullYear() + 2

/** Zero and negative money are treated as "not provided" — see spec §4.4. */
export function parseMoneyCents(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100)
}

export function parseIntSafe(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Only rewrites strings that are entirely uppercase; leaves good input alone.
 *
 * Tokens of <=3 chars or containing a digit are preserved, because automotive
 * data is full of legitimately-uppercase short tokens: LT, XLE, SLT, GMC, BMW,
 * SUV, SR5, 4WD. Title-casing those produces "Lt" and "Bmw", which read as bugs.
 * See "Known limitations" for the trade-off this accepts.
 */
export function titleCase(value: string | null): string | null {
  if (!value) return null
  if (value !== value.toUpperCase()) return value
  return value
    .split(/\s+/)
    .map((token) => {
      if (token.length <= 3 || /\d/.test(token)) return token
      return token.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
    })
    .join(' ')
}

function normalizeVin(vin: string | null): string | null {
  if (!vin) return null
  const upper = vin.trim().toUpperCase()
  return upper.length === VIN_LENGTH ? upper : null
}

function normalizeYear(year: string | null): number | null {
  const n = parseIntSafe(year)
  if (n === null || n < MIN_YEAR || n > MAX_YEAR) return null
  return n
}

/** Returns null when the vehicle has no usable identity and must be skipped. */
export function normalizeVehicle(raw: RawVehicle): CanonicalVehicle | null {
  const vin = normalizeVin(raw.vin)
  const stockNumber = raw.stockNumber?.trim() || null

  const sourceKey = vin ?? stockNumber
  if (!sourceKey) return null
  const sourceKeyType: 'vin' | 'stock' = vin ? 'vin' : 'stock'

  const fields = {
    sourceKey,
    sourceKeyType,
    vin,
    stockNumber,
    year: normalizeYear(raw.year),
    make: titleCase(raw.make),
    model: titleCase(raw.model),
    trim: titleCase(raw.trim),
    bodyStyle: titleCase(raw.bodyStyle),
    drivetrain: raw.drivetrain?.trim() ?? null,
    transmission: titleCase(raw.transmission),
    engine: raw.engine?.trim() ?? null,
    fuelType: titleCase(raw.fuelType),
    doors: parseIntSafe(raw.doors),
    exteriorColor: titleCase(raw.exteriorColor),
    interiorColor: titleCase(raw.interiorColor),
    mileage: parseIntSafe(raw.mileage),
    priceCents: parseMoneyCents(raw.price),
    downPaymentCents: parseMoneyCents(raw.downPayment),
    weeklyPaymentCents: parseMoneyCents(raw.weeklyPayment),
    description: raw.description?.trim() ?? null,
    features: raw.features,
    photoUrls: raw.photoUrls,
  }

  return {
    ...fields,
    slug: buildSlug({
      year: fields.year, make: fields.make, model: fields.model,
      trim: fields.trim, sourceKey,
    }),
    sourceHash: stableHash(fields),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frazer/normalize.test.ts`
Expected: PASS, 24 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/frazer/normalize.ts tests/frazer/normalize.test.ts
git commit -m "feat: add vehicle normalizer with money, mileage, and VIN validation"
```

---

## Task 7: Feed safety guards

The poison-pill protection from spec §4.5. Pure function, and the most important safety code in the system.

**Files:**
- Create: `src/lib/frazer/guards.ts`
- Test: `tests/frazer/guards.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/guards.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { checkFeedSanity, SHRINK_ABORT_THRESHOLD } from '@/lib/frazer/guards'

describe('checkFeedSanity', () => {
  it('accepts the first run with no baseline', () => {
    expect(checkFeedSanity({ incomingCount: 12, lastGoodCount: null })).toEqual({ ok: true })
  })

  it('aborts on an empty feed even with no baseline', () => {
    const r = checkFeedSanity({ incomingCount: 0, lastGoodCount: null })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/empty/i)
  })

  it('aborts on an empty feed with a baseline', () => {
    expect(checkFeedSanity({ incomingCount: 0, lastGoodCount: 40 }).ok).toBe(false)
  })

  it('accepts a steady feed', () => {
    expect(checkFeedSanity({ incomingCount: 40, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('accepts growth', () => {
    expect(checkFeedSanity({ incomingCount: 60, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('accepts normal attrition just above the threshold', () => {
    // 40 -> 25 is a 37.5% drop, under the 40% threshold
    expect(checkFeedSanity({ incomingCount: 25, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('aborts on a catastrophic shrink', () => {
    // 40 -> 20 is a 50% drop
    const r = checkFeedSanity({ incomingCount: 20, lastGoodCount: 40 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/50\.0%/)
  })

  it('aborts exactly at the threshold', () => {
    // 100 -> 60 is exactly a 40% drop
    expect(checkFeedSanity({ incomingCount: 60, lastGoodCount: 100 }).ok).toBe(false)
  })

  it('does not abort a tiny lot where one sale is a large percentage', () => {
    // 2 -> 1 is 50%, but below the small-lot floor
    expect(checkFeedSanity({ incomingCount: 1, lastGoodCount: 2 })).toEqual({ ok: true })
  })

  it('exports the threshold so it can be documented', () => {
    expect(SHRINK_ABORT_THRESHOLD).toBe(0.4)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/guards.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/guards`

- [ ] **Step 3: Implement `src/lib/frazer/guards.ts`**

```typescript
/** Abort if the feed shrank by this fraction or more. Spec §4.5. */
export const SHRINK_ABORT_THRESHOLD = 0.4

/**
 * Below this many vehicles, percentage shrink is meaningless — selling one
 * car off a 3-car lot is a 33% drop and perfectly normal.
 */
export const SMALL_LOT_FLOOR = 5

export type GuardInput = {
  incomingCount: number
  lastGoodCount: number | null
}

export type GuardResult = { ok: true } | { ok: false; reason: string }

/**
 * Decides whether a parsed feed is safe to apply.
 * Aborting leaves the database untouched — last-good data stays live.
 */
export function checkFeedSanity({ incomingCount, lastGoodCount }: GuardInput): GuardResult {
  if (incomingCount === 0) {
    return { ok: false, reason: 'Feed parsed to zero vehicles (empty feed)' }
  }

  if (lastGoodCount === null || lastGoodCount < SMALL_LOT_FLOOR) {
    return { ok: true }
  }

  const shrink = (lastGoodCount - incomingCount) / lastGoodCount
  if (shrink >= SHRINK_ABORT_THRESHOLD) {
    const pct = (shrink * 100).toFixed(1)
    return {
      ok: false,
      reason: `Feed shrank ${pct}% (${lastGoodCount} -> ${incomingCount}), at or above the ${SHRINK_ABORT_THRESHOLD * 100}% abort threshold`,
    }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frazer/guards.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/frazer/guards.ts tests/frazer/guards.test.ts
git commit -m "feat: add poison-pill feed safety guards"
```

---

## Task 8: Reconciliation planner

Pure diff between the feed and the database. No IO, so every edge case is cheap to test.

**Files:**
- Create: `src/lib/frazer/reconcile-plan.ts`
- Test: `tests/frazer/reconcile-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/reconcile-plan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { planReconciliation, type ExistingVehicle } from '@/lib/frazer/reconcile-plan'
import type { CanonicalVehicle } from '@/lib/frazer/types'

function incoming(over: Partial<CanonicalVehicle> = {}): CanonicalVehicle {
  return {
    sourceKey: 'VIN1', sourceKeyType: 'vin', vin: 'VIN1', stockNumber: 'A1',
    slug: 'car-vin1', year: 2019, make: 'Honda', model: 'Civic', trim: 'LX',
    bodyStyle: null, drivetrain: null, transmission: null, engine: null,
    fuelType: null, doors: null, exteriorColor: null, interiorColor: null,
    mileage: 60000, priceCents: 1699500, downPaymentCents: null,
    weeklyPaymentCents: null, description: null, features: [], photoUrls: [],
    sourceHash: 'hash-a', ...over,
  }
}

function existing(over: Partial<ExistingVehicle> = {}): ExistingVehicle {
  return {
    id: 'id-1', sourceKey: 'VIN1', sourceHash: 'hash-a',
    status: 'available', priceCents: 1699500, ...over,
  }
}

describe('planReconciliation', () => {
  it('creates a vehicle it has never seen', () => {
    const plan = planReconciliation([incoming()], [])
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.toMarkSold).toHaveLength(0)
  })

  it('skips a vehicle whose hash is unchanged', () => {
    const plan = planReconciliation([incoming()], [existing()])
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.unchangedIds).toEqual(['id-1'])
  })

  it('updates a vehicle whose hash changed', () => {
    const plan = planReconciliation([incoming({ sourceHash: 'hash-b' })], [existing()])
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0].existingId).toBe('id-1')
  })

  it('flags a price drop', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1599500 })],
      [existing({ priceCents: 1699500 })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(true)
  })

  it('does not flag a price increase', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1799500 })],
      [existing({ priceCents: 1699500 })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(false)
  })

  it('does not flag a price drop when the old price was unknown', () => {
    const plan = planReconciliation(
      [incoming({ sourceHash: 'hash-b', priceCents: 1599500 })],
      [existing({ priceCents: null })],
    )
    expect(plan.toUpdate[0].priceReduced).toBe(false)
  })

  it('marks a vehicle missing from the feed as sold', () => {
    const plan = planReconciliation([], [existing()])
    expect(plan.toMarkSold).toEqual(['id-1'])
  })

  it('does not re-mark an already-sold vehicle', () => {
    const plan = planReconciliation([], [existing({ status: 'sold' })])
    expect(plan.toMarkSold).toEqual([])
  })

  it('restores a sold vehicle that reappears in the feed', () => {
    const plan = planReconciliation([incoming()], [existing({ status: 'sold' })])
    expect(plan.toRestore).toEqual(['id-1'])
    expect(plan.toMarkSold).toEqual([])
  })

  it('leaves a hidden vehicle hidden and never marks it sold', () => {
    const plan = planReconciliation([incoming()], [existing({ status: 'hidden' })])
    expect(plan.toRestore).toEqual([])
    expect(plan.toMarkSold).toEqual([])
  })

  it('does not mark a hidden vehicle sold when it leaves the feed', () => {
    const plan = planReconciliation([], [existing({ status: 'hidden' })])
    expect(plan.toMarkSold).toEqual([])
  })

  it('keeps the first of two rows sharing a source key and reports the duplicate', () => {
    const plan = planReconciliation(
      [incoming({ stockNumber: 'A1' }), incoming({ stockNumber: 'A2' })],
      [],
    )
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toCreate[0].stockNumber).toBe('A1')
    expect(plan.duplicateKeys).toEqual(['VIN1'])
  })

  it('handles a mixed feed correctly', () => {
    const plan = planReconciliation(
      [incoming({ sourceKey: 'VIN1', sourceHash: 'hash-b' }), incoming({ sourceKey: 'VIN3' })],
      [existing({ id: 'id-1', sourceKey: 'VIN1' }), existing({ id: 'id-2', sourceKey: 'VIN2' })],
    )
    expect(plan.toUpdate.map((u) => u.existingId)).toEqual(['id-1'])
    expect(plan.toCreate.map((c) => c.sourceKey)).toEqual(['VIN3'])
    expect(plan.toMarkSold).toEqual(['id-2'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/reconcile-plan.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/reconcile-plan`

- [ ] **Step 3: Implement `src/lib/frazer/reconcile-plan.ts`**

```typescript
import type { CanonicalVehicle } from './types'

export type VehicleStatus = 'available' | 'sold' | 'hidden'

/** The minimal projection of a DB row the planner needs. */
export type ExistingVehicle = {
  id: string
  sourceKey: string
  sourceHash: string
  status: VehicleStatus
  priceCents: number | null
}

export type VehicleUpdate = {
  existingId: string
  vehicle: CanonicalVehicle
  priceReduced: boolean
}

export type ReconcilePlan = {
  toCreate: CanonicalVehicle[]
  toUpdate: VehicleUpdate[]
  toMarkSold: string[]
  toRestore: string[]
  unchangedIds: string[]
  duplicateKeys: string[]
}

/**
 * Pure diff of feed against database.
 *
 * Rules (spec §4.6):
 *  - unseen source key            -> create
 *  - seen, hash changed           -> update (flag price drops)
 *  - seen, hash identical         -> skip
 *  - in DB as available, absent   -> mark sold
 *  - in DB as sold, present again -> restore (relisting is normal)
 *  - hidden is a manual override  -> never auto-changed
 */
export function planReconciliation(
  incoming: CanonicalVehicle[],
  existing: ExistingVehicle[],
): ReconcilePlan {
  const existingByKey = new Map(existing.map((e) => [e.sourceKey, e]))

  const plan: ReconcilePlan = {
    toCreate: [], toUpdate: [], toMarkSold: [],
    toRestore: [], unchangedIds: [], duplicateKeys: [],
  }

  const seenKeys = new Set<string>()

  for (const v of incoming) {
    if (seenKeys.has(v.sourceKey)) {
      // Frazer permits duplicate VINs. First row wins; the rest are reported.
      if (!plan.duplicateKeys.includes(v.sourceKey)) plan.duplicateKeys.push(v.sourceKey)
      continue
    }
    seenKeys.add(v.sourceKey)

    const match = existingByKey.get(v.sourceKey)

    if (!match) {
      plan.toCreate.push(v)
      continue
    }

    if (match.status === 'sold') plan.toRestore.push(match.id)

    if (match.sourceHash === v.sourceHash) {
      plan.unchangedIds.push(match.id)
      continue
    }

    plan.toUpdate.push({
      existingId: match.id,
      vehicle: v,
      priceReduced:
        match.priceCents !== null &&
        v.priceCents !== null &&
        v.priceCents < match.priceCents,
    })
  }

  for (const e of existing) {
    if (seenKeys.has(e.sourceKey)) continue
    if (e.status === 'available') plan.toMarkSold.push(e.id)
  }

  return plan
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frazer/reconcile-plan.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/frazer/reconcile-plan.ts tests/frazer/reconcile-plan.test.ts
git commit -m "feat: add pure reconciliation planner with sold and relist handling"
```

---

## Task 9: VIN decoding

NHTSA vPIC enrichment. Must never block a sync (spec §4.4).

**Files:**
- Create: `src/lib/frazer/vin-decode.ts`
- Test: `tests/frazer/vin-decode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/vin-decode.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { decodeVin, applyVinDecode } from '@/lib/frazer/vin-decode'

afterEach(() => vi.unstubAllGlobals())

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok, status: ok ? 200 : 500, json: async () => body,
  }))
}

describe('decodeVin', () => {
  it('returns decoded fields on success', async () => {
    mockFetchOnce({ Results: [{
      ModelYear: '2019', Make: 'CHEVROLET', Model: 'Silverado 1500',
      Trim: 'LT', BodyClass: 'Pickup', DriveType: '4WD', FuelTypePrimary: 'Gasoline',
    }] })
    const result = await decodeVin('1GCUYDED5KZ123456')
    expect(result).toEqual({
      year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
      bodyStyle: 'Pickup', drivetrain: '4WD', fuelType: 'Gasoline',
    })
  })

  it('returns null when the API errors', async () => {
    mockFetchOnce({}, false)
    expect(await decodeVin('1GCUYDED5KZ123456')).toBeNull()
  })

  it('returns null when the network throws — never blocks a sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await decodeVin('1GCUYDED5KZ123456')).toBeNull()
  })

  it('returns null for a malformed VIN without calling the network', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await decodeVin('TOOSHORT')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('ignores vPIC placeholder values', async () => {
    mockFetchOnce({ Results: [{
      ModelYear: '2019', Make: 'HONDA', Model: 'Civic',
      Trim: 'Not Applicable', BodyClass: '', DriveType: 'Not Applicable',
    }] })
    const result = await decodeVin('2HGFC2F59KH512345')
    expect(result?.trim).toBeNull()
    expect(result?.bodyStyle).toBeNull()
    expect(result?.drivetrain).toBeNull()
  })
})

describe('applyVinDecode', () => {
  const decoded = {
    year: 2019, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT',
    bodyStyle: 'Pickup', drivetrain: '4WD', fuelType: 'Gasoline',
  }

  it('fills only fields the feed left blank', () => {
    const merged = applyVinDecode(
      { year: null, make: 'CHEVY', model: null, trim: null, bodyStyle: null, drivetrain: null, fuelType: null },
      decoded,
    )
    expect(merged.year).toBe(2019)
    expect(merged.make).toBe('CHEVY')     // feed value wins
    expect(merged.bodyStyle).toBe('Pickup')
  })

  it('is a no-op when decoding failed', () => {
    const original = { year: null, make: 'Honda', model: 'Civic', trim: null, bodyStyle: null, drivetrain: null, fuelType: null }
    expect(applyVinDecode(original, null)).toEqual(original)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/vin-decode.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/vin-decode`

- [ ] **Step 3: Implement `src/lib/frazer/vin-decode.ts`**

```typescript
import { titleCase } from './normalize'

const VPIC_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevin'
const TIMEOUT_MS = 5000

/** vPIC returns these instead of empty strings. */
const PLACEHOLDERS = new Set(['not applicable', 'not available', 'n/a', ''])

export type VinDecodeResult = {
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  bodyStyle: string | null
  drivetrain: string | null
  fuelType: string | null
}

export type DecodableFields = VinDecodeResult

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (PLACEHOLDERS.has(trimmed.toLowerCase())) return null
  return trimmed
}

/**
 * Enrichment only. Returns null on any failure — a sync must never
 * depend on a third-party API being up. Spec §4.4.
 */
export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  if (!vin || vin.length !== 17) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`${VPIC_URL}/${encodeURIComponent(vin)}?format=json`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return null
    const body = (await res.json()) as { Results?: Record<string, unknown>[] }
    const r = body?.Results?.[0]
    if (!r) return null

    const yearRaw = clean(r.ModelYear)
    const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null

    return {
      year,
      make: titleCase(clean(r.Make)),
      model: clean(r.Model),
      trim: clean(r.Trim),
      bodyStyle: clean(r.BodyClass),
      drivetrain: clean(r.DriveType),
      fuelType: clean(r.FuelTypePrimary),
    }
  } catch {
    return null
  }
}

/** Feed values always win; decoded values only fill gaps. */
export function applyVinDecode<T extends DecodableFields>(
  fields: T,
  decoded: VinDecodeResult | null,
): T {
  if (!decoded) return fields
  return {
    ...fields,
    year: fields.year ?? decoded.year,
    make: fields.make ?? decoded.make,
    model: fields.model ?? decoded.model,
    trim: fields.trim ?? decoded.trim,
    bodyStyle: fields.bodyStyle ?? decoded.bodyStyle,
    drivetrain: fields.drivetrain ?? decoded.drivetrain,
    fuelType: fields.fuelType ?? decoded.fuelType,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frazer/vin-decode.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/frazer/vin-decode.ts tests/frazer/vin-decode.test.ts
git commit -m "feat: add non-blocking NHTSA VIN decoding"
```

---

## Task 10: Photo processing

EXIF correction, resize, WebP. Spec §4.7.

**Files:**
- Create: `src/lib/frazer/photos.ts`, `tests/fixtures/images/make-fixtures.ts`
- Test: `tests/frazer/photos.test.ts`

- [ ] **Step 1: Create the fixture generator `tests/fixtures/images/make-fixtures.ts`**

Generating fixtures with `sharp` beats committing binaries — the test stays readable and the EXIF orientation is provably correct.

```typescript
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
```

- [ ] **Step 2: Write the failing test**

Create `tests/frazer/photos.test.ts`:

```typescript
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
    const out = await processPhoto(await plainJpeg(1600, 1200))
    expect(out.width).toBe(PHOTO_SIZES.full)
    expect(out.height).toBe(900)
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/frazer/photos.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/photos`

- [ ] **Step 4: Implement `src/lib/frazer/photos.ts`**

```typescript
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
 * which is what stops Sidekick phone photos from displaying sideways. Spec §4.7.
 */
export async function processPhoto(source: Buffer): Promise<ProcessedPhoto> {
  const contentHash = sha256Hex(source)

  const upright = sharp(source).rotate()
  const meta = await upright.metadata()
  if (!meta.width || !meta.height) {
    throw new Error('Unreadable image: no dimensions')
  }

  const variants: PhotoVariant[] = []
  for (const name of Object.keys(PHOTO_SIZES) as PhotoVariantName[]) {
    const target = Math.min(PHOTO_SIZES[name], meta.width)
    const buffer = await sharp(source)
      .rotate()
      .resize({ width: target, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()
    variants.push({ name, buffer, width: target })
  }

  const fullWidth = Math.min(PHOTO_SIZES.full, meta.width)
  const fullHeight = Math.round((meta.height / meta.width) * fullWidth)

  return { contentHash, width: fullWidth, height: fullHeight, variants }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/frazer/photos.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/frazer/photos.ts tests/frazer/photos.test.ts tests/fixtures/images/
git commit -m "feat: add photo pipeline with EXIF correction and WebP variants"
```

---

## Task 11: Photo storage and persistence

Downloads, dedupes against the DB, uploads to blob storage. Failures preserve existing photos.

**Files:**
- Create: `src/lib/frazer/photo-store.ts`
- Test: `tests/frazer/photo-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/photo-store.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchPhoto, planPhotoSync } from '@/lib/frazer/photo-store'

afterEach(() => vi.unstubAllGlobals())

describe('fetchPhoto', () => {
  it('returns a buffer on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      arrayBuffer: async () => new TextEncoder().encode('imagebytes').buffer,
    }))
    const buf = await fetchPhoto('https://example.com/a.jpg')
    expect(buf?.toString()).toBe('imagebytes')
  })

  it('returns null on a 404 instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    expect(await fetchPhoto('https://example.com/missing.jpg')).toBeNull()
  })

  it('returns null when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')))
    expect(await fetchPhoto('https://example.com/a.jpg')).toBeNull()
  })
})

describe('planPhotoSync', () => {
  it('downloads every photo for a vehicle with none stored', () => {
    const plan = planPhotoSync(['u1', 'u2'], [])
    expect(plan.toFetch).toEqual([
      { url: 'u1', position: 0 },
      { url: 'u2', position: 1 },
    ])
    expect(plan.toDelete).toEqual([])
  })

  it('skips a URL already stored at the same position', () => {
    const plan = planPhotoSync(['u1', 'u2'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
    ])
    expect(plan.toFetch).toEqual([{ url: 'u2', position: 1 }])
    expect(plan.toDelete).toEqual([])
  })

  it('re-fetches a photo whose position changed, because position 0 is the hero', () => {
    const plan = planPhotoSync(['u2', 'u1'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
      { id: 'p2', sourceUrl: 'u2', position: 1 },
    ])
    expect(plan.toReposition).toEqual([
      { id: 'p2', position: 0 },
      { id: 'p1', position: 1 },
    ])
    expect(plan.toFetch).toEqual([])
  })

  it('deletes a stored photo no longer in the feed', () => {
    const plan = planPhotoSync(['u1'], [
      { id: 'p1', sourceUrl: 'u1', position: 0 },
      { id: 'p2', sourceUrl: 'u2', position: 1 },
    ])
    expect(plan.toDelete).toEqual(['p2'])
  })

  it('never deletes everything when the feed lists no photos', () => {
    // A vehicle losing all photos is far more likely to be a feed glitch
    // than a real edit. Keep what we have. Spec §4.7.
    const plan = planPhotoSync([], [{ id: 'p1', sourceUrl: 'u1', position: 0 }])
    expect(plan.toDelete).toEqual([])
    expect(plan.toFetch).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/photo-store.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/photo-store`

- [ ] **Step 3: Implement `src/lib/frazer/photo-store.ts`**

```typescript
import { put } from '@vercel/blob'
import type { ProcessedPhoto } from './photos'

const FETCH_TIMEOUT_MS = 15000

export type StoredPhoto = {
  id: string
  sourceUrl: string
  position: number
}

export type PhotoSyncPlan = {
  toFetch: { url: string; position: number }[]
  toReposition: { id: string; position: number }[]
  toDelete: string[]
}

/** Returns null on any failure — the caller keeps the existing photo. Spec §4.7. */
export async function fetchPhoto(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * Diffs the feed's photo list against what is already stored.
 *
 * An empty feed photo list is treated as "no information", not "delete all" —
 * losing every photo is much more likely to be a feed glitch than an edit.
 */
export function planPhotoSync(
  feedUrls: string[],
  stored: StoredPhoto[],
): PhotoSyncPlan {
  if (feedUrls.length === 0) {
    return { toFetch: [], toReposition: [], toDelete: [] }
  }

  const storedByUrl = new Map(stored.map((s) => [s.sourceUrl, s]))
  const plan: PhotoSyncPlan = { toFetch: [], toReposition: [], toDelete: [] }

  feedUrls.forEach((url, position) => {
    const existing = storedByUrl.get(url)
    if (!existing) {
      plan.toFetch.push({ url, position })
    } else if (existing.position !== position) {
      plan.toReposition.push({ id: existing.id, position })
    }
  })

  const feedUrlSet = new Set(feedUrls)
  for (const s of stored) {
    if (!feedUrlSet.has(s.sourceUrl)) plan.toDelete.push(s.id)
  }

  return plan
}

export type UploadedUrls = { thumb: string; card: string; full: string }

/** Content-hash paths mean an identical image is never stored twice. */
export async function uploadVariants(
  photo: ProcessedPhoto,
): Promise<UploadedUrls> {
  const urls: Partial<UploadedUrls> = {}
  for (const variant of photo.variants) {
    const blob = await put(
      `vehicles/${photo.contentHash}/${variant.name}.webp`,
      variant.buffer,
      { access: 'public', contentType: 'image/webp', addRandomSuffix: false },
    )
    urls[variant.name] = blob.url
  }
  return urls as UploadedUrls
}
```

- [ ] **Step 4: Add `sourceUrl` to the photos table**

The planner needs to match stored photos back to feed URLs. Modify `src/db/schema.ts` — in the `vehiclePhotos` table, add this field immediately after `contentHash`:

```typescript
  sourceUrl: text('source_url').notNull(),
```

- [ ] **Step 5: Regenerate the migration**

Run: `npm run db:generate`
Expected: a new migration file appears in `drizzle/` adding the `source_url` column

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/frazer/photo-store.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 7: Commit**

```bash
git add src/lib/frazer/photo-store.ts tests/frazer/photo-store.test.ts src/db/schema.ts drizzle/
git commit -m "feat: add photo download, dedupe planning, and blob upload"
```

---

## Task 12: Reconciliation executor

Applies a `ReconcilePlan` to Postgres. All writes in one transaction.

**Files:**
- Create: `src/lib/frazer/reconcile-apply.ts`
- Test: `tests/frazer/reconcile-apply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/reconcile-apply.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { toVehicleRow, SOLD_PAGE_RETENTION_DAYS } from '@/lib/frazer/reconcile-apply'
import type { CanonicalVehicle } from '@/lib/frazer/types'

const canonical: CanonicalVehicle = {
  sourceKey: 'VIN1', sourceKeyType: 'vin', vin: 'VIN1', stockNumber: 'A1',
  slug: 'car-vin1', year: 2019, make: 'Honda', model: 'Civic', trim: 'LX',
  bodyStyle: 'Sedan', drivetrain: 'FWD', transmission: 'Automatic',
  engine: '2.0L', fuelType: 'Gasoline', doors: 4,
  exteriorColor: 'Silver', interiorColor: 'Black', mileage: 60000,
  priceCents: 1699500, downPaymentCents: 250000, weeklyPaymentCents: 8900,
  description: 'Nice car', features: ['Bluetooth'],
  photoUrls: ['https://x/1.jpg'], sourceHash: 'hash-a',
}

describe('toVehicleRow', () => {
  it('maps every canonical field onto the row', () => {
    const row = toVehicleRow(canonical, { priceReduced: false })
    expect(row.sourceKey).toBe('VIN1')
    expect(row.priceCents).toBe(1699500)
    expect(row.weeklyPaymentCents).toBe(8900)
    expect(row.features).toEqual(['Bluetooth'])
    expect(row.slug).toBe('car-vin1')
  })

  it('does not put photoUrls on the vehicle row — photos are their own table', () => {
    expect(toVehicleRow(canonical, { priceReduced: false })).not.toHaveProperty('photoUrls')
  })

  it('does not put sourceKeyType-derived junk on the row', () => {
    const row = toVehicleRow(canonical, { priceReduced: false })
    expect(row.sourceKeyType).toBe('vin')
  })

  it('carries the price-reduced flag through', () => {
    expect(toVehicleRow(canonical, { priceReduced: true }).priceReduced).toBe(true)
  })

  it('refreshes lastSeenAt', () => {
    const before = Date.now()
    const row = toVehicleRow(canonical, { priceReduced: false })
    expect(row.lastSeenAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('documents the sold-page retention window from the spec', () => {
    expect(SOLD_PAGE_RETENTION_DAYS).toBe(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/frazer/reconcile-apply.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/reconcile-apply`

- [ ] **Step 3: Implement `src/lib/frazer/reconcile-apply.ts`**

```typescript
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { vehicles } from '@/db/schema'
import type { CanonicalVehicle } from './types'
import type { ReconcilePlan } from './reconcile-plan'

/** Sold VDPs stay live this long before redirecting. Spec §4.6. */
export const SOLD_PAGE_RETENTION_DAYS = 30

export type ReconcileCounts = {
  created: number
  updated: number
  markedSold: number
  restored: number
}

/** Maps a CanonicalVehicle onto a `vehicles` row. Photos live elsewhere. */
export function toVehicleRow(
  v: CanonicalVehicle,
  opts: { priceReduced: boolean },
) {
  return {
    sourceKey: v.sourceKey,
    sourceKeyType: v.sourceKeyType,
    vin: v.vin,
    stockNumber: v.stockNumber,
    slug: v.slug,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    bodyStyle: v.bodyStyle,
    drivetrain: v.drivetrain,
    transmission: v.transmission,
    engine: v.engine,
    fuelType: v.fuelType,
    doors: v.doors,
    exteriorColor: v.exteriorColor,
    interiorColor: v.interiorColor,
    mileage: v.mileage,
    priceCents: v.priceCents,
    downPaymentCents: v.downPaymentCents,
    weeklyPaymentCents: v.weeklyPaymentCents,
    description: v.description,
    features: v.features,
    sourceHash: v.sourceHash,
    vinDecoded: (v.vinDecoded ?? null) as Record<string, string> | null,
    priceReduced: opts.priceReduced,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function applyReconciliation(plan: ReconcilePlan): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { created: 0, updated: 0, markedSold: 0, restored: 0 }

  await db.transaction(async (tx) => {
    for (const v of plan.toCreate) {
      await tx.insert(vehicles).values({
        ...toVehicleRow(v, { priceReduced: false }),
        status: 'available',
        firstSeenAt: new Date(),
      })
      counts.created++
    }

    for (const u of plan.toUpdate) {
      await tx.update(vehicles)
        .set(toVehicleRow(u.vehicle, { priceReduced: u.priceReduced }))
        .where(eq(vehicles.id, u.existingId))
      counts.updated++
    }

    if (plan.toMarkSold.length > 0) {
      await tx.update(vehicles)
        .set({ status: 'sold', soldAt: new Date(), updatedAt: new Date() })
        .where(inArray(vehicles.id, plan.toMarkSold))
      counts.markedSold = plan.toMarkSold.length
    }

    if (plan.toRestore.length > 0) {
      await tx.update(vehicles)
        .set({ status: 'available', soldAt: null, updatedAt: new Date() })
        .where(inArray(vehicles.id, plan.toRestore))
      counts.restored = plan.toRestore.length
    }

    if (plan.unchangedIds.length > 0) {
      await tx.update(vehicles)
        .set({ lastSeenAt: new Date() })
        .where(inArray(vehicles.id, plan.unchangedIds))
    }
  })

  return counts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/frazer/reconcile-apply.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/frazer/reconcile-apply.ts tests/frazer/reconcile-apply.test.ts
git commit -m "feat: add transactional reconciliation executor"
```

---

## Task 13: Sync orchestrator

Ties every piece together and records a `SyncRun`.

**Files:**
- Create: `src/lib/frazer/sync.ts`
- Test: `tests/frazer/sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frazer/sync.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runSyncCore } from '@/lib/frazer/sync'
import { xmlAdapter } from '@/lib/frazer/xml-adapter'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/frazer', name), 'utf-8')

/** Collaborators are injected so the orchestrator is testable without IO. */
function deps(over: Partial<Parameters<typeof runSyncCore>[0]> = {}) {
  return {
    adapter: xmlAdapter,
    fetchFeed: vi.fn().mockResolvedValue(fixture('normal.xml')),
    loadExisting: vi.fn().mockResolvedValue([]),
    lastGoodCount: vi.fn().mockResolvedValue(null),
    applyPlan: vi.fn().mockResolvedValue({ created: 3, updated: 0, markedSold: 0, restored: 0 }),
    syncPhotos: vi.fn().mockResolvedValue(4),
    decorateWithVin: vi.fn().mockImplementation(async (v) => v),
    ...over,
  }
}

describe('runSyncCore', () => {
  it('completes successfully on a healthy feed', async () => {
    const d = deps()
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.vehiclesSeen).toBe(3)
    expect(result.created).toBe(3)
    expect(d.applyPlan).toHaveBeenCalledOnce()
  })

  it('aborts without writing when the feed is empty', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('empty.xml')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toMatch(/empty/i)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('aborts without writing when the feed shrank catastrophically', async () => {
    const d = deps({ lastGoodCount: vi.fn().mockResolvedValue(40) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('aborted')
    expect(result.abortReason).toMatch(/shrank/i)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('fails without writing when the feed is unreachable', async () => {
    const d = deps({ fetchFeed: vi.fn().mockRejectedValue(new Error('ETIMEDOUT')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('failed')
    expect(result.errors[0]).toMatch(/ETIMEDOUT/)
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('fails without writing when the XML is malformed', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue('<Inventory><Vehicle>') })
    const result = await runSyncCore(d)
    expect(result.status).toBe('failed')
    expect(d.applyPlan).not.toHaveBeenCalled()
  })

  it('skips unusable rows and completes the run', async () => {
    const d = deps({ fetchFeed: vi.fn().mockResolvedValue(fixture('dirty.xml')) })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    // dirty.xml has 3 rows; two share a VIN, so one is dropped as a duplicate
    expect(result.vehiclesSeen).toBe(2)
    expect(result.errors.some((e) => /duplicate/i.test(e))).toBe(true)
  })

  it('continues the run when photo syncing throws for one vehicle', async () => {
    const d = deps({
      syncPhotos: vi.fn()
        .mockRejectedValueOnce(new Error('blob down'))
        .mockResolvedValue(2),
    })
    const result = await runSyncCore(d)
    expect(result.status).toBe('success')
    expect(result.errors.some((e) => /blob down/.test(e))).toBe(true)
  })
})
```

- [ ] **Step 2: Create `tests/fixtures/frazer/empty.xml`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Inventory></Inventory>
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/frazer/sync.test.ts`
Expected: FAIL — cannot resolve `@/lib/frazer/sync`

- [ ] **Step 4: Implement `src/lib/frazer/sync.ts`**

```typescript
import { checkFeedSanity } from './guards'
import { normalizeVehicle } from './normalize'
import { planReconciliation, type ExistingVehicle } from './reconcile-plan'
import type { CanonicalVehicle, FeedAdapter } from './types'
import type { ReconcileCounts } from './reconcile-apply'
import type { ReconcilePlan } from './reconcile-plan'

export type SyncDeps = {
  adapter: FeedAdapter
  fetchFeed: () => Promise<string>
  loadExisting: () => Promise<ExistingVehicle[]>
  lastGoodCount: () => Promise<number | null>
  applyPlan: (plan: ReconcilePlan) => Promise<ReconcileCounts>
  syncPhotos: (sourceKey: string, urls: string[]) => Promise<number>
  decorateWithVin: (v: CanonicalVehicle) => Promise<CanonicalVehicle>
}

export type SyncResult = {
  status: 'success' | 'aborted' | 'failed'
  vehiclesSeen: number
  created: number
  updated: number
  markedSold: number
  photosProcessed: number
  abortReason: string | null
  errors: string[]
  rawSnapshot: string | null
}

function emptyResult(): SyncResult {
  return {
    status: 'failed', vehiclesSeen: 0, created: 0, updated: 0,
    markedSold: 0, photosProcessed: 0, abortReason: null,
    errors: [], rawSnapshot: null,
  }
}

/**
 * The whole sync, with every collaborator injected so it is testable
 * without a database, a network, or blob storage.
 *
 * Ordering matters: fetch, parse, normalize, THEN check safety guards,
 * and only then write. Nothing touches the database before the guards pass.
 */
export async function runSyncCore(deps: SyncDeps): Promise<SyncResult> {
  const result = emptyResult()

  // 1. Fetch and parse. Any failure here aborts before any write.
  let raw: string
  try {
    raw = await deps.fetchFeed()
    result.rawSnapshot = raw
  } catch (err) {
    result.status = 'failed'
    result.errors.push(`Feed fetch failed: ${(err as Error).message}`)
    return result
  }

  let parsed
  try {
    parsed = deps.adapter.parse(raw)
  } catch (err) {
    result.status = 'failed'
    result.errors.push(`Feed parse failed: ${(err as Error).message}`)
    return result
  }

  // 2. Normalize. A bad row is skipped, not fatal.
  const canonical: CanonicalVehicle[] = []
  for (const [i, rawVehicle] of parsed.entries()) {
    const normalized = normalizeVehicle(rawVehicle)
    if (!normalized) {
      result.errors.push(`Row ${i}: skipped — no VIN and no stock number`)
      continue
    }
    canonical.push(normalized)
  }

  // 3. Safety guards. Aborting here leaves the database completely untouched.
  const guard = checkFeedSanity({
    incomingCount: canonical.length,
    lastGoodCount: await deps.lastGoodCount(),
  })
  if (!guard.ok) {
    result.status = 'aborted'
    result.abortReason = guard.reason
    return result
  }

  // 4. Enrich. Never fatal.
  const enriched: CanonicalVehicle[] = []
  for (const v of canonical) {
    try {
      enriched.push(await deps.decorateWithVin(v))
    } catch (err) {
      result.errors.push(`VIN decode failed for ${v.sourceKey}: ${(err as Error).message}`)
      enriched.push(v)
    }
  }

  // 5. Plan and apply.
  const existing = await deps.loadExisting()
  const plan = planReconciliation(enriched, existing)

  for (const key of plan.duplicateKeys) {
    result.errors.push(`Duplicate source key in feed, kept first row: ${key}`)
  }

  const counts = await deps.applyPlan(plan)
  result.created = counts.created
  result.updated = counts.updated
  result.markedSold = counts.markedSold
  result.vehiclesSeen = plan.toCreate.length + plan.toUpdate.length + plan.unchangedIds.length

  // 6. Photos. A failure for one vehicle never fails the run.
  for (const v of enriched) {
    try {
      result.photosProcessed += await deps.syncPhotos(v.sourceKey, v.photoUrls)
    } catch (err) {
      result.errors.push(`Photo sync failed for ${v.sourceKey}: ${(err as Error).message}`)
    }
  }

  result.status = 'success'
  return result
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/frazer/sync.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — all tests across all files

- [ ] **Step 7: Commit**

```bash
git add src/lib/frazer/sync.ts tests/frazer/sync.test.ts tests/fixtures/frazer/empty.xml
git commit -m "feat: add sync orchestrator with guard-before-write ordering"
```

---

## Task 14: Cron route

The scheduled entry point that wires real IO into `runSyncCore`.

**Files:**
- Create: `src/lib/frazer/sync-live.ts`, `src/app/api/cron/sync/route.ts`, `vercel.json`

- [ ] **Step 1: Create `src/lib/frazer/sync-live.ts`**

Real dependency wiring, kept out of the route so the route stays trivial.

```typescript
import { desc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '@/db'
import { syncRuns, vehicles, vehiclePhotos } from '@/db/schema'
import { xmlAdapter } from './xml-adapter'
import { runSyncCore, type SyncDeps, type SyncResult } from './sync'
import { applyReconciliation } from './reconcile-apply'
import { decodeVin, applyVinDecode } from './vin-decode'
import { fetchPhoto, planPhotoSync, uploadVariants } from './photo-store'
import { processPhoto } from './photos'
import type { ExistingVehicle } from './reconcile-plan'
import type { CanonicalVehicle } from './types'

const FEED_TIMEOUT_MS = 30000
const FEED_RETRIES = 3

async function fetchFeedWithRetry(): Promise<string> {
  const url = process.env.FRAZER_FEED_URL
  if (!url) throw new Error('FRAZER_FEED_URL is not set')

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= FEED_RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS)
      const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`Feed returned HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      lastError = err as Error
      if (attempt < FEED_RETRIES) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000))
      }
    }
  }
  throw lastError ?? new Error('Feed fetch failed')
}

async function loadExisting(): Promise<ExistingVehicle[]> {
  const rows = await db.select({
    id: vehicles.id,
    sourceKey: vehicles.sourceKey,
    sourceHash: vehicles.sourceHash,
    status: vehicles.status,
    priceCents: vehicles.priceCents,
  }).from(vehicles)
  return rows as ExistingVehicle[]
}

async function lastGoodCount(): Promise<number | null> {
  const [run] = await db.select({ count: syncRuns.vehiclesSeen })
    .from(syncRuns)
    .where(eq(syncRuns.status, 'success'))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)
  return run?.count ?? null
}

async function decorateWithVin(v: CanonicalVehicle): Promise<CanonicalVehicle> {
  if (!v.vin) return v
  const decoded = await decodeVin(v.vin)
  if (!decoded) return v
  return { ...v, ...applyVinDecode(v, decoded), vinDecoded: decoded } as CanonicalVehicle
}

async function syncPhotos(sourceKey: string, urls: string[]): Promise<number> {
  const [vehicle] = await db.select({ id: vehicles.id, year: vehicles.year, make: vehicles.make, model: vehicles.model })
    .from(vehicles).where(eq(vehicles.sourceKey, sourceKey)).limit(1)
  if (!vehicle) return 0

  const stored = await db.select({
    id: vehiclePhotos.id,
    sourceUrl: vehiclePhotos.sourceUrl,
    position: vehiclePhotos.position,
  }).from(vehiclePhotos).where(eq(vehiclePhotos.vehicleId, vehicle.id))

  const plan = planPhotoSync(urls, stored)
  const alt = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle photo'
  let processed = 0

  for (const item of plan.toFetch) {
    const buf = await fetchPhoto(item.url)
    if (!buf) continue                       // keep going; retried next run
    const photo = await processPhoto(buf)
    const uploaded = await uploadVariants(photo)
    await db.insert(vehiclePhotos).values({
      vehicleId: vehicle.id,
      position: item.position,
      contentHash: photo.contentHash,
      sourceUrl: item.url,
      urlThumb: uploaded.thumb,
      urlCard: uploaded.card,
      urlFull: uploaded.full,
      width: photo.width,
      height: photo.height,
      alt,
    }).onConflictDoNothing()
    processed++
  }

  for (const r of plan.toReposition) {
    await db.update(vehiclePhotos).set({ position: r.position }).where(eq(vehiclePhotos.id, r.id))
  }

  if (plan.toDelete.length > 0) {
    await db.delete(vehiclePhotos).where(inArray(vehiclePhotos.id, plan.toDelete))
  }

  return processed
}

export function liveDeps(): SyncDeps {
  return {
    adapter: xmlAdapter,
    fetchFeed: fetchFeedWithRetry,
    loadExisting,
    lastGoodCount,
    applyPlan: applyReconciliation,
    syncPhotos,
    decorateWithVin,
  }
}

/** Runs a sync and records it in sync_runs, whatever the outcome. */
export async function runSyncAndRecord(source: string): Promise<SyncResult> {
  const [run] = await db.insert(syncRuns)
    .values({ source, status: 'running' })
    .returning({ id: syncRuns.id })

  let result: SyncResult
  try {
    result = await runSyncCore(liveDeps())
  } catch (err) {
    result = {
      status: 'failed', vehiclesSeen: 0, created: 0, updated: 0, markedSold: 0,
      photosProcessed: 0, abortReason: null,
      errors: [`Unhandled: ${(err as Error).message}`], rawSnapshot: null,
    }
  }

  await db.update(syncRuns).set({
    status: result.status,
    finishedAt: new Date(),
    vehiclesSeen: result.vehiclesSeen,
    created: result.created,
    updated: result.updated,
    markedSold: result.markedSold,
    photosProcessed: result.photosProcessed,
    abortReason: result.abortReason,
    errors: result.errors,
  }).where(eq(syncRuns.id, run.id))

  return result
}
```

- [ ] **Step 2: Create `src/app/api/cron/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { runSyncAndRecord } from '@/lib/frazer/sync-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSyncAndRecord('xml_feed')

  // 200 even on abort: an abort is the system working correctly.
  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 })
}
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/sync", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Verify the route rejects unauthenticated requests**

Run in one terminal: `npm run dev`
Run in another: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/cron/sync`
Expected: `401`

- [ ] **Step 6: Commit**

```bash
git add src/lib/frazer/sync-live.ts src/app/api/cron/sync/route.ts vercel.json
git commit -m "feat: add scheduled sync route with live dependency wiring"
```

---

## Task 15: Admin sync status page

Makes "why isn't my car on the site?" answerable. Spec §6.2.

**Files:**
- Create: `src/app/admin/sync/page.tsx`, `src/app/api/admin/sync/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Create `src/middleware.ts`**

Basic auth is the right amount of security for a single-operator status page.

```typescript
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }

export function middleware(request: NextRequest) {
  const header = request.headers.get('authorization')

  if (header?.startsWith('Basic ')) {
    const decoded = atob(header.slice(6))
    const separator = decoded.indexOf(':')
    const password = decoded.slice(separator + 1)
    if (password && password === process.env.ADMIN_PASSWORD) {
      return NextResponse.next()
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Admin"' },
  })
}
```

- [ ] **Step 2: Create `src/app/api/admin/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { runSyncAndRecord } from '@/lib/frazer/sync-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST() {
  const result = await runSyncAndRecord('manual')
  return NextResponse.json(result)
}
```

- [ ] **Step 3: Create `src/app/admin/sync/page.tsx`**

```tsx
import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { syncRuns } from '@/db/schema'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  aborted: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-800',
  running: 'bg-blue-100 text-blue-800',
}

export default async function SyncStatusPage() {
  const runs = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(50)

  return (
    <main className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Inventory sync</h1>
        <form action="/api/admin/sync" method="post">
          <button type="submit" className="rounded bg-black px-4 py-2 text-white">
            Sync now
          </button>
        </form>
      </div>

      {runs.length === 0 && (
        <p className="text-gray-500">No syncs have run yet.</p>
      )}

      <table className="w-full text-sm">
        <thead className="border-b text-left text-gray-500">
          <tr>
            <th className="py-2">Started</th>
            <th>Status</th>
            <th>Seen</th>
            <th>New</th>
            <th>Updated</th>
            <th>Sold</th>
            <th>Photos</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b align-top">
              <td className="py-2 whitespace-nowrap">{run.startedAt.toLocaleString()}</td>
              <td>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[run.status] ?? ''}`}>
                  {run.status}
                </span>
              </td>
              <td>{run.vehiclesSeen}</td>
              <td>{run.created}</td>
              <td>{run.updated}</td>
              <td>{run.markedSold}</td>
              <td>{run.photosProcessed}</td>
              <td className="max-w-md text-xs text-gray-600">
                {run.abortReason && <div className="font-medium">{run.abortReason}</div>}
                {run.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                {run.errors.length > 5 && <div>+{run.errors.length - 5} more</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Verify the admin page requires a password**

Run in one terminal: `npm run dev`
Run in another: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/sync`
Expected: `401`

Then: `curl -s -o /dev/null -w "%{http_code}" -u "admin:$ADMIN_PASSWORD" http://localhost:3000/admin/sync`
Expected: `200`

- [ ] **Step 6: Run the full suite one more time**

Run: `npm test`
Expected: PASS, all files

- [ ] **Step 7: Commit**

```bash
git add src/app/admin src/app/api/admin src/middleware.ts
git commit -m "feat: add password-protected sync status page with manual trigger"
```

---

## Verification against a real feed

The moment the dealer supplies the feed URL (intake question 24), do this **before** trusting any of it:

1. Save the real feed response to `tests/fixtures/frazer/real-sample.xml` (scrub anything sensitive).
2. Run the adapter test against it and see what breaks.
3. Fix the field mapping in `src/lib/frazer/xml-adapter.ts` — **and only that file.**
4. Re-run `npm test`. Everything downstream should still pass. If a test outside `xml-adapter.test.ts` fails, feed field names have leaked out of the adapter and that is a bug to fix.
5. Ask the dealer to enter one real vehicle in Frazer and photograph it in Sidekick, then run a manual sync from `/admin/sync` and confirm it appears end to end.

### Specific things to check in the real feed

Each of these was found by probing the adapter with inputs the synthetic fixtures do not cover. None can be resolved without a real sample.

| Check | Why it matters |
|---|---|
| **Does any data element carry attributes?** e.g. `<Price currency="USD">9995</Price>` | Handled now — attributes are ignored and `str()` unwraps `#text` — but confirm no attribute carries information we actually need. |
| **Does the feed use XML namespaces?** e.g. `<ns:Vehicle>` | The adapter matches unprefixed tag names, case-sensitively. A namespaced feed currently throws "missing Inventory root". Deliberately not handled on speculation. |
| **What does the endpoint return on failure?** | An auth expiry or maintenance page returning HTML is *well-formed XML*. The adapter now throws on a missing `Inventory` root rather than reporting an empty lot, so this surfaces as a parse failure, not a phantom sellout. |
| **Are special characters numeric character references?** e.g. `&#39;` | A .NET-generated feed plausibly encodes apostrophes this way. Undecoded, they render literally in descriptions on the public site. |
| **Do the tag names actually match?** | The expected single-file rewrite point. Everything above is secondary to this. |

## Known limitations

**Slug collisions are possible but fail safely.** `buildSlug` disambiguates with the last 8 characters of the source key. Two different VINs can theoretically share those 8 characters. If it happens, the unique index rejects the insert, the transaction rolls back, and the run is recorded as failed with last-good data intact — loud and safe, which is the correct direction to fail. Add a numeric suffix fallback only if it ever actually occurs.

**`MAX_YEAR` is computed once at module load.** `normalize.ts` sets `MAX_YEAR = new Date().getFullYear() + 2` at import time, so the acceptable year ceiling is fixed for the life of the process rather than evaluated per call. On Vercel this is harmless — lambdas are short-lived and the ceiling is two years out — but it is a hidden time dependency, and any test that pins a year near the boundary will behave differently depending on when it runs. If this ever needs to be deterministic, pass the current year in rather than reading the clock inside the module.

**`titleCase` preserves short tokens, and that cuts both ways.** It rewrites a value only when the whole string is uppercase, and then preserves any token of three characters or fewer, or containing a digit. This keeps automotive acronyms intact — LT, XLE, SLT, GMC, BMW, SUV, SR5, 4WD — which is the common case and the one that looks broken when wrong.

The cost is that legitimately short English words are preserved too. `CREW CAB PICKUP` becomes `Crew CAB Pickup`, and `KIA` stays `KIA`. There is no length cutoff that fixes both: `CAB` and `SLT` are the same shape, so any rule producing `Cab` also produces `Slt`.

Accepted deliberately rather than solved, for three reasons. It only triggers when a dealer types a field entirely in capitals. The failure is cosmetic and readable, unlike `Lt` or `Bmw`, which look like bugs. And we have not seen a single real Frazer record, so tuning casing rules now is guesswork — a hardcoded word list added on speculation is likelier to be wrong than the rule it replaces. **Revisit once the real feed lands and we know how the dealer actually types.**

**`buildSlug` assumes a non-empty `sourceKey`, and that assumption is enforced upstream.** With an empty `sourceKey` and every other field null, the transform pipeline reduces to an empty string, which would break the URL and violate the unique index. Nothing in `slug.ts` guards against this. It is unreachable because `normalizeVehicle` (Task 6) returns `null` for any vehicle with neither VIN nor stock number, so a vehicle without a source key never reaches slug generation. If that guard is ever relaxed, `buildSlug` needs its own.

**A vehicle can move between identity keys.** If a dealer saves a car with a blank VIN (keyed on stock number) and later fills the VIN in, the source key changes, so the old record is marked sold and a new one is created. This is rare and self-correcting, but it is why `sourceKeyType` is stored — it makes the situation diagnosable from the admin page instead of mysterious.

## What this plan deliberately leaves out

- **The public website.** Separate plan.
- **The SFTP adapter** for the Frazer Partner Program. Add a `sftp-adapter.ts` implementing `FeedAdapter` when approval lands; nothing else changes.
- **Alert delivery.** Sync failures are recorded in `sync_runs` and visible on the admin page, but nothing emails or texts yet. Wire this up alongside lead notifications in the site plan so there is one notification path, not two.
- **Sold-page 301 redirects.** `SOLD_PAGE_RETENTION_DAYS` is defined here; the redirect belongs with routing in the site plan.
- **The minimum-photo guard (spec §4.7).** Zero-photo vehicles are ingested and stored by this plan, as the spec requires. Excluding them from listing pages and 404ing their VDP is a query and routing concern, so it belongs in the site plan.
- **Persisting the raw feed snapshot.** `runSyncCore` returns `rawSnapshot` and `sync_runs.raw_snapshot_ref` exists to hold a pointer to it, but nothing uploads it yet. Wire this to blob storage when the real feed arrives — replaying a real bad feed is worth far more than replaying a synthetic one.
- **Hide/unhide UI.** The `hidden` status is fully respected by the reconciliation planner and covered by tests; only the admin button is missing. It belongs with the rest of the vehicle admin in the site plan.

## Findings carried forward to the site plan

Surfaced during review of Task 1. Neither belongs to the ingest pipeline, and both will cause real problems if forgotten.

**There are two copies of `sharp` in this project.** Next declares `sharp` as its own optional dependency for `next/image`, and because its range (`^0.34.3`) conflicts with ours (`^0.35.3`), npm nests a private copy at `next/node_modules/sharp@0.34.5` — which currently carries a high-severity advisory. Our photo pipeline uses the safe top-level copy. But if the site renders feed photos through `next/image`, that is a *different* code path running the vulnerable copy against images downloaded from a third party. `npm ls sharp` does not reveal the nested copy. Decide deliberately in the site plan whether feed photos go through `next/image` at all — our pipeline already emits pre-sized WebP variants, so `next/image` optimization is arguably redundant for them.

**The default Next.js starter content is still in place.** `src/app/layout.tsx` exports `metadata.title = "Create Next App"`, `src/app/page.tsx` is boilerplate, and `README.md` is the generic template. Task 1 was scoped to scaffolding only, so leaving them was correct — but no task in this plan revisits them, and shipping a dealership site whose browser tab reads "Create Next App" is exactly the kind of thing that survives to production. The site plan must own replacing all three.
