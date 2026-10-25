import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { JobPostsCalendarView } from '@/app/(app)/jobposts/calendar/views'
import { jobPostCalendarPosts } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

type TourCalendarSearchParams = { year?: string; month?: string; view?: string }

export default function TourJobPostsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<TourCalendarSearchParams>
}) {
  return (
    <PageShell title="자소서 달력" width="3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TourJobPostsCalendar searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourJobPostsCalendar({
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
    <JobPostsCalendarView
      year={year}
      month={month}
      view={view}
      posts={jobPostCalendarPosts(fixtures, year, month)}
      basePath={TOUR_BASE_PATH}
    />
  )
}
