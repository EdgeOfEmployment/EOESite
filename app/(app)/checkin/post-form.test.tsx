import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders a required photo input, no goals by default, and the submit button', () => {
    render(<PostForm />)

    expect(screen.getByLabelText('책상 인증 사진')).toBeRequired()
    expect(screen.queryByPlaceholderText(/목표/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
  })

  it('adds a goal field when clicking the add-goal button', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
  })

  it('adds a second goal field on a second click', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 2')).toBeInTheDocument()
  })

  it('removes a goal field when clicking its delete button', () => {
    render(<PostForm />)
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    fireEvent.change(screen.getByPlaceholderText('목표 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('목표 2'), { target: { value: 'B' } })

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByPlaceholderText('목표 2')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 1')).toHaveValue('B')
  })
})
