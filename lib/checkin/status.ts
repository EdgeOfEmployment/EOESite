export interface MemberSummary {
  id: string
  name: string
}

export interface TodayStatusRow {
  member: MemberSummary
  posted: boolean
}

export function buildTodayStatus(members: MemberSummary[], todaysAuthorIds: string[]): TodayStatusRow[] {
  return members.map((member) => ({ member, posted: todaysAuthorIds.includes(member.id) }))
}

export function hasPostedToday(userId: string, todaysAuthorIds: string[]): boolean {
  return todaysAuthorIds.includes(userId)
}
