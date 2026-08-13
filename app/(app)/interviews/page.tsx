import { createClient } from '@/lib/supabase/server'
import { SessionForm } from './session-form'
import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
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

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: sessions } = await supabase
    .from('interview_sessions')
    .select('id, created_by, title, session_at, description, created_at')
    .order('session_at', { ascending: true })

  const sessionIds = (sessions ?? []).map((s) => s.id)

  const { data: participants } = sessionIds.length
    ? await supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
    : { data: [] }

  const interviewSessions: InterviewSession[] = (sessions ?? []).map((session) => ({
    id: session.id,
    createdBy: session.created_by,
    title: session.title,
    sessionAt: session.session_at,
    description: session.description,
    createdAt: session.created_at,
    participants: (participants ?? [])
      .filter((p) => p.session_id === session.id)
      .map((p) => ({ userId: p.user_id, userName: nameById.get(p.user_id) ?? '알 수 없음' })),
  }))

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">모의면접</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <SessionForm />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewSessions.map((session) => (
          <li key={session.id}>
            <SessionCard session={session} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
