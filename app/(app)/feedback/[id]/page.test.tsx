import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const doc = { id: 'doc-1', job_post_id: 'post-1', lines: ['첫 줄', '둘째 줄'] }
const jobPost = { company_name: '토스', author_id: 'user-1' }
const profiles = [{ id: 'user-1', name: '김민수' }]
const comments = [
  {
    id: 'c1',
    line_index: 0,
    parent_comment_id: null,
    author_id: 'user-1',
    body: '첫 줄 의견',
    created_at: '2026-08-12T00:00:00.000Z',
  },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'feedback_docs') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: doc }) }) }) }
      }
      if (table === 'job_posts') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: jobPost }) }) }) }
      }
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'feedback_comments') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: comments }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import FeedbackPage from './page'

describe('FeedbackPage', () => {
  it('renders each snapshot line with its comments', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()
    expect(screen.getByText('첫 줄')).toBeInTheDocument()
    expect(screen.getByText('둘째 줄')).toBeInTheDocument()
    expect(screen.getByText('첫 줄 의견')).toBeInTheDocument()
  })
})
