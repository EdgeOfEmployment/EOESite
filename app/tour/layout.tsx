import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { APP_NAV_LINKS, type NavLink } from '@/components/nav-links'
import { DemoGuard } from '@/components/tour/demo-guard'
import { TOUR_BASE_PATH } from './load-fixtures'

export const metadata: Metadata = {
  title: 'EOE 둘러보기',
  robots: { index: false, follow: false },
}

// Same tabs as the real app, derived from the same list so the two never drift apart.
// The real `/` (dashboard) lives at /tour/dashboard because /tour itself is the intro.
const TOUR_NAV_LINKS: NavLink[] = [
  { href: TOUR_BASE_PATH, label: '소개', exact: true },
  ...APP_NAV_LINKS.map((link) => ({
    ...link,
    href: link.href === '/' ? `${TOUR_BASE_PATH}/dashboard` : `${TOUR_BASE_PATH}${link.href}`,
  })),
]

export default function TourLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoGuard>
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
        체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.
      </div>
      <Suspense fallback={<div className="h-[65px] border-b border-gray-200 dark:border-gray-800" />}>
        <Nav
          links={TOUR_NAV_LINKS}
          trailing={
            <Link href="/login" className="text-sm text-gray-500 dark:text-gray-400">
              로그인
            </Link>
          }
        />
      </Suspense>
      {children}
    </DemoGuard>
  )
}
