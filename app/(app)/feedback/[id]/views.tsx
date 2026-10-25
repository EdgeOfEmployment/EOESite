import { FeedbackLines, type FeedbackLineWithComments } from './feedback-lines'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

// The whole /feedback/[id] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function FeedbackDocView({
  feedbackDocId,
  heading,
  authorName,
  lines,
  error,
}: {
  feedbackDocId: string
  heading: string
  authorName: string
  lines: FeedbackLineWithComments[]
  error?: string
}) {
  return (
    <PageShell title={heading} width="3xl">
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">작성자: {authorName}</p>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <FeedbackLines feedbackDocId={feedbackDocId} lines={lines} />
    </PageShell>
  )
}
