export interface InterviewParticipant {
  userId: string
  userName: string
}

export interface InterviewSession {
  id: string
  createdBy: string
  title: string
  sessionAt: string
  description: string | null
  createdAt: string
  participants: InterviewParticipant[]
}

export interface InterviewQuestion {
  question: string
  answer: string
}

export interface InterviewQa {
  id: string
  sessionId: string
  authorId: string
  authorName: string
  questions: InterviewQuestion[]
  feedbackDocId: string
  createdAt: string
}
