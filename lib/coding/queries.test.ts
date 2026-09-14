import { describe, it, expect, vi, beforeEach } from 'vitest'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', start_date: '2026-09-08', end_date: '2026-09-14' },
  { id: 'week-1', label: '1주차', start_date: '2026-09-01', end_date: '2026-09-07' },
]

const problems = [
  {
    id: 'problem-1',
    title: '투 포인터',
    link: 'https://example.com/1',
    created_by: 'admin-1',
    created_at: '2026-09-09T00:00:00.000Z',
    assignee_ids: ['user-1'],
  },
]

const checks = [
  { problem_id: 'problem-1', user_id: 'user-1', commit_sha: 'abc123', file_path: 'src/two.py', source: 'auto' },
]

const eqSpy = vi.fn()

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: profiles }) }) }
      }
      if (table === 'coding_weeks') {
        return { select: () => ({ order: () => ({ order: async () => ({ data: weeks }) }) }) }
      }
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: async (column: string, value: string) => {
              eqSpy(column, value)
              return { data: problems }
            },
          }),
        }
      }
      if (table === 'coding_checks') {
        return { select: () => ({ in: async () => ({ data: checks }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import { getCodingMembers, getCodingWeeks, getCodingWeekBoard } from './queries'
import { CODING_BOARD_TAG, MEMBER_NAMES_TAG } from '@/lib/cache-tags'

beforeEach(() => {
  eqSpy.mockClear()
})

describe('getCodingMembers', () => {
  it('returns approved members and tags the shared coding-board cache', async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const result = await getCodingMembers()

    expect(result).toEqual([
      { id: 'admin-1', name: '관리자' },
      { id: 'user-1', name: '김민수' },
    ])
    expect(cacheTag).toHaveBeenCalledWith(CODING_BOARD_TAG, MEMBER_NAMES_TAG)
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })
})

describe('CODING_BOARD_TAG', () => {
  it('is the string every coding-board mutation must invalidate with', () => {
    // Sibling to the assertion above, which only proves getCodingMembers tags with whatever
    // CODING_BOARD_TAG happens to equal — this pins the literal value itself, matching how
    // FINES_TAG is pinned in lib/checkin/fines.test.ts (Task 4, Step 1).
    expect(CODING_BOARD_TAG).toBe('coding-board')
  })
})

describe('getCodingWeeks', () => {
  it('returns weeks newest-first and tags the shared coding-board cache', async () => {
    const { cacheTag } = await import('next/cache')
    const result = await getCodingWeeks()

    expect(result).toEqual([
      { id: 'week-2', label: '2주차', startDate: '2026-09-08', endDate: '2026-09-14' },
      { id: 'week-1', label: '1주차', startDate: '2026-09-01', endDate: '2026-09-07' },
    ])
    expect(cacheTag).toHaveBeenCalledWith(CODING_BOARD_TAG)
  })
})

describe('getCodingWeekBoard', () => {
  it('queries problems for the given week and attaches their checks', async () => {
    const result = await getCodingWeekBoard('week-2')

    expect(eqSpy).toHaveBeenCalledWith('week_id', 'week-2')
    expect(result).toEqual([
      {
        id: 'problem-1',
        title: '투 포인터',
        link: 'https://example.com/1',
        createdBy: 'admin-1',
        createdAt: '2026-09-09T00:00:00.000Z',
        assigneeIds: ['user-1'],
        checks: [{ userId: 'user-1', commitSha: 'abc123', filePath: 'src/two.py', source: 'auto' }],
      },
    ])
  })
})
