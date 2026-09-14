import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SignupPage, { TopNotice } from './page'

describe('SignupPage', () => {
  it('renders the signup form fields in the static shell', () => {
    const ui = SignupPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이름')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입하기' })).toBeInTheDocument()
  })

  it('links to the login page', () => {
    const ui = SignupPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
  })
})

describe('SignupPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '이미 가입된 이메일입니다' }) })
    render(ui)

    expect(screen.getByText('이미 가입된 이메일입니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
