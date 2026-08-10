import { createClient } from '@/lib/supabase/server'
import { groupByWeek, formatWeekLabel } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

export default async function CodingPage({
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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('status', 'approved')

  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const { data: problems } = await supabase
    .from('coding_problems')
    .select('id, title, link, week_of, created_by, created_at')
    .order('week_of', { ascending: false })

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = problemIds.length
    ? await supabase.from('coding_checks').select('problem_id, user_id').in('problem_id', problemIds)
    : { data: [] }

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
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">코테 스터디</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
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
                  currentUserId={user!.id}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {weekGroups.length === 0 && (
          <p className="text-sm text-gray-500">아직 등록된 문제가 없습니다.</p>
        )}
      </div>
    </main>
  )
}
