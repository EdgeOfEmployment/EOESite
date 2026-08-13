import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createSession: vi.fn(),
}))

import { SessionForm } from './session-form'

describe('SessionForm', () => {
  it('renders title, date/time, description inputs and a submit button', () => {
    render(<SessionForm />)

    expect(screen.getByPlaceholderText('세션 제목')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('세션 제목')).toBeRequired()
    expect(screen.getByLabelText('일시')).toBeInTheDocument()
    expect(screen.getByLabelText('일시')).toBeRequired()
    expect(screen.getByPlaceholderText('장소/링크 등 (선택)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
  })
})
