import { describe, it, expect } from 'vitest'
import { findWeekForDate, selectAssignedProblems, buildCodingDashboardWidget } from './dashboard-widget'

describe('findWeekForDate', () => {
  const weeks = [
    { id: 'week-2', startDate: '2026-09-08', endDate: '2026-09-14' },
    { id: 'week-1', startDate: '2026-09-01', endDate: '2026-09-07' },
  ]

  it('finds the week whose range contains the date', () => {
    expect(findWeekForDate(weeks, '2026-09-10')?.id).toBe('week-2')
  })

  it('is inclusive of the start date boundary', () => {
    expect(findWeekForDate(weeks, '2026-09-08')?.id).toBe('week-2')
  })

  it('is inclusive of the end date boundary', () => {
    expect(findWeekForDate(weeks, '2026-09-07')?.id).toBe('week-1')
  })

  it('returns null when no week contains the date', () => {
    expect(findWeekForDate(weeks, '2026-09-20')).toBeNull()
  })

  it('returns null when there are no weeks', () => {
    expect(findWeekForDate([], '2026-09-10')).toBeNull()
  })
})

describe('selectAssignedProblems', () => {
  const base = { link: 'https://example.com', createdAt: '2026-09-01T00:00:00.000Z' }

  it('includes problems with no assignees (targeted at everyone)', () => {
    const problems = [{ id: 'p1', title: 'A', assigneeIds: [], ...base }]
    const result = selectAssignedProblems(problems, [], 'user-1', 2)
    expect(result.map((r) => r.id)).toEqual(['p1'])
  })

  it('includes problems where the user is an explicit assignee', () => {
    const problems = [{ id: 'p1', title: 'A', assigneeIds: ['user-1', 'user-2'], ...base }]
    const result = selectAssignedProblems(problems, [], 'user-1', 2)
    expect(result.map((r) => r.id)).toEqual(['p1'])
  })

  it('excludes problems assigned only to other users', () => {
    const problems = [{ id: 'p1', title: 'A', assigneeIds: ['user-2'], ...base }]
    const result = selectAssignedProblems(problems, [], 'user-1', 2)
    expect(result).toEqual([])
  })

  it('marks a problem as completed when its id is in completedProblemIds', () => {
    const problems = [{ id: 'p1', title: 'A', assigneeIds: [], ...base }]
    const result = selectAssignedProblems(problems, ['p1'], 'user-1', 2)
    expect(result[0].completed).toBe(true)
  })

  it('sorts incomplete problems before completed ones', () => {
    const problems = [
      { id: 'p1', title: 'done', assigneeIds: [], createdAt: '2026-09-03T00:00:00.000Z', link: base.link },
      { id: 'p2', title: 'not-done', assigneeIds: [], createdAt: '2026-09-01T00:00:00.000Z', link: base.link },
    ]
    const result = selectAssignedProblems(problems, ['p1'], 'user-1', 2)
    expect(result.map((r) => r.id)).toEqual(['p2', 'p1'])
  })

  it('breaks ties within the same completion status by newest first', () => {
    const problems = [
      { id: 'p1', title: 'older', assigneeIds: [], createdAt: '2026-09-01T00:00:00.000Z', link: base.link },
      { id: 'p2', title: 'newer', assigneeIds: [], createdAt: '2026-09-05T00:00:00.000Z', link: base.link },
    ]
    const result = selectAssignedProblems(problems, [], 'user-1', 2)
    expect(result.map((r) => r.id)).toEqual(['p2', 'p1'])
  })

  it('limits the result to the given count without indicating overflow', () => {
    const problems = [
      { id: 'p1', title: 'a', assigneeIds: [], createdAt: '2026-09-01T00:00:00.000Z', link: base.link },
      { id: 'p2', title: 'b', assigneeIds: [], createdAt: '2026-09-02T00:00:00.000Z', link: base.link },
      { id: 'p3', title: 'c', assigneeIds: [], createdAt: '2026-09-03T00:00:00.000Z', link: base.link },
    ]
    const result = selectAssignedProblems(problems, [], 'user-1', 2)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['p3', 'p2'])
  })
})

describe('buildCodingDashboardWidget', () => {
  const weeks = [{ id: 'week-1', label: '1주차', startDate: '2026-09-08', endDate: '2026-09-14' }]

  it('returns no-week when today is not inside any coding_weeks range', () => {
    const result = buildCodingDashboardWidget(weeks, [], [], 'user-1', '2026-09-20', 2)
    expect(result).toEqual({ status: 'no-week', week: null, items: [] })
  })

  it('returns no-problems when the week has zero problems', () => {
    const result = buildCodingDashboardWidget(weeks, [], [], 'user-1', '2026-09-10', 2)
    expect(result.status).toBe('no-problems')
    expect(result.week?.id).toBe('week-1')
    expect(result.items).toEqual([])
  })

  it('returns no-assignment when problems exist but none are assigned to the user', () => {
    const problems = [
      {
        id: 'p1',
        title: 'A',
        link: 'https://example.com',
        createdAt: '2026-09-08T00:00:00.000Z',
        assigneeIds: ['someone-else'],
      },
    ]
    const result = buildCodingDashboardWidget(weeks, problems, [], 'user-1', '2026-09-10', 2)
    expect(result.status).toBe('no-assignment')
    expect(result.week?.id).toBe('week-1')
    expect(result.items).toEqual([])
  })

  it('returns assigned with the selected items when the user has assigned problems', () => {
    const problems = [
      {
        id: 'p1',
        title: 'A',
        link: 'https://example.com',
        createdAt: '2026-09-08T00:00:00.000Z',
        assigneeIds: [],
      },
    ]
    const result = buildCodingDashboardWidget(weeks, problems, [], 'user-1', '2026-09-10', 2)
    expect(result.status).toBe('assigned')
    expect(result.week?.id).toBe('week-1')
    expect(result.items.map((i) => i.id)).toEqual(['p1'])
  })
})
