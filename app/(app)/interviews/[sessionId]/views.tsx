import type { InterviewQaGroup } from '@/lib/interviews/grouping'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

// The whole /interviews/[sessionId] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function InterviewSessionView({
  sessionId,
  title,
  sessionAt,
  description,
  qaGroups,
  currentUserId,
  isAdmin,
  error,
  success,
  basePath = '',
}: {
  sessionId: string
  title: string
  sessionAt: string
  description: string | null
  qaGroups: InterviewQaGroup[]
  currentUserId: string
  isAdmin: boolean
  error?: string
  success?: string
  basePath?: string
}) {
  return (
    <PageShell title={title}>
      <Toast message={success} />
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{sessionAt}</p>
      {description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{description}</p>
      )}
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <QaForm sessionId={sessionId} />
      <div className="mt-6 flex flex-col gap-6">
        {qaGroups.map((group) => (
          <section key={group.authorId}>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{group.authorName}</h2>
            <ul className="flex flex-col gap-4">
              {group.qas.map((qa) => (
                <li key={qa.id}>
                  <QaCard qa={qa} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
