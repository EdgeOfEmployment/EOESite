'use client'

import { useEffect, useState } from 'react'

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 15a5 5 0 100-10 5 5 0 000 10zM10 0a1 1 0 011 1v1a1 1 0 11-2 0V1a1 1 0 011-1zm0 17a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3.1 3.1a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zm11.7 11.7a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zM0 10a1 1 0 011-1h1a1 1 0 110 2H1a1 1 0 01-1-1zm17 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM3.1 16.9a1 1 0 010-1.4l.7-.7a1 1 0 111.4 1.4l-.7.7a1 1 0 01-1.4 0zm11.7-11.7a1 1 0 010-1.4l.7-.7a1 1 0 111.4 1.4l-.7.7a1 1 0 01-1.4 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M17.3 13.4A8 8 0 016.6 2.7a8 8 0 1010.7 10.7z" />
    </svg>
  )
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Reads the class Task 1's blocking pre-hydration script already set on <html>.
    // Can't be a lazy useState initializer: this component is server-rendered too
    // (no `document`), so the effect is the only SSR-safe place to read it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex h-11 w-11 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
