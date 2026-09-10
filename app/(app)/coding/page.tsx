import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { resolveCurrentWeek, formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import type { CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; week?: string }>
}) {
  const { error: queryError, success, week: requestedWeekId } = await searchParams
  const supabase = await createClient()
  const session = await getSessionProfile()

  const [{ data: callerProfile }, { data: profiles }, { data: weeksData }] = await Promise.all([
    supabase.from('profiles').select('github_username').eq('id', session!.userId).single(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('coding_weeks')
      .select('id, label, start_date, end_date')
      .order('start_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const weeks: CodingWeek[] = (weeksData ?? []).map((w) => ({
    id: w.id,
    label: w.label,
    startDate: w.start_date,
    endDate: w.end_date,
  }))

  const { current: currentWeek, prevId, nextId } = resolveCurrentWeek(weeks, requestedWeekId)

  const { data: problemsData } = await queryIfAny(currentWeek ? [currentWeek.id] : [], () =>
    supabase
      .from('coding_problems')
      .select('id, title, link, created_by, created_at, assignee_ids')
      .eq('week_id', currentWeek!.id)
  )

  const problemIds = (problemsData ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path, source')
      .in('problem_id', problemIds)
  )

  const codingProblems: CodingProblem[] = (problemsData ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    assigneeIds: (problem.assignee_ids as string[] | null) ?? [],
    checks: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => ({
        userId: c.user_id,
        commitSha: c.commit_sha as string | null,
        filePath: c.file_path as string | null,
        source: c.source as 'auto' | 'manual',
      })),
  }))

  return (
    <PageShell title="코테 스터디">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
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
    </PageShell>
  )
}
