'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logOut } from '@/lib/auth/logout'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/ui/cn'
import { APP_NAV_LINKS, type NavLink } from '@/components/nav-links'

function LogoutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="text-sm text-gray-500 dark:text-gray-400">
        로그아웃
      </button>
    </form>
  )
}

export function Nav({
  links = APP_NAV_LINKS,
  trailing = <LogoutButton />,
}: {
  links?: NavLink[]
  trailing?: ReactNode
}) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
      <div className="flex gap-4">
        {links.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
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
        {trailing}
      </div>
    </nav>
  )
}
