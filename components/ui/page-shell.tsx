import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

type PageShellWidth = 'sm' | '2xl' | '3xl'

const WIDTH_CLASSES: Record<PageShellWidth, string> = {
  sm: 'max-w-sm lg:max-w-md',
  '2xl': 'max-w-2xl lg:max-w-4xl xl:max-w-5xl',
  '3xl': 'max-w-3xl lg:max-w-5xl xl:max-w-6xl',
}

export function PageShell({
  title,
  headerExtra,
  width = '2xl',
  top = 'default',
  align = 'left',
  className,
  children,
}: {
  title?: string
  headerExtra?: ReactNode
  width?: PageShellWidth
  top?: 'default' | 'auth'
  align?: 'left' | 'center'
  className?: string
  children: ReactNode
}) {
  return (
    <main
      className={cn(
        'mx-auto w-full px-6',
        WIDTH_CLASSES[width],
        top === 'auth' ? 'mt-20' : 'py-8',
        align === 'center' && 'text-center',
        className
      )}
    >
      {title && (
        <div className={cn('mb-6 flex items-center', headerExtra ? 'justify-between' : false)}>
          <h1 className="text-2xl font-bold">{title}</h1>
          {headerExtra}
        </div>
      )}
      {children}
    </main>
  )
}
