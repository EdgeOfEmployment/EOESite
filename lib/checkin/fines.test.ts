import { describe, it, expect } from 'vitest'
import { buildMonthlyFineTotals } from './fines'

describe('buildMonthlyFineTotals', () => {
  it('sums fine amounts per member for the given posts', () => {
    const members = [
      { id: 'u1', name: '김민수' },
      { id: 'u2', name: '이지은' },
    ]
    const posts = [
      { authorId: 'u1', fineAmount: 10000 },
      { authorId: 'u1', fineAmount: 11000 },
      { authorId: 'u2', fineAmount: 0 },
    ]

    expect(buildMonthlyFineTotals(members, posts)).toEqual([
      { member: { id: 'u1', name: '김민수' }, totalFine: 21000 },
      { member: { id: 'u2', name: '이지은' }, totalFine: 0 },
    ])
  })

  it('returns zero for a member with no posts this month', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildMonthlyFineTotals(members, [])).toEqual([{ member: { id: 'u1', name: '김민수' }, totalFine: 0 }])
  })
})
