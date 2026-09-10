export const REACTION_EMOJIS = ['👍', '🎉', '💪'] as const

export type CheckinGoalStatus = 'todo' | 'partial' | 'done'

export interface CheckinGoal {
  body: string
  status: CheckinGoalStatus
  completedAt: string | null
}

export interface CheckinComment {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface CheckinReaction {
  id: string
  authorId: string
  emoji: string
}

export interface CheckinPost {
  id: string
  authorId: string
  authorName: string
  photoUrl: string
  goals: CheckinGoal[]
  createdAt: string
  isLate: boolean
  fineAmount: number
  comments: CheckinComment[]
  reactions: CheckinReaction[]
}
