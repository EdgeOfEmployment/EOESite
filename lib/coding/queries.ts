import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
import type { CodingProblem, CodingWeek, Member } from './types'

/**
 * The single source of truth for the coding-board cache tag. Exported rather than left as a
 * bare string because it recurs in this file, in app/(app)/coding/actions.ts (six times) and in
 * app/api/github-webhook/route.ts — a typo in any one of those would silently disable
 * invalidation with no build error and no test failure. Every call site imports this constant.
 */
export const CODING_BOARD_TAG = 'coding-board'

/**
 * Cached coding-board reads, shared by /coding and the dashboard widget on /.
 * They live here rather than in app/(app)/coding/page.tsx precisely so both routes
 * read the same rows through the same cache scopes under one `CODING_BOARD_TAG` tag —
 * two copies would mean two caches with two invalidation stories for one dataset.
 *
 * RLS check (supabase/migrations/0003_coding.sql:18,42,54 and 0013_coding_weeks.sql:18):
 * profiles, coding_problems, coding_checks and coding_weeks all grant SELECT to any
 * approved member with no per-row ownership clause, so the cookie-free cache client
 * is safe here. Every route reaching these functions is already gated by proxy.ts.
 *
 * Invalidation is `updateTag(CODING_BOARD_TAG)` from app/(app)/coding/actions.ts and
 * `revalidateTag(CODING_BOARD_TAG)` from app/api/github-webhook/route.ts. The webhook one is
 * not optional: it upserts coding_checks, and without it an auto-detected completion would sit
 * invisible until the `minutes` profile's `revalidate` window turns over — up to about a minute
 * server-side plus up to five more minutes for a client on a warm router cache (`stale`), not
 * the full hour of `expire`, which only bounds a completely idle entry.
 */
export async function getCodingMembers(): Promise<Member[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG, MEMBER_NAMES_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { data } = await supabase.from('profiles').select('id, name').eq('status', 'approved')

  return (data ?? []).map((p) => ({ id: p.id, name: p.name as string }))
}

export async function getCodingWeeks(): Promise<CodingWeek[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { data } = await supabase
    .from('coding_weeks')
    .select('id, label, start_date, end_date')
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((w) => ({
    id: w.id,
    label: w.label,
    startDate: w.start_date,
    endDate: w.end_date,
  }))
}

/**
 * `weekId` joins the cache key, so it must never be a raw `?week=` value. Callers
 * resolve it through `resolveCurrentWeek(weeks, requestedWeekId)` (lib/coding/week.ts),
 * which falls back to `weeks[0]` for an unknown id — so only ids that came out of the
 * database reach this function and the key space is bounded by the number of weeks.
 */
export async function getCodingWeekBoard(weekId: string): Promise<CodingProblem[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()

  const { data: problemsData } = await supabase
    .from('coding_problems')
    .select('id, title, link, created_by, created_at, assignee_ids')
    .eq('week_id', weekId)

  const problemIds = (problemsData ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path, source')
      .in('problem_id', problemIds)
  )

  return (problemsData ?? []).map((problem) => ({
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
}
