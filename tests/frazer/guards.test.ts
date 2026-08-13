import { describe, it, expect } from 'vitest'
import { checkFeedSanity, SHRINK_ABORT_THRESHOLD } from '@/lib/frazer/guards'

describe('checkFeedSanity', () => {
  it('accepts the first run with no baseline', () => {
    expect(checkFeedSanity({ incomingCount: 12, lastGoodCount: null })).toEqual({ ok: true })
  })

  it('aborts on an empty feed even with no baseline', () => {
    const r = checkFeedSanity({ incomingCount: 0, lastGoodCount: null })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/empty/i)
  })

  it('aborts on an empty feed with a baseline', () => {
    expect(checkFeedSanity({ incomingCount: 0, lastGoodCount: 40 }).ok).toBe(false)
  })

  it('accepts a steady feed', () => {
    expect(checkFeedSanity({ incomingCount: 40, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('accepts growth', () => {
    expect(checkFeedSanity({ incomingCount: 60, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('accepts normal attrition just above the threshold', () => {
    // 40 -> 25 is a 37.5% drop, under the 40% threshold
    expect(checkFeedSanity({ incomingCount: 25, lastGoodCount: 40 })).toEqual({ ok: true })
  })

  it('aborts on a catastrophic shrink', () => {
    // 40 -> 20 is a 50% drop
    const r = checkFeedSanity({ incomingCount: 20, lastGoodCount: 40 })
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toMatch(/50\.0%/)
  })

  it('aborts exactly at the threshold', () => {
    // 100 -> 60 is exactly a 40% drop
    expect(checkFeedSanity({ incomingCount: 60, lastGoodCount: 100 }).ok).toBe(false)
  })

  it('does not abort a tiny lot where one sale is a large percentage', () => {
    // 2 -> 1 is 50%, but below the small-lot floor
    expect(checkFeedSanity({ incomingCount: 1, lastGoodCount: 2 })).toEqual({ ok: true })
  })

  it('exports the threshold so it can be documented', () => {
    expect(SHRINK_ABORT_THRESHOLD).toBe(0.4)
  })
})
