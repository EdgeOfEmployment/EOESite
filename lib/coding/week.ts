export interface WeekGroup<T> {
  weekOf: string
  items: T[]
}

export function getMostRecentTuesday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = (day - 2 + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function formatWeekLabel(weekOf: string): string {
  const [, month, day] = weekOf.split('-')
  return `${Number(month)}/${Number(day)} 주차`
}

export function groupByWeek<T extends { weekOf: string }>(items: T[]): WeekGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(item.weekOf) ?? []
    list.push(item)
    map.set(item.weekOf, list)
  }
  return Array.from(map.entries())
    .map(([weekOf, items]) => ({ weekOf, items }))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
}
