'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const DISMISS_AFTER_MS = 3000

export function Toast({ message }: { message?: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(Boolean(message))

  useEffect(() => {
    if (!message) return

    setVisible(true)
    const dismissTimer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS)
    const cleanupTimer = setTimeout(() => router.replace(pathname, { scroll: false }), DISMISS_AFTER_MS + 200)

    return () => {
      clearTimeout(dismissTimer)
      clearTimeout(cleanupTimer)
    }
  }, [message, pathname, router])

  if (!message || !visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm dark:border-green-900 dark:bg-green-950 dark:text-green-400"
    >
      {message}
    </div>
  )
}
