import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PendingPage from './page'

describe('PendingPage', () => {
  it('shows an approval-pending message', () => {
    render(<PendingPage />)
    expect(screen.getByText(/승인 대기 중입니다/)).toBeInTheDocument()
  })
})
