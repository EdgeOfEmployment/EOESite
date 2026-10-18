import { describe, it, expect, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/problems',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/form', () => ({
  default: (props: ComponentProps<'form'>) => createElement('form', props),
}))

const summaries = [
  { id: 'p-1', company: '카카오', title: '두 수의 합', authorName: '김민수', createdAt: '2026-10-17T15:30:00.000Z', returnType: 'int', paramCount: 2 },
  { id: 'p-2', company: '네이버', title: '최단 경로', authorName: '이영희', createdAt: '2026-10-16T00:00:00.000Z', returnType: 'int[]', paramCount: 1 },
]
const getProblemSummaries = vi.fn(async () => summaries)

vi.mock('@/lib/problems/queries', () => ({
  getProblemSummaries: () => getProblemSummaries(),
}))

import ProblemsPage, { ProblemList } from './page'

describe('ProblemsPage', () => {
  it('renders the shell and the write link without awaiting data', () => {
    render(ProblemsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: '문제은행' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 작성' })).toHaveAttribute('href', '/problems/new')
  })
})

describe('ProblemList', () => {
  it('lists every problem with display title, author, and KST date', async () => {
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: /\[카카오\]-두 수의 합/ })).toHaveAttribute('href', '/problems/p-1')
    expect(screen.getByText('김민수 · 2026-10-18')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\[네이버\]-최단 경로/ })).toBeInTheDocument()
  })

  it('offers each company with its count, sorted by name', async () => {
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['전체 (2)', '네이버 (1)', '카카오 (1)'])
  })

  it('applies ?company and ?q', async () => {
    const { unmount } = render(await ProblemList({ searchParamsPromise: Promise.resolve({ company: '카카오' }) }))
    expect(screen.queryByText(/최단 경로/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '회사' })).toHaveValue('카카오')
    unmount()

    render(await ProblemList({ searchParamsPromise: Promise.resolve({ q: '최단' }) }))
    expect(screen.queryAllByRole('link', { name: /두 수의 합/ })).toHaveLength(0)
    expect(screen.getByRole('link', { name: /최단 경로/ })).toBeInTheDocument()
  })

  it('resets the filter controls when the search params change', async () => {
    const { rerender } = render(await ProblemList({ searchParamsPromise: Promise.resolve({ company: '카카오', q: '합' }) }))
    rerender(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    expect(screen.getByRole('combobox', { name: '회사' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: '검색' })).toHaveValue('')
  })

  it('distinguishes "no problems yet" from "no matches"', async () => {
    const { unmount } = render(await ProblemList({ searchParamsPromise: Promise.resolve({ q: '없는 문제' }) }))
    expect(screen.getByText('조건에 맞는 문제가 없어요.')).toBeInTheDocument()
    unmount()

    getProblemSummaries.mockResolvedValueOnce([])
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    expect(screen.getByText('아직 등록된 문제가 없어요. 첫 문제를 작성해보세요.')).toBeInTheDocument()
  })
})
