import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

type AlertVariant = 'danger' | 'success' | 'warning'

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400',
  success:
    'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400',
  warning:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400',
}

function AlertIcon({ variant }: { variant: AlertVariant }) {
  const shared = 'h-4 w-4 shrink-0'

  if (variant === 'success') {
    return (
      <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        />
      </svg>
    )
  }

  if (variant === 'warning') {
    return (
      <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.3 3.1c.7-1.2 2.7-1.2 3.4 0l6.3 11a2 2 0 01-1.7 3H3.7a2 2 0 01-1.7-3l6.3-11zM10 7a1 1 0 00-1 1v3a1 1 0 002 0V8a1 1 0 00-1-1zm0 7.5a1 1 0 100 2 1 1 0 000-2z"
        />
      </svg>
    )
  }

  return (
    <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
      />
    </svg>
  )
}

export function Alert({
  variant,
  className,
  children,
}: {
  variant: AlertVariant
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', VARIANT_CLASSES[variant], className)}>
      <AlertIcon variant={variant} />
      <p>{children}</p>
    </div>
  )
}
