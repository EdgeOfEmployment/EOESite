export interface DashboardWidgetProblem {
  id: string
  title: string
  link: string
  completed: boolean
}

export type CodingDashboardStatus = 'no-week' | 'no-problems' | 'no-assignment' | 'assigned'

export interface CodingDashboardWidget<Week> {
  status: CodingDashboardStatus
  week: Week | null
  items: DashboardWidgetProblem[]
}

export function findWeekForDate<T extends { startDate: string; endDate: string }>(
  weeks: T[],
  date: string
): T | null {
  return weeks.find((week) => week.startDate <= date && date <= week.endDate) ?? null
}

export function selectAssignedProblems(
  problems: { id: string; title: string; link: string; createdAt: string; assigneeIds: string[] }[],
  completedProblemIds: string[],
  userId: string,
  limit: number
): DashboardWidgetProblem[] {
  const completed = new Set(completedProblemIds)
  const mine = problems.filter((p) => p.assigneeIds.length === 0 || p.assigneeIds.includes(userId))

  const sorted = [...mine].sort((a, b) => {
    const aCompleted = completed.has(a.id)
    const bCompleted = completed.has(b.id)
    if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
    return b.createdAt.localeCompare(a.createdAt)
  })

  return sorted.slice(0, limit).map((p) => ({
    id: p.id,
    title: p.title,
    link: p.link,
    completed: completed.has(p.id),
  }))
}

export function buildCodingDashboardWidget<Week extends { id: string; startDate: string; endDate: string }>(
  weeks: Week[],
  problems: { id: string; title: string; link: string; createdAt: string; assigneeIds: string[] }[],
  completedProblemIds: string[],
  userId: string,
  todayDate: string,
  limit: number
): CodingDashboardWidget<Week> {
  const week = findWeekForDate(weeks, todayDate)
  if (!week) return { status: 'no-week', week: null, items: [] }

  if (problems.length === 0) return { status: 'no-problems', week, items: [] }

  const items = selectAssignedProblems(problems, completedProblemIds, userId, limit)
  if (items.length === 0) return { status: 'no-assignment', week, items: [] }

  return { status: 'assigned', week, items }
}
