import type { CheckinType } from './types'

export const CHECKIN_TYPES: CheckinType[] = ['wake', 'study', 'goal']

export interface MemberSummary {
  id: string
  name: string
}

export interface TodayPost {
  authorId: string
  type: CheckinType
}

export interface TodayStatusRow {
  member: MemberSummary
  completed: Record<CheckinType, boolean>
}

export function buildTodayStatus(members: MemberSummary[], todaysPosts: TodayPost[]): TodayStatusRow[] {
  return members.map((member) => {
    const completed = {} as Record<CheckinType, boolean>
    for (const type of CHECKIN_TYPES) {
      completed[type] = todaysPosts.some((post) => post.authorId === member.id && post.type === type)
    }
    return { member, completed }
  })
}

export function getMissingTypes(userId: string, todaysPosts: TodayPost[]): CheckinType[] {
  return CHECKIN_TYPES.filter(
    (type) => !todaysPosts.some((post) => post.authorId === userId && post.type === type)
  )
}
