import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage from './page'

describe('LoginPage', () => {
  it('renders the login form fields', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('shows an error message when present in search params', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }) })
    render(ui)

    expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다')).toBeInTheDocument()
  })
})
