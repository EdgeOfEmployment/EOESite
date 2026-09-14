import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResetPasswordPage, { TopNotice } from './page'

describe('ResetPasswordPage', () => {
  it('renders the new-password form in the static shell', () => {
    const ui = ResetPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('새 비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeInTheDocument()
  })
})

describe('ResetPasswordPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '비밀번호가 너무 짧습니다' }) })
    render(ui)

    expect(screen.getByText('비밀번호가 너무 짧습니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
