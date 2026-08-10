import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const posts = [
  {
    id: 'post-1',
    author_id: 'user-1',
    type: 'wake',
    body: '기상 완료',
    photo_url: null,
    created_at: '2026-08-10T00:00:00.000Z',
  },
]

const comments = [
  { id: 'c1', post_id: 'post-1', author_id: 'admin-1', body: '축하해요', created_at: '2026-08-10T01:00:00.000Z' },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return { eq: () => ({ single: async () => ({ data: { role: 'member' } }) }) }
            }
            return Promise.resolve({ data: profiles })
          },
        }
      }
      if (table === 'checkin_posts') {
        return { select: () => ({ order: async () => ({ data: posts }) }) }
      }
      if (table === 'checkin_comments') {
        return { select: () => ({ in: () => ({ order: async () => ({ data: comments }) }) }) }
      }
      if (table === 'checkin_reactions') {
        return { select: () => ({ in: async () => ({ data: reactions }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import CheckinPage from './page'

describe('CheckinPage', () => {
  it('renders the post form and the feed of posts with author names and comments', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('기상 완료')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })
})
