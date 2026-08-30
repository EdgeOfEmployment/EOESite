import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
  })

  it('adds the dark class and persists the choice when toggled from light', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('removes the dark class and persists the choice when toggled from dark', () => {
    document.documentElement.classList.add('dark')
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('theme')).toBe('light')
  })
})
