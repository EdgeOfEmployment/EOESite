'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get('email') as string

  if (!email) {
    redirect('/forgot-password?error=' + encodeURIComponent('이메일을 입력해주세요'))
  }

  const supabase = await createClient()
  // NEXT_PUBLIC_SITE_URL is the canonical deployed origin; the Origin request
  // header is a local-dev-only fallback since some hosting setups don't pass
  // it through reliably.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? (await headers()).get('origin')

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    redirect('/forgot-password?error=' + encodeURIComponent(error.message))
  }

  redirect('/forgot-password?sent=1')
}
