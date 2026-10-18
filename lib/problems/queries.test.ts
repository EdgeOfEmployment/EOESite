import { describe, it, expect, vi } from 'vitest'

const profiles = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이영희' },
]

const rows = [
  {
    id: 'p-2',
    company: '네이버',
    title: '최단 경로',
    signature: { params: [{ name: 'graph', type: 'int[][]' }], returnType: 'int' },
    created_by: 'user-2',
    created_at: '2026-10-18T00:00:00.000Z',
  },
  {
    id: 'p-1',
    company: '카카오',
    title: '두 수의 합',
    signature: { params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }], returnType: 'long' },
    created_by: 'gone',
    created_at: '2026-10-17T00:00:00.000Z',
  },
  {
    id: 'p-bad',
    company: '악성',
    title: '깨진 시그니처',
    signature: {},
    created_by: 'user-1',
    created_at: '2026-10-16T00:00:00.000Z',
  },
]

const detailRow = {
  id: 'p-1',
  company: '카카오',
  title: '두 수의 합',
  description_md: '설명',
  constraints_md: '',
  time_limit_ms: 1500,
  signature: rows[1].signature,
  test_cases: [{ args: [1, 2], expected: 3, isExample: true }],
  created_by: 'user-1',
  created_at: '2026-10-17T00:00:00.000Z',
  updated_at: '2026-10-18T00:00:00.000Z',
}

const cacheTagMock = vi.fn()
const orderSpy = vi.fn()
let detail: typeof detailRow | null = detailRow

vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => cacheTagMock(...tags),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () =>
            Object.assign(Promise.resolve({ data: profiles }), {
              eq: (_column: string, id: string) => ({
                maybeSingle: async () => ({ data: profiles.find((p) => p.id === id) ?? null }),
              }),
            }),
        }
      }
      if (table === 'bank_problems') {
        return {
          select: () => ({
            order: async (column: string, options: unknown) => {
              orderSpy(column, options)
              return { data: rows }
            },
            eq: () => ({ maybeSingle: async () => ({ data: detail }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import { getProblem, getProblemSummaries } from './queries'
import { MEMBER_NAMES_TAG, PROBLEM_BANK_TAG } from '@/lib/cache-tags'

describe('getProblemSummaries', () => {
  it('returns newest-first summaries with author names and signature shape, skipping malformed rows', async () => {
    const summaries = await getProblemSummaries()
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(summaries).toEqual([
      { id: 'p-2', company: '네이버', title: '최단 경로', authorName: '이영희', createdAt: '2026-10-18T00:00:00.000Z', returnType: 'int', paramCount: 1 },
      { id: 'p-1', company: '카카오', title: '두 수의 합', authorName: '알 수 없음', createdAt: '2026-10-17T00:00:00.000Z', returnType: 'long', paramCount: 2 },
    ])
    expect(cacheTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG, MEMBER_NAMES_TAG)
  })
})

describe('getProblem', () => {
  it('maps a row to a BankProblem with the author name', async () => {
    expect(await getProblem('p-1')).toEqual({
      id: 'p-1',
      company: '카카오',
      title: '두 수의 합',
      descriptionMd: '설명',
      constraintsMd: '',
      timeLimitMs: 1500,
      signature: rows[1].signature,
      testCases: detailRow.test_cases,
      createdBy: 'user-1',
      authorName: '김민수',
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-18T00:00:00.000Z',
    })
  })

  it('returns null when the stored row fails validation (code-injection param name)', async () => {
    detail = {
      ...detailRow,
      signature: { params: [{ name: 'n){system("x");int z(int m', type: 'int' }], returnType: 'int' },
      test_cases: [{ args: [1], expected: 3, isExample: true }],
    }
    expect(await getProblem('p-1')).toBeNull()
    detail = detailRow
  })

  it('returns null for an unknown id', async () => {
    detail = null
    expect(await getProblem('nope')).toBeNull()
    detail = detailRow
  })
})
