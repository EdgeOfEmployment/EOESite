import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DashboardPage from './page'

describe('DashboardPage', () => {
  it('renders the dashboard heading', () => {
    render(<DashboardPage />)
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })
})
