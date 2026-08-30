import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/checkin',
  useRouter: () => ({ replace: vi.fn() }),
}))

import { Toast } from './toast'

describe('Toast', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<Toast message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message when provided', () => {
    render(<Toast message="등록되었습니다" />)
    expect(screen.getByRole('status')).toHaveTextContent('등록되었습니다')
  })
})
