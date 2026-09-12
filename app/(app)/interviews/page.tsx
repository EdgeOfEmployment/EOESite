import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { SessionForm } from './session-form'
import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'

export const unstable_instant = { prefetch: 'static' }

type InterviewsSearchParams = { error?: string; success?: string }

async function getInterviewSessions(): Promise<InterviewSession[]> {
  'use cache'
  cacheTag('interviews-feed')
  cacheLife('minutes')

  const supabase = createCacheClient()

  const [{ data: profiles }, { data: sessions }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('interview_sessions')
      .select('id, created_by, title, session_at, description, created_at')
      .order('session_at', { ascending: true }),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))
  const sessionIds = (sessions ?? []).map((s) => s.id)

  const { data: participants } = await queryIfAny(sessionIds, () =>
    supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
  )

  return (sessions ?? []).map((s) => ({
    id: s.id,
    createdBy: s.created_by,
    title: s.title,
    sessionAt: s.session_at,
    description: s.description,
    createdAt: s.created_at,
    participants: (participants ?? [])
      .filter((p) => p.session_id === s.id)
      .map((p) => ({ userId: p.user_id, userName: nameById.get(p.user_id) ?? '알 수 없음' })),
  }))
}

export default function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<InterviewsSearchParams>
}) {
  return (
    <PageShell title="모의면접">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <SessionForm />
      <Suspense fallback={<FeedSkeleton />}>
        <FeedContent />
      </Suspense>
    </PageShell>
  )
}

async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<InterviewsSearchParams>
}) {
  const { error: queryError, success } = await searchParamsPromise

  return (
    <>
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
    </>
  )
}

function FeedSkeleton() {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-20 w-full" />
        </li>
      ))}
    </ul>
  )
}

export async function FeedContent() {
  const [session, interviewSessions] = await Promise.all([getSessionProfile(), getInterviewSessions()])
  const isAdmin = session?.role === 'admin'

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {interviewSessions.map((s) => (
        <li key={s.id}>
          <SessionCard session={s} currentUserId={session!.userId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
