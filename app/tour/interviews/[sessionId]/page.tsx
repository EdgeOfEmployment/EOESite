import { notFound } from 'next/navigation'
import { InterviewSessionView } from '@/app/(app)/interviews/[sessionId]/views'
import { sessionQaGroups } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

export default async function TourInterviewSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [{ sessionId }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const session = fixtures.interviewSessions.find((s) => s.id === sessionId)
  if (!session) notFound()

  return (
    <InterviewSessionView
      sessionId={session.id}
      title={session.title}
      sessionAt={session.sessionAt}
      description={session.description}
      qaGroups={sessionQaGroups(fixtures, session.id)}
      currentUserId={fixtures.me.id}
      isAdmin={false}
      basePath={TOUR_BASE_PATH}
    />
  )
}
