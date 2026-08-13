/** Vercel function timeout shared by /api/cron/sync and /api/admin/sync. */
export const SYNC_MAX_DURATION_SECONDS = 300

/**
 * Extra time beyond maxDuration before a `status: 'running'` sync_runs row
 * is presumed killed rather than genuinely still in flight. A hard Vercel
 * timeout leaves no chance to write a final status, so a stuck row and a
 * live one are otherwise indistinguishable from the stored data alone.
 */
export const INTERRUPTED_MARGIN_MINUTES = 10

export type RunStatusInput = {
  status: string
  startedAt: Date
}

/**
 * Display-time inference only -- never mutates the database. A `running`
 * row older than maxDuration + margin is almost certainly an orphan left
 * behind by an invocation that got killed before it could report; treat it
 * as interrupted for rendering purposes so the admin page doesn't show a
 * run that looks perpetually "in progress".
 */
export function isPresumedInterrupted(run: RunStatusInput, now: Date = new Date()): boolean {
  if (run.status !== 'running') return false
  const thresholdMs = (SYNC_MAX_DURATION_SECONDS + INTERRUPTED_MARGIN_MINUTES * 60) * 1000
  return now.getTime() - run.startedAt.getTime() > thresholdMs
}
