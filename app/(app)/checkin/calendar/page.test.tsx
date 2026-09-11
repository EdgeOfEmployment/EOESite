import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', created_at: '2026-08-10T00:00:00.000Z', is_late: true }]

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'checkin_posts') {
        return { select: () => ({ gte: () => ({ lt: async () => ({ data: posts }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import { cacheLife, cacheTag } from 'next/cache'
import CheckinCalendarPage, { CalendarContent } from './page'

describe('CheckinCalendarPage', () => {
  it('renders the static shell: title, view toggle, and a link back to the checkin feed', () => {
    const ui = CheckinCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '인증 달력' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 인증으로 돌아가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('CalendarContent', () => {
  it('renders the month label, the view toggle, and the calendar', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
  })

  it('tags the cached calendar data with the tag actions.ts revalidates', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('checkin-calendar')
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })

  it('shows the member view grouped by author when view=member', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8', view: 'member' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '김민수' })).toBeInTheDocument()
  })
})
