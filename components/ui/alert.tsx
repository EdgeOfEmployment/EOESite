import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

type AlertVariant = 'danger' | 'success' | 'warning'

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: 'text-red-600 dark:text-red-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
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
  return <p className={cn('text-sm', VARIANT_CLASSES[variant], className)}>{children}</p>
}
