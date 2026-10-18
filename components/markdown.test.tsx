import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from './markdown'

describe('Markdown', () => {
  it('renders GFM: emphasis, lists, tables, images', () => {
    const { container } = render(
      <Markdown source={'**굵게** 와 `code`\n\n- 하나\n- 둘\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![그림](https://x.example/a.png)'} />
    )
    expect(screen.getByText('굵게').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '그림' })).toHaveAttribute('src', 'https://x.example/a.png')
    expect(container.firstElementChild).toHaveClass('markdown')
  })

  it('never renders raw HTML or javascript: links', () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script><b>x</b>\n\n[클릭](javascript:alert(1))'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('클릭').getAttribute('href') ?? '').not.toContain('javascript:')
  })
})
