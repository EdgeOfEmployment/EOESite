import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockPathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

import { Nav } from './nav'

describe('Nav', () => {
  beforeEach(() => {
    mockPathname = '/'
  })

  it('renders links to the dashboard and each board', () => {
    render(<Nav />)

    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('href', '/checkin')
    expect(screen.getByRole('link', { name: '코테 스터디' })).toHaveAttribute('href', '/coding')
    expect(screen.getByRole('link', { name: '문제은행' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '자소서/공고' })).toHaveAttribute('href', '/jobposts')
    expect(screen.getByRole('link', { name: '모의면접' })).toHaveAttribute('href', '/interviews')
  })

  it('renders a logout button', () => {
    render(<Nav />)
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })

  it('marks the current page link as active, including nested routes', () => {
    mockPathname = '/checkin/calendar'
    render(<Nav />)
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '코테 스터디' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current')
  })

  it('marks 홈 as active only on the root path', () => {
    render(<Nav />)
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders custom links and trailing content in place of the app links and logout', () => {
    mockPathname = '/tour/checkin'
    render(
      <Nav
        links={[
          { href: '/tour', label: '소개', exact: true },
          { href: '/tour/checkin', label: '인증' },
        ]}
        trailing={<a href="/login">로그인</a>}
      />
    )

    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('href', '/tour/checkin')
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '소개' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })
})
