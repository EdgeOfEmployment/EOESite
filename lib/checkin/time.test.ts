import { describe, it, expect } from 'vitest'
import {
  computeLateFine,
  formatKstTime,
  getKstDateString,
  kstDayRangeUtc,
  shiftKstDateString,
  formatKstDateHeading,
} from './time'

describe('computeLateFine', () => {
  it('is not late before 10:00:00 KST', () => {
    expect(computeLateFine('2026-08-10T00:59:59.000Z')).toEqual({ isLate: false, fineAmount: 0 })
  })

  it('charges the base fine at exactly 10:00:00 KST', () => {
    expect(computeLateFine('2026-08-10T01:00:00.000Z')).toEqual({ isLate: true, fineAmount: 10000 })
  })

  it('keeps the base fine through 10:04:59 KST', () => {
    expect(computeLateFine('2026-08-10T01:04:59.000Z')).toEqual({ isLate: true, fineAmount: 10000 })
  })

  it('adds 1000 won at 10:05:00 KST', () => {
    expect(computeLateFine('2026-08-10T01:05:00.000Z')).toEqual({ isLate: true, fineAmount: 11000 })
  })

  it('adds another 1000 won for each further 5-minute bracket', () => {
    expect(computeLateFine('2026-08-10T01:10:00.000Z')).toEqual({ isLate: true, fineAmount: 12000 })
    expect(computeLateFine('2026-08-10T01:15:00.000Z')).toEqual({ isLate: true, fineAmount: 13000 })
  })
})

describe('formatKstTime', () => {
  it('formats a morning time in KST', () => {
    expect(formatKstTime('2026-08-10T01:05:00.000Z')).toBe('오전 10:05')
  })

  it('formats an afternoon time in KST', () => {
    expect(formatKstTime('2026-08-10T09:30:00.000Z')).toBe('오후 6:30')
  })

  it('formats midnight KST as 오전 12', () => {
    expect(formatKstTime('2026-08-09T15:00:00.000Z')).toBe('오전 12:00')
  })
})

describe('getKstDateString', () => {
  it('returns the KST calendar date for a UTC instant that is still the same KST day', () => {
    expect(getKstDateString('2026-08-10T01:05:00.000Z')).toBe('2026-08-10')
  })

  it('rolls over to the next KST calendar date across the UTC day boundary', () => {
    expect(getKstDateString('2026-08-09T15:00:00.000Z')).toBe('2026-08-10')
  })
})

describe('kstDayRangeUtc', () => {
  it('returns the UTC instant range spanning one KST calendar day', () => {
    expect(kstDayRangeUtc('2026-08-10')).toEqual({
      start: '2026-08-09T15:00:00.000Z',
      end: '2026-08-10T15:00:00.000Z',
    })
  })

  it('round-trips with getKstDateString: any instant inside the range maps back to the same date', () => {
    const { start } = kstDayRangeUtc('2026-08-10')
    expect(getKstDateString(start)).toBe('2026-08-10')
  })
})

describe('shiftKstDateString', () => {
  it('shifts forward by a positive delta', () => {
    expect(shiftKstDateString('2026-08-10', 1)).toBe('2026-08-11')
  })

  it('shifts backward by a negative delta', () => {
    expect(shiftKstDateString('2026-08-10', -1)).toBe('2026-08-09')
  })

  it('rolls over a month boundary', () => {
    expect(shiftKstDateString('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('rolls over a year boundary', () => {
    expect(shiftKstDateString('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatKstDateHeading', () => {
  it('formats a date string as a Korean-style heading', () => {
    expect(formatKstDateHeading('2026-08-10')).toBe('2026년 8월 10일')
  })

  it('does not zero-pad the month or day', () => {
    expect(formatKstDateHeading('2026-01-05')).toBe('2026년 1월 5일')
  })
})
