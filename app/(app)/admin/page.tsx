import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: pendingUsers } = await supabase
    .from('profiles')
    .select('id, name, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  const { data: approvedMembers } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('status', 'approved')
    .order('name', { ascending: true })

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">관리자 페이지</h1>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingUsers?.length ?? 0})</h2>
        <ul className="flex flex-col gap-3">
          {pendingUsers?.map((user) => (
            <li key={user.id} className="flex items-center justify-between rounded border p-3">
              <span>{user.name}</span>
              <div className="flex gap-2">
                <form action={approveUser.bind(null, user.id)}>
                  <button type="submit" className="rounded bg-black px-3 py-1 text-sm text-white">
                    승인
                  </button>
                </form>
                <form action={rejectUser.bind(null, user.id)}>
                  <button type="submit" className="rounded border px-3 py-1 text-sm">
                    거부
                  </button>
                </form>
              </div>
            </li>
          ))}
          {pendingUsers?.length === 0 && (
            <p className="text-sm text-gray-500">대기 중인 가입 신청이 없습니다.</p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">멤버 ({approvedMembers?.length ?? 0})</h2>
        <ul className="flex flex-col gap-3">
          {approvedMembers?.map((member) => (
            <li key={member.id} className="flex items-center justify-between rounded border p-3">
              <span>{member.name}</span>
              {member.role !== 'admin' && (
                <form action={rejectUser.bind(null, member.id)}>
                  <button type="submit" className="rounded border px-3 py-1 text-sm text-red-600">
                    강퇴
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
