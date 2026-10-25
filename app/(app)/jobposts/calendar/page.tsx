import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import type { CalendarJobPost } from '@/lib/jobposts/calendar'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { JobPostsCalendarView } from './views'

export const unstable_instant = false

type JobPostsCalendarSearchParams = { year?: string; month?: string; view?: string }

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  return { start, end }
}

async function getCalendarPosts(year: number, month: number): Promise<CalendarJobPost[]> {
  'use cache'
  cacheTag('jobposts-calendar')
  cacheLife('minutes')

  const { start, end } = monthRange(year, month)
  const supabase = createCacheClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, company_name, post_date')
      .gte('post_date', start)
      .lt('post_date', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    companyName: post.company_name,
    postDate: post.post_date,
  }))
}

export default function JobPostsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<JobPostsCalendarSearchParams>
}) {
  return (
    <PageShell title="자소서 달력" width="3xl">
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

function CalendarSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export async function CalendarContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<JobPostsCalendarSearchParams>
}) {
  const params = await searchParamsPromise
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const calendarPosts = await getCalendarPosts(year, month)

  return <JobPostsCalendarView year={year} month={month} view={view} posts={calendarPosts} />
}
