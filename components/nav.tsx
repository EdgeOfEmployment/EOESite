'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logOut } from '@/lib/auth/logout'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/ui/cn'

const links = [
  { href: '/', label: '홈' },
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
      <div className="flex gap-4">
        {links.map((link) => {
          const isActive = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(isActive && 'font-semibold text-blue-600 dark:text-blue-400')}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <form action={logOut}>
          <button type="submit" className="text-sm text-gray-500 dark:text-gray-400">
            로그아웃
          </button>
        </form>
      </div>
    </nav>
  )
}
