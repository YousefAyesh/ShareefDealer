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
