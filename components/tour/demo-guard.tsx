'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export const DEMO_BLOCKED_MESSAGE = '체험 모드에서는 저장되지 않아요'

const DISMISS_AFTER_MS = 3000

interface DemoMode {
  isDemo: boolean
  notifyBlocked: () => void
}

const DemoModeContext = createContext<DemoMode>({ isDemo: false, notifyBlocked: () => {} })

/** Read by the few write paths that do not go through a `<form>` submit (see goals-editor.tsx). */
export function useDemoMode(): DemoMode {
  return useContext(DemoModeContext)
}

/**
 * Wraps every /tour page. The real cards wire writes as `<form action={serverAction}>`, and React
 * only runs a form action from its bubble-phase `submit` listener at the root. A capture-phase
 * listener on this wrapper runs before that, so cancelling the event here means no server action
 * is ever called, without touching any card. Forms inside `[data-demo-allow]` (plain GET search
 * forms) pass through. Before hydration nothing is intercepted, but the action itself still
 * rejects the request in `getVerifiedUser()`, since a visitor has no session.
 */
export function DemoGuard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [showCount, setShowCount] = useState(0)

  const notifyBlocked = useCallback(() => {
    setVisible(true)
    setShowCount((count) => count + 1)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    function handleSubmit(event: Event) {
      const form = event.target
      if (form instanceof HTMLElement && form.closest('[data-demo-allow]')) return
      event.preventDefault()
      event.stopPropagation()
      notifyBlocked()
    }

    element.addEventListener('submit', handleSubmit, true)
    return () => element.removeEventListener('submit', handleSubmit, true)
  }, [notifyBlocked])

  useEffect(() => {
    if (showCount === 0) return
    const timer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [showCount])

  return (
    <DemoModeContext.Provider value={{ isDemo: true, notifyBlocked }}>
      <div ref={ref} className="flex flex-1 flex-col">
        {children}
      </div>
      {visible && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-950"
        >
          {DEMO_BLOCKED_MESSAGE}
        </div>
      )}
    </DemoModeContext.Provider>
  )
}
