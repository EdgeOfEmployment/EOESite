import { describe, it, expect } from 'vitest'
import { buildMonthlyFineTotals, groupLateFinesByMonth } from './fines'

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

describe('groupLateFinesByMonth', () => {
  it('groups rows by UTC calendar month, newest month first', () => {
    const rows = [
      { postId: 'p1', memberName: '김민수', createdAt: '2026-09-05T01:00:00.000Z', fineAmount: 11000, paid: false },
      { postId: 'p2', memberName: '이지은', createdAt: '2026-08-20T01:00:00.000Z', fineAmount: 10000, paid: true },
      { postId: 'p3', memberName: '김민수', createdAt: '2026-09-01T01:00:00.000Z', fineAmount: 12000, paid: false },
    ]

    expect(groupLateFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          { postId: 'p1', memberName: '김민수', createdAt: '2026-09-05T01:00:00.000Z', fineAmount: 11000, paid: false },
          { postId: 'p3', memberName: '김민수', createdAt: '2026-09-01T01:00:00.000Z', fineAmount: 12000, paid: false },
        ],
      },
      {
        monthLabel: '2026년 8월',
        rows: [
          { postId: 'p2', memberName: '이지은', createdAt: '2026-08-20T01:00:00.000Z', fineAmount: 10000, paid: true },
        ],
      },
    ])
  })

  it('preserves the input order of rows within a group', () => {
    const rows = [
      { postId: 'p1', memberName: 'a', createdAt: '2026-09-01T00:00:00.000Z', fineAmount: 1000, paid: false },
      { postId: 'p2', memberName: 'b', createdAt: '2026-09-02T00:00:00.000Z', fineAmount: 2000, paid: false },
    ]

    expect(groupLateFinesByMonth(rows)[0].rows.map((r) => r.postId)).toEqual(['p1', 'p2'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupLateFinesByMonth([])).toEqual([])
  })
})
