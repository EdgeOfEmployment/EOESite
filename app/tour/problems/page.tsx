import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { ProblemListView } from '@/app/(app)/problems/views'
import { problemSummaries } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourProblemsSearchParams = { company?: string; q?: string }

// No "문제 작성" button: the authoring form is out of the demo's scope (it is all writes).
export default function TourProblemsPage({ searchParams }: { searchParams: Promise<TourProblemsSearchParams> }) {
  return (
    <PageShell title="문제은행">
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourProblemList searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourProblemList({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourProblemsSearchParams>
}) {
  const [{ company = '', q = '' }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])

  return <ProblemListView problems={problemSummaries(fixtures)} company={company} q={q} basePath={TOUR_BASE_PATH} />
}
