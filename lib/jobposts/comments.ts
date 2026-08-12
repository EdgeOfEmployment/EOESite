import type { FlatFeedbackComment, FeedbackComment } from './types'

function buildTree(flat: FlatFeedbackComment[]): FeedbackComment[] {
  const byId = new Map<string, FeedbackComment>(flat.map((c) => [c.id, { ...c, replies: [] }]))
  const roots: FeedbackComment[] = []

  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(comment)
    } else {
      roots.push(comment)
    }
  }

  return roots
}

export function groupCommentsByLine(comments: FlatFeedbackComment[]): Map<number, FeedbackComment[]> {
  const byLine = new Map<number, FlatFeedbackComment[]>()

  for (const comment of comments) {
    const list = byLine.get(comment.lineIndex) ?? []
    list.push(comment)
    byLine.set(comment.lineIndex, list)
  }

  const result = new Map<number, FeedbackComment[]>()
  for (const [lineIndex, list] of byLine) {
    result.set(lineIndex, buildTree(list))
  }

  return result
}
