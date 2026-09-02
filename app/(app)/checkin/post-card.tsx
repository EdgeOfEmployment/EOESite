import { REACTION_EMOJIS, type CheckinPost } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { addComment, toggleReaction, deleteCheckinPost } from './actions'
import { Card } from '@/components/ui/card'
import { GoalsEditor } from './goals-editor'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: CheckinPost
  currentUserId: string
  isAdmin: boolean
}) {
  const isAuthor = post.authorId === currentUserId

  return (
    <Card as="article">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-800">10시 인증</span>
          <span className="font-medium">{post.authorName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatKstTime(post.createdAt)}</span>
          {post.isLate && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              지각 · {post.fineAmount.toLocaleString('ko-KR')}원
            </span>
          )}
        </div>
        {isAdmin && (
          <form action={deleteCheckinPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.photoUrl} alt="책상 인증 사진" className="mt-2 max-h-64 rounded object-cover" />

      <GoalsEditor postId={post.id} goals={post.goals} isAuthor={isAuthor} />

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

      <ul className="mt-3 flex flex-col gap-1">
        {post.comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <span className="font-medium">{comment.authorName}</span> {comment.body}
          </li>
        ))}
      </ul>

      <form action={addComment.bind(null, post.id)} className="mt-2 flex gap-2">
        <input
          name="body"
          placeholder="댓글 달기"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700"
        />
        <button type="submit" className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700">
          등록
        </button>
      </form>
    </Card>
  )
}
