import { describe, expect, it } from 'vitest'
import { DEALER, formatHours, formatTime, hoursToday, openingHoursSpecification, placeholderProblems } from '@/lib/dealer'

describe('formatTime', () => {
  it('renders midnight and noon as 12, not 0', () => {
    expect(formatTime('00:00')).toBe('12:00 AM')
    expect(formatTime('12:00')).toBe('12:00 PM')
  })

  it('renders morning and evening correctly', () => {
    expect(formatTime('09:00')).toBe('9:00 AM')
    expect(formatTime('19:30')).toBe('7:30 PM')
  })
})

describe('formatHours', () => {
  it('returns one entry per day of the week', () => {
    expect(formatHours()).toHaveLength(7)
  })

  it('labels a day with no open/close as Closed', () => {
    const sunday = formatHours().find((d) => d.day === 'Sunday')
    expect(sunday?.isClosed).toBe(true)
    expect(sunday?.label).toBe('Closed')
  })
})

describe('hoursToday', () => {
  it('uses the dealer timezone, not the server timezone', () => {
    // 02:00 UTC on Monday is still Sunday evening in America/Chicago. A
    // server in UTC would advertise Monday's hours to someone standing
    // outside a lot that is closed.
    const mondayEarlyUtc = new Date('2026-08-31T02:00:00Z')
    expect(DEALER.timezone).toBe('America/Chicago')
    expect(hoursToday(mondayEarlyUtc).day).toBe('Sunday')
  })

  it('returns the matching weekday during business hours', () => {
    const wednesdayNoonUtc = new Date('2026-08-26T17:00:00Z')
    expect(hoursToday(wednesdayNoonUtc).day).toBe('Wednesday')
  })
})

describe('openingHoursSpecification', () => {
  it('omits closed days entirely rather than emitting an empty range', () => {
    const spec = openingHoursSpecification()
    expect(spec.some((s) => s.dayOfWeek.endsWith('Sunday'))).toBe(false)
    expect(spec).toHaveLength(6)
  })

  it('emits 24-hour times, which is what schema.org requires', () => {
    expect(openingHoursSpecification()[0].opens).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('placeholderProblems', () => {
  it('flags the current placeholder data so a production build cannot ship it', () => {
    // This test is expected to FLIP once the client's real details land:
    // when it starts failing, delete it and replace with `toEqual([])`.
    const problems = placeholderProblems()
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join(' ')).toMatch(/phone/i)
  })
})
