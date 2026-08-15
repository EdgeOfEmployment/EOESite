import type { ComponentProps } from 'react'
import { cn } from '@/lib/ui/cn'

type ButtonVariant = 'primary' | 'secondary'

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        'rounded px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary'
          ? 'bg-accent text-accent-foreground hover:bg-accent/90'
          : 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900',
        className
      )}
      {...props}
    />
  )
}
