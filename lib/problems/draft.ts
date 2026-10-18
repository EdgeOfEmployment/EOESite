import type { Json, ProblemContent, Signature, TestCase, ValueType } from './types'
import { parseCell, validateProblem, validateSignature } from './validate'

/**
 * The authoring form's editable state. Cells stay as raw text so a half-typed `[1, 2` survives
 * re-renders; `checkDraft` turns the whole thing into a validated payload (or per-cell errors).
 * Each case's `args` is index-aligned with `params`, so adding or removing a param reshapes every case.
 */

export interface ParamDraft {
  id: string
  name: string
  type: ValueType
}

export interface CaseDraft {
  id: string
  args: string[]
  expected: string
  isExample: boolean
}

export interface Draft {
  company: string
  title: string
  descriptionMd: string
  constraintsMd: string
  timeLimitMs: string
  params: ParamDraft[]
  returnType: ValueType
  cases: CaseDraft[]
}

/** New rows are examples until this many cases exist; authors can still toggle any row. */
const DEFAULT_EXAMPLE_ROWS = 2

function newId(): string {
  return crypto.randomUUID()
}

export function emptyDraft(): Draft {
  return {
    company: '',
    title: '',
    descriptionMd: '',
    constraintsMd: '',
    timeLimitMs: '1000',
    params: [{ id: newId(), name: 'n', type: 'int' }],
    returnType: 'int',
    cases: [{ id: newId(), args: [''], expected: '', isExample: true }],
  }
}

export function draftFromContent(content: ProblemContent): Draft {
  return {
    company: content.company,
    title: content.title,
    descriptionMd: content.descriptionMd,
    constraintsMd: content.constraintsMd,
    timeLimitMs: String(content.timeLimitMs),
    params: content.signature.params.map((p) => ({ id: newId(), name: p.name, type: p.type })),
    returnType: content.signature.returnType,
    cases: content.testCases.map((c) => ({
      id: newId(),
      args: c.args.map((arg) => JSON.stringify(arg)),
      expected: JSON.stringify(c.expected),
      isExample: c.isExample,
    })),
  }
}

export function addParam(draft: Draft): Draft {
  return {
    ...draft,
    params: [...draft.params, { id: newId(), name: '', type: 'int' }],
    cases: draft.cases.map((c) => ({ ...c, args: [...c.args, ''] })),
  }
}

export function removeParam(draft: Draft, index: number): Draft {
  return {
    ...draft,
    params: draft.params.filter((_, i) => i !== index),
    cases: draft.cases.map((c) => ({ ...c, args: c.args.filter((_, i) => i !== index) })),
  }
}

export function updateParam(draft: Draft, index: number, patch: Partial<Omit<ParamDraft, 'id'>>): Draft {
  return { ...draft, params: draft.params.map((p, i) => (i === index ? { ...p, ...patch } : p)) }
}

export function addCase(draft: Draft): Draft {
  const row: CaseDraft = {
    id: newId(),
    args: draft.params.map(() => ''),
    expected: '',
    isExample: draft.cases.length < DEFAULT_EXAMPLE_ROWS,
  }
  return { ...draft, cases: [...draft.cases, row] }
}

export function removeCase(draft: Draft, caseId: string): Draft {
  return { ...draft, cases: draft.cases.filter((c) => c.id !== caseId) }
}

export function updateCase(draft: Draft, caseId: string, patch: Partial<Omit<CaseDraft, 'id' | 'args'>>): Draft {
  return { ...draft, cases: draft.cases.map((c) => (c.id === caseId ? { ...c, ...patch } : c)) }
}

export function updateCaseArg(draft: Draft, caseId: string, index: number, value: string): Draft {
  return {
    ...draft,
    cases: draft.cases.map((c) => (c.id === caseId ? { ...c, args: c.args.map((a, i) => (i === index ? value : a)) } : c)),
  }
}

export function cellKey(caseId: string, column: number | 'expected'): string {
  return `${caseId}:${column}`
}

export interface DraftCheck {
  /** Keyed by `cellKey(caseId, argIndex | 'expected')`. */
  cellErrors: Record<string, string>
  signatureError: string | null
  /** The first reason the form can't be submitted yet, for a single line next to the submit button. */
  formError: string | null
  /** The hidden `payload` field's value; null while anything is invalid. */
  payload: string | null
}

export function checkDraft(draft: Draft): DraftCheck {
  const signature: Signature = {
    params: draft.params.map((p) => ({ name: p.name, type: p.type })),
    returnType: draft.returnType,
  }
  const signatureError = validateSignature(signature)

  const cellErrors: Record<string, string> = {}
  const testCases: TestCase[] = []
  for (const row of draft.cases) {
    const args: Json[] = []
    row.args.forEach((text, i) => {
      const result = parseCell(draft.params[i].type, text)
      if (result.ok) args.push(result.value)
      else cellErrors[cellKey(row.id, i)] = result.error
    })
    const expected = parseCell(draft.returnType, row.expected)
    if (!expected.ok) cellErrors[cellKey(row.id, 'expected')] = expected.error
    if (expected.ok && args.length === row.args.length) {
      testCases.push({ args, expected: expected.value, isExample: row.isExample })
    }
  }

  if (signatureError) return { cellErrors, signatureError, formError: signatureError, payload: null }
  if (Object.keys(cellErrors).length > 0) {
    return { cellErrors, signatureError, formError: '테스트 케이스에 비어 있거나 잘못된 칸이 있습니다', payload: null }
  }

  const result = validateProblem({
    company: draft.company,
    title: draft.title,
    descriptionMd: draft.descriptionMd,
    constraintsMd: draft.constraintsMd,
    timeLimitMs: Number(draft.timeLimitMs),
    signature,
    testCases,
  })
  if (!result.ok) return { cellErrors, signatureError, formError: result.error, payload: null }
  return { cellErrors, signatureError, formError: null, payload: JSON.stringify(result.value) }
}
