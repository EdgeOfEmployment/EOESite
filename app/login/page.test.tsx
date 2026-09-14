import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage, { TopNotice } from './page'

describe('LoginPage', () => {
  it('renders the login form fields in the static shell', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('links to the signup page', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup')
  })

  it('links to the forgot-password page', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '비밀번호를 잊으셨나요?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })
})

describe('LoginPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({
      searchParamsPromise: Promise.resolve({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }),
    })
    render(ui)

    expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
