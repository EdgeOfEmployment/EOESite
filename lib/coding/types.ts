export interface Member {
  id: string
  name: string
}

export interface CodingWeek {
  id: string
  label: string
  startDate: string
  endDate: string
}

export interface CodingCheck {
  userId: string
  commitSha: string | null
  filePath: string | null
  source: 'auto' | 'manual'
}

export interface CodingProblem {
  id: string
  title: string
  link: string
  createdBy: string
  createdAt: string
  assigneeIds: string[]
  checks: CodingCheck[]
}
