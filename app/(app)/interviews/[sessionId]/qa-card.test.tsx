import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  deleteInterviewQa: vi.fn(),
}))

import { QaCard } from './qa-card'
import type { InterviewQa } from '@/lib/interviews/types'

const qa: InterviewQa = {
  id: 'qa-1',
  sessionId: 'session-1',
  authorId: 'user-1',
  authorName: '김민수',
  questions: [
    { question: '자기소개를 해주세요', answer: '안녕하세요, 백엔드 개발자 지망생입니다.' },
    { question: '가장 어려웠던 프로젝트는', answer: '결제 시스템 리팩터링이었습니다.' },
  ],
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-13T00:00:00.000Z',
}

describe('QaCard', () => {
  it('renders every question with its own answer and the author', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('자기소개를 해주세요')).toBeInTheDocument()
    expect(screen.getByText('안녕하세요, 백엔드 개발자 지망생입니다.')).toBeInTheDocument()
    expect(screen.getByText('가장 어려웠던 프로젝트는')).toBeInTheDocument()
    expect(screen.getByText('결제 시스템 리팩터링이었습니다.')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
  })

  it('shows a feedback link', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('shows a delete button for the author', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<QaCard qa={qa} currentUserId="user-9" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('hides the delete button for non-author non-admins', () => {
    render(<QaCard qa={qa} currentUserId="user-9" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
