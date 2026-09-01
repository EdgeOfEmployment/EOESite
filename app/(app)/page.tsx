import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

function monthRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { start: todayStart, end: todayEnd } = todayRangeUtc()
  const { start: monthStart, end: monthEnd } = monthRangeUtc()

  const [session, { data: members }, { data: todaysPosts }, { data: monthPosts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id').gte('created_at', todayStart).lt('created_at', todayEnd),
    supabase
      .from('checkin_posts')
      .select('author_id, fine_amount, paid')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd),
  ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const todaysAuthorIds = (todaysPosts ?? []).map((p) => p.author_id as string)
  const unpaidMonthPosts = (monthPosts ?? []).filter((p) => !p.paid)
  const monthFinePosts = unpaidMonthPosts.map((p) => ({
    authorId: p.author_id as string,
    fineAmount: p.fine_amount as number,
  }))

  const statusRows = buildTodayStatus(memberSummaries, todaysAuthorIds)
  const fineRows = buildMonthlyFineTotals(memberSummaries, monthFinePosts)
  const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false

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
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
          </tr>
        </thead>
        <tbody>
          {fineRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.totalFine.toLocaleString('ko-KR')}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
