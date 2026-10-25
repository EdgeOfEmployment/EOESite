import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import type { CalendarPost } from '@/lib/checkin/calendar'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CheckinCalendarView } from './views'

export const unstable_instant = false

type CheckinCalendarSearchParams = { year?: string; month?: string; view?: string }

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 1)).toISOString()
  return { start, end }
}

async function getCalendarPosts(year: number, month: number): Promise<CalendarPost[]> {
  'use cache'
  cacheTag('checkin-calendar')
  cacheLife('minutes')

  const { start, end } = monthRange(year, month)
  const supabase = createCacheClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, is_late')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    createdAt: post.created_at,
    isLate: post.is_late,
  }))
}

export default function CheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<CheckinCalendarSearchParams>
}) {
  return (
    <PageShell
      title="인증 달력"
      width="3xl"
      headerExtra={
        <Link href="/checkin" className="text-sm text-gray-500 underline dark:text-gray-400">
          ← 인증으로 돌아가기
        </Link>
      }
    >
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
  searchParamsPromise: Promise<CheckinCalendarSearchParams>
}) {
  const params = await searchParamsPromise
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const calendarPosts = await getCalendarPosts(year, month)

  return <CheckinCalendarView year={year} month={month} view={view} posts={calendarPosts} />
}
