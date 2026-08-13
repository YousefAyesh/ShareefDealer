import {
  pgTable, text, integer, timestamp, boolean, jsonb, uuid, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Identity. sourceKey is what we matched on; see reconcile-plan.ts.
  sourceKey: text('source_key').notNull(),
  sourceKeyType: text('source_key_type').notNull(), // 'vin' | 'stock'
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

  status: text('status').notNull().default('available'), // 'available' | 'sold' | 'hidden'
  priceReduced: boolean('price_reduced').notNull().default(false),

  sourceHash: text('source_hash').notNull(),
  vinDecoded: jsonb('vin_decoded').$type<Record<string, string>>(),

  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  soldAt: timestamp('sold_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('vehicle_photos_vehicle_hash_idx').on(t.vehicleId, t.contentHash),
])

export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source').notNull(),  // 'xml_feed' | 'sftp' | 'manual'
  status: text('status').notNull(),  // 'running' | 'success' | 'aborted' | 'failed'
  startedAt: timestamp('started_at').notNull().defaultNow(),
  finishedAt: timestamp('finished_at'),
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
  status: text('status').notNull().default('new'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
