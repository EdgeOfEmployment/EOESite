export interface JobPostReaction {
  id: string
  authorId: string
  emoji: string
}

export interface JobPostQuestion {
  question: string
  answer: string
}

export interface JobPost {
  id: string
  authorId: string
  authorName: string
  postDate: string
  companyName: string
  postingInfo: string | null
  questions: JobPostQuestion[]
  feedbackRequested: boolean
  feedbackDocId: string | null
  createdAt: string
  reactions: JobPostReaction[]
}

export interface FeedbackLine {
  questionIndex: number
  question: string
  text: string
}

export interface FlatFeedbackComment {
  id: string
  lineIndex: number
  parentCommentId: string | null
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface FeedbackComment extends FlatFeedbackComment {
  replies: FeedbackComment[]
}
