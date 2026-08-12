import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import { CommentThread } from './comment-thread'
import type { FeedbackComment } from '@/lib/jobposts/types'

const comments: FeedbackComment[] = [
  {
    id: 'c1',
    lineIndex: 0,
    parentCommentId: null,
    authorId: 'user-2',
    authorName: '이지은',
    body: '이 부분 좋아요',
    createdAt: '2026-08-12T00:00:00.000Z',
    replies: [
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'user-1',
        authorName: '김민수',
        body: '감사합니다',
        createdAt: '2026-08-12T00:01:00.000Z',
        replies: [],
      },
    ],
  },
]

describe('CommentThread', () => {
  it('renders top-level comments and their nested replies', () => {
    render(<CommentThread feedbackDocId="doc-1" lineIndex={0} comments={comments} />)

    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
  })

  it('renders a reply form for every comment and a new-comment form for the line', () => {
    render(<CommentThread feedbackDocId="doc-1" lineIndex={0} comments={comments} />)

    expect(screen.getAllByPlaceholderText('답글')).toHaveLength(2)
    expect(screen.getByPlaceholderText('댓글 추가')).toBeInTheDocument()
  })
})
