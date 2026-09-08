import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getTodayDate: () => '2026-08-11',
  addDays: (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  },
  formatWeekHeader: (week: { label: string; startDate: string; endDate: string }) =>
    `${week.label} (${week.startDate}~${week.endDate})`,
}))

import { ProblemForm } from './problem-form'
import type { Member, CodingWeek } from '@/lib/coding/types'

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const currentWeek: CodingWeek = {
  id: 'week-1',
  label: '1주차',
  startDate: '2026-09-08',
  endDate: '2026-09-14',
}

describe('ProblemForm', () => {
  it('defaults to adding to the current week when one exists, with a hidden weekId', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('existing')
    expect(container.querySelector('input[name="weekId"]')).toHaveValue('week-1')
    expect(screen.getByText('1주차 (2026-09-08~2026-09-14)')).toBeInTheDocument()
  })

  it('shows a "새 주차 만들기" toggle when a current week exists', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)
    expect(screen.getByRole('button', { name: '새 주차 만들기' })).toBeInTheDocument()
  })

  it('switches to new-week mode with editable fields when the toggle is clicked', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '새 주차 만들기' }))

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('new')
    expect(screen.getByLabelText('주차명')).toBeInTheDocument()
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-11')
    expect(screen.getByLabelText('종료일')).toHaveValue('2026-08-17')
  })

  it('switches back to the existing week when toggled again', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '새 주차 만들기' }))
    fireEvent.click(screen.getByRole('button', { name: '기존 주차에 등록' }))

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('existing')
    expect(container.querySelector('input[name="weekId"]')).toHaveValue('week-1')
  })

  it('starts in new-week mode with no toggle when there is no current week', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={null} />)

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('new')
    expect(screen.getByLabelText('주차명')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 주차 만들기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기존 주차에 등록' })).not.toBeInTheDocument()
  })

  it('renders one problem row, an optional match keyword input, and assignee checkboxes', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)

    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    const keywordInput = screen.getByLabelText('저장소 매칭 키워드 (선택)')
    expect(keywordInput).not.toBeRequired()
    expect(screen.getByRole('checkbox', { name: '김민수' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '이지은' })).toBeInTheDocument()
  })

  it('does not show a row-remove button when only one row exists', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })

  it('adds and removes problem rows', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))
    expect(screen.getAllByLabelText('문제명')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '제거' })[0])
    expect(screen.getAllByLabelText('문제명')).toHaveLength(1)
  })

  it("suffixes each row's field names with its row id and keeps rowIds in sync", () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))

    expect(container.querySelector('input[name="title-row-1"]')).toBeInTheDocument()
    expect(container.querySelector('input[name="title-row-2"]')).toBeInTheDocument()
    expect(container.querySelector('input[name="link-row-2"]')).toBeInTheDocument()
    expect(container.querySelectorAll('input[name="assigneeIds-row-2"]')).toHaveLength(members.length)
    expect(container.querySelector('input[name="rowIds"]')).toHaveValue('row-1,row-2')
  })

  it('re-derives weekMode to existing/new-week target when currentWeek prop changes without a remount', () => {
    const { container, rerender } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '새 주차 만들기' }))
    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('new')

    const nextWeek: CodingWeek = {
      id: 'week-2',
      label: '2주차',
      startDate: '2026-09-15',
      endDate: '2026-09-21',
    }
    rerender(<ProblemForm members={members} currentWeek={nextWeek} />)

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('existing')
    expect(container.querySelector('input[name="weekId"]')).toHaveValue('week-2')
    expect(screen.getByRole('button', { name: '새 주차 만들기' })).toBeInTheDocument()
  })

  it('renders the current-week display as an accessible disabled field', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)

    const currentWeekField = screen.getByLabelText('등록 대상 주차')
    expect(currentWeekField).toBeDisabled()
    expect(currentWeekField).toHaveValue('1주차 (2026-09-08~2026-09-14)')
  })
})
