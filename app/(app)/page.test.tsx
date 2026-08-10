import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({ data: [{ author_id: 'user-2', type: 'wake' }] }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import DashboardPage from './page'

describe('DashboardPage', () => {
  it('renders the dashboard heading', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  it('shows the missing-checkin message for the current user', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText(/기상, 스터디, 목표달성 인증을 하지 않았어요/)).toBeInTheDocument()
  })

  it('renders a status row per approved member with a checkmark for completed types', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })
})
