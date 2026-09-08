import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCommitFileUrl } from './github-link'

describe('buildCommitFileUrl', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_SOURCE_REPO', 'EdgeOfEmployment/Coding-Test')
  })

  it('builds a blob URL for the given commit sha and file path', () => {
    expect(buildCommitFileUrl('abc123', 'Donghyeon/two-sum/two-sum.js')).toBe(
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/abc123/Donghyeon/two-sum/two-sum.js'
    )
  })

  it('URL-encodes spaces and Korean characters in each path segment', () => {
    const url = buildCommitFileUrl('abc123', '동현/과제 진행하기/과제 진행하기.js')
    expect(url).toBe(
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/abc123/' +
        encodeURIComponent('동현') +
        '/' +
        encodeURIComponent('과제 진행하기') +
        '/' +
        encodeURIComponent('과제 진행하기.js')
    )
  })

  it('returns null when GITHUB_SOURCE_REPO is not configured', () => {
    vi.stubEnv('GITHUB_SOURCE_REPO', '')
    expect(buildCommitFileUrl('abc123', 'a/b.js')).toBeNull()
  })
})
