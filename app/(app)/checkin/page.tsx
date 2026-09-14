import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinGoal } from '@/lib/checkin/types'
import { getKstDateString, kstDayRangeUtc, shiftKstDateString, formatKstDateHeading, checkinFeedTag } from '@/lib/checkin/time'
import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'

// `selectedDate` is derived from both the `date` search param and the current time, which
// the instant validator cannot sample — the same situation Phase 1 hit on the two calendar
// pages. See also the note on /jobposts and /interviews: `prefetch: 'static'` additionally
// requires declared `samples` for headers and search params, which only `prefetch: 'runtime'`
// accepts.
export const unstable_instant = false

type CheckinSearchParams = { error?: string; success?: string; date?: string }

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
    return todayKst
  }

  const parsed = new Date(`${dateParam}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateParam) {
    return todayKst
  }

  return dateParam > todayKst ? todayKst : dateParam
}

/**
 * The single place `{ selectedDate, isToday }` is derived. `DayHeader` and `FeedContent` both
 * need it and both stream independently, so keeping the derivation in one function is what
 * stops the clamping rules and the `isToday` comparison from drifting apart between them.
 */
async function resolveDayContext(
  searchParamsPromise: Promise<CheckinSearchParams>
): Promise<{ selectedDate: string; isToday: boolean }> {
  const { date } = await searchParamsPromise
  const todayKst = getKstDateString(new Date().toISOString())
  const selectedDate = resolveSelectedDate(date, todayKst)

  return { selectedDate, isToday: selectedDate === todayKst }
}

/**
 * `isToday` must be passed in rather than computed here: a `'use cache'` scope would freeze
 * its notion of "today" at cache-fill time and keep serving it. It also joins `date` in the
 * cache key, so at KST midnight the same date is re-read under (date, false) as a fresh
 * long-lived entry while the orphaned (date, true) entry expires within 60 seconds.
 *
 * Today's check-ins are a live accountability signal, so they get the `seconds` profile.
 * Note what that actually promises: `revalidate: 1s` is stale-while-revalidate, so another
 * member's first request past the window still gets the previous entry while a fresh one is
 * built, and `stale: 30s` is a *client* router value, so a member sitting on a warm client
 * cache may not consult the server at all for up to 30s. The member who acts sees their own
 * write immediately, because `updateTag` clears the client cache. Earlier days are immutable
 * history and get `max` (revalidate 30 days); `checkin-feed-${date}` lets an action that
 * touches one day invalidate only that day.
 *
 * The second tag, `member-names`, is the escape hatch for the one thing cached here that is
 * not day-scoped: the `profiles` name lookup. Nothing in the app can rename a member today
 * (admin/actions.ts only ever writes `status`), so a rename is an out-of-band DB edit — but
 * without this tag such an edit would show a stale name on past days for up to 30 days with
 * no way to fix it short of a deploy. `revalidateTag('member-names', 'max')` clears every day.
 */
async function getCheckinPosts(date: string, isToday: boolean): Promise<CheckinPost[]> {
  'use cache'
  cacheTag(checkinFeedTag(date), MEMBER_NAMES_TAG)

  if (isToday) {
    cacheLife('seconds')
  } else {
    cacheLife('max')
  }

  const supabase = createCacheClient()
  const { start, end } = kstDayRangeUtc(date)

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, photo_url, goals, created_at, is_late, fine_amount')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false }),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))
  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: comments }, { data: reactions }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase
        .from('checkin_comments')
        .select('id, post_id, author_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    ),
    queryIfAny(postIds, () =>
      supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
  ])

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    photoUrl: post.photo_url,
    goals: (post.goals ?? []) as CheckinGoal[],
    createdAt: post.created_at,
    isLate: post.is_late,
    fineAmount: post.fine_amount,
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
}

export default function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<CheckinSearchParams>
}) {
  return (
    <PageShell
      title="10시 인증"
      headerExtra={
        <Link href="/checkin/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<DayHeaderSkeleton />}>
        <DayHeader searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
}) {
  const { error: queryError, success } = await searchParamsPromise

  return (
    <>
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
    </>
  )
}

function DayHeaderSkeleton() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-center">
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function FeedSkeleton() {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Reads only the search param — no database access — so the date nav and the post form
 * paint without waiting on the feed's round trip.
 */
export async function DayHeader({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
}) {
  const { selectedDate, isToday } = await resolveDayContext(searchParamsPromise)
  const prevDate = shiftKstDateString(selectedDate, -1)
  const nextDate = shiftKstDateString(selectedDate, 1)

  return (
    <>
      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
        <Link href={`/checkin?date=${prevDate}`} className="underline">
          ◀
        </Link>
        <span className="font-medium">
          {formatKstDateHeading(selectedDate)}
          {isToday ? ' (오늘)' : ''}
        </span>
        {isToday ? (
          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
            ▶
          </span>
        ) : (
          <Link href={`/checkin?date=${nextDate}`} className="underline">
            ▶
          </Link>
        )}
      </div>

      {isToday && <PostForm />}
    </>
  )
}

export async function FeedContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
}) {
  const { selectedDate, isToday } = await resolveDayContext(searchParamsPromise)

  const [session, checkinPosts] = await Promise.all([
    getSessionProfile(),
    getCheckinPosts(selectedDate, isToday),
  ])
  const isAdmin = session?.role === 'admin'

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {checkinPosts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
