import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * The Drizzle client, created lazily on first use.
 *
 * The obvious version of this file throws at module scope when
 * DATABASE_URL is unset. That breaks demo mode: src/lib/inventory.ts
 * imports `db` unconditionally at the top of the file, so merely loading
 * the inventory module evaluates this one -- and every page renders
 * inventory. The result is a site that cannot boot without a database even
 * when DEMO_MODE=true and it is never going to run a query, which is
 * exactly the configuration used to deploy before the Frazer feed exists.
 *
 * Deferring to first property access moves the error to the moment
 * something actually tries to talk to Postgres. Demo mode never gets
 * there, so it needs no database configuration at all.
 */
type Db = ReturnType<typeof drizzle<typeof schema>>
type DbClient = ReturnType<typeof postgres>

const globalForDb = globalThis as unknown as {
  dbClient: DbClient | undefined
  dbInstance: Db | undefined
}

function initDb(): Db {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Set it, or set DEMO_MODE=true to serve the ' +
        'checked-in inventory instead of querying Postgres.',
    )
  }

  const client = globalForDb.dbClient ?? postgres(url, { prepare: false, max: 1 })
  if (process.env.NODE_ENV !== 'production') globalForDb.dbClient = client

  return drizzle(client, { schema })
}

/**
 * A Proxy rather than a getter so `db` keeps the shape of a Drizzle client
 * for both callers and TypeScript. Methods are bound to the real instance,
 * since Drizzle's query builders rely on `this`.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    globalForDb.dbInstance ??= initDb()
    const instance = globalForDb.dbInstance
    const value = Reflect.get(instance, prop, instance)
    return typeof value === 'function' ? value.bind(instance) : value
  },
})
