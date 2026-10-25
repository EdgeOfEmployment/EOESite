import type { JobPost } from '@/lib/jobposts/types'
import { PostCard } from './post-card'

// Pure markup for /jobposts' feed boundary in page.tsx, which keeps the data read and caching.
// /tour renders this same view from fixtures.

export function JobPostFeedView({
  posts,
  currentUserId,
  isAdmin,
  basePath = '',
}: {
  posts: JobPost[]
  currentUserId: string
  isAdmin: boolean
  basePath?: string
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
        </li>
      ))}
    </ul>
  )
}
