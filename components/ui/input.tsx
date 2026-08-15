import type { ComponentProps } from 'react'
import { cn } from '@/lib/ui/cn'

const fieldClassName =
  'w-full rounded border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent dark:border-gray-700 dark:placeholder:text-gray-500'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldClassName, className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldClassName, className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(fieldClassName, className)} {...props} />
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />
}
