export interface Member {
  id: string
  name: string
}

export interface CodingProblem {
  id: string
  title: string
  link: string
  weekOf: string
  createdBy: string
  createdAt: string
  checkedUserIds: string[]
}
