import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { groupByWeek, formatWeekLabel } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import type { CodingProblem, Member } from '@/lib/coding/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
  const supabase = await createClient()
  const session = await getSessionProfile()

  const [{ data: callerProfile }, { data: profiles }, { data: problems }] = await Promise.all([
    supabase.from('profiles').select('github_username').eq('id', session!.userId).single(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('coding_problems')
      .select('id, title, link, week_of, created_by, created_at')
      .order('week_of', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase.from('coding_checks').select('problem_id, user_id').in('problem_id', problemIds)
  )

  const codingProblems: CodingProblem[] = (problems ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    weekOf: problem.week_of,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    checkedUserIds: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => c.user_id),
  }))

  const weekGroups = groupByWeek(codingProblems)

  return (
    <PageShell title="코테 스터디">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
      {isAdmin && <ProblemForm />}
      <div className="mt-6 flex flex-col gap-6">
        {weekGroups.map((week) => (
          <section key={week.weekOf}>
            <h2 className="mb-2 text-lg font-semibold">{formatWeekLabel(week.weekOf)}</h2>
            <div className="flex flex-col gap-3">
              {week.items.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {weekGroups.length === 0 && <EmptyState message="아직 등록된 문제가 없습니다." />}
      </div>
    </PageShell>
  )
}
