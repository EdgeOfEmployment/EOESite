import type { InterviewQa } from './types'

export interface InterviewQaGroup {
  authorId: string
  authorName: string
  qas: InterviewQa[]
}

export function groupQasByAuthor(qas: InterviewQa[]): InterviewQaGroup[] {
  const groups = new Map<string, InterviewQaGroup>()

  for (const qa of qas) {
    const existing = groups.get(qa.authorId)
    if (existing) {
      existing.qas.push(qa)
    } else {
      groups.set(qa.authorId, { authorId: qa.authorId, authorName: qa.authorName, qas: [qa] })
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.authorName.localeCompare(b.authorName, 'ko'))
}
