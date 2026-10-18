import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { MEMBER_NAMES_TAG, PROBLEM_BANK_TAG } from '@/lib/cache-tags'
import type { BankProblem, BankProblemSummary, Signature } from './types'
import { validateProblem, validateSignature } from './validate'

/**
 * Cached problem-bank reads for /problems, /problems/new, /problems/[id] and its edit page.
 *
 * RLS check (supabase/migrations/0016_problem_bank.sql and 0003_coding.sql): bank_problems and
 * profiles both grant SELECT to any approved member with no per-row ownership clause, so the
 * cookie-free cache client is safe here. Every route reaching these functions is gated by proxy.ts.
 *
 * Rows are re-validated on read because RLS lets members write bank_problems directly, bypassing the
 * actions, and the files generated from them are executed by other members.
 *
 * Invalidation is `updateTag(PROBLEM_BANK_TAG)` from app/(app)/problems/actions.ts. Per-viewer
 * decisions (may this viewer edit?) are made by callers outside these cache scopes.
 */

const UNKNOWN_AUTHOR = '알 수 없음'

export async function getProblemSummaries(): Promise<BankProblemSummary[]> {
  'use cache'
  cacheTag(PROBLEM_BANK_TAG, MEMBER_NAMES_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const [{ data: rows }, { data: profiles }] = await Promise.all([
    supabase
      .from('bank_problems')
      .select('id, company, title, signature, created_by, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, name'),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.name as string]))
  return (rows ?? [])
    .filter((row) => validateSignature(row.signature) === null)
    .map((row) => {
      const signature = row.signature as Signature
      return {
        id: row.id,
        company: row.company,
        title: row.title,
        authorName: nameById.get(row.created_by) ?? UNKNOWN_AUTHOR,
        createdAt: row.created_at,
        returnType: signature.returnType,
        paramCount: signature.params.length,
      }
    })
}

/** `id` joins the cache key, so callers must pass it through `isUuid` first. */
export async function getProblem(id: string): Promise<BankProblem | null> {
  'use cache'
  cacheTag(PROBLEM_BANK_TAG, MEMBER_NAMES_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { data: row } = await supabase
    .from('bank_problems')
    .select('id, company, title, description_md, constraints_md, time_limit_ms, signature, test_cases, created_by, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (!row) return null

  const result = validateProblem({
    company: row.company,
    title: row.title,
    descriptionMd: row.description_md,
    constraintsMd: row.constraints_md,
    timeLimitMs: row.time_limit_ms,
    signature: row.signature,
    testCases: row.test_cases,
  })
  if (!result.ok) return null

  const { data: author } = await supabase.from('profiles').select('name').eq('id', row.created_by).maybeSingle()
  return {
    id: row.id,
    ...result.value,
    createdBy: row.created_by,
    authorName: (author?.name as string | undefined) ?? UNKNOWN_AUTHOR,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
