import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { SessionForm } from '@/app/(app)/interviews/session-form'
import { InterviewSessionFeedView } from '@/app/(app)/interviews/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourInterviewsPage() {
  return (
    <PageShell title="모의면접">
      <SessionForm />
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
        <TourInterviewFeed />
      </Suspense>
    </PageShell>
  )
}

export async function TourInterviewFeed() {
  const fixtures = await loadTourFixtures()

  return (
    <InterviewSessionFeedView
      sessions={fixtures.interviewSessions}
      currentUserId={fixtures.me.id}
      isAdmin={false}
      basePath={TOUR_BASE_PATH}
    />
  )
}
