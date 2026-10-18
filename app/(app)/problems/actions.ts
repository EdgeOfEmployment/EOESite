'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/auth/verify'
import { PROBLEM_BANK_TAG } from '@/lib/cache-tags'
import { resolveExtension } from '@/lib/storage/file-extension'
import { LIMITS, validateProblem, type ProblemValidation } from '@/lib/problems/validate'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PROBLEM_IMAGES_BUCKET,
  extractImagePaths,
  problemImagePublicPrefix,
} from '@/lib/problems/images'
import type { ProblemContent } from '@/lib/problems/types'

export interface FormState {
  error: string | null
}

export type UploadResult = { url: string } | { error: string }

// Every write below ends in `updateTag(PROBLEM_BANK_TAG)`, never `revalidatePath`: a path call
// expires the route's implicit soft tag, which makes the `'use cache'` reader discard every entry
// older than that instant (see the longer note in app/(app)/coding/actions.ts). `updateTag` also
// clears the client router cache, so the author sees their own write on the next navigation.

function readPayload(formData: FormData): ProblemValidation {
  const raw = formData.get('payload')
  if (typeof raw !== 'string' || raw === '') return { ok: false, error: '입력값을 확인해주세요' }
  if (raw.length > LIMITS.payloadChars) return { ok: false, error: '문제 데이터가 너무 큽니다 (최대 1MB)' }
  try {
    return validateProblem(JSON.parse(raw))
  } catch {
    return { ok: false, error: '요청 형식이 올바르지 않습니다' }
  }
}

function toRow(content: ProblemContent) {
  return {
    company: content.company,
    title: content.title,
    description_md: content.descriptionMd,
    constraints_md: content.constraintsMd,
    time_limit_ms: content.timeLimitMs,
    signature: content.signature,
    test_cases: content.testCases,
  }
}

function imagePathsOf(content: ProblemContent): string[] {
  const prefix = problemImagePublicPrefix(process.env.NEXT_PUBLIC_SUPABASE_URL!)
  return extractImagePaths([content.descriptionMd, content.constraintsMd], prefix)
}

/**
 * Best effort: a leftover image is harmless, a failed edit is not. Skips keys another problem
 * still references (e.g. a pasted image URL), since removing them would break that problem.
 */
async function removeUnusedImages(supabase: Awaited<ReturnType<typeof createClient>>, id: string, candidates: string[]) {
  if (candidates.length === 0) return
  const { data: others, error } = await supabase.from('bank_problems').select('image_paths').neq('id', id).overlaps('image_paths', candidates)
  // If we can't tell which images are shared, keep them all: an orphan is harmless, a lost image is not.
  if (error) return
  const stillUsed = new Set((others ?? []).flatMap((row) => row.image_paths as string[]))
  const removable = candidates.filter((path) => !stillUsed.has(path))
  if (removable.length > 0) await supabase.storage.from(PROBLEM_IMAGES_BUCKET).remove(removable)
}

export async function createProblem(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = readPayload(formData)
  if (!result.ok) return { error: result.error }

  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('bank_problems')
    .insert({ ...toRow(result.value), image_paths: imagePathsOf(result.value), created_by: user.id })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? '문제를 등록하지 못했어요' }

  updateTag(PROBLEM_BANK_TAG)
  redirect(`/problems/${data.id}?success=` + encodeURIComponent('문제를 등록했어요'))
}

export async function updateProblem(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const result = readPayload(formData)
  if (!result.ok) return { error: result.error }

  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) redirect('/login')

  const { data: existing } = await supabase.from('bank_problems').select('image_paths').eq('id', id).maybeSingle()
  if (!existing) return { error: '존재하지 않는 문제입니다' }

  const imagePaths = imagePathsOf(result.value)
  // RLS (author or admin) filters the row out instead of raising, so an empty result means "not allowed".
  const { data: updated, error } = await supabase
    .from('bank_problems')
    .update({ ...toRow(result.value), image_paths: imagePaths, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) return { error: error.message }
  if (!updated || updated.length === 0) return { error: '권한이 없습니다' }

  // Invalidate before cleanup so a failure while removing images cannot leave the cache stale.
  updateTag(PROBLEM_BANK_TAG)

  const removed = (existing.image_paths as string[]).filter((path) => !imagePaths.includes(path))
  await removeUnusedImages(supabase, id, removed)

  redirect(`/problems/${id}?success=` + encodeURIComponent('문제를 수정했어요'))
}

export async function deleteProblem(id: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) redirect('/login')

  const { data: deleted, error } = await supabase.from('bank_problems').delete().eq('id', id).select('image_paths')
  if (error) redirect(`/problems/${id}?error=` + encodeURIComponent(error.message))
  if (!deleted || deleted.length === 0) redirect(`/problems/${id}?error=` + encodeURIComponent('권한이 없습니다'))

  // Invalidate before cleanup so a failure while removing images cannot leave the cache stale.
  updateTag(PROBLEM_BANK_TAG)

  await removeUnusedImages(supabase, id, deleted[0].image_paths as string[])

  redirect('/problems?success=' + encodeURIComponent('문제를 삭제했어요'))
}

export async function uploadProblemImage(formData: FormData): Promise<UploadResult> {
  const file = formData.get('image')
  if (!(file instanceof File) || file.size === 0) return { error: '이미지를 선택해주세요' }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: 'PNG, JPEG, GIF, WebP 이미지만 올릴 수 있어요' }
  if (file.size > MAX_IMAGE_BYTES) return { error: '이미지는 4MB 이하여야 해요' }

  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) return { error: '로그인이 필요해요' }

  const path = `${user.id}/${crypto.randomUUID()}${resolveExtension(file.name)}`
  const { error } = await supabase.storage.from(PROBLEM_IMAGES_BUCKET).upload(path, file)
  if (error) return { error: error.message }

  const { data } = supabase.storage.from(PROBLEM_IMAGES_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}
