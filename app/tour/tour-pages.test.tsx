import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/tour/checkin',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import TourLayout from './layout'
import TourIntroPage from './page'
import { TourDashboard } from './dashboard/page'
import { TourCheckinDay } from './checkin/page'
import { TourCheckinCalendar } from './checkin/calendar/page'
import { TourCodingBoard } from './coding/page'
import { TourProblemList } from './problems/page'
import TourProblemDetailPage from './problems/[id]/page'
import { TourJobPostFeed } from './jobposts/page'
import { TourJobPostsCalendar } from './jobposts/calendar/page'
import TourFeedbackPage from './feedback/[id]/page'
import { TourInterviewFeed } from './interviews/page'
import TourInterviewSessionPage from './interviews/[sessionId]/page'

// 2026-10-25 12:00 KST, a Sunday: the last day of coding week 12 (10/19~10/25).
const NOW = new Date('2026-10-25T03:00:00.000Z')

/** Every internal link on a /tour page must stay inside /tour. */
function expectLinksStayInTour(container: HTMLElement) {
  const internal = Array.from(container.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute('href'))
  expect(internal.length).toBeGreaterThan(0)
  for (const href of internal) {
    expect(href).toMatch(/^\/tour(\/|\?|$)/)
  }
}

describe('/tour pages', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('layout shows the demo banner, the tour tabs and a login link instead of logout', () => {
    render(TourLayout({ children: <p>본문</p> }))

    expect(screen.getByText('체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/tour/dashboard')
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })

  it('intro links every feature card into /tour and points at the public repo', () => {
    const { container } = render(TourIntroPage())

    expect(screen.getByRole('link', { name: /코테 스터디 →/ })).toHaveAttribute('href', '/tour/coding')
    expect(screen.getByRole('link', { name: 'GitHub 저장소' })).toHaveAttribute(
      'href',
      'https://github.com/EdgeOfEmployment/EOESite'
    )
    expectLinksStayInTour(container)
  })

  it('dashboard shows the demo member already checked in, with tour-scoped links', async () => {
    const { container } = render(await TourDashboard())

    expect(screen.getByText('오늘의 10시 인증을 완료했어요!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '코딩 보드 바로가기' })).toHaveAttribute('href', '/tour/coding?week=tour-week-12')
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it("check-in shows today's feed with the post form", async () => {
    const { container } = render(await TourCheckinDay({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월 25일 (오늘)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/tour/checkin?date=2026-10-24')
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
    expectLinksStayInTour(container)
  })

  it('check-in shows a past day without the post form', async () => {
    render(await TourCheckinDay({ searchParamsPromise: Promise.resolve({ date: '2026-10-20' }) }))

    expect(screen.getByText('2026년 10월 20일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10시 인증하기' })).not.toBeInTheDocument()
  })

  it('check-in calendar defaults to the current month', async () => {
    const { container } = render(await TourCheckinCalendar({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('coding board opens on the current week and offers the demo member a manual complete', async () => {
    const { container } = render(await TourCodingBoard({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('12주차 (10/19~10/25)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/tour/coding?week=tour-week-11')
    expect(screen.getByRole('button', { name: '완료 처리' })).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('problem list filters by the search query and keeps its GET form out of the demo guard', async () => {
    const { container } = render(await TourProblemList({ searchParamsPromise: Promise.resolve({ q: '괄호' }) }))

    const items = within(container.querySelector('ul')!).getAllByRole('link')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('[네이버]-올바른 괄호 문자열')
    const form = container.querySelector('form')!
    expect(form).toHaveAttribute('data-demo-allow')
    expect(form.getAttribute('action')).toBe('/tour/problems')
    expectLinksStayInTour(container)
  })

  it('problem detail renders a fixture problem and 404s on an unknown id', async () => {
    render(await TourProblemDetailPage({ params: Promise.resolve({ id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a02' }) }))
    expect(screen.getByRole('heading', { name: '[네이버]-올바른 괄호 문자열' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()

    await expect(TourProblemDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('job post feed links its feedback request into /tour', async () => {
    const { container } = render(await TourJobPostFeed())

    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/tour/feedback/tour-feedback-toss')
    expectLinksStayInTour(container)
  })

  it('job post calendar defaults to the current month', async () => {
    const { container } = render(await TourJobPostsCalendar({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('feedback page renders the document and 404s on an unknown id', async () => {
    render(await TourFeedbackPage({ params: Promise.resolve({ id: 'tour-feedback-toss' }) }))
    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()

    await expect(TourFeedbackPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('interview feed links each session into /tour', async () => {
    const { container } = render(await TourInterviewFeed())

    expect(screen.getByRole('link', { name: '기술면접 스터디 (네트워크·DB)' })).toHaveAttribute(
      'href',
      '/tour/interviews/tour-interview-1'
    )
    expectLinksStayInTour(container)
  })

  it('interview session page links each Q&A feedback into /tour', async () => {
    const { container } = render(await TourInterviewSessionPage({ params: Promise.resolve({ sessionId: 'tour-interview-1' }) }))

    expect(screen.getAllByRole('link', { name: '피드백 보기' }).map((a) => a.getAttribute('href')).sort()).toEqual([
      '/tour/feedback/tour-feedback-qa-doyun',
      '/tour/feedback/tour-feedback-qa-me',
    ])
    expectLinksStayInTour(container)
  })
})
