import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './alert'

describe('Alert', () => {
  it('renders its message', () => {
    render(<Alert variant="danger">문제가 발생했습니다</Alert>)
    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
  })

  it('applies red background/border/text for the danger variant', () => {
    render(<Alert variant="danger">에러</Alert>)
    const container = screen.getByText('에러').closest('div')
    expect(container).toHaveClass('bg-red-50')
    expect(container).toHaveClass('border-red-200')
    expect(container).toHaveClass('text-red-700')
  })

  it('applies green background for the success variant', () => {
    render(<Alert variant="success">완료</Alert>)
    expect(screen.getByText('완료').closest('div')).toHaveClass('bg-green-50')
  })

  it('applies amber background for the warning variant', () => {
    render(<Alert variant="warning">주의</Alert>)
    expect(screen.getByText('주의').closest('div')).toHaveClass('bg-amber-50')
  })

  it('renders a decorative icon alongside the message', () => {
    const { container } = render(<Alert variant="danger">에러</Alert>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
