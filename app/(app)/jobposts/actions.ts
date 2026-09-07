'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { buildFeedbackLines } from '@/lib/jobposts/snapshot'
import { getVerifiedUser } from '@/lib/auth/verify'

export async function createJobPost(formData: FormData) {
  const companyName = formData.get('companyName') as string
  const postingInfo = (formData.get('postingInfo') as string) || null
  const postDate = (formData.get('postDate') as string) || new Date().toISOString().slice(0, 10)
  const feedbackRequested = formData.get('feedbackRequested') === 'on'
  const questionCount = Number(formData.get('questionCount') ?? '0')

  const questions: { question: string; answer: string }[] = []
  for (let i = 0; i < questionCount; i++) {
    const question = (formData.get(`question-${i}`) as string) || ''
    const answer = (formData.get(`answer-${i}`) as string) || ''
    if (question && answer) {
      questions.push({ question, answer })
    }
  }

  if (!companyName || questions.length === 0) {
    redirect('/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const { data: inserted, error } = await supabase
    .from('job_posts')
    .insert({
      author_id: user.id,
      post_date: postDate,
      company_name: companyName,
      posting_info: postingInfo,
      questions,
      feedback_requested: feedbackRequested,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    redirect('/jobposts?error=' + encodeURIComponent(error?.message ?? '등록에 실패했습니다'))
    return
  }

  if (feedbackRequested) {
    const { error: docError } = await supabase
      .from('feedback_docs')
      .insert({ job_post_id: inserted.id, lines: buildFeedbackLines(questions) })

    if (docError) {
      redirect('/jobposts?error=' + encodeURIComponent(docError.message))
      return
    }
  }

  revalidatePath('/jobposts')
  redirect('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
}

export async function toggleReaction(postId: string, emoji: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('job_post_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('author_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('job_post_reactions').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('job_post_reactions')
      .insert({ post_id: postId, author_id: user.id, emoji })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/jobposts')
}

export async function deleteJobPost(postId: string) {
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

  const { error } = await supabase.from('job_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/jobposts')
}
