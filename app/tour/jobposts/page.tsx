import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { PostForm } from '@/app/(app)/jobposts/post-form'
import { JobPostFeedView } from '@/app/(app)/jobposts/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourJobPostsPage() {
  return (
    <PageShell
      title="자소서 / 공고"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/jobposts/calendar`} className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <PostForm />
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
        <TourJobPostFeed />
      </Suspense>
    </PageShell>
  )
}

export async function TourJobPostFeed() {
  const fixtures = await loadTourFixtures()

  return (
    <JobPostFeedView posts={fixtures.jobPosts} currentUserId={fixtures.me.id} isAdmin={false} basePath={TOUR_BASE_PATH} />
  )
}
