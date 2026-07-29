import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Nav } from './nav'

describe('Nav', () => {
  it('renders links to the dashboard and each board', () => {
    render(<Nav />)

    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('href', '/checkin')
    expect(screen.getByRole('link', { name: '코테 스터디' })).toHaveAttribute('href', '/coding')
    expect(screen.getByRole('link', { name: '자소서/공고' })).toHaveAttribute('href', '/jobposts')
    expect(screen.getByRole('link', { name: '모의면접' })).toHaveAttribute('href', '/interviews')
  })

  it('renders a logout button', () => {
    render(<Nav />)
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })
})
