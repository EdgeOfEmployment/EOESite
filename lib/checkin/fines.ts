import type { MemberSummary } from './status'

export interface MonthlyFinePost {
  authorId: string
  fineAmount: number
}

export interface FineTotalRow {
  member: MemberSummary
  totalFine: number
}

export function buildMonthlyFineTotals(members: MemberSummary[], monthPosts: MonthlyFinePost[]): FineTotalRow[] {
  return members.map((member) => ({
    member,
    totalFine: monthPosts
      .filter((post) => post.authorId === member.id)
      .reduce((sum, post) => sum + post.fineAmount, 0),
  }))
}

export interface LateFineRow {
  postId: string
  memberName: string
  createdAt: string
  fineAmount: number
  paid: boolean
}

export interface MonthlyFineGroup {
  monthLabel: string
  rows: LateFineRow[]
}

export function groupLateFinesByMonth(rows: LateFineRow[]): MonthlyFineGroup[] {
  const rowsByMonthKey = new Map<string, LateFineRow[]>()

  for (const row of rows) {
    const date = new Date(row.createdAt)
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const existing = rowsByMonthKey.get(monthKey)
    if (existing) {
      existing.push(row)
    } else {
      rowsByMonthKey.set(monthKey, [row])
    }
  }

  return Array.from(rowsByMonthKey.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([monthKey, monthRows]) => ({ monthLabel: formatMonthLabel(monthKey), rows: monthRows }))
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}년 ${month}월`
}
