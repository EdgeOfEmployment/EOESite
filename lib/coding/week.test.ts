import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatWeekHeader, getTodayDate, addDays, resolveCurrentWeek } from './week'

describe('formatWeekHeader', () => {
  it('formats a week as "{label} ({M/D}~{M/D})"', () => {
    expect(
      formatWeekHeader({ label: '1주차', startDate: '2026-09-08', endDate: '2026-09-14' })
    ).toBe('1주차 (9/8~9/14)')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(
      formatWeekHeader({ label: '2주차', startDate: '2026-01-06', endDate: '2026-01-09' })
    ).toBe('2주차 (1/6~1/9)')
  })
})

describe('getTodayDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T15:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current date as YYYY-MM-DD', () => {
    expect(getTodayDate()).toBe('2026-08-11')
  })
})

describe('addDays', () => {
  it('adds the given number of days to a date', () => {
    expect(addDays('2026-08-11', 6)).toBe('2026-08-17')
  })

  it('rolls over the month boundary correctly', () => {
    expect(addDays('2026-08-28', 6)).toBe('2026-09-03')
  })
})

describe('resolveCurrentWeek', () => {
  const weeks = [{ id: 'week-3' }, { id: 'week-2' }, { id: 'week-1' }]

  it('defaults to the newest (first) week when no id is requested', () => {
    const result = resolveCurrentWeek(weeks)
    expect(result.current?.id).toBe('week-3')
    expect(result.prevId).toBe('week-2')
    expect(result.nextId).toBeNull()
  })

  it('resolves to the requested week and computes older/newer neighbors', () => {
    const result = resolveCurrentWeek(weeks, 'week-2')
    expect(result.current?.id).toBe('week-2')
    expect(result.prevId).toBe('week-1')
    expect(result.nextId).toBe('week-3')
  })

  it('hides the older-week link on the oldest week', () => {
    const result = resolveCurrentWeek(weeks, 'week-1')
    expect(result.current?.id).toBe('week-1')
    expect(result.prevId).toBeNull()
    expect(result.nextId).toBe('week-2')
  })

  it('falls back to the newest week when the requested id does not exist', () => {
    const result = resolveCurrentWeek(weeks, 'unknown-id')
    expect(result.current?.id).toBe('week-3')
  })

  it('returns nulls when there are no weeks at all', () => {
    const result = resolveCurrentWeek([])
    expect(result.current).toBeNull()
    expect(result.prevId).toBeNull()
    expect(result.nextId).toBeNull()
  })
})
