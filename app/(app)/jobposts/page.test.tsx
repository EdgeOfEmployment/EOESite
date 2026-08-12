import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const posts = [
  {
    id: 'post-1',
    author_id: 'user-1',
    post_date: '2026-08-12',
    company_name: '토스',
    posting_info: '백엔드 신입',
    cover_letter_text: '자소서 원문',
    feedback_requested: true,
    created_at: '2026-08-12T00:00:00.000Z',
  },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]
const feedbackDocs = [{ id: 'doc-1', job_post_id: 'post-1' }]

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
      if (table === 'job_posts') {
        return { select: () => ({ order: async () => ({ data: posts }) }) }
      }
      if (table === 'job_post_reactions') {
        return { select: () => ({ in: async () => ({ data: reactions }) }) }
      }
      if (table === 'feedback_docs') {
        return { select: () => ({ in: async () => ({ data: feedbackDocs }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
  toggleReaction: vi.fn(),
  deleteJobPost: vi.fn(),
}))

import JobPostsPage from './page'

describe('JobPostsPage', () => {
  it('renders the post form and the feed with author, company, and feedback link', async () => {
    const ui = await JobPostsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })
})
