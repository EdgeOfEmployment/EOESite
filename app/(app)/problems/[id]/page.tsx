import { notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getProblem } from '@/lib/problems/queries'
import { isUuid } from '@/lib/problems/validate'
import { ProblemDetailView } from './views'

export default async function ProblemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const { error, success } = await searchParams
  if (!isUuid(id)) notFound()

  const [problem, session] = await Promise.all([getProblem(id), getSessionProfile()])
  if (!problem) notFound()

  const canManage = session?.userId === problem.createdBy || session?.role === 'admin'

  return <ProblemDetailView problem={problem} canManage={canManage} error={error} success={success} />
}
