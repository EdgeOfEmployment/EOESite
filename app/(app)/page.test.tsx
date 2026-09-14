import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const todaysAuthorIds = ['user-1']

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

// `connection()` requires a real Next.js request scope, which this render-function-level
// test does not run inside — mock it as a no-op so `TodayAlert`/`StatusTable`/`FineTables`
// can await it the same way they do in the real request/build lifecycle.
vi.mock('next/server', () => ({
  connection: vi.fn(async () => undefined),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members.map((m) => ({ id: m.id, name: m.name })) }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: (columns: string) => ({
            gte: () => ({
              lt: async () =>
                columns === 'author_id'
                  ? { data: todaysAuthorIds.map((id) => ({ author_id: id })) }
                  : {
                      data: [
                        { author_id: 'user-1', fine_amount: 3000, paid: false },
                        { author_id: 'user-1', fine_amount: 2000, paid: true },
                      ],
                    },
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: () => ({
            gte: () => ({ lt: async () => ({ data: [{ user_id: 'user-2', amount: 1000, paid: false }] }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

const sessionProfile = { userId: 'user-1', role: 'member', status: 'approved' }

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => sessionProfile),
}))

vi.mock('@/lib/coding/queries', () => ({
  getCodingWeeks: vi.fn(async () => [
    { id: 'week-1', label: '1주차', startDate: '2000-01-01', endDate: '2099-12-31' },
  ]),
  getCodingWeekBoard: vi.fn(async () => [
    {
      id: 'problem-1',
      title: '투 포인터',
      link: 'https://example.com/1',
      createdBy: 'admin-1',
      createdAt: '2026-09-02T00:00:00.000Z',
      assigneeIds: ['user-1'],
      checks: [],
    },
  ]),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }),
    }),
  })),
}))

import DashboardPage, { TodayAlert, StatusTable, CodingWidget, FineTables } from './page'

beforeEach(() => {
  sessionProfile.status = 'approved'
})

describe('DashboardPage', () => {
  it('renders the static shell title and the checkin link without awaiting any data', () => {
    const ui = DashboardPage()
    render(ui)

    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('DashboardPage TodayAlert', () => {
  it('shows the completed alert for a caller who posted today', async () => {
    const ui = await TodayAlert()
    render(ui)

    expect(screen.getByText('오늘의 10시 인증을 완료했어요!')).toBeInTheDocument()
  })
})

describe('DashboardPage StatusTable', () => {
  it("tags today's status with the per-day checkin-feed tag that /checkin already uses, and ticks the members who posted today", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const ui = await StatusTable()
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith(expect.stringMatching(/^checkin-feed-\d{4}-\d{2}-\d{2}$/), 'member-names')
    expect(cacheLife).toHaveBeenCalledWith('seconds')
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })
})

describe('DashboardPage CodingWidget', () => {
  it('renders the assigned problem for an approved member', async () => {
    const ui = await CodingWidget()
    render(ui)

    expect(screen.getByRole('link', { name: '투 포인터' })).toHaveAttribute('href', 'https://example.com/1')
    expect(screen.getByRole('link', { name: '코딩 보드 바로가기' })).toHaveAttribute('href', '/coding?week=week-1')
  })

  it('renders nothing for a member who is not approved', async () => {
    sessionProfile.status = 'pending'
    const ui = await CodingWidget()

    expect(ui).toBeNull()
  })
})

describe('DashboardPage FineTables', () => {
  it('tags the fine tables with the fines tag and totals unpaid and all fines per member', async () => {
    const { cacheTag } = await import('next/cache')
    const ui = await FineTables()
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('fines', 'member-names')
    expect(
      screen.getByText(
        `미납액 합계 ${(4000).toLocaleString('ko-KR')}원 · 벌금 총액 합계 ${(6000).toLocaleString('ko-KR')}원`
      )
    ).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })
})
