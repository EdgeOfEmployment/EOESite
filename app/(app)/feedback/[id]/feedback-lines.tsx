'use client'

import { useState } from 'react'
import type { FeedbackComment } from '@/lib/jobposts/types'
import { CommentThread } from './comment-thread'

export interface FeedbackLineWithComments {
  index: number
  questionIndex: number
  question: string
  text: string
  comments: FeedbackComment[]
}

function countComments(comments: FeedbackComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countComments(c.replies), 0)
}

export function FeedbackLines({
  feedbackDocId,
  lines,
}: {
  feedbackDocId: string
  lines: FeedbackLineWithComments[]
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  function toggle(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index))
  }

  let lastQuestionIndex = -1
  let displayNumber = 0

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => {
        const isNewQuestion = line.questionIndex !== lastQuestionIndex
        if (isNewQuestion) {
          lastQuestionIndex = line.questionIndex
          displayNumber = 0
        }
        displayNumber += 1
        const commentCount = countComments(line.comments)
        const expanded = expandedIndex === line.index

        return (
          <div key={line.index}>
            {isNewQuestion && <h2 className="mb-1 mt-4 text-sm font-semibold text-gray-700">{line.question}</h2>}
            <div
              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                expanded ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-xs text-gray-400">{displayNumber}</span>
              <p className="flex-1 whitespace-pre-wrap">{line.text}</p>
              <button type="button" onClick={() => toggle(line.index)} className="shrink-0 text-xs text-gray-500">
                {commentCount > 0 ? `💬 ${commentCount}` : '+'}
              </button>
            </div>
            {expanded && (
              <div className="ml-4 mb-2 rounded border border-blue-200 bg-blue-50/50 p-3">
                <CommentThread feedbackDocId={feedbackDocId} lineIndex={line.index} comments={line.comments} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
