/**
 * Scheduled Frazer inventory sync.
 *
 * NOT CURRENTLY SCHEDULED. There is no `crons` entry in vercel.json, for two
 * reasons:
 *
 *  1. Vercel's Hobby plan allows a cron to run at most once per day, so the
 *     15-minute schedule this needs is rejected at deploy time -- the whole
 *     deployment fails, not just the cron.
 *  2. There is no feed to sync from yet. Without FRAZER_FEED_URL this route
 *     throws, and without CRON_SECRET it 500s, so a daily schedule would do
 *     nothing but log an error every morning.
 *
 * The route itself still works and is safe to leave deployed: it refuses any
 * request without the CRON_SECRET bearer token, so it cannot be triggered by
 * anyone who finds the URL.
 *
 * TO RE-ENABLE, once the dealer has a Frazer feed URL (intake question 24)
 * and a Vercel Pro plan:
 *
 *   1. Set FRAZER_FEED_URL and CRON_SECRET in the Vercel project settings.
 *   2. Create vercel.json at the repo root:
 *
 *        { "crons": [{ "path": "/api/cron/sync", "schedule": "*\/15 * * * *" }] }
 *
 *   3. Set DEMO_MODE=false so the site reads from Postgres instead of the
 *      checked-in inventory files.
 *
 * On Hobby, the most frequent schedule that will deploy is once a day, e.g.
 * "0 9 * * *".
 */
import { NextResponse } from 'next/server'
import { runSyncAndRecord } from '@/lib/frazer/sync-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runSyncAndRecord('xml_feed')

  // 200 on abort: an abort is the safety system working correctly, not an error.
  return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 })
}
