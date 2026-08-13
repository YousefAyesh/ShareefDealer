import { desc } from 'drizzle-orm'
import { db } from '@/db'
import { syncRuns } from '@/db/schema'
import { isPresumedInterrupted } from '@/lib/frazer/sync-run-status'

export const dynamic = 'force-dynamic'

const DEALER_TIMEZONE = process.env.DEALER_TIMEZONE || 'America/New_York'
const MAX_ERRORS_SHOWN = 5

function formatTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DEALER_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZoneName: 'short',
  }).format(date)
}

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800 border border-green-300',
  aborted: 'bg-amber-100 text-amber-800 border border-amber-300',
  failed: 'bg-red-100 text-red-800 border border-red-300',
  running: 'bg-blue-100 text-blue-800 border border-blue-300',
  // A running row presumed killed by a hard timeout, not genuinely in
  // flight. Distinct color from 'running' so it doesn't read as live.
  interrupted: 'bg-gray-200 text-gray-700 border border-gray-400',
}

function StatusBadge({ status, interrupted }: { status: string; interrupted: boolean }) {
  const label = interrupted ? 'interrupted' : status
  const style = STATUS_STYLES[label] ?? 'bg-gray-100 text-gray-800 border border-gray-300'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  )
}

function NotesCell({
  abortReason, errors, interrupted,
}: { abortReason: string | null; errors: string[]; interrupted: boolean }) {
  if (interrupted) {
    return (
      <div className="max-w-md text-xs text-gray-600">
        This run was killed before it could report — presumed interrupted by
        the function timeout, not a genuine failure. Any progress made
        before the kill was already committed.
      </div>
    )
  }
  if (!abortReason && errors.length === 0) {
    return <span className="text-gray-400">—</span>
  }
  const shown = errors.slice(0, MAX_ERRORS_SHOWN)
  const remaining = errors.length - shown.length
  return (
    <div className="max-w-md space-y-1 text-xs text-gray-700">
      {abortReason && <div className="font-medium text-amber-700">{abortReason}</div>}
      {shown.length > 0 && (
        <ul className="list-inside list-disc space-y-0.5">
          {shown.map((err, i) => (
            <li key={i} className="break-words">{err}</li>
          ))}
        </ul>
      )}
      {remaining > 0 && (
        <div className="text-gray-500">+{remaining} more</div>
      )}
    </div>
  )
}

export default async function AdminSyncPage() {
  const runs = await db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(50)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Sync status</h1>
        <form action="/api/admin/sync" method="POST">
          <button
            type="submit"
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            Sync now
          </button>
        </form>
      </div>

      {runs.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-gray-500">
          No sync runs yet. Click &quot;Sync now&quot; to run one, or wait for the next scheduled run.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Started</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Seen</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Created</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Updated</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Sold</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Photos</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((run) => {
                const interrupted = isPresumedInterrupted(run)
                return (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                      {formatTimestamp(run.startedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={run.status} interrupted={interrupted} />
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{run.vehiclesSeen}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{run.created}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{run.updated}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{run.markedSold}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{run.photosProcessed}</td>
                    <td className="px-3 py-2">
                      <NotesCell abortReason={run.abortReason} errors={run.errors} interrupted={interrupted} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
