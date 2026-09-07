import { describe, it, expect } from 'vitest'
import { buildMonthlyFineTotals, groupFinesByMonth, type FineRow } from './fines'

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

describe('groupFinesByMonth', () => {
  it('groups rows by UTC calendar month, newest month first', () => {
    const rows: FineRow[] = [
      {
        id: 'p1',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-05T01:00:00.000Z',
        amount: 11000,
        paid: false,
      },
      {
        id: 'p2',
        kind: 'late',
        memberName: '이지은',
        createdAt: '2026-08-20T01:00:00.000Z',
        amount: 10000,
        paid: true,
      },
      {
        id: 'p3',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-01T01:00:00.000Z',
        amount: 12000,
        paid: false,
      },
    ]

    expect(groupFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          {
            id: 'p1',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-05T01:00:00.000Z',
            amount: 11000,
            paid: false,
          },
          {
            id: 'p3',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-01T01:00:00.000Z',
            amount: 12000,
            paid: false,
          },
        ],
      },
      {
        monthLabel: '2026년 8월',
        rows: [
          {
            id: 'p2',
            kind: 'late',
            memberName: '이지은',
            createdAt: '2026-08-20T01:00:00.000Z',
            amount: 10000,
            paid: true,
          },
        ],
      },
    ])
  })

  it('groups late and manual fines together within the same month', () => {
    const rows: FineRow[] = [
      {
        id: 'p1',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-05T01:00:00.000Z',
        amount: 11000,
        paid: false,
      },
      {
        id: 'm1',
        kind: 'manual',
        memberName: '김민수',
        createdAt: '2026-09-03T01:00:00.000Z',
        amount: 5000,
        paid: false,
        reason: '지각 3회 누적',
      },
    ]

    expect(groupFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          {
            id: 'p1',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-05T01:00:00.000Z',
            amount: 11000,
            paid: false,
          },
          {
            id: 'm1',
            kind: 'manual',
            memberName: '김민수',
            createdAt: '2026-09-03T01:00:00.000Z',
            amount: 5000,
            paid: false,
            reason: '지각 3회 누적',
          },
        ],
      },
    ])
  })

  it('preserves the input order of rows within a group', () => {
    const rows: FineRow[] = [
      { id: 'p1', kind: 'late', memberName: 'a', createdAt: '2026-09-01T00:00:00.000Z', amount: 1000, paid: false },
      { id: 'p2', kind: 'late', memberName: 'b', createdAt: '2026-09-02T00:00:00.000Z', amount: 2000, paid: false },
    ]

    expect(groupFinesByMonth(rows)[0].rows.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupFinesByMonth([])).toEqual([])
  })
})
