import Link from 'next/link'
import type { InterviewQa } from '@/lib/interviews/types'
import { deleteInterviewQa } from './actions'

export function QaCard({
  qa,
  currentUserId,
  isAdmin,
}: {
  qa: InterviewQa
  currentUserId: string
  isAdmin: boolean
}) {
  const canDelete = isAdmin || qa.authorId === currentUserId

  return (
    <article className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">{qa.authorName}</span>
        {canDelete && (
          <form action={deleteInterviewQa.bind(null, qa.sessionId, qa.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {qa.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500">{q.question}</p>
            <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
          </div>
        ))}
      </div>

      <Link href={`/feedback/${qa.feedbackDocId}`} className="mt-3 inline-block text-sm text-gray-500 underline">
        피드백 보기
      </Link>
    </article>
  )
}
