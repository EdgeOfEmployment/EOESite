import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import { setCheckinPostPaid } from './fine-actions'
import { groupLateFinesByMonth, type LateFineRow } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

function formatFineDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ showPaid?: string }>
}) {
  const { showPaid: showPaidParam } = await searchParams
  const showPaid = showPaidParam === '1'

  const supabase = await createClient()

  const [
    { data: pendingUsers, error: pendingError },
    { data: approvedMembers, error: approvedError },
    { data: lateFines, error: lateFinesError },
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
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, fine_amount, paid')
      .eq('is_late', true)
      .gt('fine_amount', 0)
      .order('created_at', { ascending: false }),
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  if (lateFinesError) {
    console.error('admin page: failed to fetch late fines', lateFinesError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []
  const nameById = new Map(approvedList.map((m) => [m.id, m.name as string]))

  const lateFineRows: LateFineRow[] = (lateFines ?? [])
    .filter((post) => showPaid || !post.paid)
    .map((post) => ({
      postId: post.id,
      memberName: nameById.get(post.author_id) ?? '알 수 없음',
      createdAt: post.created_at,
      fineAmount: post.fine_amount,
      paid: post.paid,
    }))

  const fineGroups = groupLateFinesByMonth(lateFineRows)

  return (
    <PageShell title="관리자 페이지">
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingList.length})</h2>
        {pendingList.length === 0 ? (
          <EmptyState message="대기 중인 가입 신청이 없습니다." />
        ) : (
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
          </ul>
        )}
      </section>

      <section className="mb-10">
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

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">지각 벌금 관리</h2>
          <Link
            href={showPaid ? '/admin' : '/admin?showPaid=1'}
            className="text-sm text-gray-500 underline dark:text-gray-400"
          >
            {showPaid ? '미납 건만 보기' : '납부 내역 보기'}
          </Link>
        </div>
        {fineGroups.length === 0 ? (
          <EmptyState message={showPaid ? '지각 벌금 내역이 없습니다.' : '미납된 벌금이 없습니다.'} />
        ) : (
          <div className="flex flex-col gap-6">
            {fineGroups.map((group) => (
              <div key={group.monthLabel}>
                <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">{group.monthLabel}</h3>
                <ul className="flex flex-col gap-3">
                  {group.rows.map((row) => (
                    <Card key={row.postId} as="li" padding="sm" className="flex items-center justify-between">
                      <span>
                        {formatFineDate(row.createdAt)} · {row.memberName} · {row.fineAmount.toLocaleString('ko-KR')}원
                      </span>
                      <form action={setCheckinPostPaid.bind(null, row.postId, !row.paid)}>
                        <Button type="submit" variant="secondary">
                          {row.paid ? '미납으로 표시' : '납부완료로 표시'}
                        </Button>
                      </form>
                    </Card>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}
