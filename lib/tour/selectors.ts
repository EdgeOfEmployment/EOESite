import type { CheckinPost } from '@/lib/checkin/types'
import type { CalendarPost } from '@/lib/checkin/calendar'
import { getKstDateString, kstMonthKey } from '@/lib/checkin/time'
import type { CalendarJobPost } from '@/lib/jobposts/calendar'
import type { FeedbackComment } from '@/lib/jobposts/types'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { buildCodingDashboardWidget, findWeekForDate, type CodingDashboardWidget } from '@/lib/coding/dashboard-widget'
import type { CodingWeek } from '@/lib/coding/types'
import { groupQasByAuthor, type InterviewQaGroup } from '@/lib/interviews/grouping'
import type { BankProblemSummary } from '@/lib/problems/types'
import type { TourFixtures } from './fixtures'

/**
 * The /tour counterparts of the real pages' queries: each one shapes fixtures exactly the way
 * the matching Supabase read shapes rows, so the shared views receive identical props.
 */

const CODING_WIDGET_LIMIT = 2

export function checkinPostsOn(fixtures: TourFixtures, kstDate: string): CheckinPost[] {
  return fixtures.checkinPosts.filter((post) => getKstDateString(post.createdAt) === kstDate)
}

export function todaysAuthorIds(fixtures: TourFixtures): string[] {
  return checkinPostsOn(fixtures, fixtures.today).map((post) => post.authorId)
}

/** Like `getMonthlyFines`: this KST month's late fines and manual fines together. */
export function monthFines(fixtures: TourFixtures): { authorId: string; fineAmount: number; paid: boolean }[] {
  const month = kstMonthKey(fixtures.today)
  const inMonth = (iso: string) => kstMonthKey(getKstDateString(iso)) === month

  return [
    ...fixtures.checkinPosts
      .filter((post) => inMonth(post.createdAt))
      .map((post) => ({
        authorId: post.authorId,
        fineAmount: post.fineAmount,
        paid: fixtures.paidPostIds.includes(post.id),
      })),
    ...fixtures.manualFines
      .filter((fine) => inMonth(fine.createdAt))
      .map((fine) => ({ authorId: fine.userId, fineAmount: fine.amount, paid: fine.paid })),
  ]
}

/** Like /checkin/calendar's read, which bounds the month in UTC. */
export function checkinCalendarPosts(fixtures: TourFixtures, year: number, month: number): CalendarPost[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return fixtures.checkinPosts
    .filter((post) => post.createdAt.startsWith(prefix))
    .map((post) => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      createdAt: post.createdAt,
      isLate: post.isLate,
    }))
}

export function jobPostCalendarPosts(fixtures: TourFixtures, year: number, month: number): CalendarJobPost[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return fixtures.jobPosts
    .filter((post) => post.postDate.startsWith(prefix))
    .map((post) => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      companyName: post.companyName,
      postDate: post.postDate,
    }))
}

export function codingWidget(fixtures: TourFixtures): CodingDashboardWidget<CodingWeek> {
  const week = findWeekForDate(fixtures.codingWeeks, fixtures.today)
  const problems = week ? fixtures.codingProblems[week.id] ?? [] : []
  const completed = problems
    .filter((problem) => problem.checks.some((check) => check.userId === fixtures.me.id))
    .map((problem) => problem.id)

  return buildCodingDashboardWidget(
    fixtures.codingWeeks,
    problems,
    completed,
    fixtures.me.id,
    fixtures.today,
    CODING_WIDGET_LIMIT
  )
}

export function problemSummaries(fixtures: TourFixtures): BankProblemSummary[] {
  return fixtures.bankProblems
    .map((problem) => ({
      id: problem.id,
      company: problem.company,
      title: problem.title,
      authorName: problem.authorName,
      createdAt: problem.createdAt,
      returnType: problem.signature.returnType,
      paramCount: problem.signature.params.length,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface TourFeedbackPage {
  heading: string
  authorName: string
  lines: { index: number; questionIndex: number; question: string; text: string; comments: FeedbackComment[] }[]
}

/** Like /feedback/[id]'s read: lines with their comment trees. `null` for an unknown id. */
export function feedbackPage(fixtures: TourFixtures, id: string): TourFeedbackPage | null {
  const doc = fixtures.feedbackDocs.find((d) => d.id === id)
  if (!doc) return null

  const commentsByLine = groupCommentsByLine(doc.comments)
  return {
    heading: doc.heading,
    authorName: doc.authorName,
    lines: doc.lines.map((line, index) => ({ index, ...line, comments: commentsByLine.get(index) ?? [] })),
  }
}

export function sessionQaGroups(fixtures: TourFixtures, sessionId: string): InterviewQaGroup[] {
  return groupQasByAuthor(fixtures.interviewQas.filter((qa) => qa.sessionId === sessionId))
}
