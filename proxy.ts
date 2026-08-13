import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getRedirectPath, type Profile } from '@/lib/auth/access'

const SESSION_HEADERS = ['x-user-id', 'x-user-role', 'x-user-status']

export async function proxy(request: NextRequest) {
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

  const redirectPath = getRedirectPath(profile, request.nextUrl.pathname)

  if (redirectPath) {
    const url = request.nextUrl.clone()
    url.pathname = redirectPath
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  const requestHeaders = new Headers(request.headers)
  SESSION_HEADERS.forEach((header) => requestHeaders.delete(header))

  if (user && profile) {
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-role', profile.role)
    requestHeaders.set('x-user-status', profile.status)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
