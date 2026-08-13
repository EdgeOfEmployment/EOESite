import type { FeedbackLine } from '@/lib/jobposts/types'

function splitIntoSentences(text: string): string[] {
  const result: string[] = []
  let current = ''

  for (const char of text) {
    if (char === '.') {
      const sentence = (current + '.').trim()
      if (sentence.length > 0) result.push(sentence)
      current = ''
    } else if (char === '\n') {
      const sentence = current.trim()
      if (sentence.length > 0) result.push(sentence)
      current = ''
    } else {
      current += char
    }
  }

  const remainder = current.trim()
  if (remainder.length > 0) result.push(remainder)

  return result
}

export function buildFeedbackLines(questions: { question: string; answer: string }[]): FeedbackLine[] {
  const lines: FeedbackLine[] = []

  questions.forEach((q, questionIndex) => {
    for (const text of splitIntoSentences(q.answer)) {
      lines.push({ questionIndex, question: q.question, text })
    }
  })

  return lines
}
