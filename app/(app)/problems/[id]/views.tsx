import Link from 'next/link'
import { getKstDateString } from '@/lib/checkin/time'
import { displayTitle, formatSignature, type BankProblem } from '@/lib/problems/types'
import { Markdown } from '@/components/markdown'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { deleteProblem } from '../actions'
import { DeleteProblemButton } from './delete-problem-button'
import { DownloadPanel } from './download-panel'
import { ExampleTable } from './example-table'

// The whole /problems/[id] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function ProblemDetailView({
  problem,
  canManage,
  error,
  success,
  basePath = '',
}: {
  problem: BankProblem
  canManage: boolean
  error?: string
  success?: string
  basePath?: string
}) {
  const id = problem.id
  const examples = problem.testCases.filter((testCase) => testCase.isExample)
  const updated = problem.updatedAt.slice(0, 16) !== problem.createdAt.slice(0, 16)

  return (
    <PageShell
      title={displayTitle(problem.company, problem.title)}
      headerExtra={
        canManage ? (
          <div className="flex gap-2">
            <Link
              href={`${basePath}/problems/${id}/edit`}
              className="inline-flex min-h-11 items-center rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              수정
            </Link>
            <DeleteProblemButton action={deleteProblem.bind(null, id)} />
          </div>
        ) : undefined
      }
    >
      <Toast message={success} />
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <p className="-mt-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
        {problem.authorName} · {getKstDateString(problem.createdAt)}
        {updated && ` (수정 ${getKstDateString(problem.updatedAt)})`} · 시간 제한 {problem.timeLimitMs}ms
      </p>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 text-lg font-semibold">문제 설명</h2>
          <Markdown source={problem.descriptionMd} />
        </section>
        {problem.constraintsMd && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">제한사항</h2>
            <Markdown source={problem.constraintsMd} />
          </section>
        )}
        <section>
          <h2 className="mb-2 text-lg font-semibold">함수 시그니처</h2>
          <code className="text-sm">{formatSignature(problem.signature)}</code>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">입출력 예</h2>
          <ExampleTable signature={problem.signature} cases={examples} />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">풀이 파일 다운로드</h2>
          <DownloadPanel problemId={id} problem={problem} basePath={basePath} />
        </section>
      </div>
    </PageShell>
  )
}
