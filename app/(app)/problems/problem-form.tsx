'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { displayTitle, type ProblemContent } from '@/lib/problems/types'
import { checkDraft, draftFromContent, emptyDraft, type Draft } from '@/lib/problems/draft'
import { LIMITS } from '@/lib/problems/validate'
import type { FormState } from './actions'
import { CaseTable } from './case-table'
import { MarkdownField } from './markdown-field'
import { SignatureEditor } from './signature-editor'

const INITIAL_STATE: FormState = { error: null }

/**
 * Create and edit share this form. Everything is serialized into one hidden `payload` field;
 * the action re-validates it with the same `validateProblem` and returns `{ error }` rather than
 * redirecting, so a rejected submit keeps the author's table intact.
 */
export function ProblemForm({
  action,
  initial,
  companies,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>
  initial?: ProblemContent
  companies: string[]
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)
  const [draft, setDraft] = useState<Draft>(() => (initial ? draftFromContent(initial) : emptyDraft()))
  const check = useMemo(() => checkDraft(draft), [draft])

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault()
      }}
    >
      {state.error && <Alert variant="danger">{state.error}</Alert>}
      <input type="hidden" name="payload" value={check.payload ?? ''} />

      <div className="flex flex-col gap-2">
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
          <div className="flex flex-col gap-1">
            <Label htmlFor="company">회사</Label>
            <Input
              id="company"
              list="company-options"
              placeholder="예: 카카오"
              maxLength={LIMITS.company}
              value={draft.company}
              onChange={(e) => set('company', e.target.value)}
            />
            <datalist id="company-options">
              {companies.map((company) => (
                <option key={company} value={company} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="title">문제 제목</Label>
            <Input
              id="title"
              placeholder="예: 두 수의 합"
              maxLength={LIMITS.title}
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
            />
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          게시글 제목: {displayTitle(draft.company.trim() || '회사', draft.title.trim() || '문제 제목')}
        </p>
      </div>

      <MarkdownField id="descriptionMd" label="문제 설명" rows={10} value={draft.descriptionMd} onChange={(v) => set('descriptionMd', v)} />
      <MarkdownField id="constraintsMd" label="제한사항" rows={4} value={draft.constraintsMd} onChange={(v) => set('constraintsMd', v)} />

      <div className="flex flex-col gap-1 sm:w-48">
        <Label htmlFor="timeLimitMs">시간 제한 (ms)</Label>
        <Input
          id="timeLimitMs"
          type="number"
          min={LIMITS.minTimeLimitMs}
          max={LIMITS.maxTimeLimitMs}
          step={100}
          value={draft.timeLimitMs}
          onChange={(e) => set('timeLimitMs', e.target.value)}
        />
      </div>

      <SignatureEditor draft={draft} onChange={setDraft} error={check.signatureError} />
      <CaseTable draft={draft} onChange={setDraft} cellErrors={check.cellErrors} />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || check.payload === null}>
          {submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className="inline-flex min-h-11 items-center rounded border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          취소
        </Link>
        {check.formError && <p className="text-sm text-amber-700 dark:text-amber-400">{check.formError}</p>}
      </div>
    </form>
  )
}
