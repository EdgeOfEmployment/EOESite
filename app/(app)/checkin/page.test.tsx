import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/checkin',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const posts = [
  {
    id: 'post-1',
    author_id: 'user-1',
    photo_url: 'https://example.com/photo.jpg',
    goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
    created_at: '2026-08-10T01:05:00.000Z',
    is_late: true,
    fine_amount: 11000,
  },
]

const comments = [
  { id: 'c1', post_id: 'post-1', author_id: 'admin-1', body: '축하해요', created_at: '2026-08-10T01:10:00.000Z' },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]

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
        return {
          select: () => ({
            gte: () => ({
              lt: () => ({ order: async () => ({ data: posts }) }),
            }),
          }),
        }
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

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  setGoalStatus: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import CheckinPage, { TopNotice, DayHeader, FeedContent } from './page'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z')) // KST 11:00, 2026-08-10
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CheckinPage', () => {
  it('renders the static shell: title and the calendar link', () => {
    const ui = CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '10시 인증' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '달력 보기' })).toHaveAttribute('href', '/checkin/calendar')
  })
})

describe('TopNotice', () => {
  it('renders the success toast and the error alert from the search params', async () => {
    const ui = await TopNotice({
      searchParamsPromise: Promise.resolve({ success: '인증을 등록했어요', error: '사진이 필요해요' }),
    })
    render(ui)

    expect(screen.getByText('인증을 등록했어요')).toBeInTheDocument()
    expect(screen.getByText('사진이 필요해요')).toBeInTheDocument()
  })

  it('renders neither when no notice params are present', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('DayHeader', () => {
  it('defaults to todays KST date, shows the post form, and disables the next-day link', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/checkin?date=2026-08-09')
    expect(screen.queryByRole('link', { name: '▶' })).not.toBeInTheDocument()
  })

  it('hides the post form and shows an active next-day link for a past date', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-09' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 9일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10시 인증하기' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '▶' })).toHaveAttribute('href', '/checkin?date=2026-08-10')
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/checkin?date=2026-08-08')
  })

  it('falls back to todays date for an invalid date parameter', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: 'not-a-date' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('falls back to todays date for a calendrically invalid date parameter', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-02-30' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('clamps a future date parameter to today', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-15' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('does not clamp a date parameter that exactly equals today', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-10' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })
})

describe('FeedContent', () => {
  it('renders the days posts with goals and comments', async () => {
    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })

  it("caches todays feed under the day's tag with a seconds lifetime", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')

    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('checkin-feed-2026-08-10', 'member-names')
    expect(cacheLife).toHaveBeenCalledWith('seconds')
  })

  it("caches a past day under that day's tag with a max lifetime", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')

    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({ date: '2026-08-09' }) })
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('checkin-feed-2026-08-09', 'member-names')
    expect(cacheLife).toHaveBeenCalledWith('max')
  })
})
