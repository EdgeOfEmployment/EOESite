import { Suspense } from 'react'
import Link from 'next/link'
import { getProblemSummaries } from '@/lib/problems/queries'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'
import { ProblemListView } from './views'

type ProblemsSearchParams = { company?: string; q?: string; error?: string; success?: string }

export default function ProblemsPage({ searchParams }: { searchParams: Promise<ProblemsSearchParams> }) {
  return (
    <PageShell
      title="문제은행"
      headerExtra={
        <Link
          href="/problems/new"
          className="inline-flex min-h-11 items-center rounded bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          문제 작성
        </Link>
      }
    >
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <ProblemList searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
  const { error, success } = await searchParamsPromise
  return (
    <>
      <Toast message={success} />
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

export async function ProblemList({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
  const { company = '', q = '' } = await searchParamsPromise
  const problems = await getProblemSummaries()

  return <ProblemListView problems={problems} company={company} q={q} />
}
