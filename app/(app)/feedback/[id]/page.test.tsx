import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const doc = {
  id: 'doc-1',
  job_post_id: 'post-1',
  lines: [
    { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
    { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
    { questionIndex: 1, question: '본인의 강점은 무엇인가요', text: '책임감이 강합니다.' },
  ],
}
const jobPost = { company_name: '토스', author_id: 'user-1' }
const profiles = [{ id: 'user-1', name: '김민수' }]
const comments = [
  {
    id: 'c1',
    line_index: 0,
    parent_comment_id: null,
    author_id: 'user-1',
    body: '첫 문장 의견',
    created_at: '2026-08-13T00:00:00.000Z',
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
  it('renders a heading per question and every line under it', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지원동기를 작성해주세요' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '본인의 강점은 무엇인가요' })).toBeInTheDocument()
    expect(screen.getByText('첫 번째 문장입니다.')).toBeInTheDocument()
    expect(screen.getByText('두 번째 문장입니다.')).toBeInTheDocument()
    expect(screen.getByText('책임감이 강합니다.')).toBeInTheDocument()
  })

  it('attaches existing comments to the correct line', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('button', { name: '💬 1' })).toBeInTheDocument()
  })
})
