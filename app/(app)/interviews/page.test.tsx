import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/interviews',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const sessions = [
  {
    id: 'session-1',
    created_by: 'user-1',
    title: '2조 모의면접',
    session_at: '2026-08-20T14:00',
    description: 'Zoom 링크',
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

const participants = [{ id: 'p1', session_id: 'session-1', user_id: 'admin-1' }]

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'interview_sessions') {
        return { select: () => ({ order: async () => ({ data: sessions }) }) }
      }
      if (table === 'interview_participants') {
        return { select: () => ({ in: async () => ({ data: participants }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createSession: vi.fn(),
  toggleParticipation: vi.fn(),
  deleteSession: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

import InterviewsPage, { FeedContent } from './page'

describe('InterviewsPage', () => {
  it('renders the static shell: title and the session form', () => {
    const ui = InterviewsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '모의면접' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
  })
})

describe('FeedContent', () => {
  it('renders the session feed with participant count and tags the cache correctly', async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const ui = await FeedContent()
    render(ui)

    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('참석 1명 (관리자)')).toBeInTheDocument()
    expect(cacheTag).toHaveBeenCalledWith('interviews-feed')
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })
})
