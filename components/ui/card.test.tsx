import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './card'

describe('Card', () => {
  it('renders as a div by default', () => {
    render(<Card data-testid="card">내용</Card>)
    expect(screen.getByTestId('card').tagName).toBe('DIV')
  })

  it('renders as the element passed via "as"', () => {
    render(
      <Card as="article" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card').tagName).toBe('ARTICLE')
  })

  it('uses smaller padding when padding="sm"', () => {
    render(
      <Card padding="sm" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card')).toHaveClass('p-3')
    expect(screen.getByTestId('card')).not.toHaveClass('p-4')
  })

  it('uses roomier padding when padding="lg"', () => {
    render(
      <Card padding="lg" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card')).toHaveClass('p-6')
  })

  it('applies a subtle shadow by default', () => {
    render(<Card data-testid="card">내용</Card>)
    expect(screen.getByTestId('card')).toHaveClass('shadow-sm')
  })
})
