'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/ui/cn'
import { Spinner } from './spinner'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-12 px-4 py-2.5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  type,
  disabled,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus()
  const showPending = type === 'submit' && pending

  return (
    <button
      type={type}
      disabled={disabled || showPending}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        SIZE_CLASSES[size],
        variant === 'primary'
          ? 'bg-accent text-accent-foreground hover:bg-accent/90'
          : 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900',
        className
      )}
      {...props}
    >
      {showPending && (
        <>
          <Spinner className="h-4 w-4" />
          <span className="sr-only">로딩 중</span>
        </>
      )}
      {children}
    </button>
  )
}
