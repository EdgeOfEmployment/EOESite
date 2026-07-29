import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const pendingUsers = [{ id: 'u1', name: '김민수', created_at: '2026-07-01T00:00:00Z' }]
const approvedMembers = [
  { id: 'u2', name: '관리자', role: 'admin' },
  { id: 'u3', name: '이지은', role: 'member' },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          order: () => ({
            data: table === 'profiles' && value === 'pending' ? pendingUsers : approvedMembers,
          }),
        }),
      }),
    }),
  })),
}))

vi.mock('./actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

import AdminPage from './page'

describe('AdminPage', () => {
  it('lists pending signups and approved members', async () => {
    const ui = await AdminPage()
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '거부' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '강퇴' })).toHaveLength(1)
  })
})
