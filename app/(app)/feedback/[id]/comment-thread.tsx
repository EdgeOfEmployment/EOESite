import type { FeedbackComment } from '@/lib/jobposts/types'
import { addFeedbackComment } from './actions'

function CommentNode({
  feedbackDocId,
  lineIndex,
  comment,
}: {
  feedbackDocId: string
  lineIndex: number
  comment: FeedbackComment
}) {
  return (
    <li className="mt-2">
      <div className="text-sm">
        <span className="font-medium">{comment.authorName}</span> {comment.body}
      </div>
      {comment.replies.length > 0 && (
        <ul className="ml-4 border-l pl-2">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} feedbackDocId={feedbackDocId} lineIndex={lineIndex} comment={reply} />
          ))}
        </ul>
      )}
      <form
        action={addFeedbackComment.bind(null, feedbackDocId, lineIndex, comment.id)}
        className="ml-4 mt-1 flex gap-2"
      >
        <input name="body" placeholder="답글" required className="flex-1 rounded border px-2 py-1 text-xs" />
        <button type="submit" className="rounded border px-2 py-1 text-xs">
          답글
        </button>
      </form>
    </li>
  )
}

export function CommentThread({
  feedbackDocId,
  lineIndex,
  comments,
}: {
  feedbackDocId: string
  lineIndex: number
  comments: FeedbackComment[]
}) {
  return (
    <div className="mt-1">
      <ul>
        {comments.map((comment) => (
          <CommentNode key={comment.id} feedbackDocId={feedbackDocId} lineIndex={lineIndex} comment={comment} />
        ))}
      </ul>
      <form action={addFeedbackComment.bind(null, feedbackDocId, lineIndex, null)} className="mt-2 flex gap-2">
        <input name="body" placeholder="댓글 추가" required className="flex-1 rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-3 py-1 text-sm">
          등록
        </button>
      </form>
    </div>
  )
}
