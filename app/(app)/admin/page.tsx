import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import {
  setCheckinPostPaid,
  cancelCheckinFine,
  addManualFine,
  deleteManualFine,
  setManualFinePaid,
} from './fine-actions'
import { groupFinesByMonth, type FineRow } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select, Label } from '@/components/ui/input'

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
    { data: allProfiles, error: allProfilesError },
    { data: lateFines, error: lateFinesError },
    { data: manualFines, error: manualFinesError },
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
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, fine_amount, paid')
      .eq('is_late', true)
      .gt('fine_amount', 0)
      .order('created_at', { ascending: false }),
    supabase
      .from('manual_fines')
      .select('id, user_id, amount, reason, created_at, paid')
      .order('created_at', { ascending: false }),
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  if (allProfilesError) {
    console.error('admin page: failed to fetch profiles for fine list names', allProfilesError)
  }

  if (lateFinesError) {
    console.error('admin page: failed to fetch late fines', lateFinesError)
  }

  if (manualFinesError) {
    console.error('admin page: failed to fetch manual fines', manualFinesError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []
  // Looked up from all profiles (not just approved) so a member who was later
  // rejected/kicked still shows by name against any fine they still owe.
  const nameById = new Map((allProfiles ?? []).map((p) => [p.id, p.name as string]))

  const lateFineRows: FineRow[] = (lateFines ?? [])
    .filter((post) => showPaid || !post.paid)
    .map((post) => ({
      id: post.id,
      kind: 'late' as const,
      memberName: nameById.get(post.author_id) ?? '알 수 없음',
      createdAt: post.created_at,
      amount: post.fine_amount,
      paid: post.paid,
    }))

  const manualFineRows: FineRow[] = (manualFines ?? [])
    .filter((fine) => showPaid || !fine.paid)
    .map((fine) => ({
      id: fine.id,
      kind: 'manual' as const,
      memberName: nameById.get(fine.user_id) ?? '알 수 없음',
      createdAt: fine.created_at,
      amount: fine.amount,
      paid: fine.paid,
      reason: fine.reason,
    }))

  const fineGroups = groupFinesByMonth([...lateFineRows, ...manualFineRows])

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
          <h2 className="text-lg font-semibold">벌금 관리</h2>
          <Link
            href={showPaid ? '/admin' : '/admin?showPaid=1'}
            className="text-sm text-gray-500 underline dark:text-gray-400"
          >
            {showPaid ? '미납 건만 보기' : '납부 내역 보기'}
          </Link>
        </div>

        <Card
          as="form"
          action={addManualFine}
          padding="sm"
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Label htmlFor="manual-fine-user" className="sr-only">
              대상 멤버
            </Label>
            <Select id="manual-fine-user" name="userId" required defaultValue="">
              <option value="" disabled>
                멤버 선택
              </option>
              {approvedList.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Label htmlFor="manual-fine-amount" className="sr-only">
              금액
            </Label>
            <Input id="manual-fine-amount" name="amount" type="number" min="1" step="1" placeholder="금액" required />
          </div>
          <div className="flex-[2]">
            <Label htmlFor="manual-fine-reason" className="sr-only">
              사유
            </Label>
            <Input id="manual-fine-reason" name="reason" type="text" placeholder="사유" required />
          </div>
          <Button type="submit">벌금 추가</Button>
        </Card>

        {fineGroups.length === 0 ? (
          <EmptyState message={showPaid ? '벌금 내역이 없습니다.' : '미납된 벌금이 없습니다.'} />
        ) : (
          <div className="flex flex-col gap-6">
            {fineGroups.map((group) => (
              <div key={group.monthLabel}>
                <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">{group.monthLabel}</h3>
                <ul className="flex flex-col gap-3">
                  {group.rows.map((row) => (
                    <Card key={row.id} as="li" padding="sm" className="flex items-center justify-between gap-3">
                      <span>
                        {formatFineDate(row.createdAt)} · {row.memberName} · {row.amount.toLocaleString('ko-KR')}원
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {row.kind === 'late' ? '지각' : '수동'}
                        </span>
                        {row.reason && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({row.reason})</span>
                        )}
                      </span>
                      <div className="flex gap-2">
                        <form
                          action={
                            row.kind === 'late'
                              ? setCheckinPostPaid.bind(null, row.id, !row.paid)
                              : setManualFinePaid.bind(null, row.id, !row.paid)
                          }
                        >
                          <Button type="submit" variant="secondary">
                            {row.paid ? '미납으로 표시' : '납부완료로 표시'}
                          </Button>
                        </form>
                        <form
                          action={
                            row.kind === 'late'
                              ? cancelCheckinFine.bind(null, row.id)
                              : deleteManualFine.bind(null, row.id)
                          }
                        >
                          <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                            {row.kind === 'late' ? '취소' : '삭제'}
                          </Button>
                        </form>
                      </div>
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
