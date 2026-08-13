import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const docs: Record<string, { id: string; job_post_id: string | null; interview_qa_id: string | null; lines: unknown }> = {
  'doc-1': {
    id: 'doc-1',
    job_post_id: 'post-1',
    interview_qa_id: null,
    lines: [
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
      { questionIndex: 1, question: '본인의 강점은 무엇인가요', text: '책임감이 강합니다.' },
    ],
  },
  'doc-2': {
    id: 'doc-2',
    job_post_id: null,
    interview_qa_id: 'qa-1',
    lines: [{ questionIndex: 0, question: '자기소개를 해주세요', text: '안녕하세요.' }],
  },
}

const jobPosts: Record<string, { company_name: string; author_id: string }> = {
  'post-1': { company_name: '토스', author_id: 'user-1' },
}

const interviewQas: Record<string, { author_id: string; session_id: string }> = {
  'qa-1': { author_id: 'user-2', session_id: 'session-1' },
}

const interviewSessions: Record<string, { title: string }> = {
  'session-1': { title: '2조 모의면접' },
}

const profiles = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const commentsByDoc: Record<string, unknown[]> = {
  'doc-1': [
    {
      id: 'c1',
      line_index: 0,
      parent_comment_id: null,
      author_id: 'user-1',
      body: '첫 문장 의견',
      created_at: '2026-08-13T00:00:00.000Z',
    },
  ],
  'doc-2': [],
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'feedback_docs') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: docs[id] }) }) }) }
      }
      if (table === 'job_posts') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: jobPosts[id] }) }) }) }
      }
      if (table === 'interview_qas') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: interviewQas[id] }) }) }) }
      }
      if (table === 'interview_sessions') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: interviewSessions[id] }) }) }) }
      }
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'feedback_comments') {
        return { select: () => ({ eq: (_col: string, docId: string) => ({ order: async () => ({ data: commentsByDoc[docId] ?? [] }) }) }) }
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
  it('renders a heading per question and every line under it for a job-post feedback doc', async () => {
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

  it('attaches existing comments to the correct line for a job-post feedback doc', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('button', { name: '💬 1' })).toBeInTheDocument()
  })

  it('resolves the heading and author from the interview session for an interview QA feedback doc', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-2' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '2조 모의면접 피드백' })).toBeInTheDocument()
    expect(screen.getByText('작성자: 이지은')).toBeInTheDocument()
    expect(screen.getByText('안녕하세요.')).toBeInTheDocument()
  })
})
