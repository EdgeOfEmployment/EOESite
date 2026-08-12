import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the company name, posting info, one question/answer pair, date, and feedback checkbox by default', () => {
    render(<PostForm />)

    expect(screen.getByPlaceholderText('회사명')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('공고 링크/정보 (선택)')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText(/질문/)).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: '피드백 받고 싶어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('adds another question/answer pair when clicking the add button', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))

    expect(screen.getAllByPlaceholderText(/질문/)).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(2)
  })

  it('removes a question/answer pair when clicking its delete button', () => {
    render(<PostForm />)
    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(1)
  })

  it('does not show a delete button when only one question remains', () => {
    render(<PostForm />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
