export type CheckinType = 'wake' | 'study' | 'goal'

export const CHECKIN_TYPE_LABELS: Record<CheckinType, string> = {
  wake: '기상',
  study: '스터디',
  goal: '목표달성',
}

export const REACTION_EMOJIS = ['👍', '🎉', '💪'] as const

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
  type: CheckinType
  photoUrl: string | null
  body: string
  createdAt: string
  comments: CheckinComment[]
  reactions: CheckinReaction[]
}
