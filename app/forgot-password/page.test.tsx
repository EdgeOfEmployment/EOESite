import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ForgotPasswordPage from './page'

describe('ForgotPasswordPage', () => {
  it('renders the email form', async () => {
    const ui = await ForgotPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재설정 링크 보내기' })).toBeInTheDocument()
  })

  it('shows an error message when present in search params', async () => {
    const ui = await ForgotPasswordPage({ searchParams: Promise.resolve({ error: '이메일을 입력해주세요' }) })
    render(ui)

    expect(screen.getByText('이메일을 입력해주세요')).toBeInTheDocument()
  })

  it('shows a confirmation message after the link is sent', async () => {
    const ui = await ForgotPasswordPage({ searchParams: Promise.resolve({ sent: '1' }) })
    render(ui)

    expect(screen.getByText('입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.')).toBeInTheDocument()
  })

  it('links back to the login page', async () => {
    const ui = await ForgotPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute('href', '/login')
  })
})
