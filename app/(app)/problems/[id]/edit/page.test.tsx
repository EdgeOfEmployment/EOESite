import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('../../actions', () => ({
  updateProblem: vi.fn(),
  uploadProblemImage: vi.fn(),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div>{source}</div>,
}))

const ID = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b'
const problem = {
  id: ID,
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
  createdBy: 'author-1',
  authorName: '김민수',
  createdAt: '2026-10-18T01:00:00.000Z',
  updatedAt: '2026-10-18T01:00:00.000Z',
}

vi.mock('@/lib/problems/queries', () => ({
  getProblem: vi.fn(async () => problem),
  getProblemSummaries: vi.fn(async () => []),
}))

const session = { userId: 'author-1', role: 'member', status: 'approved' }
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => session),
}))

import EditProblemPage from './page'

beforeEach(() => {
  session.userId = 'author-1'
  session.role = 'member'
})

describe('EditProblemPage', () => {
  it('prefills the form for the author', async () => {
    render(await EditProblemPage({ params: Promise.resolve({ id: ID }) }))
    expect(screen.getByLabelText('회사')).toHaveValue('카카오')
    expect(screen.getByRole('button', { name: '수정 완료' })).toBeEnabled()
  })

  it('sends anyone else back to the problem with an error', async () => {
    session.userId = 'someone-else'
    await expect(EditProblemPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
      `REDIRECT:/problems/${ID}?error=` + encodeURIComponent('수정 권한이 없습니다')
    )
  })
})
