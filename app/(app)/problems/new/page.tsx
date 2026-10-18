import { Suspense } from 'react'
import { getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts } from '@/lib/problems/filter'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { createProblem } from '../actions'
import { ProblemForm } from '../problem-form'

export default function NewProblemPage() {
  return (
    <PageShell title="문제 작성">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewProblemForm />
      </Suspense>
    </PageShell>
  )
}

export async function NewProblemForm() {
  const summaries = await getProblemSummaries()
  return (
    <ProblemForm
      action={createProblem}
      companies={companyCounts(summaries).map((c) => c.company)}
      submitLabel="등록"
      cancelHref="/problems"
    />
  )
}
