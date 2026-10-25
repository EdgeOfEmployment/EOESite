import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CodingWidgetView, FineTablesView, StatusTableView, TodayAlertView } from '@/app/(app)/dashboard-views'
import { codingWidget, monthFines, todaysAuthorIds } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourDashboardPage() {
  return (
    <PageShell title="대시보드" width="3xl">
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourDashboard />
      </Suspense>
    </PageShell>
  )
}

export async function TourDashboard() {
  const fixtures = await loadTourFixtures()
  const authorIds = todaysAuthorIds(fixtures)

  return (
    <>
      <TodayAlertView posted={authorIds.includes(fixtures.me.id)} />

      <Link
        href={`${TOUR_BASE_PATH}/checkin`}
        className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        인증 보러가기
      </Link>

      <CodingWidgetView widget={codingWidget(fixtures)} basePath={TOUR_BASE_PATH} />
      <StatusTableView members={fixtures.members} todaysAuthorIds={authorIds} />
      <FineTablesView members={fixtures.members} fines={monthFines(fixtures)} />
    </>
  )
}
