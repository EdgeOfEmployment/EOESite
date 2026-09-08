import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/coding',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', start_date: '2026-09-15', end_date: '2026-09-21' },
  { id: 'week-1', label: '1주차', start_date: '2026-09-08', end_date: '2026-09-14' },
]

const problems = [
  {
    id: 'problem-1',
    title: '두 수의 합',
    link: 'https://example.com/problem/1',
    created_by: 'admin-1',
    created_at: '2026-09-08T00:00:00.000Z',
    assignee_ids: [],
  },
]

const checks = [{ problem_id: 'problem-1', user_id: 'user-1', commit_sha: null, file_path: null }]

const weeksOrderMock = vi.fn(async () => ({ data: weeks }))
const problemsEqMock = vi.fn(async () => ({ data: problems }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'github_username') {
              return {
                eq: () => ({
                  single: async () => ({ data: { github_username: 'kimminsu-dev' } }),
                }),
              }
            }
            return { eq: () => Promise.resolve({ data: profiles }) }
          },
        }
      }
      if (table === 'coding_weeks') {
        return { select: () => ({ order: weeksOrderMock }) }
      }
      if (table === 'coding_problems') {
        return { select: () => ({ eq: problemsEqMock }) }
      }
      if (table === 'coding_checks') {
        return { select: () => ({ in: async () => ({ data: checks }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))

import { getSessionProfile } from '@/lib/auth/session'
import CodingPage from './page'

beforeEach(() => {
  weeksOrderMock.mockClear()
  problemsEqMock.mockClear()
})

describe('CodingPage', () => {
  it('renders the newest week by default, queries its problems, and shows the member checklist', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('2주차 (9/15~9/21)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
    expect(problemsEqMock).toHaveBeenCalledWith('week_id', 'week-2')
  })

  it('renders the requested week when ?week= matches an existing week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByText('1주차 (9/8~9/14)')).toBeInTheDocument()
    expect(problemsEqMock).toHaveBeenCalledWith('week_id', 'week-1')
  })

  it('falls back to the newest week when ?week= does not match any week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'unknown-id' }) })
    render(ui)

    expect(screen.getByText('2주차 (9/15~9/21)')).toBeInTheDocument()
  })

  it('shows only a previous-week link on the newest week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/coding?week=week-1')
    expect(screen.queryByRole('link', { name: '다음 주차 →' })).not.toBeInTheDocument()
  })

  it('shows only a next-week link on the oldest week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '다음 주차 →' })).toHaveAttribute('href', '/coding?week=week-2')
    expect(screen.queryByRole('link', { name: '← 이전 주차' })).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no weeks at all', async () => {
    weeksOrderMock.mockResolvedValueOnce({ data: [] })

    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('아직 등록된 문제가 없습니다.')).toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.queryByRole('button', { name: '문제 등록' })).not.toBeInTheDocument()
  })

  it('shows the problem registration form for admins', async () => {
    vi.mocked(getSessionProfile).mockResolvedValueOnce({
      userId: 'admin-1',
      role: 'admin',
      status: 'approved',
    })

    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it("renders the GitHub settings form pre-filled with the caller's registered username", async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })
})
