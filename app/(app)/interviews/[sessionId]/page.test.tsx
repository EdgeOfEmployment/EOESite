import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const session = {
  id: 'session-1',
  title: '2조 모의면접',
  session_at: '2026-08-20T14:00',
  description: 'Zoom 링크',
}

const profiles = [{ id: 'user-1', name: '김민수' }]

const qas = [
  {
    id: 'qa-1',
    author_id: 'user-1',
    questions: [{ question: '자기소개를 해주세요', answer: '안녕하세요.' }],
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

const feedbackDocs = [{ id: 'doc-1', interview_qa_id: 'qa-1' }]

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
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session }) }) }) }
      }
      if (table === 'interview_qas') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: qas }) }) }) }
      }
      if (table === 'feedback_docs') {
        return { select: () => ({ in: async () => ({ data: feedbackDocs }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./actions', () => ({
  createInterviewQa: vi.fn(),
  deleteInterviewQa: vi.fn(),
}))

import InterviewSessionPage from './page'

describe('InterviewSessionPage', () => {
  it('renders the session title, description, and registered QA entries', async () => {
    const ui = await InterviewSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '2조 모의면접' })).toBeInTheDocument()
    expect(screen.getByText('Zoom 링크')).toBeInTheDocument()
    expect(screen.getByText('자기소개를 해주세요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })
})
