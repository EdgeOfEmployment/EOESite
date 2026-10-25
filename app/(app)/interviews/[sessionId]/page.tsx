import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { InterviewSessionView } from './views'
import { groupQasByAuthor } from '@/lib/interviews/grouping'
import type { InterviewQa } from '@/lib/interviews/types'

export default async function InterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { sessionId } = await params
  const { error: queryError, success } = await searchParams
  const supabase = await createClient()

  const [caller, { data: session }, { data: profiles }, { data: qas }] = await Promise.all([
    getSessionProfile(),
    supabase
      .from('interview_sessions')
      .select('id, title, session_at, description')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('interview_qas')
      .select('id, author_id, questions, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = caller?.role === 'admin'

  if (!session) {
    redirect('/interviews?error=' + encodeURIComponent('존재하지 않는 세션입니다'))
    return
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const qaIds = (qas ?? []).map((q) => q.id)

  const { data: feedbackDocs } = await queryIfAny(qaIds, () =>
    supabase.from('feedback_docs').select('id, interview_qa_id').in('interview_qa_id', qaIds)
  )

  const feedbackDocIdByQa = new Map((feedbackDocs ?? []).map((d) => [d.interview_qa_id, d.id as string]))

  const interviewQas: InterviewQa[] = (qas ?? []).map((qa) => ({
    id: qa.id,
    sessionId,
    authorId: qa.author_id,
    authorName: nameById.get(qa.author_id) ?? '알 수 없음',
    questions: qa.questions,
    feedbackDocId: feedbackDocIdByQa.get(qa.id) ?? '',
    createdAt: qa.created_at,
  }))

  const qaGroups = groupQasByAuthor(interviewQas)

  return (
    <InterviewSessionView
      sessionId={sessionId}
      title={session.title}
      sessionAt={session.session_at}
      description={session.description}
      qaGroups={qaGroups}
      currentUserId={caller!.userId}
      isAdmin={isAdmin}
      error={queryError}
      success={success}
    />
  )
}
