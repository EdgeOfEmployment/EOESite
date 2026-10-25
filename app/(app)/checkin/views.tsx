import Link from 'next/link'
import type { CheckinPost } from '@/lib/checkin/types'
import { formatKstDateHeading, shiftKstDateString } from '@/lib/checkin/time'
import { PostForm } from './post-form'
import { PostCard } from './post-card'

// Pure markup for /checkin's streamed boundaries in page.tsx, which keep all the data reads and
// caching. /tour renders these same views from fixtures.

export function DayNavView({
  selectedDate,
  isToday,
  basePath = '',
}: {
  selectedDate: string
  isToday: boolean
  basePath?: string
}) {
  const prevDate = shiftKstDateString(selectedDate, -1)
  const nextDate = shiftKstDateString(selectedDate, 1)

  return (
    <>
      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
        <Link href={`${basePath}/checkin?date=${prevDate}`} className="underline">
          ◀
        </Link>
        <span className="font-medium">
          {formatKstDateHeading(selectedDate)}
          {isToday ? ' (오늘)' : ''}
        </span>
        {isToday ? (
          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
            ▶
          </span>
        ) : (
          <Link href={`${basePath}/checkin?date=${nextDate}`} className="underline">
            ▶
          </Link>
        )}
      </div>

      {isToday && <PostForm />}
    </>
  )
}

export function CheckinFeedView({
  posts,
  currentUserId,
  isAdmin,
}: {
  posts: CheckinPost[]
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={currentUserId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
