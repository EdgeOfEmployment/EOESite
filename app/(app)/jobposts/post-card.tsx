import Link from 'next/link'
import { REACTION_EMOJIS } from '@/lib/checkin/types'
import type { JobPost } from '@/lib/jobposts/types'
import { toggleReaction, deleteJobPost } from './actions'
import { Card } from '@/components/ui/card'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: JobPost
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{post.companyName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{post.authorName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{post.postDate}</span>
        </div>
        {isAdmin && (
          <form action={deleteJobPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {post.postingInfo && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{post.postingInfo}</p>
      )}

      <div className="flex flex-col gap-3">
        {post.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{q.question}</p>
            <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {REACTION_EMOJIS.map((emoji) => {
          const count = post.reactions.filter((r) => r.emoji === emoji).length
          const reacted = post.reactions.some((r) => r.emoji === emoji && r.authorId === currentUserId)
          return (
            <form key={emoji} action={toggleReaction.bind(null, post.id, emoji)}>
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${
                  reacted
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {emoji}
                {count > 0 ? ` ${count}` : ''}
              </button>
            </form>
          )
        })}
      </div>

      {post.feedbackDocId && (
        <Link
          href={`/feedback/${post.feedbackDocId}`}
          className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
        >
          피드백 보기
        </Link>
      )}
    </Card>
  )
}
