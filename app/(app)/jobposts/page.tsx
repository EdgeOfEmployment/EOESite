import { createClient } from '@/lib/supabase/server'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'

export default async function JobPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: posts } = await supabase
    .from('job_posts')
    .select('id, author_id, post_date, company_name, posting_info, questions, feedback_requested, created_at')
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map((p) => p.id)

  const { data: reactions } = postIds.length
    ? await supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    : { data: [] }

  const { data: feedbackDocs } = postIds.length
    ? await supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds)
    : { data: [] }

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
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">자소서 / 공고</h1>
        <a href="/jobposts/calendar" className="text-sm text-gray-500 underline">
          달력 보기
        </a>
      </div>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {jobPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
