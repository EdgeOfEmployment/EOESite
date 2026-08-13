'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createSession(formData: FormData) {
  const title = (formData.get('title') as string) || ''
  const sessionAt = (formData.get('sessionAt') as string) || ''
  const description = (formData.get('description') as string) || null

  if (!title || !sessionAt) {
    redirect('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
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

  const { error } = await supabase.from('interview_sessions').insert({
    created_by: user.id,
    title,
    session_at: sessionAt,
    description,
  })

  if (error) {
    redirect('/interviews?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/interviews')
}

export async function toggleParticipation(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('interview_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('interview_participants').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('interview_participants')
      .insert({ session_id: sessionId, user_id: user.id })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/interviews')
}

export async function deleteSession(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('권한이 없습니다')

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select('created_by')
    .eq('id', sessionId)
    .single()

  if (sessionError) throw new Error(sessionError.message)

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)

  const isOwner = session?.created_by === user.id
  const isAdmin = callerProfile?.role === 'admin'

  if (!isOwner && !isAdmin) throw new Error('권한이 없습니다')

  const { error } = await supabase.from('interview_sessions').delete().eq('id', sessionId)

  if (error) throw new Error(error.message)

  revalidatePath('/interviews')
}
