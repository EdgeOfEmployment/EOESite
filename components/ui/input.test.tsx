import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, Textarea, Select, Label } from './input'

describe('Input', () => {
  it('renders an input and forwards props', () => {
    render(<Input placeholder="이메일" />)
    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
  })

  it('keeps a 44px minimum tap target at every size', () => {
    const { rerender } = render(<Input placeholder="sm" size="sm" />)
    expect(screen.getByPlaceholderText('sm')).toHaveClass('min-h-11')
    rerender(<Input placeholder="lg" size="lg" />)
    expect(screen.getByPlaceholderText('lg')).toHaveClass('min-h-12')
  })
})

describe('Textarea', () => {
  it('renders a textarea and forwards props', () => {
    render(<Textarea placeholder="내용" />)
    expect(screen.getByPlaceholderText('내용')).toBeInTheDocument()
  })

  it('does not force a height floor (rows-driven instead)', () => {
    render(<Textarea placeholder="내용" size="sm" />)
    expect(screen.getByPlaceholderText('내용')).not.toHaveClass('min-h-11')
  })
})

describe('Select', () => {
  it('renders a select with its options', () => {
    render(
      <Select defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})

describe('Label', () => {
  it('associates with a field via htmlFor', () => {
    render(
      <>
        <Label htmlFor="name">이름</Label>
        <Input id="name" />
      </>
    )
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })
})
