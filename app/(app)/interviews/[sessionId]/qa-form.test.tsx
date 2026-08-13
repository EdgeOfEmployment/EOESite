import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createInterviewQa: vi.fn(),
}))

import { QaForm } from './qa-form'

describe('QaForm', () => {
  it('renders one question/answer pair and a submit button by default', () => {
    render(<QaForm sessionId="session-1" />)

    expect(screen.getAllByPlaceholderText('받은 질문')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('adds another question/answer pair when clicking the add button', () => {
    render(<QaForm sessionId="session-1" />)

    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))

    expect(screen.getAllByPlaceholderText('받은 질문')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(2)
  })

  it('removes a question/answer pair when clicking its delete button', () => {
    render(<QaForm sessionId="session-1" />)
    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(1)
  })

  it('does not show a delete button when only one question remains', () => {
    render(<QaForm sessionId="session-1" />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
