import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({ data: [{ author_id: 'user-2', fine_amount: 11000 }] }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

import DashboardPage from './page'

describe('DashboardPage', () => {
  it('renders the dashboard heading', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  it('shows the not-yet-posted message when the current user has no post today', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('오늘 아직 10시 인증을 하지 않았어요.')).toBeInTheDocument()
  })

  it('renders a status row per approved member with a checkmark for who posted today', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getAllByText('김민수')).toHaveLength(2)
    expect(screen.getAllByText('이지은')).toHaveLength(2)
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })

  it('shows this months fine total per member', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expect(screen.getByText('11,000원')).toBeInTheDocument()
    expect(screen.getByText('0원')).toBeInTheDocument()
  })

  it('links to the checkin feed', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})
