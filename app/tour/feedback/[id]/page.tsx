import { notFound } from 'next/navigation'
import { FeedbackDocView } from '@/app/(app)/feedback/[id]/views'
import { feedbackPage } from '@/lib/tour/selectors'
import { loadTourFixtures } from '../../load-fixtures'

export default async function TourFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const page = feedbackPage(fixtures, id)
  if (!page) notFound()

  return <FeedbackDocView feedbackDocId={id} heading={page.heading} authorName={page.authorName} lines={page.lines} />
}
