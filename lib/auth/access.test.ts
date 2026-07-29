import { describe, it, expect } from 'vitest'
import { getRedirectPath, type Profile } from './access'

describe('getRedirectPath', () => {
  it('sends unauthenticated users to /login', () => {
    expect(getRedirectPath(null, '/')).toBe('/login')
  })

  it('lets unauthenticated users reach /login', () => {
    expect(getRedirectPath(null, '/login')).toBeNull()
  })

  it('lets unauthenticated users reach /signup', () => {
    expect(getRedirectPath(null, '/signup')).toBeNull()
  })

  it('sends pending users to /pending', () => {
    const profile: Profile = { status: 'pending', role: 'member' }
    expect(getRedirectPath(profile, '/')).toBe('/pending')
  })

  it('sends rejected users to /pending', () => {
    const profile: Profile = { status: 'rejected', role: 'member' }
    expect(getRedirectPath(profile, '/')).toBe('/pending')
  })

  it('lets pending users stay on /pending', () => {
    const profile: Profile = { status: 'pending', role: 'member' }
    expect(getRedirectPath(profile, '/pending')).toBeNull()
  })

  it('sends approved users away from /login to the dashboard', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/login')).toBe('/')
  })

  it('sends approved users away from /pending to the dashboard', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/pending')).toBe('/')
  })

  it('lets approved members reach the dashboard', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/')).toBeNull()
  })

  it('blocks non-admin members from /admin', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/admin')).toBe('/')
  })

  it('lets admins reach /admin', () => {
    const profile: Profile = { status: 'approved', role: 'admin' }
    expect(getRedirectPath(profile, '/admin')).toBeNull()
  })

  it('lets admins reach nested admin routes like /admin/foo', () => {
    const profile: Profile = { status: 'approved', role: 'admin' }
    expect(getRedirectPath(profile, '/admin/foo')).toBeNull()
  })

  it('blocks non-admin members from nested admin routes like /admin/foo', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/admin/foo')).toBe('/')
  })

  it('does not treat /login-help as the public /login path for unauthenticated users', () => {
    expect(getRedirectPath(null, '/login-help')).toBe('/login')
  })

  it('does not treat /admin-guide as an admin route for approved non-admin members', () => {
    const profile: Profile = { status: 'approved', role: 'member' }
    expect(getRedirectPath(profile, '/admin-guide')).toBeNull()
  })

  it('lets rejected users stay on /pending', () => {
    const profile: Profile = { status: 'rejected', role: 'member' }
    expect(getRedirectPath(profile, '/pending')).toBeNull()
  })
})
