import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  toggleGoalCompleted: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { CheckinPost } from '@/lib/checkin/types'

const post: CheckinPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  photoUrl: 'https://example.com/photo.jpg',
  goals: [
    { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
    { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
  ],
  createdAt: '2026-08-10T01:05:00.000Z',
  isLate: true,
  fineAmount: 11000,
  comments: [
    { id: 'c1', authorId: 'user-2', authorName: '이지은', body: '축하해요', createdAt: '2026-08-10T01:10:00.000Z' },
  ],
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the type label, author, created time, photo, goals, and comments', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('10시 인증')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('오전 10:05')).toBeInTheDocument()
    expect(screen.getByAltText('책상 인증 사진')).toHaveAttribute('src', 'https://example.com/photo.jpg')
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })

  it('shows a late badge with the fine amount', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('지각 · 11,000원')).toBeInTheDocument()
  })

  it('lets the author toggle their own goal completion', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '알고리즘 3문제 풀기' })).toBeInTheDocument()
  })

  it('does not render a toggle button for a non-author viewer', () => {
    render(<PostCard post={post} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '알고리즘 3문제 풀기' })).not.toBeInTheDocument()
  })

  it('shows the completion time for a completed goal', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('완료 오전 11:00')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
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
