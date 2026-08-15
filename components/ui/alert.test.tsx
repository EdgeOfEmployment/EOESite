import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './alert'

describe('Alert', () => {
  it('renders its message', () => {
    render(<Alert variant="danger">문제가 발생했습니다</Alert>)
    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
  })

  it('applies red text for the danger variant', () => {
    render(<Alert variant="danger">에러</Alert>)
    expect(screen.getByText('에러')).toHaveClass('text-red-600')
  })

  it('applies green text for the success variant', () => {
    render(<Alert variant="success">완료</Alert>)
    expect(screen.getByText('완료')).toHaveClass('text-green-600')
  })

  it('applies amber text for the warning variant', () => {
    render(<Alert variant="warning">주의</Alert>)
    expect(screen.getByText('주의')).toHaveClass('text-amber-600')
  })
})
