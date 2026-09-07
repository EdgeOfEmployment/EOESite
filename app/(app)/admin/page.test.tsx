import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const pendingUsers = [{ id: 'u1', name: '김민수', created_at: '2026-07-01T00:00:00Z' }]
const approvedMembers = [
  { id: 'u2', name: '관리자', role: 'admin' },
  { id: 'u3', name: '이지은', role: 'member' },
]
// u4 is neither pending nor approved (e.g. kicked/rejected after posting a late
// check-in) — only reachable via the unfiltered all-profiles lookup.
const allProfiles = [
  { id: 'u1', name: '김민수' },
  { id: 'u2', name: '관리자' },
  { id: 'u3', name: '이지은' },
  { id: 'u4', name: '박서준' },
]
const lateFines = [
  { id: 'post-1', author_id: 'u3', created_at: '2026-09-05T01:00:00.000Z', fine_amount: 11000, paid: false },
  { id: 'post-2', author_id: 'u3', created_at: '2026-08-20T01:00:00.000Z', fine_amount: 10000, paid: true },
  { id: 'post-3', author_id: 'u4', created_at: '2026-09-03T01:00:00.000Z', fine_amount: 12000, paid: false },
]
const manualFines = [
  {
    id: 'manual-1',
    user_id: 'u3',
    amount: 5000,
    reason: '지각 3회 누적',
    created_at: '2026-09-04T01:00:00.000Z',
    paid: false,
  },
]

function makeSupabaseMock({
  late = lateFines,
  manual = manualFines,
}: { late?: typeof lateFines; manual?: typeof manualFines } = {}) {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'id, name') {
              return Promise.resolve({ data: allProfiles })
            }
            return {
              eq: (_col: string, value: string) => ({
                order: () => ({
                  data: value === 'pending' ? pendingUsers : approvedMembers,
                }),
              }),
            }
          },
        }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: async () => ({ data: late }),
              }),
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: () => ({
            order: async () => ({ data: manual }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabaseMock()),
}))

vi.mock('./actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

vi.mock('./fine-actions', () => ({
  setCheckinPostPaid: vi.fn(),
  cancelCheckinFine: vi.fn(),
  addManualFine: vi.fn(),
  deleteManualFine: vi.fn(),
  setManualFinePaid: vi.fn(),
}))

import AdminPage from './page'

describe('AdminPage', () => {
  it('lists pending signups and approved members', async () => {
    const ui = await AdminPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    // scoped to `span` because the same name also appears as an `<option>`
    // in the manual-fine-form member dropdown rendered further down this page
    expect(screen.getByText('이지은', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('관리자', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '거부' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '강퇴' })).toHaveLength(1)
  })

  describe('벌금 관리', () => {
    it('renders the manual fine form with a member dropdown, amount and reason fields', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByRole('heading', { name: '벌금 관리' })).toBeInTheDocument()
      expect(screen.getByLabelText('대상 멤버')).toBeInTheDocument()
      expect(screen.getByText('관리자', { selector: 'option' })).toBeInTheDocument()
      expect(screen.getByText('이지은', { selector: 'option' })).toBeInTheDocument()
      expect(screen.getByLabelText('금액')).toBeInTheDocument()
      expect(screen.getByLabelText('사유')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '벌금 추가' })).toBeInTheDocument()
    })

    it('shows only unpaid fines by default, grouped by month, merging late and manual fines', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.queryByText('2026년 8월')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '납부완료로 표시' })).toHaveLength(3)
      expect(screen.getByText('지각 3회 누적', { exact: false })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '납부 내역 보기' })).toHaveAttribute('href', '/admin?showPaid=1')
    })

    it('gives late fines a 취소 button and manual fines a 삭제 button', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1)
    })

    it('resolves a fine owner name even if they are no longer pending or approved', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText(/박서준/)).toBeInTheDocument()
      expect(screen.queryByText(/알 수 없음/)).not.toBeInTheDocument()
    })

    it('reveals paid fines with a reverse toggle when showPaid=1', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({ showPaid: '1' }) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.getByText('2026년 8월')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '납부완료로 표시' }).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '미납으로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '미납 건만 보기' })).toHaveAttribute('href', '/admin')
    })

    it('shows an empty state when there are no unpaid fines', async () => {
      vi.doMock('@/lib/supabase/server', () => ({
        createClient: vi.fn(async () => makeSupabaseMock({ late: [], manual: [] })),
      }))
      vi.resetModules()
      const { default: FreshAdminPage } = await import('./page')

      const ui = await FreshAdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('미납된 벌금이 없습니다.')).toBeInTheDocument()
    })
  })
})
