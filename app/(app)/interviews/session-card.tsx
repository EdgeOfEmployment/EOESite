import Link from 'next/link'
import type { InterviewSession } from '@/lib/interviews/types'
import { toggleParticipation, deleteSession } from './actions'
import { Card } from '@/components/ui/card'

export function SessionCard({
  session,
  currentUserId,
  isAdmin,
}: {
  session: InterviewSession
  currentUserId: string
  isAdmin: boolean
}) {
  const isParticipating = session.participants.some((p) => p.userId === currentUserId)
  const canDelete = isAdmin || session.createdBy === currentUserId

  return (
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Link href={`/interviews/${session.id}`} className="font-medium underline">
            {session.title}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">{session.sessionAt}</p>
        </div>
        {canDelete && (
          <form action={deleteSession.bind(null, session.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {session.description && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{session.description}</p>
      )}

      <form action={toggleParticipation.bind(null, session.id)} className="flex items-center gap-2">
        <button
          type="submit"
          className={`rounded border px-2 py-1 text-xs ${
            isParticipating
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-gray-300 dark:border-gray-700'
          }`}
        >
          {isParticipating ? '참석 취소' : '참석하기'}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {`참석 ${session.participants.length}명${
            session.participants.length > 0
              ? ` (${session.participants.map((p) => p.userName).join(', ')})`
              : ''
          }`}
        </span>
      </form>
    </Card>
  )
}
