import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const problems = [
  {
    id: 'problem-1',
    title: '두 수의 합',
    link: 'https://example.com/problem/1',
    week_of: '2026-08-11',
    created_by: 'admin-1',
    created_at: '2026-08-11T00:00:00.000Z',
  },
]

const checks = [{ problem_id: 'problem-1', user_id: 'user-1' }]

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
      if (table === 'coding_problems') {
        return { select: () => ({ order: async () => ({ data: problems }) }) }
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
  createProblem: vi.fn(),
  toggleCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))

import CodingPage from './page'

describe('CodingPage', () => {
  it('renders the week heading and the problem with member checklist', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('8/11 주차')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.queryByRole('button', { name: '문제 등록' })).not.toBeInTheDocument()
  })

  it("renders the GitHub settings form pre-filled with the caller's registered username", async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })
})
