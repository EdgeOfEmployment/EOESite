import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getMostRecentTuesday: () => '2026-08-11',
}))

import { ProblemForm } from './problem-form'
import type { Member } from '@/lib/coding/types'

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

describe('ProblemForm', () => {
  it('renders a week-of input, one problem row, and a submit button', () => {
    render(<ProblemForm members={members} />)

    expect(screen.getByLabelText('대상 주차')).toBeInTheDocument()
    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it('defaults the week-of field to the most recent Tuesday', () => {
    render(<ProblemForm members={members} />)
    expect(screen.getByLabelText('대상 주차')).toHaveValue('2026-08-11')
  })

  it('renders an optional match keyword input', () => {
    render(<ProblemForm members={members} />)
    const input = screen.getByLabelText('저장소 매칭 키워드 (선택)')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeRequired()
  })

  it('renders an assignee checkbox for every approved member', () => {
    render(<ProblemForm members={members} />)
    expect(screen.getByRole('checkbox', { name: '김민수' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '이지은' })).toBeInTheDocument()
  })

  it('does not show a row-remove button when only one row exists', () => {
    render(<ProblemForm members={members} />)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })

  it('adds another problem row when "문제 추가" is clicked', () => {
    render(<ProblemForm members={members} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))

    expect(screen.getAllByLabelText('문제명')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '제거' })).toHaveLength(2)
  })

  it('removes a row when its "제거" button is clicked', () => {
    render(<ProblemForm members={members} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))
    fireEvent.click(screen.getAllByRole('button', { name: '제거' })[0])

    expect(screen.getAllByLabelText('문제명')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })
})
