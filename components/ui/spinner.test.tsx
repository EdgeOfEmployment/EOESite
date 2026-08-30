import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner } from './spinner'

describe('Spinner', () => {
  it('is decorative (hidden from assistive tech)', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the spin animation class', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')).toHaveClass('animate-spin')
  })

  it('merges a caller-provided className', () => {
    const { container } = render(<Spinner className="text-accent-foreground" />)
    expect(container.querySelector('svg')).toHaveClass('text-accent-foreground')
  })
})
