export interface WeekNav<T> {
  current: T | null
  prevId: string | null
  nextId: string | null
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatWeekHeader(week: { label: string; startDate: string; endDate: string }): string {
  return `${week.label} (${formatMonthDay(week.startDate)}~${formatMonthDay(week.endDate)})`
}

export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function resolveCurrentWeek<T extends { id: string }>(
  weeks: T[],
  requestedId?: string
): WeekNav<T> {
  if (weeks.length === 0) {
    return { current: null, prevId: null, nextId: null }
  }

  const requestedIndex = requestedId ? weeks.findIndex((week) => week.id === requestedId) : -1
  const currentIndex = requestedIndex === -1 ? 0 : requestedIndex
  const current = weeks[currentIndex]

  return {
    current,
    prevId: currentIndex < weeks.length - 1 ? weeks[currentIndex + 1].id : null,
    nextId: currentIndex > 0 ? weeks[currentIndex - 1].id : null,
  }
}
