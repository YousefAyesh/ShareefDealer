import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set')
}

type DbClient = ReturnType<typeof postgres>

const globalForDb = globalThis as unknown as {
  dbClient: DbClient | undefined
}

const client =
  globalForDb.dbClient ??
  postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.dbClient = client
}

export const db = drizzle(client, { schema })
