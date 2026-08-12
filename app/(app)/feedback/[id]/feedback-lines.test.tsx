import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import { FeedbackLines } from './feedback-lines'
import type { FeedbackLineWithComments } from './feedback-lines'

const lines: FeedbackLineWithComments[] = [
  {
    index: 0,
    questionIndex: 0,
    question: '지원동기를 작성해주세요',
    text: '첫 번째 문장입니다.',
    comments: [],
  },
  {
    index: 1,
    questionIndex: 0,
    question: '지원동기를 작성해주세요',
    text: '두 번째 문장입니다.',
    comments: [
      {
        id: 'c1',
        lineIndex: 1,
        parentCommentId: null,
        authorId: 'user-2',
        authorName: '이지은',
        body: '이 부분 좋아요',
        createdAt: '2026-08-13T00:00:00.000Z',
        replies: [
          {
            id: 'c2',
            lineIndex: 1,
            parentCommentId: 'c1',
            authorId: 'user-1',
            authorName: '김민수',
            body: '감사합니다',
            createdAt: '2026-08-13T00:01:00.000Z',
            replies: [],
          },
        ],
      },
    ],
  },
  {
    index: 2,
    questionIndex: 1,
    question: '본인의 강점은 무엇인가요',
    text: '책임감이 강합니다.',
    comments: [],
  },
]

describe('FeedbackLines', () => {
  it('shows a question heading whenever the question changes', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.getByRole('heading', { name: '지원동기를 작성해주세요' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '본인의 강점은 무엇인가요' })).toBeInTheDocument()
  })

  it('shows a comment count badge for a line with existing comments, and a plain trigger otherwise', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.getByRole('button', { name: '💬 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '+' })).toHaveLength(2)
  })

  it('expands only the clicked line, showing its comment thread', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))

    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
  })

  it('collapses the previously expanded line when a different line is clicked', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()
  })

  it('collapses the line when its own trigger is clicked again', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()
  })
})
