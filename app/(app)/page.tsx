import { createClient } from '@/lib/supabase/server'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from '@/lib/checkin/status'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase.from('profiles').select('id, name').eq('status', 'approved')

  const { start, end } = todayRangeUtc()
  const { data: todaysPosts } = await supabase
    .from('checkin_posts')
    .select('author_id, type')
    .gte('created_at', start)
    .lt('created_at', end)

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const posts = (todaysPosts ?? []).map((p) => ({ authorId: p.author_id, type: p.type as CheckinType }))

  const statusRows = buildTodayStatus(memberSummaries, posts)
  const missingTypes = user ? getMissingTypes(user.id, posts) : []

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {missingTypes.length > 0 ? (
        <p className="mt-2 text-sm text-amber-600">
          오늘 아직 {missingTypes.map((t) => CHECKIN_TYPE_LABELS[t]).join(', ')} 인증을 하지 않았어요.
        </p>
      ) : (
        <p className="mt-2 text-sm text-green-600">오늘의 인증을 모두 완료했어요!</p>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">멤버</th>
            {CHECKIN_TYPES.map((type) => (
              <th key={type} className="border p-2">
                {CHECKIN_TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border p-2">{row.member.name}</td>
              {CHECKIN_TYPES.map((type) => (
                <td key={type} className="border p-2 text-center">
                  {row.completed[type] ? '✅' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
