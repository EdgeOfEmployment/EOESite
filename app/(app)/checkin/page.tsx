import { createClient } from '@/lib/supabase/server'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinType } from '@/lib/checkin/types'

export default async function CheckinPage({
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
    .from('checkin_posts')
    .select('id, author_id, type, body, photo_url, created_at')
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map((p) => p.id)

  const { data: comments } = postIds.length
    ? await supabase
        .from('checkin_comments')
        .select('id, post_id, author_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const { data: reactions } = postIds.length
    ? await supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    : { data: [] }

  const checkinPosts: CheckinPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    type: post.type as CheckinType,
    photoUrl: post.photo_url,
    body: post.body,
    createdAt: post.created_at,
    comments: (comments ?? [])
      .filter((c) => c.post_id === post.id)
      .map((c) => ({
        id: c.id,
        authorId: c.author_id,
        authorName: nameById.get(c.author_id) ?? '알 수 없음',
        body: c.body,
        createdAt: c.created_at,
      })),
    reactions: (reactions ?? [])
      .filter((r) => r.post_id === post.id)
      .map((r) => ({ id: r.id, authorId: r.author_id, emoji: r.emoji })),
  }))

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">인증</h1>
        <a href="/checkin/calendar" className="text-sm text-gray-500 underline">
          달력 보기
        </a>
      </div>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {checkinPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
