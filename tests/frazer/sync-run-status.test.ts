import { describe, it, expect } from 'vitest'
import {
  isPresumedInterrupted,
  SYNC_MAX_DURATION_SECONDS,
  INTERRUPTED_MARGIN_MINUTES,
} from '@/lib/frazer/sync-run-status'

const minutesAgo = (n: number, from: Date) => new Date(from.getTime() - n * 60_000)

describe('isPresumedInterrupted', () => {
  it('treats a running row started well within the max-duration-plus-margin window as still live', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const run = { status: 'running', startedAt: minutesAgo(5, now) }
    expect(isPresumedInterrupted(run, now)).toBe(false)
  })

  it('treats a running row older than the max-duration-plus-margin window as interrupted', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const run = { status: 'running', startedAt: minutesAgo(20, now) }
    expect(isPresumedInterrupted(run, now)).toBe(true)
  })

  it('does not flag a running row exactly at the threshold as interrupted', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const thresholdMinutes = SYNC_MAX_DURATION_SECONDS / 60 + INTERRUPTED_MARGIN_MINUTES
    const run = { status: 'running', startedAt: minutesAgo(thresholdMinutes, now) }
    expect(isPresumedInterrupted(run, now)).toBe(false)
  })

  it('never flags a non-running row as interrupted, no matter how old', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const run = { status: 'success', startedAt: minutesAgo(60 * 24, now) }
    expect(isPresumedInterrupted(run, now)).toBe(false)
  })

  it('never flags an aborted row as interrupted', () => {
    const now = new Date('2026-08-12T12:00:00Z')
    const run = { status: 'aborted', startedAt: minutesAgo(60, now) }
    expect(isPresumedInterrupted(run, now)).toBe(false)
  })
})
