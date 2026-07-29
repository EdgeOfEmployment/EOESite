export type ProfileStatus = 'pending' | 'approved' | 'rejected'
export type ProfileRole = 'member' | 'admin'

export interface Profile {
  status: ProfileStatus
  role: ProfileRole
}

const PUBLIC_PATHS = ['/login', '/signup']

export function getRedirectPath(profile: Profile | null, pathname: string): string | null {
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path))

  if (!profile) {
    return isPublicPath ? null : '/login'
  }

  if (profile.status !== 'approved') {
    return pathname.startsWith('/pending') ? null : '/pending'
  }

  if (isPublicPath || pathname.startsWith('/pending')) {
    return '/'
  }

  if (pathname.startsWith('/admin') && profile.role !== 'admin') {
    return '/'
  }

  return null
}
