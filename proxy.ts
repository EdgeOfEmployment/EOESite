import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getRedirectPath, type Profile } from '@/lib/auth/access'

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
      console.error('middleware: failed to fetch profile', error)
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

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
