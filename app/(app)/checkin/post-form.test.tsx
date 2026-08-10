import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the type select, body textarea, photo input, and submit button', () => {
    render(<PostForm />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('오늘의 인증 내용을 남겨주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument()
  })

  it('lists all three checkin types as options', () => {
    render(<PostForm />)

    expect(screen.getByRole('option', { name: '기상' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '스터디' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '목표달성' })).toBeInTheDocument()
  })
})
