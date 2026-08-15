import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
