import { describe, it, expect } from 'vitest'
import { groupCommentsByLine } from './comments'
import type { FlatFeedbackComment } from './types'

describe('groupCommentsByLine', () => {
  it('groups top-level comments under their line index', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: '첫 줄 의견',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 1,
        parentCommentId: null,
        authorId: 'u2',
        authorName: '이지은',
        body: '둘째 줄 의견',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)

    expect(grouped.get(0)?.map((c) => c.id)).toEqual(['c1'])
    expect(grouped.get(1)?.map((c) => c.id)).toEqual(['c2'])
  })

  it('nests replies under their parent comment on the same line', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: '첫 줄 의견',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'u2',
        authorName: '이지은',
        body: '답글',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)
    const roots = grouped.get(0) ?? []

    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe('c1')
    expect(roots[0].replies.map((r) => r.id)).toEqual(['c2'])
  })

  it('supports nested replies more than one level deep', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: 'A',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'u2',
        authorName: '이지은',
        body: 'B',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
      {
        id: 'c3',
        lineIndex: 0,
        parentCommentId: 'c2',
        authorId: 'u1',
        authorName: '김민수',
        body: 'C',
        createdAt: '2026-08-12T00:02:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)
    const roots = grouped.get(0) ?? []

    expect(roots[0].replies[0].replies.map((r) => r.id)).toEqual(['c3'])
  })

  it('returns an empty map for no comments', () => {
    expect(groupCommentsByLine([]).size).toBe(0)
  })
})
