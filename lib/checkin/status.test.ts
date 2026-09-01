import { describe, it, expect } from 'vitest'
import { buildTodayStatus, hasPostedToday } from './status'

describe('buildTodayStatus', () => {
  it('marks a member posted when their id is in the list of authors who posted today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildTodayStatus(members, ['u1'])).toEqual([{ member: { id: 'u1', name: '김민수' }, posted: true }])
  })

  it('marks a member not posted when their id is absent', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildTodayStatus(members, [])).toEqual([{ member: { id: 'u1', name: '김민수' }, posted: false }])
  })
})

describe('hasPostedToday', () => {
  it('returns true when the user id is present', () => {
    expect(hasPostedToday('u1', ['u1', 'u2'])).toBe(true)
  })

  it('returns false when the user id is absent', () => {
    expect(hasPostedToday('u1', ['u2'])).toBe(false)
  })
})
