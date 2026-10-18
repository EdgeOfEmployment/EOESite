import { notFound, redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getProblem, getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts } from '@/lib/problems/filter'
import { isUuid } from '@/lib/problems/validate'
import { PageShell } from '@/components/ui/page-shell'
import { updateProblem } from '../../actions'
import { ProblemForm } from '../../problem-form'

export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const [problem, session, summaries] = await Promise.all([getProblem(id), getSessionProfile(), getProblemSummaries()])
  if (!problem) notFound()
  if (session?.userId !== problem.createdBy && session?.role !== 'admin') {
    redirect(`/problems/${id}?error=` + encodeURIComponent('수정 권한이 없습니다'))
  }

  return (
    <PageShell title="문제 수정">
      <ProblemForm
        action={updateProblem.bind(null, id)}
        initial={problem}
        companies={companyCounts(summaries).map((c) => c.company)}
        submitLabel="수정 완료"
        cancelHref={`/problems/${id}`}
      />
    </PageShell>
  )
}
