'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeLateFine } from '@/lib/checkin/time'
import type { CheckinGoal } from '@/lib/checkin/types'
import { getVerifiedUser } from '@/lib/auth/verify'

// Supabase Storage rejects keys containing spaces or non-ASCII characters
// (e.g. Korean screenshot filenames like "스크린샷 2026-08-14 143253.png"),
// so the original filename can't be used as-is in the upload path.
function resolveExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}

export async function createCheckinPost(formData: FormData) {
  const photo = formData.get('photo') as File | null
  const goalCount = Number(formData.get('goalCount') ?? '0')

  const goals: CheckinGoal[] = []
  for (let i = 0; i < goalCount; i++) {
    const body = ((formData.get(`goal-${i}`) as string) || '').trim()
    if (body) {
      goals.push({ body, completed: false, completedAt: null })
    }
  }

  if (!photo || photo.size === 0) {
    redirect('/checkin?error=' + encodeURIComponent('책상 인증 사진을 첨부해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const path = `${user.id}/${Date.now()}${resolveExtension(photo.name)}`
  const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(path, photo)

  if (uploadError) {
    redirect('/checkin?error=' + encodeURIComponent(uploadError.message))
    return
  }

  const { data: publicUrlData } = supabase.storage.from('checkin-photos').getPublicUrl(path)
  const photoUrl = publicUrlData.publicUrl

  const { isLate, fineAmount } = computeLateFine(new Date().toISOString())

  const { error } = await supabase.from('checkin_posts').insert({
    author_id: user.id,
    photo_url: photoUrl,
    goals,
    is_late: isLate,
    fine_amount: fineAmount,
  })

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

  const user = await getVerifiedUser(supabase)

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

export async function toggleReaction(postId: string, emoji: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

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

export async function toggleGoalCompleted(postId: string, goalIndex: number) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: post, error: fetchError } = await supabase
    .from('checkin_posts')
    .select('author_id, goals')
    .eq('id', postId)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!post || post.author_id !== user.id) throw new Error('권한이 없습니다')

  const goals = (post.goals ?? []) as CheckinGoal[]
  const goal = goals[goalIndex]
  if (!goal) throw new Error('목표를 찾을 수 없습니다')

  const nextCompleted = !goal.completed
  const updatedGoals = goals.map((g, i) =>
    i === goalIndex
      ? { ...g, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
      : g
  )

  const { error } = await supabase.from('checkin_posts').update({ goals: updatedGoals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function updateCheckinGoals(postId: string, formData: FormData) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: post, error: fetchError } = await supabase
    .from('checkin_posts')
    .select('author_id')
    .eq('id', postId)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!post || post.author_id !== user.id) throw new Error('권한이 없습니다')

  const goalCount = Number(formData.get('goalCount') ?? '0')
  const goals: CheckinGoal[] = []
  for (let i = 0; i < goalCount; i++) {
    const body = ((formData.get(`goal-${i}`) as string) || '').trim()
    if (!body) continue

    const completed = formData.get(`completed-${i}`) === 'true'
    const completedAt = completed ? ((formData.get(`completedAt-${i}`) as string) || null) : null
    goals.push({ body, completed, completedAt })
  }

  const { error } = await supabase.from('checkin_posts').update({ goals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function deleteCheckinPost(postId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

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
