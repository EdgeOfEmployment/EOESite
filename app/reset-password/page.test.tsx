import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResetPasswordPage from './page'

describe('ResetPasswordPage', () => {
  it('renders the new password form', async () => {
    const ui = await ResetPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('새 비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeInTheDocument()
  })

  it('shows an error message when present in search params', async () => {
    const ui = await ResetPasswordPage({
      searchParams: Promise.resolve({ error: '비밀번호는 6자 이상이어야 합니다' }),
    })
    render(ui)

    expect(screen.getByText('비밀번호는 6자 이상이어야 합니다')).toBeInTheDocument()
  })
})
