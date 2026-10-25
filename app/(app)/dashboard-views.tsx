import Link from 'next/link'
import { buildTodayStatus, type MemberSummary } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import type { CodingDashboardWidget } from '@/lib/coding/dashboard-widget'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'

// Pure markup for the dashboard's streamed boundaries in page.tsx, which keep all the data
// reads and caching. /tour renders these same views from fixtures.

export interface MonthFine {
  authorId: string
  fineAmount: number
  paid: boolean
}

export function TodayAlertView({ posted }: { posted: boolean }) {
  return posted ? (
    <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
  ) : (
    <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
  )
}

export function StatusTableView({
  members,
  todaysAuthorIds,
}: {
  members: MemberSummary[]
  todaysAuthorIds: string[]
}) {
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

export function CodingWidgetView({
  widget,
  basePath = '',
}: {
  widget: CodingDashboardWidget<{ id: string }>
  basePath?: string
}) {
  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">이번 주 코딩 문제</h2>

      {widget.status === 'no-week' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          이번 주 주차가 아직 생성되지 않았습니다.
        </p>
      )}
      {widget.status === 'no-problems' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 문제가 아직 등록되지 않았습니다.</p>
      )}
      {widget.status === 'no-assignment' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 나에게 할당된 문제가 없습니다.</p>
      )}
      {widget.status === 'assigned' && (
        <ul className="mt-2 flex flex-col gap-1">
          {widget.items.map((item) => (
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
        href={widget.week ? `${basePath}/coding?week=${widget.week.id}` : `${basePath}/coding`}
        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        코딩 보드 바로가기
      </Link>
    </Card>
  )
}

export function FineTablesView({ members, fines }: { members: MemberSummary[]; fines: MonthFine[] }) {
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
