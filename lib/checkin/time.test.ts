import { describe, it, expect } from 'vitest'
import { computeLateFine, formatKstTime } from './time'

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
