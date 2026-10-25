import type { InterviewSession } from '@/lib/interviews/types'
import { SessionCard } from './session-card'

// Pure markup for /interviews' feed boundary in page.tsx, which keeps the data read and
// caching. /tour renders this same view from fixtures.

export function InterviewSessionFeedView({
  sessions,
  currentUserId,
  isAdmin,
  basePath = '',
}: {
  sessions: InterviewSession[]
  currentUserId: string
  isAdmin: boolean
  basePath?: string
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {sessions.map((s) => (
        <li key={s.id}>
          <SessionCard session={s} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
        </li>
      ))}
    </ul>
  )
}
