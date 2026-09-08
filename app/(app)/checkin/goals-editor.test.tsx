import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const toggleGoalCompletedMock = vi.fn()
const updateCheckinGoalsMock = vi.fn().mockResolvedValue(undefined)

vi.mock('./actions', () => ({
  toggleGoalCompleted: (...args: unknown[]) => toggleGoalCompletedMock(...args),
  updateCheckinGoals: (...args: unknown[]) => updateCheckinGoalsMock(...args),
}))

import { GoalsEditor } from './goals-editor'
import type { CheckinGoal } from '@/lib/checkin/types'

const goals: CheckinGoal[] = [
  { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
  { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
]

describe('GoalsEditor', () => {
  it('renders goals with completion state and completion time', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('완료 오전 11:00')).toBeInTheDocument()
  })

  it('lets the author toggle a goal via the existing action', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '알고리즘 3문제 풀기' }))
  })

  it('shows an edit button for the author', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
  })

  it('does not show an edit button for a non-author viewer', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={false} />)
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  it('enters edit mode with text inputs when the edit button is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getByDisplayValue('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByDisplayValue('이력서 초안 작성')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('adds a new empty input when "+ 항목 추가" is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 항목 추가' }))

    expect(screen.getByPlaceholderText('목표 3')).toBeInTheDocument()
  })

  it('removes an item when its delete button is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByDisplayValue('알고리즘 3문제 풀기')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('이력서 초안 작성')).toBeInTheDocument()
  })

  it('renders a drag handle for each goal in edit mode', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getAllByRole('button', { name: '순서 변경' })).toHaveLength(2)
  })

  it('discards changes and exits edit mode when "취소" is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByDisplayValue('알고리즘 3문제 풀기'), {
      target: { value: '바뀐 텍스트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.queryByText('바뀐 텍스트')).not.toBeInTheDocument()
  })

  it('saves edited goals with completion state preserved', async () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByDisplayValue('알고리즘 3문제 풀기'), {
      target: { value: '알고리즘 5문제 풀기' },
    })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(updateCheckinGoalsMock).toHaveBeenCalledTimes(1))

    const [postId, formData] = updateCheckinGoalsMock.mock.calls[0] as [string, FormData]
    expect(postId).toBe('post-1')
    expect(formData.get('goalCount')).toBe('2')
    expect(formData.get('goal-0')).toBe('알고리즘 5문제 풀기')
    expect(formData.get('completed-0')).toBe('false')
    expect(formData.get('goal-1')).toBe('이력서 초안 작성')
    expect(formData.get('completed-1')).toBe('true')
    expect(formData.get('completedAt-1')).toBe('2026-08-10T02:00:00.000Z')

    await waitFor(() => expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument())
  })
})
