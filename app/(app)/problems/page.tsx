import { Suspense } from 'react'
import Form from 'next/form'
import Link from 'next/link'
import { getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts, filterProblems } from '@/lib/problems/filter'
import { displayTitle } from '@/lib/problems/types'
import { getKstDateString } from '@/lib/checkin/time'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/skeleton'

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

/**
 * Filtering and counting happen here, outside the `'use cache'` read, so `?company`/`?q`
 * never become cache keys — every visitor shares the one cached summary list.
 */
export async function ProblemList({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
  const { company = '', q = '' } = await searchParamsPromise
  const problems = await getProblemSummaries()
  const counts = companyCounts(problems)
  const visible = filterProblems(problems, { company, q })

  return (
    <>
      <Form action="/problems" className="mb-4 flex flex-wrap gap-2">
        <Select name="company" aria-label="회사" defaultValue={company} className="w-auto">
          <option value="">전체 ({problems.length})</option>
          {counts.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} ({c.count})
            </option>
          ))}
        </Select>
        <Input name="q" aria-label="검색" placeholder="회사명 또는 제목으로 검색" defaultValue={q} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </Form>

      {problems.length === 0 ? (
        <EmptyState message="아직 등록된 문제가 없어요. 첫 문제를 작성해보세요." />
      ) : visible.length === 0 ? (
        <EmptyState message="조건에 맞는 문제가 없어요." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((problem) => (
            <li key={problem.id}>
              <Link href={`/problems/${problem.id}`} className="block">
                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{displayTitle(problem.company, problem.title)}</span>
                    <span className="shrink-0 rounded border border-gray-300 px-2 py-0.5 font-mono text-xs dark:border-gray-700">
                      {problem.paramCount}개 인자 → {problem.returnType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {problem.authorName} · {getKstDateString(problem.createdAt)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
