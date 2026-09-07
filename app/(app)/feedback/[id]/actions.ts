'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getVerifiedUser } from '@/lib/auth/verify'

export async function addFeedbackComment(
  feedbackDocId: string,
  lineIndex: number,
  parentCommentId: string | null,
  formData: FormData
) {
  const body = formData.get('body') as string

  if (!body) {
    redirect(`/feedback/${feedbackDocId}?error=` + encodeURIComponent('댓글 내용을 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const { error } = await supabase.from('feedback_comments').insert({
    feedback_doc_id: feedbackDocId,
    line_index: lineIndex,
    parent_comment_id: parentCommentId,
    author_id: user.id,
    body,
  })

  if (error) {
    redirect(`/feedback/${feedbackDocId}?error=` + encodeURIComponent(error.message))
    return
  }

  revalidatePath(`/feedback/${feedbackDocId}`)
}
