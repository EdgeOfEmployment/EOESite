import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageShell } from './page-shell'

describe('PageShell', () => {
  it('renders a heading when title is provided', () => {
    render(<PageShell title="대시보드">내용</PageShell>)
    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument()
  })

  it('renders headerExtra next to the title', () => {
    render(
      <PageShell title="인증" headerExtra={<a href="/checkin/calendar">달력 보기</a>}>
        내용
      </PageShell>
    )
    expect(screen.getByRole('link', { name: '달력 보기' })).toBeInTheDocument()
  })

  it('renders children without a title when none is given', () => {
    render(<PageShell>본문만</PageShell>)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByText('본문만')).toBeInTheDocument()
  })
})
