export interface JobPostReaction {
  id: string
  authorId: string
  emoji: string
}

export interface JobPost {
  id: string
  authorId: string
  authorName: string
  postDate: string
  companyName: string
  postingInfo: string | null
  coverLetterText: string
  feedbackRequested: boolean
  feedbackDocId: string | null
  createdAt: string
  reactions: JobPostReaction[]
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
