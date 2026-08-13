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
