import { describe, it, expect } from 'vitest'
import { groupQasByAuthor } from './grouping'
import type { InterviewQa } from './types'

function makeQa(overrides: Partial<InterviewQa>): InterviewQa {
  return {
    id: 'qa-x',
    sessionId: 'session-1',
    authorId: 'user-x',
    authorName: '홍길동',
    questions: [{ question: 'q', answer: 'a' }],
    feedbackDocId: 'doc-x',
    createdAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  }
}

describe('groupQasByAuthor', () => {
  it('groups multiple QA entries from the same author together', () => {
    const qas = [
      makeQa({ id: 'qa-1', authorId: 'user-1', authorName: '김민수' }),
      makeQa({ id: 'qa-2', authorId: 'user-1', authorName: '김민수' }),
    ]

    const groups = groupQasByAuthor(qas)

    expect(groups).toHaveLength(1)
    expect(groups[0].authorName).toBe('김민수')
    expect(groups[0].qas.map((q) => q.id)).toEqual(['qa-1', 'qa-2'])
  })

  it('creates one group per distinct author, sorted by author name', () => {
    const qas = [
      makeQa({ id: 'qa-1', authorId: 'user-2', authorName: '이지은' }),
      makeQa({ id: 'qa-2', authorId: 'user-1', authorName: '김민수' }),
    ]

    const groups = groupQasByAuthor(qas)

    expect(groups.map((g) => g.authorName)).toEqual(['김민수', '이지은'])
  })

  it('preserves each qa entry within its group', () => {
    const qa = makeQa({ id: 'qa-1' })
    const groups = groupQasByAuthor([qa])

    expect(groups[0].qas[0]).toEqual(qa)
  })
})
