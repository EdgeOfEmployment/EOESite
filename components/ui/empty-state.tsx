import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

export function EmptyState({
  message,
  action,
  className,
}: {
  message: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400',
        className
      )}
    >
      <svg
        className="h-8 w-8 text-gray-300 dark:text-gray-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7l1.5-3h15L21 7M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7M3 7h18M8 11h8"
        />
      </svg>
      <p>{message}</p>
      {action}
    </div>
  )
}
