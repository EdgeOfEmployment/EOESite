import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { CommentThread } from './comment-thread'

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('feedback_docs')
    .select('id, job_post_id, lines')
    .eq('id', id)
    .maybeSingle()

  if (!doc) {
    redirect('/jobposts?error=' + encodeURIComponent('존재하지 않는 피드백입니다'))
    return
  }

  const { data: jobPost } = await supabase
    .from('job_posts')
    .select('company_name, author_id')
    .eq('id', doc.job_post_id)
    .single()

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: rawComments } = await supabase
    .from('feedback_comments')
    .select('id, line_index, parent_comment_id, author_id, body, created_at')
    .eq('feedback_doc_id', id)
    .order('created_at', { ascending: true })

  const flatComments = (rawComments ?? []).map((c) => ({
    id: c.id,
    lineIndex: c.line_index,
    parentCommentId: c.parent_comment_id,
    authorId: c.author_id,
    authorName: nameById.get(c.author_id) ?? '알 수 없음',
    body: c.body,
    createdAt: c.created_at,
  }))

  const commentsByLine = groupCommentsByLine(flatComments)
  const lines = doc.lines as string[]
  const authorName = nameById.get(jobPost?.author_id ?? '') ?? '알 수 없음'

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{jobPost?.company_name} 자소서 피드백</h1>
      <p className="mb-6 text-sm text-gray-500">작성자: {authorName}</p>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <ul className="flex flex-col gap-3">
        {lines.map((text, index) => (
          <li key={index} className="rounded border p-3">
            <p className="whitespace-pre-wrap text-sm">{text || ' '}</p>
            <CommentThread feedbackDocId={id} lineIndex={index} comments={commentsByLine.get(index) ?? []} />
          </li>
        ))}
      </ul>
    </main>
  )
}
