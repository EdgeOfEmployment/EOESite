import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

export default async function JobPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [session, { data: profiles }, { data: posts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, post_date, company_name, posting_info, questions, feedback_requested, created_at')
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: reactions }, { data: feedbackDocs }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
    queryIfAny(postIds, () =>
      supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds)
    ),
  ])

  const feedbackDocIdByPost = new Map((feedbackDocs ?? []).map((d) => [d.job_post_id, d.id as string]))

  const jobPosts: JobPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    postDate: post.post_date,
    companyName: post.company_name,
    postingInfo: post.posting_info,
    questions: post.questions,
    feedbackRequested: post.feedback_requested,
    feedbackDocId: feedbackDocIdByPost.get(post.id) ?? null,
    createdAt: post.created_at,
    reactions: (reactions ?? [])
      .filter((r) => r.post_id === post.id)
      .map((r) => ({ id: r.id, authorId: r.author_id, emoji: r.emoji })),
  }))

  return (
    <PageShell
      title="자소서 / 공고"
      headerExtra={
        <Link href="/jobposts/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {jobPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
