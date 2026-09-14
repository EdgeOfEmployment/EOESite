import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday, type MemberSummary } from '@/lib/checkin/status'
import { buildMonthlyFineTotals, FINES_TAG } from '@/lib/checkin/fines'
import { getKstDateString, kstDayRangeUtc, kstMonthRangeUtc, kstMonthKey, checkinFeedTag } from '@/lib/checkin/time'
import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
import { buildCodingDashboardWidget, findWeekForDate } from '@/lib/coding/dashboard-widget'
import { getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/skeleton'

const CODING_WIDGET_LIMIT = 2

/**
 * The dashboard's four streamed boundaries (`TodayAlert`, `CodingWidget`, `StatusTable`,
 * `FineTables`) each need "today" in KST, but — unlike /checkin's `resolveDayContext`, which
 * `DayHeader` and `FeedContent` must agree on exactly or the visible date heading and the shown
 * posts would mismatch — nothing here compares two boundaries' notion of "today" against each
 * other: one boundary uses it for a per-day tag, one for a week lookup, one for a month key. A
 * few milliseconds of possible disagreement at the exact instant of KST midnight is not
 * user-visible in any of those. This helper exists only so the four call sites don't each retype
 * `getKstDateString(new Date().toISOString())`; each still calls it independently, at its own
 * render time, exactly as before.
 */
function todayKst(): string {
  return getKstDateString(new Date().toISOString())
}

interface MonthFine {
  authorId: string
  fineAmount: number
  paid: boolean
}

/**
 * Today's check-in status, cached under the SAME tag /checkin already uses for the same
 * KST day: `checkinFeedTag(date)`. That is the whole point of the choice: `revalidateCheckinDay()`
 * in app/(app)/checkin/actions.ts already fires that same helper's tag on every post, comment,
 * reaction and goal edit, so this scope is correctly invalidated with no new plumbing — and
 * `revalidatePath('/')` can be deleted in Task 5 rather than replaced.
 *
 * `todayKstDate` is computed from `new Date()` OUTSIDE this scope and passed in. A `'use cache'`
 * function that computed "today" itself would freeze that value at cache-fill time and serve
 * it forever; passing it also folds it into the key, so KST midnight rolls over on its own.
 *
 * `cacheLife('seconds')` matches /checkin's treatment of today: stale 30s / revalidate 1s /
 * expire 60s. The honest guarantee is the one Phase 4 documented — instant for the member
 * who acts (updateTag clears their client cache), about a second plus one request for
 * another member who navigates.
 *
 * RLS: checkin_posts grants SELECT to any approved member with no ownership clause
 * (supabase/migrations/0009_checkin_desk_goal.sql), as does profiles, so the cookie-free
 * cache client is safe here.
 */
async function getTodayCheckinStatus(
  todayKstDate: string
): Promise<{ members: MemberSummary[]; todaysAuthorIds: string[] }> {
  'use cache'
  cacheTag(checkinFeedTag(todayKstDate), MEMBER_NAMES_TAG)
  cacheLife('seconds')

  const supabase = createCacheClient()
  const { start, end } = kstDayRangeUtc(todayKstDate)

  const [{ data: members }, { data: todaysPosts }] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id').gte('created_at', start).lt('created_at', end),
  ])

  return {
    members: (members ?? []).map((m) => ({ id: m.id, name: m.name as string })),
    todaysAuthorIds: (todaysPosts ?? []).map((p) => p.author_id as string),
  }
}

/**
 * This month's fines, late and manual together. Tagged `FINES_TAG`, which Task 5 wires to the
 * five admin fine actions, to `createCheckinPost` (which writes `fine_amount`), and to
 * `deleteCheckinPost` (which can delete a row that was carrying a nonzero `fine_amount`).
 *
 * Keyed by MONTH, not by day: this query already reads the whole month, so keying the cache by
 * the exact day would mint a fresh entry — and guarantee a miss — at every KST midnight, for
 * data that is otherwise identical all month. `kstMonthKey` collapses any date in a month to the
 * same `"YYYY-MM"` key, and `kstMonthRangeUtc` accepts that key exactly as it accepts a full date.
 *
 * RLS: manual_fines grants SELECT to any approved member (0011_manual_fines.sql:15).
 */
async function getMonthlyFines(
  monthKey: string
): Promise<{ members: MemberSummary[]; fines: MonthFine[] }> {
  'use cache'
  cacheTag(FINES_TAG, MEMBER_NAMES_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { start, end } = kstMonthRangeUtc(monthKey)

  const [{ data: members }, { data: monthPosts }, { data: monthManualFines }] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('checkin_posts')
      .select('author_id, fine_amount, paid')
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('manual_fines')
      .select('user_id, amount, paid')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  return {
    members: (members ?? []).map((m) => ({ id: m.id, name: m.name as string })),
    fines: [
      ...(monthPosts ?? []).map((p) => ({
        authorId: p.author_id as string,
        fineAmount: p.fine_amount as number,
        paid: p.paid as boolean,
      })),
      ...(monthManualFines ?? []).map((f) => ({
        authorId: f.user_id as string,
        fineAmount: f.amount as number,
        paid: f.paid as boolean,
      })),
    ],
  }
}

export default function DashboardPage() {
  return (
    <PageShell title="대시보드" width="3xl">
      <Suspense fallback={<TodayAlertSkeleton />}>
        <TodayAlert />
      </Suspense>

      <Link href="/checkin" className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400">
        인증 보러가기
      </Link>

      <Suspense fallback={null}>
        <CodingWidget />
      </Suspense>

      <Suspense fallback={<StatusTableSkeleton />}>
        <StatusTable />
      </Suspense>

      <Suspense fallback={<FineTablesSkeleton />}>
        <FineTables />
      </Suspense>
    </PageShell>
  )
}

function TodayAlertSkeleton() {
  return <Skeleton className="h-12 w-full" />
}

function StatusTableSkeleton() {
  return <Skeleton className="mt-6 h-48 w-full" />
}

function FineTablesSkeleton() {
  return (
    <>
      <Skeleton className="mt-8 h-6 w-40" />
      <Skeleton className="mt-2 h-48 w-full" />
    </>
  )
}

/**
 * Split from `StatusTable` below rather than bundled into one component. The CURRENT (pre-Phase-5)
 * page renders the alert first, then the checkin link, then the coding widget, and only THEN the
 * status table — bundling "today's checkin status" into one Suspense boundary would have moved
 * the table up above the link and widget, silently reordering the page as a side effect of adding
 * caching. Both this and `StatusTable` call `getTodayCheckinStatus`, which is intentional: it is a
 * `'use cache'` scope, so the second call within the same render is a cache hit, not a second
 * Supabase round trip — the split costs nothing and preserves the existing visual order exactly.
 */
export async function TodayAlert() {
  // Required before touching `new Date()` (inside `todayKst()` below) — this Next.js
  // version's prerenderer needs a request-time read (cookies/headers/searchParams/
  // connection) before any `new Date()` call, or it can't tell the render is meant to be
  // dynamic. See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md.
  await connection()

  const [session, { todaysAuthorIds }] = await Promise.all([
    getSessionProfile(),
    getTodayCheckinStatus(todayKst()),
  ])

  const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false

  return posted ? (
    <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
  ) : (
    <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
  )
}

export async function StatusTable() {
  // Required before touching `new Date()` (inside `todayKst()` below) — this Next.js
  // version's prerenderer needs a request-time read (cookies/headers/searchParams/
  // connection) before any `new Date()` call, or it can't tell the render is meant to be
  // dynamic. See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md.
  await connection()

  const { members, todaysAuthorIds } = await getTodayCheckinStatus(todayKst())
  const statusRows = buildTodayStatus(members, todaysAuthorIds)

  return (
    <table className="mt-6 w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
          <th className="border border-gray-200 p-2 dark:border-gray-800">10시 인증</th>
        </tr>
      </thead>
      <tbody>
        {statusRows.map((row) => (
          <tr key={row.member.id}>
            <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
            <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
              {row.posted ? '✅' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * The week and problem rows come from the shared cached accessors in lib/coding/queries.ts,
 * so this widget and /coding read the same scopes under the same `CODING_BOARD_TAG` tag. Only
 * the caller's own completions are per-member, so only that read stays uncached.
 */
export async function CodingWidget() {
  const session = await getSessionProfile()

  if (session?.status !== 'approved') return null

  const today = todayKst()
  const weeks = await getCodingWeeks()
  const targetWeek = findWeekForDate(weeks, today)
  const problems = targetWeek ? await getCodingWeekBoard(targetWeek.id) : []
  const problemIds = problems.map((p) => p.id)

  const supabase = await createClient()
  const { data: checksData } = await queryIfAny(problemIds, () =>
    supabase.from('coding_checks').select('problem_id').eq('user_id', session.userId).in('problem_id', problemIds)
  )

  const completedProblemIds = (checksData ?? []).map((c) => c.problem_id as string)

  const codingWidget = buildCodingDashboardWidget(
    weeks,
    problems,
    completedProblemIds,
    session.userId,
    today,
    CODING_WIDGET_LIMIT
  )

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">이번 주 코딩 문제</h2>

      {codingWidget.status === 'no-week' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          이번 주 주차가 아직 생성되지 않았습니다.
        </p>
      )}
      {codingWidget.status === 'no-problems' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 문제가 아직 등록되지 않았습니다.</p>
      )}
      {codingWidget.status === 'no-assignment' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 나에게 할당된 문제가 없습니다.</p>
      )}
      {codingWidget.status === 'assigned' && (
        <ul className="mt-2 flex flex-col gap-1">
          {codingWidget.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  item.completed
                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {item.completed ? '완료' : '미완료'}
              </span>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={codingWidget.week ? `/coding?week=${codingWidget.week.id}` : '/coding'}
        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        코딩 보드 바로가기
      </Link>
    </Card>
  )
}

export async function FineTables() {
  // Required before touching `new Date()` (inside `todayKst()` below) — this Next.js
  // version's prerenderer needs a request-time read (cookies/headers/searchParams/
  // connection) before any `new Date()` call, or it can't tell the render is meant to be
  // dynamic. See node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md.
  await connection()

  const { members, fines } = await getMonthlyFines(kstMonthKey(todayKst()))

  const allMonthFinePosts = fines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
  const unpaidMonthFinePosts = fines
    .filter((f) => !f.paid)
    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))

  const unpaidFineRows = buildMonthlyFineTotals(members, unpaidMonthFinePosts)
  const totalFineRows = buildMonthlyFineTotals(members, allMonthFinePosts)

  const unpaidMonthTotal = unpaidMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
  const allMonthTotal = allMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">이번 달 벌금 정산</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        미납액 합계 {unpaidMonthTotal.toLocaleString('ko-KR')}원 · 벌금 총액 합계 {allMonthTotal.toLocaleString('ko-KR')}원
      </p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금 총액</th>
          </tr>
        </thead>
        <tbody>
          {unpaidFineRows.map((row, index) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.totalFine.toLocaleString('ko-KR')}원
              </td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {totalFineRows[index].totalFine.toLocaleString('ko-KR')}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
