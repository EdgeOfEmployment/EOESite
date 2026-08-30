import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getRedirectPath, type Profile } from '@/lib/auth/access'
import {
  signSessionCache,
  verifySessionCache,
  SESSION_CACHE_COOKIE,
  SESSION_CACHE_TTL_MS,
} from '@/lib/auth/session-cache'
import type { SessionProfile } from '@/lib/auth/session'

const SESSION_HEADERS = ['x-user-id', 'x-user-role', 'x-user-status']

export async function proxy(request: NextRequest) {
  const cached = readCachedSession(request)
  if (cached) {
    // Cache hit: reuse the verdict from the last real check as-is, and leave
    // its cookie untouched so the TTL window doesn't slide forward on every click.
    return buildResponse(request, cached)
  }

  const { supabaseResponse, supabase, user } = await updateSession(request)

  let profile: Profile | null = null
  if (user) {
    const { data, error } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single()
    if (error) {
      console.error('proxy: failed to fetch profile', error)
    }
    profile = data as Profile | null
  }

  const session: SessionProfile | null =
    user && profile ? { userId: user.id, role: profile.role, status: profile.status } : null

  const response = buildResponse(request, session)
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  applySessionCacheCookie(response, session)

  return response
}

function readCachedSession(request: NextRequest): SessionProfile | null {
  const secret = process.env.SESSION_CACHE_SECRET
  const token = request.cookies.get(SESSION_CACHE_COOKIE)?.value
  if (!secret || !token) return null
  return verifySessionCache(token, secret, Date.now(), SESSION_CACHE_TTL_MS)
}

function buildResponse(request: NextRequest, session: SessionProfile | null) {
  const profile: Profile | null = session ? { status: session.status, role: session.role } : null
  const redirectPath = getRedirectPath(profile, request.nextUrl.pathname)

  if (redirectPath) {
    const url = request.nextUrl.clone()
    url.pathname = redirectPath
    return NextResponse.redirect(url)
  }

  return buildNextResponse(request, session)
}

function buildNextResponse(request: NextRequest, session: SessionProfile | null) {
  const requestHeaders = new Headers(request.headers)
  SESSION_HEADERS.forEach((header) => requestHeaders.delete(header))

  if (session) {
    requestHeaders.set('x-user-id', session.userId)
    requestHeaders.set('x-user-role', session.role)
    requestHeaders.set('x-user-status', session.status)
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

function applySessionCacheCookie(
  response: ReturnType<typeof NextResponse.next>,
  session: SessionProfile | null
) {
  const secret = process.env.SESSION_CACHE_SECRET
  if (!secret) return

  if (!session) {
    response.cookies.delete(SESSION_CACHE_COOKIE)
    return
  }

  response.cookies.set(SESSION_CACHE_COOKIE, signSessionCache(session, secret, Date.now()), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_CACHE_TTL_MS / 1000,
  })
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
