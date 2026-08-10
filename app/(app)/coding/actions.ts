'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createProblem(formData: FormData) {
  const title = formData.get('title') as string
  const link = formData.get('link') as string
  const weekOf = formData.get('weekOf') as string

  if (!title || !link || !weekOf) {
    redirect('/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
    return
  }

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_problems')
    .insert({ title, link, week_of: weekOf, created_by: user.id })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
}
