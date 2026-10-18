import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getKstDateString } from '@/lib/checkin/time'
import { getProblem } from '@/lib/problems/queries'
import { isUuid } from '@/lib/problems/validate'
import { displayTitle, formatSignature } from '@/lib/problems/types'
import { Markdown } from '@/components/markdown'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { deleteProblem } from '../actions'
import { DeleteProblemButton } from './delete-problem-button'
import { DownloadPanel } from './download-panel'
import { ExampleTable } from './example-table'

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
  const examples = problem.testCases.filter((testCase) => testCase.isExample)
  const updated = problem.updatedAt.slice(0, 16) !== problem.createdAt.slice(0, 16)

  return (
    <PageShell
      title={displayTitle(problem.company, problem.title)}
      headerExtra={
        canManage ? (
          <div className="flex gap-2">
            <Link
              href={`/problems/${id}/edit`}
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
          <DownloadPanel problemId={id} problem={problem} />
        </section>
      </div>
    </PageShell>
  )
}
