import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="아직 등록된 문제가 없습니다." />)
    expect(screen.getByText('아직 등록된 문제가 없습니다.')).toBeInTheDocument()
  })

  it('renders an optional action', () => {
    render(<EmptyState message="없습니다" action={<button>추가하기</button>} />)
    expect(screen.getByRole('button', { name: '추가하기' })).toBeInTheDocument()
  })

  it('omits the action slot when none is given', () => {
    render(<EmptyState message="없습니다" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
