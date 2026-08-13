import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  toggleParticipation: vi.fn(),
  deleteSession: vi.fn(),
}))

import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'

const session: InterviewSession = {
  id: 'session-1',
  createdBy: 'user-1',
  title: '2조 모의면접',
  sessionAt: '2026-08-20T14:00',
  description: 'Zoom 링크: https://zoom.example/abc',
  createdAt: '2026-08-13T00:00:00.000Z',
  participants: [{ userId: 'user-2', userName: '이지은' }],
}

describe('SessionCard', () => {
  it('renders the title, time, and description', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('2026-08-20T14:00')).toBeInTheDocument()
    expect(screen.getByText('Zoom 링크: https://zoom.example/abc')).toBeInTheDocument()
  })

  it('shows participant count and names', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('참석 1명 (이지은)')).toBeInTheDocument()
  })

  it('shows a join button when the current user has not RSVPed', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '참석하기' })).toBeInTheDocument()
  })

  it('shows a cancel button when the current user has already RSVPed', () => {
    render(<SessionCard session={session} currentUserId="user-2" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '참석 취소' })).toBeInTheDocument()
  })

  it('shows a delete button for the session creator', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a delete button for admins even if they are not the creator', () => {
    render(<SessionCard session={session} currentUserId="admin-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('hides the delete button for non-creator non-admins', () => {
    render(<SessionCard session={session} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
