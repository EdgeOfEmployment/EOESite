import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const updateSessionMock = vi.fn()
const getRedirectPathMock = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (...args: unknown[]) => updateSessionMock(...args),
}))

vi.mock('@/lib/auth/access', () => ({
  getRedirectPath: (...args: unknown[]) => getRedirectPathMock(...args),
}))

import { proxy } from './proxy'

function buildSupabaseResponse() {
  const response = NextResponse.next()
  response.cookies.set('sb-access-token', 'refreshed-token')
  return response
}

describe('proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects unauthenticated visitors away from a protected path', async () => {
    const supabaseResponse = buildSupabaseResponse()
    const fromMock = vi.fn()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: fromMock }, user: null })
    getRedirectPathMock.mockReturnValue('/login')

    const request = new NextRequest('https://example.com/jobposts')
    const response = await proxy(request)

    expect(getRedirectPathMock).toHaveBeenCalledWith(null, '/jobposts')
    expect(fromMock).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://example.com/login')
  })

  it('carries the refreshed session cookie onto the redirect response', async () => {
    const supabaseResponse = buildSupabaseResponse()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: vi.fn() }, user: null })
    getRedirectPathMock.mockReturnValue('/login')

    const request = new NextRequest('https://example.com/jobposts')
    const response = await proxy(request)

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-token')
  })

  it('looks up the profile and passes it to getRedirectPath when a user is present', async () => {
    const supabaseResponse = buildSupabaseResponse()
    const single = vi.fn().mockResolvedValue({ data: { status: 'approved', role: 'member' } })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const fromMock = vi.fn().mockReturnValue({ select })
    updateSessionMock.mockResolvedValue({
      supabaseResponse,
      supabase: { from: fromMock },
      user: { id: 'user-1' },
    })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/jobposts')
    await proxy(request)

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(select).toHaveBeenCalledWith('status, role')
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
    expect(getRedirectPathMock).toHaveBeenCalledWith({ status: 'approved', role: 'member' }, '/jobposts')
  })

  it('does not look up a profile when there is no user', async () => {
    const supabaseResponse = buildSupabaseResponse()
    const fromMock = vi.fn()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: fromMock }, user: null })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/login')
    await proxy(request)

    expect(fromMock).not.toHaveBeenCalled()
    expect(getRedirectPathMock).toHaveBeenCalledWith(null, '/login')
  })

  it('returns the refreshed supabase response unchanged when no redirect is needed', async () => {
    const supabaseResponse = buildSupabaseResponse()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: vi.fn() }, user: null })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/login')
    const response = await proxy(request)

    expect(response).toBe(supabaseResponse)
  })
})
