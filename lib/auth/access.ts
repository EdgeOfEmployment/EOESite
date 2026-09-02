export type ProfileStatus = 'pending' | 'approved' | 'rejected'
export type ProfileRole = 'member' | 'admin'

export interface Profile {
  status: ProfileStatus
  role: ProfileRole
}

const PUBLIC_PATHS = ['/login', '/signup', '/pending', '/forgot-password']

// Always reachable, independent of session/approval state: the recovery-link
// exchange has no session yet, and the page it lands on must accept whatever
// approval status the profile is in.
const ALWAYS_ALLOWED_PATHS = ['/auth', '/reset-password']

function matchesPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + '/')
}

export function getRedirectPath(profile: Profile | null, pathname: string): string | null {
  if (ALWAYS_ALLOWED_PATHS.some((path) => matchesPath(pathname, path))) {
    return null
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => matchesPath(pathname, path))

  if (!profile) {
    return isPublicPath ? null : '/login'
  }

  if (profile.status !== 'approved') {
    return matchesPath(pathname, '/pending') ? null : '/pending'
  }

  if (isPublicPath || matchesPath(pathname, '/pending')) {
    return '/'
  }

  if (matchesPath(pathname, '/admin') && profile.role !== 'admin') {
    return '/'
  }

  return null
}
