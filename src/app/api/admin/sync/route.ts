import { NextResponse } from 'next/server'
import { runSyncAndRecord } from '@/lib/frazer/sync-live'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  await runSyncAndRecord('manual')
  // Redirect back so the "Sync now" form lands on the refreshed page.
  return NextResponse.redirect(new URL('/admin/sync', request.url), { status: 303 })
}
