import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const pendingUsers = [{ id: 'u1', name: '김민수', created_at: '2026-07-01T00:00:00Z' }]
const approvedMembers = [
  { id: 'u2', name: '관리자', role: 'admin' },
  { id: 'u3', name: '이지은', role: 'member' },
]
const lateFines = [
  { id: 'post-1', author_id: 'u3', created_at: '2026-09-05T01:00:00.000Z', fine_amount: 11000, paid: false },
  { id: 'post-2', author_id: 'u3', created_at: '2026-08-20T01:00:00.000Z', fine_amount: 10000, paid: true },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({
              order: () => ({
                data: value === 'pending' ? pendingUsers : approvedMembers,
              }),
            }),
          }),
        }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: async () => ({ data: lateFines }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

vi.mock('./fine-actions', () => ({
  setCheckinPostPaid: vi.fn(),
}))

import AdminPage from './page'

describe('AdminPage', () => {
  it('lists pending signups and approved members', async () => {
    const ui = await AdminPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '거부' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '강퇴' })).toHaveLength(1)
  })

  describe('지각 벌금 관리', () => {
    it('shows only unpaid fines by default, grouped by month', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.queryByText('2026년 8월')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '납부완료로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '납부 내역 보기' })).toHaveAttribute('href', '/admin?showPaid=1')
    })

    it('reveals paid fines with a reverse toggle when showPaid=1', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({ showPaid: '1' }) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.getByText('2026년 8월')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '납부완료로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '미납으로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '미납 건만 보기' })).toHaveAttribute('href', '/admin')
    })

    it('shows an empty state when there are no unpaid fines', async () => {
      vi.doMock('@/lib/supabase/server', () => ({
        createClient: vi.fn(async () => ({
          from: (table: string) => {
            if (table === 'profiles') {
              return {
                select: () => ({
                  eq: (_col: string, value: string) => ({
                    order: () => ({ data: value === 'pending' ? pendingUsers : approvedMembers }),
                  }),
                }),
              }
            }
            return {
              select: () => ({
                eq: () => ({ gt: () => ({ order: async () => ({ data: [] }) }) }),
              }),
            }
          },
        })),
      }))
      vi.resetModules()
      const { default: FreshAdminPage } = await import('./page')

      const ui = await FreshAdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('미납된 벌금이 없습니다.')).toBeInTheDocument()
    })
  })
})
