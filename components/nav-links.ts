// Kept out of nav.tsx on purpose: that file is 'use client', and every export of a client module
// reaches a Server Component as a client reference, not a value — so the /tour layout could not
// `.map()` over the links to build its own copy if they lived there.

export interface NavLink {
  href: string
  label: string
  /** Active only on this exact path, not on nested routes (the dashboard's `/`). */
  exact?: boolean
}

export const APP_NAV_LINKS: NavLink[] = [
  { href: '/', label: '홈', exact: true },
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/problems', label: '문제은행' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]
