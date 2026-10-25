import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CheckinCalendarView } from '@/app/(app)/checkin/calendar/views'
import { checkinCalendarPosts } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

type TourCalendarSearchParams = { year?: string; month?: string; view?: string }

export default function TourCheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<TourCalendarSearchParams>
}) {
  return (
    <PageShell
      title="인증 달력"
      width="3xl"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/checkin`} className="text-sm text-gray-500 underline dark:text-gray-400">
          ← 인증으로 돌아가기
        </Link>
      }
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TourCheckinCalendar searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCheckinCalendar({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCalendarSearchParams>
}) {
  const [params, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const [todayYear, todayMonth] = fixtures.today.split('-').map(Number)
  const year = params.year ? Number(params.year) : todayYear
  const month = params.month ? Number(params.month) : todayMonth
  const view = params.view === 'member' ? 'member' : 'date'

  return (
    <CheckinCalendarView
      year={year}
      month={month}
      view={view}
      posts={checkinCalendarPosts(fixtures, year, month)}
      basePath={TOUR_BASE_PATH}
    />
  )
}
