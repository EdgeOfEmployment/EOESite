import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return { eq: () => ({ single: async () => ({ data: { role: 'member' } }) }) }
            }
            return Promise.resolve({ data: profiles })
          },
        }
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

import InterviewsPage from './page'

describe('InterviewsPage', () => {
  it('renders the session form and the session feed with participant count', async () => {
    const ui = await InterviewsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('참석 1명 (관리자)')).toBeInTheDocument()
  })
})
