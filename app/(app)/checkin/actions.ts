'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CHECKIN_TYPES } from '@/lib/checkin/status'
import type { CheckinType } from '@/lib/checkin/types'

function isCheckinType(value: string): value is CheckinType {
  return (CHECKIN_TYPES as string[]).includes(value)
}

export async function createCheckinPost(formData: FormData) {
  const type = formData.get('type') as string
  const body = formData.get('body') as string
  const photo = formData.get('photo') as File | null

  if (!type || !isCheckinType(type) || !body) {
    redirect('/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요'))
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

  let photoUrl: string | null = null

  if (photo && photo.size > 0) {
    const path = `${user.id}/${Date.now()}-${photo.name}`
    const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(path, photo)

    if (uploadError) {
      redirect('/checkin?error=' + encodeURIComponent(uploadError.message))
      return
    }

    const { data: publicUrlData } = supabase.storage.from('checkin-photos').getPublicUrl(path)
    photoUrl = publicUrlData.publicUrl
  }

  const { error } = await supabase
    .from('checkin_posts')
    .insert({ author_id: user.id, type, body, photo_url: photoUrl })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/checkin')
  revalidatePath('/')
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
}

export async function addComment(postId: string, formData: FormData) {
  const body = formData.get('body') as string

  if (!body) {
    redirect('/checkin?error=' + encodeURIComponent('댓글 내용을 입력해주세요'))
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

  const { error } = await supabase
    .from('checkin_comments')
    .insert({ post_id: postId, author_id: user.id, body })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/checkin')
}

export async function deleteCheckinPost(postId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('권한이 없습니다')

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase.from('checkin_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function toggleReaction(postId: string, emoji: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('checkin_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('author_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('checkin_reactions').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('checkin_reactions')
      .insert({ post_id: postId, author_id: user.id, emoji })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/checkin')
}
