import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const checkinCalls: { fields: string; gte: string; lt: string }[] = []
const manualFineCalls: { fields: string; gte: string; lt: string }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: (fields: string) => ({
            gte: (_col: string, gteValue: string) => ({
              lt: async (_col2: string, ltValue: string) => {
                checkinCalls.push({ fields, gte: gteValue, lt: ltValue })
                return {
                  data: [
                    { author_id: 'user-2', fine_amount: 11000, paid: false },
                    { author_id: 'user-2', fine_amount: 5000, paid: true },
                  ],
                }
              },
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: (fields: string) => ({
            gte: (_col: string, gteValue: string) => ({
              lt: async (_col2: string, ltValue: string) => {
                manualFineCalls.push({ fields, gte: gteValue, lt: ltValue })
                return { data: [{ user_id: 'user-2', amount: 3000, paid: false }] }
              },
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

  it('shows this months unpaid fine total per member, including unpaid manual fines', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expect(screen.getByText('미납액')).toBeInTheDocument()
    expect(screen.getByText('14,000원')).toBeInTheDocument()
    expect(screen.getAllByText('0원')).toHaveLength(2)
  })

  it('shows this months total fine (paid and unpaid) per member, including manual fines', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('벌금 총액')).toBeInTheDocument()
    expect(screen.getByText('19,000원')).toBeInTheDocument()
  })

  it('links to the checkin feed', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('DashboardPage KST date boundaries', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("queries today's checkin_posts using the KST calendar day, not the UTC day", async () => {
    // 2026-08-10T20:00:00Z is still Aug 10 in UTC, but already 2026-08-11 05:00 KST.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T20:00:00.000Z'))
    checkinCalls.length = 0

    const ui = await DashboardPage()
    render(ui)

    const todayCall = checkinCalls.find((c) => c.fields === 'author_id')
    expect(todayCall).toEqual({
      fields: 'author_id',
      gte: '2026-08-10T15:00:00.000Z',
      lt: '2026-08-11T15:00:00.000Z',
    })
  })

  it("queries this month's checkin_posts and manual_fines using the KST calendar month, not the UTC month", async () => {
    // 2026-08-31T20:00:00Z is still August in UTC, but already 2026-09-01 05:00 KST.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T20:00:00.000Z'))
    checkinCalls.length = 0
    manualFineCalls.length = 0

    const ui = await DashboardPage()
    render(ui)

    const monthCall = checkinCalls.find((c) => c.fields === 'author_id, fine_amount, paid')
    expect(monthCall).toEqual({
      fields: 'author_id, fine_amount, paid',
      gte: '2026-08-31T15:00:00.000Z',
      lt: '2026-09-30T15:00:00.000Z',
    })

    const manualCall = manualFineCalls.find((c) => c.fields === 'user_id, amount, paid')
    expect(manualCall).toEqual({
      fields: 'user_id, amount, paid',
      gte: '2026-08-31T15:00:00.000Z',
      lt: '2026-09-30T15:00:00.000Z',
    })
  })
})
