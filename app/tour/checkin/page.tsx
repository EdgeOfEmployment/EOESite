import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CheckinFeedView, DayNavView } from '@/app/(app)/checkin/views'
import { resolveSelectedDate } from '@/lib/checkin/date-param'
import { checkinPostsOn } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourCheckinSearchParams = { date?: string }

export default function TourCheckinPage({ searchParams }: { searchParams: Promise<TourCheckinSearchParams> }) {
  return (
    <PageShell
      title="10시 인증"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/checkin/calendar`} className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <TourCheckinDay searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCheckinDay({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCheckinSearchParams>
}) {
  const [{ date }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const selectedDate = resolveSelectedDate(date, fixtures.today)

  return (
    <>
      <DayNavView selectedDate={selectedDate} isToday={selectedDate === fixtures.today} basePath={TOUR_BASE_PATH} />
      <CheckinFeedView posts={checkinPostsOn(fixtures, selectedDate)} currentUserId={fixtures.me.id} isAdmin={false} />
    </>
  )
}
