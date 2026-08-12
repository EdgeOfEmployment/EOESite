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
  postDate: '2026-08-12',
  companyName: '토스',
  postingInfo: '백엔드 신입 공고',
  coverLetterText: '자소서 원문입니다',
  feedbackRequested: true,
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-12T00:00:00.000Z',
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the company, author, date, posting info, and cover letter text', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('2026-08-12')).toBeInTheDocument()
    expect(screen.getByText('백엔드 신입 공고')).toBeInTheDocument()
    expect(screen.getByText('자소서 원문입니다')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
  })

  it('shows a feedback link when a feedback doc exists', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('does not show a feedback link when feedback was not requested', () => {
    render(<PostCard post={{ ...post, feedbackDocId: null }} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('link', { name: '피드백 보기' })).not.toBeInTheDocument()
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
