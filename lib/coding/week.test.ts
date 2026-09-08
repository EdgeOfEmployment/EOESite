import { describe, it, expect } from 'vitest'
import { getMostRecentTuesday, formatWeekLabel, groupByWeek, getWeekDueDate, formatDueDateLabel } from './week'

describe('getMostRecentTuesday', () => {
  it('returns the same date when given a Tuesday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-11T12:00:00.000Z'))).toBe('2026-08-11')
  })

  it('returns the prior Tuesday when given a Wednesday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-12T12:00:00.000Z'))).toBe('2026-08-11')
  })

  it('returns the prior Tuesday when given a Monday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-10T12:00:00.000Z'))).toBe('2026-08-04')
  })

  it('returns the prior Tuesday when given a Sunday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-09T12:00:00.000Z'))).toBe('2026-08-04')
  })
})

describe('formatWeekLabel', () => {
  it('formats a week-of date as "M/D 주차"', () => {
    expect(formatWeekLabel('2026-08-11')).toBe('8/11 주차')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(formatWeekLabel('2026-01-06')).toBe('1/6 주차')
  })
})

describe('groupByWeek', () => {
  it('groups items by weekOf and sorts newest week first', () => {
    const items = [
      { id: 'a', weekOf: '2026-08-04' },
      { id: 'b', weekOf: '2026-08-11' },
      { id: 'c', weekOf: '2026-08-04' },
    ]

    const groups = groupByWeek(items)

    expect(groups.map((g) => g.weekOf)).toEqual(['2026-08-11', '2026-08-04'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'c'])
  })
})

describe('getWeekDueDate', () => {
  it('returns 6 days after the week-of date', () => {
    expect(getWeekDueDate('2026-08-11')).toBe('2026-08-17')
  })

  it('rolls over the month boundary correctly', () => {
    expect(getWeekDueDate('2026-08-28')).toBe('2026-09-03')
  })
})

describe('formatDueDateLabel', () => {
  it('formats a due date as "M/D 마감"', () => {
    expect(formatDueDateLabel('2026-08-17')).toBe('8/17 마감')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(formatDueDateLabel('2026-09-03')).toBe('9/3 마감')
  })
})
