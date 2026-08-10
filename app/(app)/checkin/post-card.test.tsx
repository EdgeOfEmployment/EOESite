import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { CheckinPost } from '@/lib/checkin/types'

const post: CheckinPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  type: 'wake',
  photoUrl: null,
  body: '오늘도 기상 성공!',
  createdAt: '2026-08-10T00:00:00.000Z',
  comments: [
    { id: 'c1', authorId: 'user-2', authorName: '이지은', body: '축하해요', createdAt: '2026-08-10T01:00:00.000Z' },
  ],
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the type label, author, body, and comments', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('기상')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('오늘도 기상 성공!')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
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
