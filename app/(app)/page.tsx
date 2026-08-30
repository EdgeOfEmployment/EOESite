import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from '@/lib/checkin/status'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { start, end } = todayRangeUtc()

  const [session, { data: members }, { data: todaysPosts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id, type').gte('created_at', start).lt('created_at', end),
  ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const posts = (todaysPosts ?? []).map((p) => ({ authorId: p.author_id, type: p.type as CheckinType }))

  const statusRows = buildTodayStatus(memberSummaries, posts)
  const missingTypes = session ? getMissingTypes(session.userId, posts) : []

  return (
    <PageShell title="대시보드" width="3xl">
      {missingTypes.length > 0 ? (
        <Alert variant="warning">
          오늘 아직 {missingTypes.map((t) => CHECKIN_TYPE_LABELS[t]).join(', ')} 인증을 하지 않았어요.
        </Alert>
      ) : (
        <Alert variant="success">오늘의 인증을 모두 완료했어요!</Alert>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            {CHECKIN_TYPES.map((type) => (
              <th key={type} className="border border-gray-200 p-2 dark:border-gray-800">
                {CHECKIN_TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              {CHECKIN_TYPES.map((type) => (
                <td key={type} className="border border-gray-200 p-2 text-center dark:border-gray-800">
                  {row.completed[type] ? '✅' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
