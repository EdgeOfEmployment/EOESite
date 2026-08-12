import { describe, it, expect } from 'vitest'
import { buildMonthCalendar, groupPostsByMember } from './calendar'

describe('buildMonthCalendar', () => {
  it('places a post on the correct day cell', () => {
    const posts = [
      { id: 'p1', authorId: 'u1', authorName: '김민수', companyName: '토스', postDate: '2026-08-10' },
    ]

    const weeks = buildMonthCalendar(2026, 8, posts)
    const day10 = weeks.flat().find((day) => day.date === '2026-08-10')

    expect(day10?.posts).toHaveLength(1)
    expect(day10?.posts[0].id).toBe('p1')
  })

  it('marks days outside the target month as not in month', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    const outsideDays = weeks.flat().filter((day) => !day.inMonth)

    for (const day of outsideDays) {
      expect(day.date.startsWith('2026-08')).toBe(false)
    }
  })

  it('returns 6 weeks of 7 days each', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    expect(weeks).toHaveLength(6)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
    }
  })
})

describe('groupPostsByMember', () => {
  it('groups posts under their author and sorts by author name', () => {
    const posts = [
      { id: 'p1', authorId: 'u2', authorName: '이지은', companyName: '네이버', postDate: '2026-08-10' },
      { id: 'p2', authorId: 'u1', authorName: '김민수', companyName: '카카오', postDate: '2026-08-11' },
      { id: 'p3', authorId: 'u1', authorName: '김민수', companyName: '토스', postDate: '2026-08-12' },
    ]

    const grouped = groupPostsByMember(posts)

    expect(grouped.map((g) => g.authorName)).toEqual(['김민수', '이지은'])
    expect(grouped[0].posts).toHaveLength(2)
    expect(grouped[1].posts).toHaveLength(1)
  })
})
