import { describe, it, expect } from 'vitest'
import { MEMBER_NAMES_TAG, CODING_BOARD_TAG } from './cache-tags'

describe('MEMBER_NAMES_TAG', () => {
  it('is the string every profile-name cache scope must tag and invalidate with', () => {
    expect(MEMBER_NAMES_TAG).toBe('member-names')
  })
})

describe('CODING_BOARD_TAG', () => {
  it('is the string every coding-board cache scope must tag and invalidate with', () => {
    expect(CODING_BOARD_TAG).toBe('coding-board')
  })
})
