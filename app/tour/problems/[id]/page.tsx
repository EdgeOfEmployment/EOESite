import { notFound } from 'next/navigation'
import { ProblemDetailView } from '@/app/(app)/problems/[id]/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

export default async function TourProblemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const problem = fixtures.bankProblems.find((p) => p.id === id)
  if (!problem) notFound()

  return <ProblemDetailView problem={problem} canManage={false} basePath={TOUR_BASE_PATH} />
}
