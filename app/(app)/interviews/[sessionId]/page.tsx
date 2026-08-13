import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
import type { InterviewQa } from '@/lib/interviews/types'

export default async function InterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { sessionId } = await params
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id, title, session_at, description')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) {
    redirect('/interviews?error=' + encodeURIComponent('존재하지 않는 세션입니다'))
    return
  }

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: qas } = await supabase
    .from('interview_qas')
    .select('id, author_id, questions, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  const qaIds = (qas ?? []).map((q) => q.id)

  const { data: feedbackDocs } = qaIds.length
    ? await supabase.from('feedback_docs').select('id, interview_qa_id').in('interview_qa_id', qaIds)
    : { data: [] }

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

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{session.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{session.session_at}</p>
      {session.description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600">{session.description}</p>
      )}
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <QaForm sessionId={sessionId} />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewQas.map((qa) => (
          <li key={qa.id}>
            <QaCard qa={qa} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
