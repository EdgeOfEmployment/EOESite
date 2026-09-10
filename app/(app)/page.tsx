import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import { getKstDateString, kstDayRangeUtc, kstMonthRangeUtc } from '@/lib/checkin/time'
import { buildCodingDashboardWidget, findWeekForDate } from '@/lib/coding/dashboard-widget'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'

const CODING_WIDGET_LIMIT = 2

export default async function DashboardPage() {
  const supabase = await createClient()
  const todayKst = getKstDateString(new Date().toISOString())
  const { start: todayStart, end: todayEnd } = kstDayRangeUtc(todayKst)
  const { start: monthStart, end: monthEnd } = kstMonthRangeUtc(todayKst)

  const [session, { data: members }, { data: todaysPosts }, { data: monthPosts }, { data: monthManualFines }] =
    await Promise.all([
      getSessionProfile(),
      supabase.from('profiles').select('id, name').eq('status', 'approved'),
      supabase.from('checkin_posts').select('author_id').gte('created_at', todayStart).lt('created_at', todayEnd),
      supabase
        .from('checkin_posts')
        .select('author_id, fine_amount, paid')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd),
      supabase
        .from('manual_fines')
        .select('user_id, amount, paid')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd),
    ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const todaysAuthorIds = (todaysPosts ?? []).map((p) => p.author_id as string)

  const monthCheckinFines = (monthPosts ?? []).map((p) => ({
    authorId: p.author_id as string,
    fineAmount: p.fine_amount as number,
    paid: p.paid as boolean,
  }))
  const monthManualFinesList = (monthManualFines ?? []).map((f) => ({
    authorId: f.user_id as string,
    fineAmount: f.amount as number,
    paid: f.paid as boolean,
  }))
  const allMonthFines = [...monthCheckinFines, ...monthManualFinesList]

  const allMonthFinePosts = allMonthFines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
  const unpaidMonthFinePosts = allMonthFines
    .filter((f) => !f.paid)
    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))

  const statusRows = buildTodayStatus(memberSummaries, todaysAuthorIds)
  const unpaidFineRows = buildMonthlyFineTotals(memberSummaries, unpaidMonthFinePosts)
  const totalFineRows = buildMonthlyFineTotals(memberSummaries, allMonthFinePosts)
  const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false

  const isApprovedMember = session?.status === 'approved'
  let codingWidget: ReturnType<typeof buildCodingDashboardWidget> | null = null

  if (isApprovedMember) {
    const { data: weeksData } = await supabase.from('coding_weeks').select('id, label, start_date, end_date')

    const weeks = (weeksData ?? []).map((w) => ({
      id: w.id as string,
      label: w.label as string,
      startDate: w.start_date as string,
      endDate: w.end_date as string,
    }))

    const targetWeek = findWeekForDate(weeks, todayKst)

    const { data: problemsData } = await queryIfAny(targetWeek ? [targetWeek.id] : [], () =>
      supabase
        .from('coding_problems')
        .select('id, title, link, created_at, assignee_ids')
        .eq('week_id', targetWeek!.id)
    )

    const problems = (problemsData ?? []).map((p) => ({
      id: p.id as string,
      title: p.title as string,
      link: p.link as string,
      createdAt: p.created_at as string,
      assigneeIds: (p.assignee_ids as string[] | null) ?? [],
    }))

    const problemIds = problems.map((p) => p.id)

    const { data: checksData } = await queryIfAny(problemIds, () =>
      supabase.from('coding_checks').select('problem_id').eq('user_id', session!.userId).in('problem_id', problemIds)
    )

    const completedProblemIds = (checksData ?? []).map((c) => c.problem_id as string)

    codingWidget = buildCodingDashboardWidget(
      weeks,
      problems,
      completedProblemIds,
      session!.userId,
      todayKst,
      CODING_WIDGET_LIMIT
    )
  }

  const unpaidMonthTotal = unpaidMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
  const allMonthTotal = allMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)

  return (
    <PageShell title="대시보드" width="3xl">
      {posted ? (
        <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
      ) : (
        <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
      )}

      <Link href="/checkin" className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400">
        인증 보러가기
      </Link>

      {isApprovedMember && codingWidget && (
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
      )}

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
    </PageShell>
  )
}
