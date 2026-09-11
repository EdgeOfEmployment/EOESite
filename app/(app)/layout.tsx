import { Suspense } from 'react'
import { Nav } from '@/components/nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[65px] border-b border-gray-200 dark:border-gray-800" />}>
        <Nav />
      </Suspense>
      {children}
    </>
  )
}
