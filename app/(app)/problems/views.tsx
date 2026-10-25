import Form from 'next/form'
import Link from 'next/link'
import { companyCounts, filterProblems } from '@/lib/problems/filter'
import { displayTitle, type BankProblemSummary } from '@/lib/problems/types'
import { getKstDateString } from '@/lib/checkin/time'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'

// Pure markup for /problems' list boundary in page.tsx, which keeps the cached read.
// /tour renders this same view from fixtures.

/**
 * Filtering and counting happen here, outside the `'use cache'` read, so `?company`/`?q`
 * never become cache keys — every visitor shares the one cached summary list.
 */
export function ProblemListView({
  problems,
  company,
  q,
  basePath = '',
}: {
  problems: BankProblemSummary[]
  company: string
  q: string
  basePath?: string
}) {
  const counts = companyCounts(problems)
  const visible = filterProblems(problems, { company, q })

  return (
    <>
      {/* data-demo-allow: a GET search form, so the /tour DemoGuard lets it navigate. */}
      <Form
        key={JSON.stringify([company, q])}
        action={`${basePath}/problems`}
        data-demo-allow
        className="mb-4 flex flex-wrap gap-2"
      >
        <Select name="company" aria-label="회사" defaultValue={company}>
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
              <Link href={`${basePath}/problems/${problem.id}`} className="block">
                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{displayTitle(problem.company, problem.title)}</span>
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
