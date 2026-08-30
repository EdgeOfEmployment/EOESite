import type { ComponentProps } from 'react'
import { cn } from '@/lib/ui/cn'

type FieldSize = 'sm' | 'md' | 'lg'

const FIELD_SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'min-h-11 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-12 px-4 py-2.5 text-base',
}

const TEXTAREA_SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

const baseFieldClassName =
  'w-full rounded border border-gray-300 bg-transparent placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent dark:border-gray-700 dark:placeholder:text-gray-500'

type InputProps = Omit<ComponentProps<'input'>, 'size'> & { size?: FieldSize }
type SelectProps = Omit<ComponentProps<'select'>, 'size'> & { size?: FieldSize }

export function Input({ size = 'md', className, ...props }: InputProps) {
  return <input className={cn(baseFieldClassName, FIELD_SIZE_CLASSES[size], className)} {...props} />
}

export function Textarea({
  size = 'md',
  className,
  ...props
}: ComponentProps<'textarea'> & { size?: FieldSize }) {
  return <textarea className={cn(baseFieldClassName, TEXTAREA_SIZE_CLASSES[size], className)} {...props} />
}

export function Select({ size = 'md', className, ...props }: SelectProps) {
  return <select className={cn(baseFieldClassName, FIELD_SIZE_CLASSES[size], className)} {...props} />
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />
}
