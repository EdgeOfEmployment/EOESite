import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders children and forwards the type attribute', () => {
    render(<Button type="submit">저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('applies the accent background by default (primary variant)', () => {
    render(<Button>확인</Button>)
    expect(screen.getByRole('button', { name: '확인' })).toHaveClass('bg-accent')
  })

  it('applies an outline style for the secondary variant', () => {
    render(<Button variant="secondary">취소</Button>)
    const button = screen.getByRole('button', { name: '취소' })
    expect(button).toHaveClass('border')
    expect(button).not.toHaveClass('bg-accent')
  })

  it('merges a caller-provided className', () => {
    render(<Button className="self-start">등록</Button>)
    expect(screen.getByRole('button', { name: '등록' })).toHaveClass('self-start')
  })

  it('keeps a 44px minimum tap target at every size', () => {
    const { rerender } = render(<Button size="sm">작게</Button>)
    expect(screen.getByRole('button', { name: '작게' })).toHaveClass('min-h-11')
    rerender(<Button size="lg">크게</Button>)
    expect(screen.getByRole('button', { name: '크게' })).toHaveClass('min-h-12')
  })

  it('shows a spinner and disables itself while its enclosing form is submitting', async () => {
    let resolveAction: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveAction = resolve
    })

    render(
      <form action={() => pending}>
        <Button type="submit">제출</Button>
      </form>
    )

    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('로딩 중')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()

    resolveAction()
  })
})
