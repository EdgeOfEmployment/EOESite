import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/coding',
  useRouter: () => ({ replace: vi.fn() }),
}))

const members = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', startDate: '2026-09-08', endDate: '2026-09-14' },
  { id: 'week-1', label: '1주차', startDate: '2026-09-01', endDate: '2026-09-07' },
]

const week2Problems = [
  {
    id: 'problem-2',
    title: '이분 탐색',
    link: 'https://example.com/2',
    createdBy: 'admin-1',
    createdAt: '2026-09-09T00:00:00.000Z',
    assigneeIds: [],
    checks: [],
  },
]

const week1Problems = [
  {
    id: 'problem-1',
    title: '투 포인터',
    link: 'https://example.com/1',
    createdBy: 'admin-1',
    createdAt: '2026-09-02T00:00:00.000Z',
    assigneeIds: [],
    checks: [],
  },
]

const getCodingWeekBoard = vi.fn(async (weekId: string) =>
  weekId === 'week-2' ? week2Problems : week1Problems
)

vi.mock('@/lib/coding/queries', () => ({
  getCodingMembers: vi.fn(async () => members),
  getCodingWeeks: vi.fn(async () => weeks),
  getCodingWeekBoard: (weekId: string) => getCodingWeekBoard(weekId),
}))

const sessionProfile = { userId: 'user-1', role: 'member', status: 'approved' }

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => sessionProfile),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { github_username: 'mkim' } }) }),
      }),
    }),
  })),
}))

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  updateGithubUsername: vi.fn(),
  deleteProblem: vi.fn(),
  adminRemoveCheck: vi.fn(),
  markSelfComplete: vi.fn(),
  unmarkSelfComplete: vi.fn(),
}))

import CodingPage, { TopNotice, GithubSettings, BoardContent } from './page'

beforeEach(() => {
  getCodingWeekBoard.mockClear()
  sessionProfile.role = 'member'
})

describe('CodingPage', () => {
  it('renders the static shell title without awaiting any data', () => {
    const ui = CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '코테 스터디' })).toBeInTheDocument()
  })
})

describe('CodingPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '문제를 등록하지 못했어요' }) })
    render(ui)

    expect(screen.getByText('문제를 등록하지 못했어요')).toBeInTheDocument()
  })
})

describe('CodingPage GithubSettings', () => {
  it("pre-fills the form with the caller's registered username", async () => {
    const ui = await GithubSettings()
    render(ui)

    expect(screen.getByPlaceholderText('GitHub 아이디')).toHaveValue('mkim')
  })
})

describe('CodingPage BoardContent', () => {
  it('renders the newest week by default and queries its problems', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-2')
    expect(screen.getByText('이분 탐색')).toBeInTheDocument()
  })

  it('renders the requested week when ?week= matches an existing week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-1')
    expect(screen.getByText('투 포인터')).toBeInTheDocument()
  })

  it('falls back to the newest week when ?week= does not match any week, so no unknown id reaches the cache key', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'unknown-id' }) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-2')
    expect(getCodingWeekBoard).not.toHaveBeenCalledWith('unknown-id')
  })

  it('shows only a previous-week link on the newest week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/coding?week=week-1')
    expect(screen.queryByRole('link', { name: '다음 주차 →' })).not.toBeInTheDocument()
  })

  it('shows only a next-week link on the oldest week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '다음 주차 →' })).toHaveAttribute('href', '/coding?week=week-2')
    expect(screen.queryByRole('link', { name: '← 이전 주차' })).not.toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.queryByRole('button', { name: '문제 등록' })).not.toBeInTheDocument()
  })

  it('shows the problem registration form for admins', async () => {
    sessionProfile.role = 'admin'
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })
})
