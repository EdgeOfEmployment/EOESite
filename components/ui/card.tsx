import type { ElementType, ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/ui/cn'

type CardTag = 'div' | 'article' | 'form' | 'li'
type CardPadding = 'sm' | 'md'

const PADDING_CLASSES: Record<CardPadding, string> = {
  sm: 'p-3',
  md: 'p-4',
}

type CardProps<T extends CardTag> = {
  as?: T
  padding?: CardPadding
  className?: string
} & Omit<ComponentPropsWithoutRef<T>, 'className'>

export function Card<T extends CardTag = 'div'>({
  as,
  padding = 'md',
  className,
  ...props
}: CardProps<T>) {
  const Component = (as ?? 'div') as ElementType
  return (
    <Component
      className={cn('rounded-lg border border-gray-200', PADDING_CLASSES[padding], 'dark:border-gray-800', className)}
      {...props}
    />
  )
}
