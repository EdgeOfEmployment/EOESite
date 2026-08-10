import { describe, it, expect } from 'vitest'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from './status'

describe('buildTodayStatus', () => {
  it('marks a type complete when the member has a matching post today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    const posts = [{ authorId: 'u1', type: 'wake' as const }]

    const rows = buildTodayStatus(members, posts)

    expect(rows).toEqual([
      { member: { id: 'u1', name: '김민수' }, completed: { wake: true, study: false, goal: false } },
    ])
  })

  it('marks all types incomplete when the member has no posts today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    const rows = buildTodayStatus(members, [])

    expect(rows[0].completed).toEqual({ wake: false, study: false, goal: false })
  })
})

describe('getMissingTypes', () => {
  it('returns all types when the user has no posts today', () => {
    expect(getMissingTypes('u1', [])).toEqual(CHECKIN_TYPES)
  })

  it('excludes types the user already posted today', () => {
    const posts = [{ authorId: 'u1', type: 'wake' as const }]
    expect(getMissingTypes('u1', posts)).toEqual(['study', 'goal'])
  })

  it('ignores posts from other users', () => {
    const posts = [{ authorId: 'u2', type: 'wake' as const }]
    expect(getMissingTypes('u1', posts)).toEqual(CHECKIN_TYPES)
  })
})
