import { describe, it, expect } from 'vitest'
import { resolveSelectedDate } from './date-param'

describe('resolveSelectedDate', () => {
  it('falls back to today when the param is missing or malformed', () => {
    expect(resolveSelectedDate(undefined, '2026-10-25')).toBe('2026-10-25')
    expect(resolveSelectedDate('2026-1-5', '2026-10-25')).toBe('2026-10-25')
  })

  it('falls back to today for a date that does not exist', () => {
    expect(resolveSelectedDate('2026-02-30', '2026-10-25')).toBe('2026-10-25')
  })

  it('keeps a past date', () => {
    expect(resolveSelectedDate('2026-10-20', '2026-10-25')).toBe('2026-10-20')
  })

  it('clamps a future date to today', () => {
    expect(resolveSelectedDate('2026-11-01', '2026-10-25')).toBe('2026-10-25')
  })
})
