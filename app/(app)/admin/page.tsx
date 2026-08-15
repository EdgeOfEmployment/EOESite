import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function AdminPage() {
  const supabase = await createClient()

  const [
    { data: pendingUsers, error: pendingError },
    { data: approvedMembers, error: approvedError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, name, role')
      .eq('status', 'approved')
      .order('name', { ascending: true }),
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []

  return (
    <PageShell title="관리자 페이지">
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingList.length})</h2>
        <ul className="flex flex-col gap-3">
          {pendingList.map((user) => (
            <Card key={user.id} as="li" padding="sm" className="flex items-center justify-between">
              <span>{user.name}</span>
              <div className="flex gap-2">
                <form action={approveUser.bind(null, user.id)}>
                  <Button type="submit">승인</Button>
                </form>
                <form action={rejectUser.bind(null, user.id)}>
                  <Button type="submit" variant="secondary">
                    거부
                  </Button>
                </form>
              </div>
            </Card>
          ))}
          {pendingList.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">대기 중인 가입 신청이 없습니다.</p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">멤버 ({approvedList.length})</h2>
        <ul className="flex flex-col gap-3">
          {approvedList.map((member) => (
            <Card key={member.id} as="li" padding="sm" className="flex items-center justify-between">
              <span>{member.name}</span>
              {member.role !== 'admin' && (
                <form action={rejectUser.bind(null, member.id)}>
                  <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                    강퇴
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </ul>
      </section>
    </PageShell>
  )
}
