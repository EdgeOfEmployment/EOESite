import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => '/problems/x',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

vi.mock('../actions', () => ({
  deleteProblem: vi.fn(),
}))

const ID = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b'

const problem = {
  id: ID,
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '배열의 합을 구하세요.',
  constraintsMd: '- n ≤ 10',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: true },
    { args: [[9, 9], 9], expected: 27, isExample: false },
  ],
  createdBy: 'author-1',
  authorName: '김민수',
  createdAt: '2026-10-18T01:00:00.000Z',
  updatedAt: '2026-10-18T01:00:00.000Z',
}

const getProblem = vi.fn<(id: string) => Promise<typeof problem | null>>(async () => problem)
vi.mock('@/lib/problems/queries', () => ({
  getProblem: (id: string) => getProblem(id),
}))

const session = { userId: 'viewer-1', role: 'member', status: 'approved' }
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => session),
}))

import ProblemDetailPage from './page'

function renderPage(id = ID) {
  return ProblemDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })
}

beforeEach(() => {
  session.userId = 'viewer-1'
  session.role = 'member'
  getProblem.mockClear()
})

describe('ProblemDetailPage', () => {
  it('renders title, meta, body, signature, and only the example cases', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { name: '[카카오]-두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText(/김민수 · 2026-10-18/)).toBeInTheDocument()
    expect(screen.getByText('배열의 합을 구하세요.')).toBeInTheDocument()
    expect(screen.getByText('solution(arr: int[], k: int) -> int')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '[1,2]' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '[9,9]' })).not.toBeInTheDocument()
  })

  it('hides edit and delete from other members', async () => {
    render(await renderPage())
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows edit and delete to the author and to admins', async () => {
    session.userId = 'author-1'
    const { unmount } = render(await renderPage())
    expect(screen.getByRole('link', { name: '수정' })).toHaveAttribute('href', `/problems/${ID}/edit`)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    unmount()

    session.userId = 'someone'
    session.role = 'admin'
    render(await renderPage())
    expect(screen.getByRole('link', { name: '수정' })).toBeInTheDocument()
  })

  it('404s on a malformed id without reading the cache', async () => {
    await expect(renderPage('../etc')).rejects.toThrow('NOT_FOUND')
    expect(getProblem).not.toHaveBeenCalled()
  })

  it('404s on an unknown id', async () => {
    getProblem.mockResolvedValueOnce(null)
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })
})
