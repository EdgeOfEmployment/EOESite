import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  toggleReaction: vi.fn(),
  deleteJobPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'

const post: JobPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  postDate: '2026-08-13',
  companyName: '토스',
  postingInfo: '백엔드 신입 공고',
  questions: [
    { question: '지원동기를 작성해주세요', answer: '문제 해결에 흥미를 느꼈습니다.' },
    { question: '본인의 강점은 무엇인가요', answer: '책임감이 강합니다.' },
  ],
  feedbackRequested: true,
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-13T00:00:00.000Z',
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders every question with its own answer', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('지원동기를 작성해주세요')).toBeInTheDocument()
    expect(screen.getByText('문제 해결에 흥미를 느꼈습니다.')).toBeInTheDocument()
    expect(screen.getByText('본인의 강점은 무엇인가요')).toBeInTheDocument()
    expect(screen.getByText('책임감이 강합니다.')).toBeInTheDocument()
  })

  it('renders the company, author, and date', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('2026-08-13')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
  })

  it('shows a feedback link when a feedback doc exists', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('does not show a delete button for non-admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
