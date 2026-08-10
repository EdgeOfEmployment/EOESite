import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblem: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getMostRecentTuesday: () => '2026-08-11',
}))

import { ProblemForm } from './problem-form'

describe('ProblemForm', () => {
  it('renders title, link, and week-of inputs plus a submit button', () => {
    render(<ProblemForm />)

    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    expect(screen.getByLabelText('대상 주차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it('defaults the week-of field to the most recent Tuesday', () => {
    render(<ProblemForm />)
    expect(screen.getByLabelText('대상 주차')).toHaveValue('2026-08-11')
  })
})
