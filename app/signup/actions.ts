'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signUp(formData: FormData) {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!name || !email || !password) {
    redirect('/signup?error=' + encodeURIComponent('모든 항목을 입력해주세요'))
  }

  if (password.length < 6) {
    redirect('/signup?error=' + encodeURIComponent('비밀번호는 6자 이상이어야 합니다'))
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })

  if (error) {
    redirect('/signup?error=' + encodeURIComponent(error.message))
  }

  redirect('/pending')
}
