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
