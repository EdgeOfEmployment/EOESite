import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  markSelfComplete: vi.fn(),
  unmarkSelfComplete: vi.fn(),
}))

import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

const NON_MEMBER_VIEWER = 'viewer-x'

const baseProblem: CodingProblem = {
  id: 'problem-1',
  title: '두 수의 합',
  link: 'https://example.com/problem/1',
  createdBy: 'admin-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  assigneeIds: [],
  checks: [{ userId: 'user-2', commitSha: null, filePath: null, source: 'auto' }],
}

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

beforeEach(() => {
  vi.stubEnv('GITHUB_SOURCE_REPO', 'EdgeOfEmployment/Coding-Test')
})

describe('ProblemCard', () => {
  it('renders the problem title as a link and lists all members when no assignees are set', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      'https://example.com/problem/1'
    )
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('lists only the assigned members when assigneeIds is non-empty', () => {
    const problem = { ...baseProblem, assigneeIds: ['user-2'] }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.queryByText('김민수')).not.toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('shows completion status as plain text for every member, never a clickable check button', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.queryByRole('button', { name: '체크' })).not.toBeInTheDocument()
    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.getByText('미완료')).toBeInTheDocument()
  })

  it('shows "아직 제출 안됨" and no link for a member with no check', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByText('아직 제출 안됨')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '코드 보기' })).not.toBeInTheDocument()
  })

  it('shows "완료 (자동 감지)" but no link and no "아직 제출 안됨" for an auto-checked member with no commit info', () => {
    const problem = { ...baseProblem, assigneeIds: ['user-2'] }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '코드 보기' })).not.toBeInTheDocument()
    expect(screen.queryByText('아직 제출 안됨')).not.toBeInTheDocument()
  })

  it('links to the exact commit file when a check has commit info', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-2', commitSha: 'sha-1', filePath: 'user2/two-sum/two-sum.js', source: 'auto' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByRole('link', { name: '코드 보기' })).toHaveAttribute(
      'href',
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/sha-1/user2/two-sum/two-sum.js'
    )
  })

  it('does not show a cancel button for non-admins viewing someone else', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('shows a cancel button only next to the completed member when viewed by an admin', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })

  it('does not show a delete button for non-admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a "완료 처리" button on the caller\'s own unchecked row', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByRole('button', { name: '완료 처리' })).toBeInTheDocument()
  })

  it('does not show a "완료 처리" button on another member\'s unchecked row', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId="user-2" />)

    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument()
  })

  it('shows a manual badge and a self-cancel button on the caller\'s own manually-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'manual' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByText('완료 (본인 체크)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('does not show a self-cancel button on the caller\'s own auto-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'auto' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('shows only one cancel button (self, not admin) when an admin views their own manually-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'manual' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={true} currentUserId="user-1" />)

    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })

  it('still shows the admin cancel button when an admin views their own auto-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'auto' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={true} currentUserId="user-1" />)

    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })
})
