'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SESSION_CACHE_COOKIE } from '@/lib/auth/session-cache'

export async function logOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  ;(await cookies()).delete(SESSION_CACHE_COOKIE)
  redirect('/login')
}
