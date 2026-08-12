import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the company name, posting info, cover letter, date, and feedback checkbox fields', () => {
    render(<PostForm />)

    expect(screen.getByPlaceholderText('회사명')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('공고 링크/정보 (선택)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('자소서 원문')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '피드백 받고 싶어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })
})
