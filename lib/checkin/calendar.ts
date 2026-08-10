import type { CheckinType } from './types'

export interface CalendarPost {
  id: string
  authorId: string
  authorName: string
  type: CheckinType
  createdAt: string
}

export interface CalendarDay {
  date: string
  inMonth: boolean
  posts: CalendarPost[]
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildMonthCalendar(year: number, month: number, posts: CalendarPost[]): CalendarDay[][] {
  const postsByDate = new Map<string, CalendarPost[]>()
  for (const post of posts) {
    const key = post.createdAt.slice(0, 10)
    const list = postsByDate.get(key) ?? []
    list.push(post)
    postsByDate.set(key, list)
  }

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startWeekday = firstOfMonth.getUTCDay()
  const cursor = new Date(firstOfMonth)
  cursor.setUTCDate(cursor.getUTCDate() - startWeekday)

  const weeks: CalendarDay[][] = []

  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = []
    for (let day = 0; day < 7; day++) {
      const key = toDateKey(cursor)
      days.push({
        date: key,
        inMonth: cursor.getUTCMonth() === month - 1,
        posts: postsByDate.get(key) ?? [],
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(days)
  }

  return weeks
}

export function groupPostsByMember(
  posts: CalendarPost[]
): { authorId: string; authorName: string; posts: CalendarPost[] }[] {
  const map = new Map<string, { authorId: string; authorName: string; posts: CalendarPost[] }>()

  for (const post of posts) {
    const existing = map.get(post.authorId)
    if (existing) {
      existing.posts.push(post)
    } else {
      map.set(post.authorId, { authorId: post.authorId, authorName: post.authorName, posts: [post] })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.authorName.localeCompare(b.authorName))
}
