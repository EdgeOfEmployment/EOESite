import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DemoGuard, DEMO_BLOCKED_MESSAGE, useDemoMode } from './demo-guard'

function ModeProbe() {
  const { isDemo } = useDemoMode()
  return <span>{isDemo ? 'demo' : 'live'}</span>
}

describe('DemoGuard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // Positive control: proves the click below really reaches React's form action machinery in
  // jsdom, so the "not called" assertions in the guarded tests mean something.
  it('runs the form action when the form is outside the guard', async () => {
    const action = vi.fn()
    render(
      <form action={action}>
        <button type="submit">등록</button>
      </form>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })

  it('cancels a form action submit and shows the demo toast instead', () => {
    const action = vi.fn()
    render(
      <DemoGuard>
        <form action={action}>
          <button type="submit">등록</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    expect(action).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(DEMO_BLOCKED_MESSAGE)
  })

  it('cancels an onSubmit handler too', () => {
    const onSubmit = vi.fn()
    render(
      <DemoGuard>
        <form onSubmit={onSubmit}>
          <button type="submit">저장</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets forms inside [data-demo-allow] submit normally', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <DemoGuard>
        <form data-demo-allow onSubmit={onSubmit}>
          <button type="submit">검색</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '검색' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides the toast after three seconds', () => {
    vi.useFakeTimers()
    render(
      <DemoGuard>
        <form action={() => {}}>
          <button type="submit">등록</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reports demo mode to descendants, and live mode outside the guard', () => {
    render(
      <>
        <DemoGuard>
          <ModeProbe />
        </DemoGuard>
        <ModeProbe />
      </>
    )

    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('live')).toBeInTheDocument()
  })
})
