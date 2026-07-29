import Link from 'next/link'
import { logOut } from '@/lib/auth/logout'

const links = [
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b px-6 py-4">
      <div className="flex gap-4">
        <Link href="/" className="font-bold">
          홈
        </Link>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
      <form action={logOut}>
        <button type="submit" className="text-sm text-gray-500">
          로그아웃
        </button>
      </form>
    </nav>
  )
}
