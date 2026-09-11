import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', company_name: '토스', post_date: '2026-08-12' }]

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
      if (table === 'job_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({ data: posts }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import JobPostsCalendarPage, { CalendarContent } from './page'
import { cacheTag, cacheLife } from 'next/cache'

describe('JobPostsCalendarPage', () => {
  it('renders the static shell: title and view toggle', () => {
    const ui = JobPostsCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '자소서 달력' })).toBeInTheDocument()
  })
})

describe('CalendarContent', () => {
  it('renders the month label and view toggle, and tags the cache correctly', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
    expect(cacheTag).toHaveBeenCalledWith('jobposts-calendar')
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
