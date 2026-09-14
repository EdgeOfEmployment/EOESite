import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { getCodingMembers, getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
import { resolveCurrentWeek, formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/skeleton'

type CodingSearchParams = { error?: string; success?: string; week?: string }

export default function CodingPage({
  searchParams,
}: {
  searchParams: Promise<CodingSearchParams>
}) {
  return (
    <PageShell title="코테 스터디">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<GithubSettingsSkeleton />}>
        <GithubSettings />
      </Suspense>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CodingSearchParams>
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

function GithubSettingsSkeleton() {
  return <Skeleton className="mb-6 h-12 w-full" />
}

function BoardSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-6 w-48 self-center" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * The caller's own GitHub username is per-caller data, so it can never live inside a
 * `'use cache'` scope. It gets its own boundary rather than riding along with the board
 * so a slow profile read cannot hold up the week's problems, or the reverse.
 */
export async function GithubSettings() {
  const session = await getSessionProfile()
  const supabase = await createClient()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('github_username')
    .eq('id', session!.userId)
    .single()

  return <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
}

export async function BoardContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CodingSearchParams>
}) {
  const { week: requestedWeekId } = await searchParamsPromise

  const [session, weeks, members] = await Promise.all([
    getSessionProfile(),
    getCodingWeeks(),
    getCodingMembers(),
  ])

  const isAdmin = session?.role === 'admin'
  const { current: currentWeek, prevId, nextId } = resolveCurrentWeek(weeks, requestedWeekId)
  const codingProblems = currentWeek ? await getCodingWeekBoard(currentWeek.id) : []

  return (
    <>
      {isAdmin && <ProblemForm members={members} currentWeek={currentWeek} />}
      <div className="mt-6 flex flex-col gap-4">
        {currentWeek ? (
          <>
            <div className="flex items-center justify-between">
              {prevId ? (
                <Link href={`/coding?week=${prevId}`} className="text-sm underline">
                  ← 이전 주차
                </Link>
              ) : (
                <span />
              )}
              <h2 className="text-lg font-semibold">{formatWeekHeader(currentWeek)}</h2>
              {nextId ? (
                <Link href={`/coding?week=${nextId}`} className="text-sm underline">
                  다음 주차 →
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="flex flex-col gap-3">
              {codingProblems.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={session!.userId}
                />
              ))}
              {codingProblems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
            </div>
          </>
        ) : (
          <EmptyState message="아직 등록된 문제가 없습니다." />
        )}
      </div>
    </>
  )
}
