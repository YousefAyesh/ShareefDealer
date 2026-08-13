import { eq, inArray } from 'drizzle-orm'
import type { CanonicalVehicle } from './types'
import type { ReconcilePlan } from './reconcile-plan'

/** Sold VDPs stay live this long before redirecting, to preserve search ranking. */
export const SOLD_PAGE_RETENTION_DAYS = 30

export type ReconcileCounts = {
  created: number
  updated: number
  markedSold: number
  restored: number
}

/**
 * Maps a CanonicalVehicle onto a `vehicles` row.
 *
 * Deliberately omits `status`: the sync must never overwrite a manual
 * `hidden` override. Status transitions happen only via the explicit
 * markSold / restore paths below. Photos live in their own table.
 */
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
  // Imported lazily so this module — and toVehicleRow, which is pure and
  // unit-tested without a database — can be loaded in a test process that
  // has no DATABASE_URL. See src/db/index.ts, which throws at import time
  // if that env var is missing.
  const { db } = await import('@/db')
  const { vehicles } = await import('@/db/schema')

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

    // Applied regardless of whether these ids also appear in unchangedIds —
    // toRestore is authoritative for status. See reconcile-plan.ts.
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
