import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { GithubSettingsForm } from '@/app/(app)/coding/github-settings-form'
import { CodingBoardView } from '@/app/(app)/coding/views'
import { resolveCurrentWeek } from '@/lib/coding/week'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourCodingSearchParams = { week?: string }

export default function TourCodingPage({ searchParams }: { searchParams: Promise<TourCodingSearchParams> }) {
  return (
    <PageShell title="코테 스터디">
      <GithubSettingsForm currentUsername="eoe-demo" />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourCodingBoard searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCodingBoard({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCodingSearchParams>
}) {
  const [{ week }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const { current, prevId, nextId } = resolveCurrentWeek(fixtures.codingWeeks, week)

  return (
    <CodingBoardView
      isAdmin={false}
      members={fixtures.members}
      currentWeek={current}
      prevId={prevId}
      nextId={nextId}
      problems={current ? fixtures.codingProblems[current.id] ?? [] : []}
      currentUserId={fixtures.me.id}
      basePath={TOUR_BASE_PATH}
    />
  )
}
