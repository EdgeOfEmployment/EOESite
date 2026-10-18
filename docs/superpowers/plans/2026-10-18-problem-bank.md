# Problem Bank (문제은행) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/problems` board where any approved member authors a coding-test problem (company + title, Markdown body with images, typed `solution` signature, test cases) and anyone downloads it as a self-grading C / JavaScript / Python / Java file.

**Architecture:** Pure TypeScript modules in `lib/problems/` hold the domain: validation shared by the browser and the server, a draft model for the authoring form, and one file generator per language. Next.js App Router pages under `app/(app)/problems/` read through `'use cache'` queries tagged `PROBLEM_BANK_TAG` and write through server actions that re-validate the payload and call `updateTag`. Supabase stores rows in `bank_problems` (RLS: approved members read and create; author or admin edits/deletes) and images in a public `problem-images` bucket.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript, Supabase (Postgres + Storage), Tailwind v4, Vitest + Testing Library, `react-markdown` 10 + `remark-gfm` 4.

**Spec:** `docs/superpowers/specs/2026-10-18-problem-bank-design.md`

---

## Before you start

- Work on branch `feat/problem-bank` (already created; the spec is committed there).
- Read `AGENTS.md`. This Next.js version differs from older ones; the relevant guides are `node_modules/next/dist/docs/01-app/02-guides/forms.md` (`useActionState`) and the caching notes in `lib/cache-tags.ts` and `app/(app)/coding/actions.ts` (why writes use `updateTag`, never `revalidatePath`).
- Each task names a suggested subagent model per `AGENTS.md`. Tasks touching RLS, caching or auth get a `sonnet`+ reviewer.
- **Every code block in this plan was compiled, linted and tested** in a scratch copy of this repo (102 unit tests, plus 32 real compile-and-run checks of the generated files with gcc 6.3 MinGW, Node 22, Python 3.12, JDK 21). Copy the code exactly. Where a test expects a specific Korean message, the implementation must produce that exact string.
- Shell is Git Bash on Windows. Create files with your editor/Write tool, not long heredocs.
- Commit messages follow the repo style (`feat:`, `test:`, `docs:`, `chore:`). Append the session's usual `Co-Authored-By` trailer.

## File Structure

**Domain (`lib/problems/`)** — pure, no React, no Supabase except `queries.ts`:

| File | Responsibility |
|---|---|
| `types.ts` | `ValueType`, `Signature`, `TestCase`, `ProblemContent`, `BankProblem`, `BankProblemSummary`, `displayTitle`, `formatSignature` |
| `reserved.ts` | Parameter names forbidden in any target language or the harness |
| `validate.ts` | Value/cell/signature/case/problem validation shared by form and server; `normalizeLine`, `isUuid`, `LIMITS` |
| `draft.ts` | Authoring-form state model (raw text cells) and `checkDraft` → per-cell errors or the JSON payload |
| `filter.ts` | Company counts and list filtering (outside the cache scope) |
| `images.ts` | Bucket name, upload limits, public-URL prefix, Markdown image-key extraction |
| `queries.ts` | `'use cache'` reads: `getProblemSummaries`, `getProblem` |
| `generate/shared.ts` | Case ordering, header lines, comment rendering, markers, `floatText` |
| `generate/python.ts`, `js.ts`, `java.ts`, `c.ts` | One generator per language |
| `generate/index.ts` | `generate(problem, lang, opts)` dispatch and `LANGUAGES` |
| `generate/toolchain-fixtures.ts`, `toolchain.test.ts` | Opt-in compile-and-run verification |

**Shared:** `lib/storage/file-extension.ts` (moved out of checkin), `lib/cache-tags.ts` (+`PROBLEM_BANK_TAG`), `components/markdown.tsx`, `app/globals.css` (+`.markdown`), `components/nav.tsx` (+link).

**Routes (`app/(app)/problems/`):**

| File | Responsibility |
|---|---|
| `actions.ts` | `createProblem`, `updateProblem`, `deleteProblem`, `uploadProblemImage` |
| `page.tsx` | List with company filter and search |
| `problem-form.tsx` | Create/edit form (client) wiring the three editors below |
| `markdown-field.tsx` | Markdown textarea with preview tab and image upload |
| `signature-editor.tsx` | Params + return type |
| `case-table.tsx` | Test case table |
| `new/page.tsx` | Create page |
| `[id]/page.tsx`, `[id]/loading.tsx` | Detail page and its loading boundary (also covers edit) |
| `[id]/example-table.tsx`, `download-panel.tsx`, `delete-problem-button.tsx` | Detail page parts |
| `[id]/edit/page.tsx` | Edit page (author/admin only) |

**Database:** `supabase/migrations/0016_problem_bank.sql`.

---

### Task 1: Domain types and validation

**Suggested model:** haiku

**Files:**
- Create: `lib/problems/types.ts`
- Create: `lib/problems/reserved.ts`
- Create: `lib/problems/validate.ts`
- Test: `lib/problems/validate.test.ts`

- [ ] **Step 1: Create the types module** (pure declarations; exercised by every later test)

`lib/problems/types.ts`:

````ts
export const VALUE_TYPES = ['int', 'long', 'double', 'bool', 'string', 'int[]', 'string[]', 'int[][]'] as const

export type ValueType = (typeof VALUE_TYPES)[number]

export type Json = number | boolean | string | Json[]

export interface Param {
  name: string
  type: ValueType
}

export interface Signature {
  params: Param[]
  returnType: ValueType
}

export interface TestCase {
  args: Json[]
  expected: Json
  isExample: boolean
}

/** Everything an author writes; what the form submits and what the generator consumes. */
export interface ProblemContent {
  company: string
  title: string
  descriptionMd: string
  constraintsMd: string
  timeLimitMs: number
  signature: Signature
  testCases: TestCase[]
}

export interface BankProblem extends ProblemContent {
  id: string
  createdBy: string
  authorName: string
  createdAt: string
  updatedAt: string
}

export interface BankProblemSummary {
  id: string
  company: string
  title: string
  authorName: string
  createdAt: string
  returnType: ValueType
  paramCount: number
}

export function isValueType(value: unknown): value is ValueType {
  return typeof value === 'string' && (VALUE_TYPES as readonly string[]).includes(value)
}

export function displayTitle(company: string, title: string): string {
  return `[${company}]-${title}`
}

export function formatSignature(signature: Signature): string {
  const params = signature.params.map((p) => `${p.name}: ${p.type}`).join(', ')
  return `solution(${params}) -> ${signature.returnType}`
}
````

- [ ] **Step 2: Create the reserved-name list**

`lib/problems/reserved.ts`:

````ts
/**
 * Names a parameter may not take, because some target language or the generated harness would
 * reject or misread them. Only lowercase-initial names matter: the name rule already requires
 * `^[a-z]`. `stdin`/`stdout`/`stderr`/`errno` are object-like macros in common C libraries
 * (MSVCRT defines `stdin` as `(&_iob[0])`), so a parameter with that name would not compile.
 */
const C_NAMES = [
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extern', 'float', 'for', 'goto', 'if', 'inline', 'int', 'long', 'register', 'restrict', 'return',
  'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union', 'unsigned', 'void',
  'volatile', 'while', 'bool', 'true', 'false', 'stdin', 'stdout', 'stderr', 'errno', 'unix', 'linux',
]

const JS_NAMES = [
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'implements', 'import', 'in', 'instanceof', 'interface', 'let', 'new', 'null', 'package',
  'private', 'protected', 'public', 'return', 'static', 'super', 'switch', 'this', 'throw', 'true',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'arguments', 'eval', 'undefined',
]

const PYTHON_NAMES = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]

const JAVA_NAMES = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const',
  'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float',
  'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
  'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void',
  'volatile', 'while', 'var', 'record', 'yield', 'true', 'false', 'null',
]

const HARNESS_NAMES = ['solution', 'main', 'ret_len', 'ret_rows', 'ret_cols']

export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  ...C_NAMES,
  ...JS_NAMES,
  ...PYTHON_NAMES,
  ...JAVA_NAMES,
  ...HARNESS_NAMES,
])
````

- [ ] **Step 3: Write the failing validation tests**

`lib/problems/validate.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import {
  isUuid,
  normalizeLine,
  parseCell,
  validateProblem,
  validateSignature,
  validateTestCases,
  validateValue,
} from './validate'
import type { Signature } from './types'

describe('validateValue', () => {
  it('accepts int bounds and rejects values outside them or non-integers', () => {
    expect(validateValue('int', 2147483647)).toBeNull()
    expect(validateValue('int', -2147483648)).toBeNull()
    expect(validateValue('int', 2147483648)).not.toBeNull()
    expect(validateValue('int', 1.5)).not.toBeNull()
    expect(validateValue('int', '1')).not.toBeNull()
  })

  it('limits long to the JSON safe-integer range', () => {
    expect(validateValue('long', 9007199254740991)).toBeNull()
    expect(validateValue('long', 9007199254740992)).not.toBeNull()
  })

  it('accepts any finite double but not NaN-like values', () => {
    expect(validateValue('double', 0.1)).toBeNull()
    expect(validateValue('double', 5)).toBeNull()
    expect(validateValue('double', Infinity)).not.toBeNull()
  })

  it('checks bool and string shapes', () => {
    expect(validateValue('bool', false)).toBeNull()
    expect(validateValue('bool', 0)).not.toBeNull()
    expect(validateValue('string', '')).toBeNull()
    expect(validateValue('string', 1)).not.toBeNull()
    expect(validateValue('string', 'a'.repeat(10001))).not.toBeNull()
  })

  it('checks array element types', () => {
    expect(validateValue('int[]', [])).toBeNull()
    expect(validateValue('int[]', [1, 'a'])).toBe('int[]의 원소는 int 범위의 정수여야 합니다')
    expect(validateValue('string[]', ['a', 'b'])).toBeNull()
    expect(validateValue('string[]', ['a', 1])).not.toBeNull()
  })

  it('requires int[][] to be rectangular', () => {
    expect(validateValue('int[][]', [])).toBeNull()
    expect(validateValue('int[][]', [[], []])).toBeNull()
    expect(validateValue('int[][]', [[1, 2], [3, 4]])).toBeNull()
    expect(validateValue('int[][]', [[1, 2], [3]])).toBe('int[][]의 모든 행은 길이가 같아야 합니다')
    expect(validateValue('int[][]', [1, 2])).not.toBeNull()
  })
})

describe('parseCell', () => {
  it('parses a valid JSON literal for the column type', () => {
    expect(parseCell('int[]', '[1, 2, 3]')).toEqual({ ok: true, value: [1, 2, 3] })
    expect(parseCell('string', '"abc"')).toEqual({ ok: true, value: 'abc' })
  })

  it('explains unquoted strings, empty cells, and type mismatches', () => {
    expect(parseCell('string', 'abc')).toEqual({ ok: false, error: 'JSON 형식이 아닙니다 (문자열은 "따옴표"로 감싸세요)' })
    expect(parseCell('int', '  ')).toEqual({ ok: false, error: '값을 입력하세요' })
    expect(parseCell('int', '"1"')).toEqual({ ok: false, error: 'int는 -2147483648 ~ 2147483647 범위의 정수여야 합니다' })
  })
})

describe('validateSignature', () => {
  const sig = (params: { name: string; type: string }[], returnType = 'int') => ({ params, returnType })

  it('accepts a normal signature', () => {
    expect(validateSignature(sig([{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }]))).toBeNull()
  })

  it('requires 1 to 6 params', () => {
    expect(validateSignature(sig([]))).toBe('파라미터는 1~6개여야 합니다')
    const seven = Array.from({ length: 7 }, (_, i) => ({ name: `p${i}`, type: 'int' }))
    expect(validateSignature(sig(seven))).toBe('파라미터는 1~6개여야 합니다')
  })

  it('rejects bad names, reserved words, and duplicates', () => {
    expect(validateSignature(sig([{ name: 'Arr', type: 'int' }]))).toMatch(/영문 소문자로 시작/)
    expect(validateSignature(sig([{ name: 'class', type: 'int' }]))).toMatch(/예약어/)
    expect(validateSignature(sig([{ name: 'stdin', type: 'int' }]))).toMatch(/예약어/)
    expect(validateSignature(sig([{ name: 'a', type: 'int' }, { name: 'a', type: 'int' }]))).toMatch(/중복/)
  })

  it('rejects a name that collides with a C length argument', () => {
    expect(validateSignature(sig([{ name: 'arr', type: 'int[]' }, { name: 'arr_len', type: 'int' }]))).toMatch(
      /C 코드의 배열 길이 인자/
    )
  })

  it('rejects unknown types', () => {
    expect(validateSignature(sig([{ name: 'a', type: 'float' }]))).toBe('파라미터 형식이 올바르지 않습니다')
    expect(validateSignature(sig([{ name: 'a', type: 'int' }], 'void'))).toBe('함수 시그니처 형식이 올바르지 않습니다')
  })
})

describe('validateTestCases', () => {
  const signature: Signature = { params: [{ name: 'arr', type: 'int[]' }], returnType: 'int' }

  it('accepts matching cases with at least one example', () => {
    expect(validateTestCases(signature, [{ args: [[1]], expected: 1, isExample: true }])).toBeNull()
  })

  it('names the case and param in type errors', () => {
    expect(validateTestCases(signature, [{ args: [['x']], expected: 1, isExample: true }])).toBe(
      '케이스 1 · arr: int[]의 원소는 int 범위의 정수여야 합니다'
    )
    expect(validateTestCases(signature, [{ args: [[1]], expected: 'x', isExample: true }])).toMatch(/^케이스 1 · 기대값:/)
  })

  it('rejects arity mismatches, empty lists, and lists without an example', () => {
    expect(validateTestCases(signature, [{ args: [], expected: 1, isExample: true }])).toBe(
      '케이스 1의 인자 개수가 파라미터 개수와 다릅니다'
    )
    expect(validateTestCases(signature, [])).toBe('테스트 케이스는 1~50개여야 합니다')
    expect(validateTestCases(signature, [{ args: [[1]], expected: 1, isExample: false }])).toBe(
      '예시 케이스가 최소 1개 있어야 합니다'
    )
  })
})

describe('normalizeLine', () => {
  it('trims and collapses whitespace including newlines', () => {
    expect(normalizeLine('  카카오   뱅크\n ')).toBe('카카오 뱅크')
  })
})

describe('validateProblem', () => {
  const valid = {
    company: ' 카카오 ',
    title: '두 수의 합',
    descriptionMd: '설명',
    constraintsMd: '',
    timeLimitMs: 1000,
    signature: { params: [{ name: 'a', type: 'int', extra: 'x' }], returnType: 'int' },
    testCases: [{ args: [1], expected: 1, isExample: true, extra: 'x' }],
    createdBy: 'someone-else',
  }

  it('returns a normalized copy with only known fields', () => {
    const result = validateProblem(valid)
    expect(result).toEqual({
      ok: true,
      value: {
        company: '카카오',
        title: '두 수의 합',
        descriptionMd: '설명',
        constraintsMd: '',
        timeLimitMs: 1000,
        signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
        testCases: [{ args: [1], expected: 1, isExample: true }],
      },
    })
  })

  it('rejects blank company, missing description, and out-of-range time limits', () => {
    expect(validateProblem({ ...valid, company: '   ' })).toEqual({ ok: false, error: '회사 이름은 1~30자여야 합니다' })
    expect(validateProblem({ ...valid, descriptionMd: '' })).toEqual({ ok: false, error: '문제 설명은 1~20000자여야 합니다' })
    expect(validateProblem({ ...valid, timeLimitMs: 50 })).toEqual({
      ok: false,
      error: '시간 제한은 100~60000ms 사이의 정수여야 합니다',
    })
  })

  it('surfaces signature and test case errors', () => {
    expect(validateProblem({ ...valid, signature: { params: [], returnType: 'int' } })).toEqual({
      ok: false,
      error: '파라미터는 1~6개여야 합니다',
    })
    expect(validateProblem({ ...valid, testCases: [] })).toEqual({ ok: false, error: '테스트 케이스는 1~50개여야 합니다' })
  })
})

describe('isUuid', () => {
  it('accepts canonical uuids only', () => {
    expect(isUuid('3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b/../x')).toBe(false)
  })
})
````

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/validate.test.ts`
Expected: FAIL — `Failed to resolve import "./validate"`.

- [ ] **Step 5: Implement validation**

`lib/problems/validate.ts`:

````ts
import { isValueType, type Json, type Param, type ProblemContent, type Signature, type TestCase, type ValueType } from './types'
import { RESERVED_NAMES } from './reserved'

/**
 * Shared by the authoring form (live, per cell) and the server actions (whole payload), so
 * the browser and the database agree on what a valid problem is.
 */

export const LIMITS = {
  company: 30,
  title: 100,
  description: 20000,
  constraints: 5000,
  minParams: 1,
  maxParams: 6,
  minCases: 1,
  maxCases: 50,
  string: 10000,
  intArray: 100000,
  stringArray: 10000,
  cellChars: 200000,
  payloadChars: 1000000,
  minTimeLimitMs: 100,
  maxTimeLimitMs: 60000,
} as const

const INT_MIN = -2147483648
const INT_MAX = 2147483647
const PARAM_NAME = /^[a-z][a-zA-Z0-9_]{0,29}$/

function isInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= INT_MIN && (value as number) <= INT_MAX
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Returns a Korean error message, or null when `value` is a valid `type`. */
export function validateValue(type: ValueType, value: unknown): string | null {
  switch (type) {
    case 'int':
      return isInt(value) ? null : 'int는 -2147483648 ~ 2147483647 범위의 정수여야 합니다'
    case 'long':
      return Number.isSafeInteger(value) ? null : 'long은 ±9007199254740991 범위의 정수여야 합니다'
    case 'double':
      return typeof value === 'number' && Number.isFinite(value) ? null : 'double은 숫자여야 합니다'
    case 'bool':
      return typeof value === 'boolean' ? null : 'bool은 true 또는 false여야 합니다'
    case 'string':
      if (typeof value !== 'string') return 'string은 "따옴표"로 감싼 문자열이어야 합니다'
      return value.length <= LIMITS.string ? null : `string은 ${LIMITS.string}자 이하여야 합니다`
    case 'int[]':
      if (!Array.isArray(value)) return 'int[]는 [1, 2, 3] 형태의 배열이어야 합니다'
      if (value.length > LIMITS.intArray) return `int[]는 원소 ${LIMITS.intArray}개 이하여야 합니다`
      return value.every(isInt) ? null : 'int[]의 원소는 int 범위의 정수여야 합니다'
    case 'string[]':
      if (!Array.isArray(value)) return 'string[]는 ["a", "b"] 형태의 배열이어야 합니다'
      if (value.length > LIMITS.stringArray) return `string[]는 원소 ${LIMITS.stringArray}개 이하여야 합니다`
      if (!value.every((v) => typeof v === 'string')) return 'string[]의 원소는 문자열이어야 합니다'
      return value.every((v) => (v as string).length <= LIMITS.string)
        ? null
        : `string[]의 각 문자열은 ${LIMITS.string}자 이하여야 합니다`
    case 'int[][]': {
      if (!Array.isArray(value) || !value.every(Array.isArray)) {
        return 'int[][]는 [[1, 2], [3, 4]] 형태의 2차원 배열이어야 합니다'
      }
      const rows = value as unknown[][]
      if (rows.some((row) => row.length !== rows[0].length)) return 'int[][]의 모든 행은 길이가 같아야 합니다'
      if (rows.length * (rows[0]?.length ?? 0) > LIMITS.intArray) {
        return `int[][]는 원소 ${LIMITS.intArray}개 이하여야 합니다`
      }
      return rows.every((row) => row.every(isInt)) ? null : 'int[][]의 원소는 int 범위의 정수여야 합니다'
    }
  }
}

export type CellResult = { ok: true; value: Json } | { ok: false; error: string }

/** Parses one test-case table cell (a JSON literal) and checks it against the column's type. */
export function parseCell(type: ValueType, text: string): CellResult {
  if (text.trim() === '') return { ok: false, error: '값을 입력하세요' }
  if (text.length > LIMITS.cellChars) return { ok: false, error: `${LIMITS.cellChars}자 이하로 입력하세요` }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON 형식이 아닙니다 (문자열은 "따옴표"로 감싸세요)' }
  }
  const error = validateValue(type, value)
  return error ? { ok: false, error } : { ok: true, value: value as Json }
}

/** The identifiers a parameter occupies in the generated C signature (arrays carry length arguments). */
export function cExpandedNames(param: Param): string[] {
  if (param.type === 'int[]' || param.type === 'string[]') return [param.name, `${param.name}_len`]
  if (param.type === 'int[][]') return [param.name, `${param.name}_rows`, `${param.name}_cols`]
  return [param.name]
}

export function validateSignature(signature: unknown): string | null {
  if (!isRecord(signature) || !Array.isArray(signature.params) || !isValueType(signature.returnType)) {
    return '함수 시그니처 형식이 올바르지 않습니다'
  }
  const params = signature.params as unknown[]
  if (params.length < LIMITS.minParams || params.length > LIMITS.maxParams) {
    return `파라미터는 ${LIMITS.minParams}~${LIMITS.maxParams}개여야 합니다`
  }
  const names = new Set<string>()
  for (const param of params) {
    if (!isRecord(param) || typeof param.name !== 'string' || !isValueType(param.type)) {
      return '파라미터 형식이 올바르지 않습니다'
    }
    if (!PARAM_NAME.test(param.name)) {
      return `파라미터 이름 "${param.name}"은(는) 영문 소문자로 시작하고 영문, 숫자, _만 쓸 수 있습니다 (최대 30자)`
    }
    if (RESERVED_NAMES.has(param.name)) return `"${param.name}"은(는) 예약어라서 파라미터 이름으로 쓸 수 없습니다`
    if (names.has(param.name)) return `파라미터 이름 "${param.name}"이(가) 중복됩니다`
    names.add(param.name)
  }
  const expanded = (params as Param[]).flatMap(cExpandedNames)
  const collision = expanded.find((name, i) => expanded.indexOf(name) !== i)
  if (collision) return `"${collision}"이(가) C 코드의 배열 길이 인자 이름과 겹칩니다. 파라미터 이름을 바꿔주세요`
  return null
}

/** Assumes `signature` already passed validateSignature. */
export function validateTestCases(signature: Signature, testCases: unknown): string | null {
  if (!Array.isArray(testCases)) return '테스트 케이스 형식이 올바르지 않습니다'
  if (testCases.length < LIMITS.minCases || testCases.length > LIMITS.maxCases) {
    return `테스트 케이스는 ${LIMITS.minCases}~${LIMITS.maxCases}개여야 합니다`
  }
  for (const [index, testCase] of testCases.entries()) {
    const n = index + 1
    if (!isRecord(testCase) || !Array.isArray(testCase.args) || typeof testCase.isExample !== 'boolean' || !('expected' in testCase)) {
      return `케이스 ${n}의 형식이 올바르지 않습니다`
    }
    if (testCase.args.length !== signature.params.length) return `케이스 ${n}의 인자 개수가 파라미터 개수와 다릅니다`
    for (const [i, param] of signature.params.entries()) {
      const error = validateValue(param.type, testCase.args[i])
      if (error) return `케이스 ${n} · ${param.name}: ${error}`
    }
    const error = validateValue(signature.returnType, testCase.expected)
    if (error) return `케이스 ${n} · 기대값: ${error}`
  }
  if (!testCases.some((testCase) => (testCase as TestCase).isExample)) return '예시 케이스가 최소 1개 있어야 합니다'
  return null
}

/** Trims and collapses whitespace (including newlines) so `" 카카오  뱅크 "` and `"카카오 뱅크"` are one company. */
export function normalizeLine(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export type ProblemValidation = { ok: true; value: ProblemContent } | { ok: false; error: string }

/** Validates a whole untrusted payload and returns a clean copy with only known fields. */
export function validateProblem(input: unknown): ProblemValidation {
  const fail = (error: string): ProblemValidation => ({ ok: false, error })
  if (!isRecord(input)) return fail('요청 형식이 올바르지 않습니다')

  const company = typeof input.company === 'string' ? normalizeLine(input.company) : ''
  const title = typeof input.title === 'string' ? normalizeLine(input.title) : ''
  const descriptionMd = typeof input.descriptionMd === 'string' ? input.descriptionMd.trim() : ''
  const constraintsMd = typeof input.constraintsMd === 'string' ? input.constraintsMd.trim() : ''
  const timeLimitMs = input.timeLimitMs

  if (!company || company.length > LIMITS.company) return fail(`회사 이름은 1~${LIMITS.company}자여야 합니다`)
  if (!title || title.length > LIMITS.title) return fail(`문제 제목은 1~${LIMITS.title}자여야 합니다`)
  if (!descriptionMd || descriptionMd.length > LIMITS.description) {
    return fail(`문제 설명은 1~${LIMITS.description}자여야 합니다`)
  }
  if (constraintsMd.length > LIMITS.constraints) return fail(`제한사항은 ${LIMITS.constraints}자 이하여야 합니다`)
  if (
    typeof timeLimitMs !== 'number' ||
    !Number.isInteger(timeLimitMs) ||
    timeLimitMs < LIMITS.minTimeLimitMs ||
    timeLimitMs > LIMITS.maxTimeLimitMs
  ) {
    return fail(`시간 제한은 ${LIMITS.minTimeLimitMs}~${LIMITS.maxTimeLimitMs}ms 사이의 정수여야 합니다`)
  }

  const signatureError = validateSignature(input.signature)
  if (signatureError) return fail(signatureError)
  const rawSignature = input.signature as Signature
  const signature: Signature = {
    params: rawSignature.params.map((p) => ({ name: p.name, type: p.type })),
    returnType: rawSignature.returnType,
  }

  const casesError = validateTestCases(signature, input.testCases)
  if (casesError) return fail(casesError)
  const testCases = (input.testCases as TestCase[]).map((c) => ({
    args: c.args,
    expected: c.expected,
    isExample: c.isExample,
  }))

  return { ok: true, value: { company, title, descriptionMd, constraintsMd, timeLimitMs, signature, testCases } }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Route `[id]` guard: only well-formed ids may reach a `'use cache'` read, keeping the cache key space bounded. */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}
````

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/validate.test.ts`
Expected: PASS (21 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/problems/types.ts lib/problems/reserved.ts lib/problems/validate.ts lib/problems/validate.test.ts
git commit -m "feat: add problem bank domain types and validation"
```

---

### Task 2: Generator shared helpers

**Suggested model:** haiku

**Files:**
- Create: `lib/problems/generate/shared.ts`
- Test: `lib/problems/generate/shared.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/generate/shared.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { commentBlock, floatText, headerLines, orderCases } from './shared'
import type { ProblemContent } from '../types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명입니다.\n![배열 그림](https://cdn.example.com/a.png)',
  constraintsMd: '- n ≤ 10',
  timeLimitMs: 1500,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: false },
    { args: [[], 0], expected: 0, isExample: true },
  ],
}
const opts = { problemUrl: 'https://site.example/problems/abc' }

describe('orderCases', () => {
  it('puts examples first and numbers each kind from 1', () => {
    expect(orderCases(problem.testCases).map((c) => [c.label, c.kind])).toEqual([
      ['Example 1', 'Example'],
      ['Extra 1', 'Extra'],
    ])
  })
})

describe('headerLines', () => {
  it('carries title, url, limit, run command, body, and signature, with images replaced', () => {
    const lines = headerLines(problem, opts, 'run it')
    expect(lines[0]).toBe('[카카오]-두 수의 합')
    expect(lines).toContain('문제 페이지: https://site.example/problems/abc')
    expect(lines).toContain('시간 제한: 1500ms')
    expect(lines).toContain('실행 방법: run it')
    expect(lines).toContain('[이미지: 배열 그림 - 사이트에서 확인]')
    expect(lines).toContain('- n ≤ 10')
    expect(lines.at(-1)).toBe('[함수 시그니처] solution(arr: int[], k: int) -> int')
  })

  it('omits the constraints section when it is empty', () => {
    expect(headerLines({ ...problem, constraintsMd: '' }, opts, 'x')).not.toContain('[제한사항]')
  })
})

describe('commentBlock', () => {
  it('splits on every line terminator a target language honors', () => {
    const block = commentBlock([`a\rb${String.fromCharCode(0x2028)}c`, ''], '#')
    expect(block).toBe('# a\n# b\n# c\n#')
  })

  it('applies the sanitizer to each line', () => {
    expect(commentBlock(['x'], '//', (l) => l.toUpperCase())).toBe('// X')
  })
})

describe('floatText', () => {
  it('always reads as floating point', () => {
    expect(floatText(5)).toBe('5.0')
    expect(floatText(0.25)).toBe('0.25')
    expect(floatText(1e21)).toBe('1e+21')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/generate/shared.test.ts`
Expected: FAIL — `Failed to resolve import "./shared"`.

- [ ] **Step 3: Implement the shared helpers**

Note `LINE_BREAK` is built with `new RegExp('...\\u2028|\\u2029')` on purpose: a regex *literal* containing those escapes is easy to corrupt into raw separator characters when copied, which breaks parsing.

`lib/problems/generate/shared.ts`:

````ts
import { displayTitle, formatSignature, type ProblemContent, type TestCase } from '../types'

export type Language = 'c' | 'js' | 'python' | 'java'

export interface GenerateOptions {
  /** Absolute URL of the problem's detail page, printed in the header comment. */
  problemUrl: string
}

export interface GeneratedFile {
  filename: string
  content: string
}

export interface OrderedCase extends TestCase {
  label: string
  kind: 'Example' | 'Extra'
}

/** Marker comments every generated file carries; the toolchain test splices solutions between them. */
export const SOLUTION_MARKER = '===== 여기에 풀이를 작성하세요 ====='
export const HARNESS_MARKER = '===== 아래는 채점 코드입니다 (수정하지 마세요) ====='

/** Examples first, then extras, each numbered from 1 within its own kind. */
export function orderCases(cases: TestCase[]): OrderedCase[] {
  const examples = cases
    .filter((c) => c.isExample)
    .map((c, i) => ({ ...c, label: `Example ${i + 1}`, kind: 'Example' as const }))
  const extras = cases
    .filter((c) => !c.isExample)
    .map((c, i) => ({ ...c, label: `Extra ${i + 1}`, kind: 'Extra' as const }))
  return [...examples, ...extras]
}

// Every character any of the four languages treats as ending a line comment. JS ends a `//`
// comment at U+2028/U+2029 and Python at a lone `\r`, so splitting only on `\n` would let the
// rest of a description line escape the comment and become code.
const LINE_BREAK = new RegExp('\\r\\n|\\r|\\n|\\u2028|\\u2029')
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g

function markdownLines(markdown: string): string[] {
  return markdown
    .replace(IMAGE, (_match, alt: string) =>
      alt.trim() ? `[이미지: ${alt.trim()} - 사이트에서 확인]` : '[이미지 - 사이트에서 확인]'
    )
    .split(LINE_BREAK)
}

export function headerLines(problem: ProblemContent, opts: GenerateOptions, runCommand: string): string[] {
  const lines = [
    displayTitle(problem.company, problem.title),
    `문제 페이지: ${opts.problemUrl}`,
    `시간 제한: ${problem.timeLimitMs}ms`,
    `실행 방법: ${runCommand}`,
    '',
    '[문제 설명]',
    ...markdownLines(problem.descriptionMd),
  ]
  if (problem.constraintsMd.trim()) {
    lines.push('', '[제한사항]', ...markdownLines(problem.constraintsMd))
  }
  lines.push('', `[함수 시그니처] ${formatSignature(problem.signature)}`)
  return lines
}

/** Renders lines as single-line comments, so a description containing `*` `/` can never close a block. */
export function commentBlock(lines: string[], prefix: string, sanitize: (line: string) => string = (l) => l): string {
  return lines
    .flatMap((line) => line.split(LINE_BREAK))
    .map((line) => {
      const text = sanitize(line.trimEnd())
      return text ? `${prefix} ${text}` : prefix
    })
    .join('\n')
}

/** A number literal that every target language reads as floating point (`5` → `5.0`). */
export function floatText(value: number): string {
  const text = String(value)
  return /[.eE]/.test(text) ? text : `${text}.0`
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/generate/shared.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/generate/shared.ts lib/problems/generate/shared.test.ts
git commit -m "feat: add shared helpers for problem file generators"
```

---

### Task 3: Python generator

**Suggested model:** haiku

**Files:**
- Create: `lib/problems/generate/python.ts`
- Test: `lib/problems/generate/python.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/generate/python.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { generatePython, pyLiteral } from './python'
import { HARNESS_MARKER, SOLUTION_MARKER } from './shared'
import type { ProblemContent } from '../types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1500,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: false },
    { args: [[], 0], expected: 0, isExample: true },
  ],
}
const opts = { problemUrl: 'https://site.example/problems/abc' }

describe('generatePython', () => {
  it('emits a typed stub between the markers', () => {
    const { filename, content } = generatePython(problem, opts)
    expect(filename).toBe('solution.py')
    expect(content.startsWith('# [카카오]-두 수의 합\n')).toBe(true)
    expect(content).toContain(`# ${SOLUTION_MARKER}\ndef solution(arr: List[int], k: int) -> int:\n    # TODO\n    return 0`)
    expect(content).toContain(`# ${HARNESS_MARKER}`)
  })

  it('embeds the time limit and the ordered cases as native literals', () => {
    const { content } = generatePython(problem, opts)
    expect(content).toContain('_TIME_LIMIT_MS = 1500')
    expect(content).toContain('    ("Example 1", "Example", [[], 0], 0),\n    ("Extra 1", "Extra", [[1,2], 3], 6),')
  })

  it('uses the comparator for the return type', () => {
    const { content } = generatePython({ ...problem, signature: { ...problem.signature, returnType: 'double' } }, opts)
    expect(content).toContain('abs(got - expected) <= 1e-6 * max(1.0, abs(expected))')
  })
})

describe('pyLiteral', () => {
  it('spells bools and floats the Python way and reuses JSON for the rest', () => {
    expect(pyLiteral('bool', true)).toBe('True')
    expect(pyLiteral('double', 2)).toBe('2.0')
    expect(pyLiteral('string[]', ['따옴표"', '\\'])).toBe('["따옴표\\"","\\\\"]')
    expect(pyLiteral('int[][]', [[1], [2]])).toBe('[[1],[2]]')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/generate/python.test.ts`
Expected: FAIL — `Failed to resolve import "./python"`.

- [ ] **Step 3: Implement the Python generator**

The runtime block is a `String.raw` template: what you see is exactly the emitted Python, backslashes included.

`lib/problems/generate/python.ts`:

````ts
import type { Json, ProblemContent, ValueType } from '../types'
import {
  commentBlock,
  floatText,
  headerLines,
  orderCases,
  HARNESS_MARKER,
  SOLUTION_MARKER,
  type GenerateOptions,
  type GeneratedFile,
} from './shared'

const PY_TYPE: Record<ValueType, string> = {
  int: 'int',
  long: 'int',
  double: 'float',
  bool: 'bool',
  string: 'str',
  'int[]': 'List[int]',
  'string[]': 'List[str]',
  'int[][]': 'List[List[int]]',
}

const PY_DEFAULT: Record<ValueType, string> = {
  int: '0',
  long: '0',
  double: '0.0',
  bool: 'False',
  string: '""',
  'int[]': '[]',
  'string[]': '[]',
  'int[][]': '[]',
}

const PY_EQUALS: Record<ValueType, string> = {
  int: 'return isinstance(got, int) and not isinstance(got, bool) and got == expected',
  long: 'return isinstance(got, int) and not isinstance(got, bool) and got == expected',
  double:
    'return isinstance(got, (int, float)) and not isinstance(got, bool) and abs(got - expected) <= 1e-6 * max(1.0, abs(expected))',
  bool: 'return isinstance(got, bool) and got == expected',
  string: 'return isinstance(got, str) and got == expected',
  'int[]': 'return isinstance(got, (list, tuple)) and list(got) == expected',
  'string[]': 'return isinstance(got, (list, tuple)) and list(got) == expected',
  'int[][]':
    'return isinstance(got, (list, tuple)) and [list(r) if isinstance(r, (list, tuple)) else r for r in got] == expected',
}

/** JSON is already valid Python for ints, strings and lists of them; only floats and bools differ. */
export function pyLiteral(type: ValueType, value: Json): string {
  if (type === 'double') return floatText(value as number)
  if (type === 'bool') return value ? 'True' : 'False'
  return JSON.stringify(value)
}

const PY_RUNTIME = String.raw`def _fmt(v):
    try:
        s = json.dumps(v, ensure_ascii=False)
    except (TypeError, ValueError):
        s = repr(v)
    return s if len(s) <= 200 else s[:200] + "..."


def _main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="backslashreplace")
    passed = {"Example": 0, "Extra": 0}
    total = {"Example": 0, "Extra": 0}
    all_ok = True
    for label, kind, args, expected in _CASES:
        total[kind] += 1
        print("[" + label + "] ", end="", flush=True)
        args = copy.deepcopy(args)
        start = time.perf_counter()
        try:
            got = solution(*args)
        except Exception as e:
            all_ok = False
            print("ERROR  " + type(e).__name__ + ": " + str(e))
            continue
        ms = int((time.perf_counter() - start) * 1000)
        ok = _equals(got, expected)
        line = ("PASS" if ok else "FAIL") + "  " + str(ms) + "ms"
        if ms > _TIME_LIMIT_MS:
            line += "  WARN time limit exceeded (" + str(_TIME_LIMIT_MS) + "ms)"
        print(line)
        if ok:
            passed[kind] += 1
        else:
            all_ok = False
            print("    expected: " + _fmt(expected))
            print("    got:      " + _fmt(got))
    print("----")
    print(
        "Examples: %d/%d passed | Extra: %d/%d passed | %s"
        % (passed["Example"], total["Example"], passed["Extra"], total["Extra"], "ALL PASSED" if all_ok else "SOME FAILED")
    )
    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    _main()`

export function generatePython(problem: ProblemContent, opts: GenerateOptions): GeneratedFile {
  const { params, returnType } = problem.signature
  const caseLines = orderCases(problem.testCases).map((c) => {
    const args = c.args.map((arg, i) => pyLiteral(params[i].type, arg)).join(', ')
    return `    (${JSON.stringify(c.label)}, ${JSON.stringify(c.kind)}, [${args}], ${pyLiteral(returnType, c.expected)}),`
  })
  const signature = params.map((p) => `${p.name}: ${PY_TYPE[p.type]}`).join(', ')

  const content = [
    commentBlock(headerLines(problem, opts, 'python solution.py'), '#'),
    'from typing import List',
    '',
    '',
    `# ${SOLUTION_MARKER}`,
    `def solution(${signature}) -> ${PY_TYPE[returnType]}:`,
    '    # TODO',
    `    return ${PY_DEFAULT[returnType]}`,
    '',
    '',
    `# ${HARNESS_MARKER}`,
    'import copy',
    'import json',
    'import sys',
    'import time',
    '',
    `_TIME_LIMIT_MS = ${problem.timeLimitMs}`,
    '_CASES = [',
    ...caseLines,
    ']',
    '',
    '',
    'def _equals(got, expected):',
    `    ${PY_EQUALS[returnType]}`,
    '',
    '',
    PY_RUNTIME,
  ].join('\n')

  return { filename: 'solution.py', content: content + '\n' }
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/generate/python.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/generate/python.ts lib/problems/generate/python.test.ts
git commit -m "feat: generate self-grading Python problem files"
```

---

### Task 4: JavaScript generator

**Suggested model:** haiku

**Files:**
- Create: `lib/problems/generate/js.ts`
- Test: `lib/problems/generate/js.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/generate/js.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { generateJs } from './js'
import { SOLUTION_MARKER } from './shared'
import type { ProblemContent } from '../types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1500,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: false },
    { args: [[], 0], expected: 0, isExample: true },
  ],
}
const opts = { problemUrl: 'https://site.example/problems/abc' }

describe('generateJs', () => {
  it('emits a JSDoc-typed stub between the markers', () => {
    const { filename, content } = generateJs(problem, opts)
    expect(filename).toBe('solution.js')
    expect(content).toContain(`// ${SOLUTION_MARKER}\n/**\n * @param {number[]} arr\n * @param {number} k\n * @returns {number}\n */`)
    expect(content).toContain('function solution(arr, k) {\n  // TODO\n  return 0\n}')
  })

  it('embeds cases as JSON, examples first', () => {
    const { content } = generateJs(problem, opts)
    expect(content).toContain('const TIME_LIMIT_MS = 1500')
    expect(content).toContain('  ["Example 1", "Example", [[],0], 0],\n  ["Extra 1", "Extra", [[1,2],3], 6],')
  })

  it('compares nested arrays for int[][] returns', () => {
    const { content } = generateJs({ ...problem, signature: { ...problem.signature, returnType: 'int[][]' } }, opts)
    expect(content).toContain('row.every((v, j) => v === expected[i][j])')
    expect(content).toContain('  return []\n}')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/generate/js.test.ts`
Expected: FAIL — `Failed to resolve import "./js"`.

- [ ] **Step 3: Implement the JavaScript generator**

`lib/problems/generate/js.ts`:

````ts
import type { ProblemContent, ValueType } from '../types'
import {
  commentBlock,
  headerLines,
  orderCases,
  HARNESS_MARKER,
  SOLUTION_MARKER,
  type GenerateOptions,
  type GeneratedFile,
} from './shared'

const JS_TYPE: Record<ValueType, string> = {
  int: 'number',
  long: 'number',
  double: 'number',
  bool: 'boolean',
  string: 'string',
  'int[]': 'number[]',
  'string[]': 'string[]',
  'int[][]': 'number[][]',
}

const JS_DEFAULT: Record<ValueType, string> = {
  int: '0',
  long: '0',
  double: '0',
  bool: 'false',
  string: "''",
  'int[]': '[]',
  'string[]': '[]',
  'int[][]': '[]',
}

const JS_EQUALS: Record<ValueType, string> = {
  int: "return typeof got === 'number' && got === expected",
  long: "return typeof got === 'number' && got === expected",
  double: "return typeof got === 'number' && Math.abs(got - expected) <= 1e-6 * Math.max(1, Math.abs(expected))",
  bool: 'return got === expected',
  string: 'return got === expected',
  'int[]': 'return Array.isArray(got) && got.length === expected.length && got.every((v, i) => v === expected[i])',
  'string[]': 'return Array.isArray(got) && got.length === expected.length && got.every((v, i) => v === expected[i])',
  'int[][]':
    'return Array.isArray(got) && got.length === expected.length && got.every((row, i) => Array.isArray(row) && row.length === expected[i].length && row.every((v, j) => v === expected[i][j]))',
}

// Deliberately written without template literals so the emitted JS never needs `${` escaping here.
const JS_RUNTIME = String.raw`function fmt(v) {
  let s
  try {
    s = JSON.stringify(v)
  } catch (e) {
    s = undefined
  }
  if (s === undefined) s = String(v)
  return s.length > 200 ? s.slice(0, 200) + '...' : s
}

function main() {
  const passed = { Example: 0, Extra: 0 }
  const total = { Example: 0, Extra: 0 }
  let allOk = true
  for (const [label, kind, args, expected] of CASES) {
    total[kind]++
    process.stdout.write('[' + label + '] ')
    const input = JSON.parse(JSON.stringify(args))
    const start = process.hrtime.bigint()
    let got
    try {
      got = solution(...input)
    } catch (e) {
      allOk = false
      const name = e instanceof Error ? e.name : 'Error'
      const message = e instanceof Error ? e.message : String(e)
      console.log('ERROR  ' + name + ': ' + message)
      continue
    }
    const ms = Math.floor(Number(process.hrtime.bigint() - start) / 1e6)
    const ok = equals(got, expected)
    let line = (ok ? 'PASS' : 'FAIL') + '  ' + ms + 'ms'
    if (ms > TIME_LIMIT_MS) line += '  WARN time limit exceeded (' + TIME_LIMIT_MS + 'ms)'
    console.log(line)
    if (ok) {
      passed[kind]++
    } else {
      allOk = false
      console.log('    expected: ' + fmt(expected))
      console.log('    got:      ' + fmt(got))
    }
  }
  console.log('----')
  console.log(
    'Examples: ' + passed.Example + '/' + total.Example + ' passed | Extra: ' + passed.Extra + '/' + total.Extra +
      ' passed | ' + (allOk ? 'ALL PASSED' : 'SOME FAILED')
  )
  process.exitCode = allOk ? 0 : 1
}

main()`

export function generateJs(problem: ProblemContent, opts: GenerateOptions): GeneratedFile {
  const { params, returnType } = problem.signature
  const caseLines = orderCases(problem.testCases).map(
    (c) => `  [${JSON.stringify(c.label)}, ${JSON.stringify(c.kind)}, ${JSON.stringify(c.args)}, ${JSON.stringify(c.expected)}],`
  )

  const content = [
    commentBlock(headerLines(problem, opts, 'node solution.js'), '//'),
    "'use strict'",
    '',
    `// ${SOLUTION_MARKER}`,
    '/**',
    ...params.map((p) => ` * @param {${JS_TYPE[p.type]}} ${p.name}`),
    ` * @returns {${JS_TYPE[returnType]}}`,
    ' */',
    `function solution(${params.map((p) => p.name).join(', ')}) {`,
    '  // TODO',
    `  return ${JS_DEFAULT[returnType]}`,
    '}',
    '',
    `// ${HARNESS_MARKER}`,
    `const TIME_LIMIT_MS = ${problem.timeLimitMs}`,
    'const CASES = [',
    ...caseLines,
    ']',
    '',
    'function equals(got, expected) {',
    `  ${JS_EQUALS[returnType]}`,
    '}',
    '',
    JS_RUNTIME,
  ].join('\n')

  return { filename: 'solution.js', content: content + '\n' }
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/generate/js.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/generate/js.ts lib/problems/generate/js.test.ts
git commit -m "feat: generate self-grading JavaScript problem files"
```

---

### Task 5: Java generator

**Suggested model:** sonnet (long escaping-sensitive file)

**Files:**
- Create: `lib/problems/generate/java.ts`
- Test: `lib/problems/generate/java.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/generate/java.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { generateJava, javaString } from './java'
import type { ProblemContent } from '../types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1500,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: false },
    { args: [[], 0], expected: 0, isExample: true },
  ],
}
const opts = { problemUrl: 'https://site.example/problems/abc' }

describe('generateJava', () => {
  it('emits a Solution class with an instance solution method', () => {
    const { filename, content } = generateJava(problem, opts)
    expect(filename).toBe('Solution.java')
    expect(content).toContain('public class Solution {')
    expect(content).toContain('    public int solution(int[] arr, int k) {\n        // TODO\n        return 0;\n    }')
    expect(content).toContain('    static final long TIME_LIMIT_MS = 1500L;')
  })

  it('decodes each case from JSON text in its own method and calls them in order', () => {
    const { content } = generateJava(problem, opts)
    expect(content).toContain('        start(0, "Example 1");\n        int[] a0 = toIntArr(parse(j("[]")));')
    expect(content).toContain('        int ex = toInt(parse(j("6")));')
    expect(content).toContain('        case1();\n        case2();')
  })

  it('splits long JSON into several string constants', () => {
    const big = Array.from({ length: 3000 }, (_, i) => i)
    const { content } = generateJava({ ...problem, testCases: [{ args: [big, 1], expected: 1, isExample: true }] }, opts)
    const line = content.split('\n').find((l) => l.includes('int[] a0 ='))!
    expect(line.match(/", "/g)?.length).toBeGreaterThanOrEqual(1)
  })

  it('defuses \\u inside comments', () => {
    const { content } = generateJava({ ...problem, descriptionMd: 'see \\u000a here' }, opts)
    expect(content).toContain('// see \\ u000a here')
  })
})

describe('javaString', () => {
  it('escapes so javac never sees a raw newline, quote, backslash, or non-ASCII char', () => {
    expect(javaString('가"\\\n')).toBe('"\\uac00\\"\\\\\\n"')
    expect(javaString(String.fromCharCode(1))).toBe('"\\001"')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/generate/java.test.ts`
Expected: FAIL — `Failed to resolve import "./java"`.

- [ ] **Step 3: Implement the Java generator**

Case data is JSON text parsed at runtime (see the comment above `CHUNK`). The JSON parser's number branch returns a `StringBuilder` so that a number can never be mistaken for a string value by `toStr`.

`lib/problems/generate/java.ts`:

````ts
import type { Json, ProblemContent, ValueType } from '../types'
import {
  commentBlock,
  headerLines,
  orderCases,
  HARNESS_MARKER,
  SOLUTION_MARKER,
  type GenerateOptions,
  type GeneratedFile,
} from './shared'

const JAVA_TYPE: Record<ValueType, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  bool: 'boolean',
  string: 'String',
  'int[]': 'int[]',
  'string[]': 'String[]',
  'int[][]': 'int[][]',
}

const JAVA_DEFAULT: Record<ValueType, string> = {
  int: '0',
  long: '0L',
  double: '0.0',
  bool: 'false',
  string: '""',
  'int[]': 'new int[0]',
  'string[]': 'new String[0]',
  'int[][]': 'new int[0][0]',
}

const JAVA_CONVERTER: Record<ValueType, string> = {
  int: 'toInt',
  long: 'toLong',
  double: 'toDouble',
  bool: 'toBool',
  string: 'toStr',
  'int[]': 'toIntArr',
  'string[]': 'toStrArr',
  'int[][]': 'toIntGrid',
}

// Case data is embedded as JSON text and parsed at runtime instead of as Java array literals:
// array initializers compile to bytecode per element, so a few thousand elements would blow the
// 64 KB method limit, and distinct large ints would exhaust the 65,535-entry constant pool.
// Chunks stay well under the 65,535-byte limit on a single string constant.
const CHUNK = 8000

/**
 * A Java string literal that compiles under any platform encoding: non-ASCII becomes `\uXXXX`.
 * Control characters use named or octal escapes, never `\u`, because javac expands `\u000a`
 * into a real newline before lexing and the literal would no longer close.
 */
export function javaString(text: string): string {
  let out = '"'
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text.charCodeAt(i)
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20) out += '\\' + code.toString(8).padStart(3, '0')
    else if (code < 0x7f) out += ch
    else out += '\\u' + code.toString(16).padStart(4, '0')
  }
  return out + '"'
}

function jsonChunks(value: Json): string {
  const json = JSON.stringify(value)
  const parts: string[] = []
  for (let i = 0; i < json.length; i += CHUNK) parts.push(javaString(json.slice(i, i + CHUNK)))
  return parts.join(', ')
}

const JAVA_RUNTIME = String.raw`    static final int[] PASSED = new int[2];
    static final int[] TOTAL = new int[2];
    static boolean allOk = true;

    static void start(int kind, String label) {
        TOTAL[kind]++;
        System.out.print("[" + label + "] ");
        System.out.flush();
    }

    static void error(Throwable e) {
        allOk = false;
        System.out.println("ERROR  " + e.getClass().getSimpleName() + ": " + e.getMessage());
    }

    static boolean report(int kind, boolean ok, long ms) {
        StringBuilder line = new StringBuilder(ok ? "PASS" : "FAIL").append("  ").append(ms).append("ms");
        if (ms > TIME_LIMIT_MS) line.append("  WARN time limit exceeded (").append(TIME_LIMIT_MS).append("ms)");
        System.out.println(line);
        if (ok) PASSED[kind]++;
        else allOk = false;
        return ok;
    }

    static void detail(String expected, String got) {
        System.out.println("    expected: " + cut(expected));
        System.out.println("    got:      " + cut(got));
    }

    static String cut(String s) {
        return s.length() > 200 ? s.substring(0, 200) + "..." : s;
    }

    static String j(String... parts) {
        StringBuilder b = new StringBuilder();
        for (String p : parts) b.append(p);
        return b.toString();
    }

    static Object parse(String s) {
        return new JsonParser(s).value();
    }

    /** Minimal JSON reader for the shapes the site emits. Numbers stay as text until a converter reads them. */
    static final class JsonParser {
        private final String s;
        private int i = 0;

        JsonParser(String s) {
            this.s = s;
        }

        Object value() {
            char c = s.charAt(i);
            if (c == '[') {
                i++;
                List<Object> list = new ArrayList<>();
                if (s.charAt(i) == ']') {
                    i++;
                    return list;
                }
                while (true) {
                    list.add(value());
                    char d = s.charAt(i++);
                    if (d == ']') return list;
                }
            }
            if (c == '"') {
                i++;
                StringBuilder b = new StringBuilder();
                while (true) {
                    char d = s.charAt(i++);
                    if (d == '"') return b.toString();
                    if (d != '\\') {
                        b.append(d);
                        continue;
                    }
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n': b.append('\n'); break;
                        case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e);
                    }
                }
            }
            if (s.startsWith("true", i)) {
                i += 4;
                return Boolean.TRUE;
            }
            if (s.startsWith("false", i)) {
                i += 5;
                return Boolean.FALSE;
            }
            int begin = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            return new StringBuilder(s.substring(begin, i));
        }
    }

    @SuppressWarnings("unchecked")
    static List<Object> list(Object o) {
        return (List<Object>) o;
    }

    static int toInt(Object o) { return Integer.parseInt(o.toString()); }
    static long toLong(Object o) { return Long.parseLong(o.toString()); }
    static double toDouble(Object o) { return Double.parseDouble(o.toString()); }
    static boolean toBool(Object o) { return (Boolean) o; }
    static String toStr(Object o) { return (String) o; }

    static int[] toIntArr(Object o) {
        List<Object> l = list(o);
        int[] r = new int[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toInt(l.get(i));
        return r;
    }

    static String[] toStrArr(Object o) {
        List<Object> l = list(o);
        String[] r = new String[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toStr(l.get(i));
        return r;
    }

    static int[][] toIntGrid(Object o) {
        List<Object> l = list(o);
        int[][] r = new int[l.size()][];
        for (int i = 0; i < r.length; i++) r[i] = toIntArr(l.get(i));
        return r;
    }

    static boolean eq(int a, int b) { return a == b; }
    static boolean eq(long a, long b) { return a == b; }
    static boolean eq(double a, double b) { return Math.abs(a - b) <= 1e-6 * Math.max(1.0, Math.abs(b)); }
    static boolean eq(boolean a, boolean b) { return a == b; }
    static boolean eq(String a, String b) { return a != null && a.equals(b); }
    static boolean eq(int[] a, int[] b) { return a != null && Arrays.equals(a, b); }
    static boolean eq(String[] a, String[] b) { return a != null && Arrays.equals(a, b); }

    static boolean eq(int[][] a, int[][] b) {
        if (a == null || a.length != b.length) return false;
        for (int i = 0; i < b.length; i++) if (!Arrays.equals(a[i], b[i])) return false;
        return true;
    }

    static String show(int v) { return String.valueOf(v); }
    static String show(long v) { return String.valueOf(v); }
    static String show(double v) { return String.valueOf(v); }
    static String show(boolean v) { return String.valueOf(v); }

    static String show(String v) {
        if (v == null) return "null";
        return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    static String show(int[] v) {
        return v == null ? "null" : Arrays.toString(v);
    }

    static String show(String[] v) {
        if (v == null) return "null";
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) b.append(i == 0 ? "" : ", ").append(show(v[i]));
        return b.append("]").toString();
    }

    static String show(int[][] v) {
        if (v == null) return "null";
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) b.append(i == 0 ? "" : ", ").append(show(v[i]));
        return b.append("]").toString();
    }`

function caseMethod(problem: ProblemContent, index: number, c: ReturnType<typeof orderCases>[number]): string {
  const { params, returnType } = problem.signature
  const kind = c.kind === 'Example' ? 0 : 1
  const argLines = params.map(
    (p, i) => `        ${JAVA_TYPE[p.type]} a${i} = ${JAVA_CONVERTER[p.type]}(parse(j(${jsonChunks(c.args[i])})));`
  )
  return [
    `    static void case${index}() {`,
    `        start(${kind}, ${javaString(c.label)});`,
    ...argLines,
    `        ${JAVA_TYPE[returnType]} ex = ${JAVA_CONVERTER[returnType]}(parse(j(${jsonChunks(c.expected)})));`,
    '        Solution s = new Solution();',
    '        long t0 = System.nanoTime();',
    `        ${JAVA_TYPE[returnType]} got;`,
    '        try {',
    `            got = s.solution(${params.map((_, i) => `a${i}`).join(', ')});`,
    '        } catch (Throwable e) {',
    '            error(e);',
    '            return;',
    '        }',
    '        long ms = (System.nanoTime() - t0) / 1000000L;',
    `        if (!report(${kind}, eq(got, ex), ms)) detail(show(ex), show(got));`,
    '    }',
  ].join('\n')
}

export function generateJava(problem: ProblemContent, opts: GenerateOptions): GeneratedFile {
  const { params, returnType } = problem.signature
  const cases = orderCases(problem.testCases)
  // javac expands `\u` escapes even inside comments, so `\u000a` in a description would end the comment.
  const header = commentBlock(
    headerLines(problem, opts, 'javac -encoding UTF-8 Solution.java && java Solution'),
    '//',
    (line) => line.replace(/\\u/g, '\\ u')
  )

  const content = [
    header,
    'import java.util.*;',
    '',
    'public class Solution {',
    `    // ${SOLUTION_MARKER}`,
    `    public ${JAVA_TYPE[returnType]} solution(${params.map((p) => `${JAVA_TYPE[p.type]} ${p.name}`).join(', ')}) {`,
    '        // TODO',
    `        return ${JAVA_DEFAULT[returnType]};`,
    '    }',
    '',
    `    // ${HARNESS_MARKER}`,
    `    static final long TIME_LIMIT_MS = ${problem.timeLimitMs}L;`,
    '',
    JAVA_RUNTIME,
    '',
    ...cases.map((c, i) => caseMethod(problem, i + 1, c) + '\n'),
    '    public static void main(String[] args) {',
    ...cases.map((_, i) => `        case${i + 1}();`),
    '        System.out.println("----");',
    '        System.out.println("Examples: " + PASSED[0] + "/" + TOTAL[0] + " passed | Extra: " + PASSED[1] + "/" + TOTAL[1]',
    '            + " passed | " + (allOk ? "ALL PASSED" : "SOME FAILED"));',
    '        System.exit(allOk ? 0 : 1);',
    '    }',
    '}',
  ].join('\n')

  return { filename: 'Solution.java', content: content + '\n' }
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/generate/java.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/generate/java.ts lib/problems/generate/java.test.ts
git commit -m "feat: generate self-grading Java problem files"
```

---

### Task 6: C generator

**Suggested model:** sonnet (long escaping-sensitive file)

**Files:**
- Create: `lib/problems/generate/c.ts`
- Test: `lib/problems/generate/c.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/generate/c.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { cParam, cString, cValue, generateC } from './c'
import type { ProblemContent } from '../types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1500,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: false },
    { args: [[], 0], expected: 0, isExample: true },
  ],
}
const opts = { problemUrl: 'https://site.example/problems/abc' }

describe('cParam', () => {
  it('expands array params with length arguments', () => {
    expect(cParam({ name: 'arr', type: 'int[]' })).toBe('int arr[], int arr_len')
    expect(cParam({ name: 'words', type: 'string[]' })).toBe('char* words[], int words_len')
    expect(cParam({ name: 'g', type: 'int[][]' })).toBe('int** g, int g_rows, int g_cols')
    expect(cParam({ name: 'x', type: 'long' })).toBe('long long x')
  })
})

describe('generateC', () => {
  it('emits the stub with out-params for array returns', () => {
    const { filename, content } = generateC(
      {
        ...problem,
        signature: { ...problem.signature, returnType: 'int[]' },
        testCases: [{ args: [[1], 1], expected: [1], isExample: true }],
      },
      opts
    )
    expect(filename).toBe('solution.c')
    expect(content).toContain(
      'int* solution(int arr[], int arr_len, int k, int* ret_len) {\n    // TODO\n    *ret_len = 0;\n    return NULL;\n}'
    )
  })

  it('emits one function per case, examples first, and calls them from main', () => {
    const { content } = generateC(problem, opts)
    expect(content).toContain('#define H_TIME_LIMIT_MS 1500')
    expect(content).toContain(
      'static void case_1(void) {\n    int* a0 = NULL;\n    int a1 = 0;\n    int ex = 0;\n    h_start(0, "Example 1");'
    )
    expect(content).toContain('    int got = solution(a0, 0, a1);')
    expect(content).toContain('    case_1();\n    case_2();')
  })

  it('keeps trigraphs and trailing backslashes out of comments', () => {
    const { content } = generateC({ ...problem, descriptionMd: 'x ??/\n끝 \\' }, opts)
    expect(content).toContain('// x ? ?/')
    expect(content).toContain('// 끝 \\.')
  })
})

describe('cValue', () => {
  it('passes empty arrays as NULL and spells INT_MIN safely', () => {
    expect(cValue('int[]', 'a0', [])).toEqual({ decls: ['int* a0 = NULL;'], args: ['a0', '0'] })
    expect(cValue('int', 'a0', -2147483648).decls).toEqual(['int a0 = (-2147483647 - 1);'])
    expect(cValue('int[][]', 'a0', [[], []])).toEqual({ decls: ['static int* a0[] = {NULL, NULL};'], args: ['a0', '2', '0'] })
  })

  it('declares mutable per-case storage for strings and string arrays', () => {
    expect(cValue('string[]', 'a1', ['x', 'y'])).toEqual({
      decls: ['static char a1_0[] = "x";', 'static char a1_1[] = "y";', 'static char* a1[] = {a1_0, a1_1};'],
      args: ['a1', '2'],
    })
  })
})

describe('cString', () => {
  it('escapes quotes, backslashes, trigraph question marks, and non-ASCII bytes', () => {
    expect(cString('a"\\?')).toBe('"a\\"\\\\\\?"')
    expect(cString('가')).toBe('"\\352\\260\\200"')
    expect(cString('\n')).toBe('"\\012"')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/generate/c.test.ts`
Expected: FAIL — `Failed to resolve import "./c"`.

- [ ] **Step 3: Implement the C generator**

`lib/problems/generate/c.ts`:

````ts
import type { Json, Param, ProblemContent, ValueType } from '../types'
import {
  commentBlock,
  floatText,
  headerLines,
  orderCases,
  HARNESS_MARKER,
  SOLUTION_MARKER,
  type GenerateOptions,
  type GeneratedFile,
  type OrderedCase,
} from './shared'

const C_RETURN: Record<ValueType, string> = {
  int: 'int',
  long: 'long long',
  double: 'double',
  bool: 'bool',
  string: 'char*',
  'int[]': 'int*',
  'string[]': 'char**',
  'int[][]': 'int**',
}

const C_RETURN_OUT_PARAMS: Record<ValueType, string[]> = {
  int: [],
  long: [],
  double: [],
  bool: [],
  string: [],
  'int[]': ['int* ret_len'],
  'string[]': ['int* ret_len'],
  'int[][]': ['int* ret_rows', 'int* ret_cols'],
}

const C_DEFAULT_BODY: Record<ValueType, string[]> = {
  int: ['return 0;'],
  long: ['return 0;'],
  double: ['return 0.0;'],
  bool: ['return false;'],
  string: ['char* answer = calloc(1, 1);', 'return answer;'],
  'int[]': ['*ret_len = 0;', 'return NULL;'],
  'string[]': ['*ret_len = 0;', 'return NULL;'],
  'int[][]': ['*ret_rows = 0;', '*ret_cols = 0;', 'return NULL;'],
}

const C_SHOW: Record<ValueType, string> = {
  int: 'h_show_ll',
  long: 'h_show_ll',
  double: 'h_show_d',
  bool: 'h_show_b',
  string: 'h_show_s',
  'int[]': 'h_show_ia',
  'string[]': 'h_show_sa',
  'int[][]': 'h_show_ig',
}

const C_EQUALS: Partial<Record<ValueType, string>> = {
  double: 'h_eq_d',
  string: 'h_eq_s',
  'int[]': 'h_eq_ia',
  'string[]': 'h_eq_sa',
  'int[][]': 'h_eq_ig',
}

export function cParam(param: Param): string {
  const n = param.name
  switch (param.type) {
    case 'int':
      return `int ${n}`
    case 'long':
      return `long long ${n}`
    case 'double':
      return `double ${n}`
    case 'bool':
      return `bool ${n}`
    case 'string':
      return `char* ${n}`
    case 'int[]':
      return `int ${n}[], int ${n}_len`
    case 'string[]':
      return `char* ${n}[], int ${n}_len`
    case 'int[][]':
      return `int** ${n}, int ${n}_rows, int ${n}_cols`
  }
}

function cInt(value: number): string {
  // `-2147483648` parses as unary minus applied to an out-of-range literal.
  return value === -2147483648 ? '(-2147483647 - 1)' : String(value)
}

/**
 * Emits UTF-8 bytes, with everything outside printable ASCII as 3-digit octal escapes so the
 * source compiles regardless of editor/compiler charset. `?` is escaped because gcc's
 * `-std=c99` enables trigraphs, where `??/` would turn into a backslash.
 */
export function cString(text: string): string {
  let out = '"'
  for (const byte of new TextEncoder().encode(text)) {
    if (byte === 0x22) out += '\\"'
    else if (byte === 0x5c) out += '\\\\'
    else if (byte === 0x3f) out += '\\?'
    else if (byte >= 0x20 && byte < 0x7f) out += String.fromCharCode(byte)
    else out += '\\' + byte.toString(8).padStart(3, '0')
  }
  return out + '"'
}

interface CValue {
  decls: string[]
  /** The expressions this value contributes to a call: the value plus any length arguments. */
  args: string[]
}

/** Declares a mutable, per-case copy of `value` so a solution that writes into its input affects only that case. */
export function cValue(type: ValueType, name: string, value: Json): CValue {
  switch (type) {
    case 'int':
      return { decls: [`int ${name} = ${cInt(value as number)};`], args: [name] }
    case 'long':
      return { decls: [`long long ${name} = ${value}LL;`], args: [name] }
    case 'double':
      return { decls: [`double ${name} = ${floatText(value as number)};`], args: [name] }
    case 'bool':
      return { decls: [`bool ${name} = ${value ? 'true' : 'false'};`], args: [name] }
    case 'string':
      return { decls: [`static char ${name}[] = ${cString(value as string)};`], args: [name] }
    case 'int[]': {
      const arr = value as number[]
      // C99 has no zero-length arrays; an empty array is passed as NULL with length 0.
      if (arr.length === 0) return { decls: [`int* ${name} = NULL;`], args: [name, '0'] }
      return { decls: [`static int ${name}[] = {${arr.map(cInt).join(', ')}};`], args: [name, String(arr.length)] }
    }
    case 'string[]': {
      const arr = value as string[]
      if (arr.length === 0) return { decls: [`char** ${name} = NULL;`], args: [name, '0'] }
      return {
        decls: [
          ...arr.map((s, i) => `static char ${name}_${i}[] = ${cString(s)};`),
          `static char* ${name}[] = {${arr.map((_, i) => `${name}_${i}`).join(', ')}};`,
        ],
        args: [name, String(arr.length)],
      }
    }
    case 'int[][]': {
      const rows = value as number[][]
      if (rows.length === 0) return { decls: [`int** ${name} = NULL;`], args: [name, '0', '0'] }
      const cols = rows[0].length
      const rowDecls = cols === 0 ? [] : rows.map((r, i) => `static int ${name}_r${i}[] = {${r.map(cInt).join(', ')}};`)
      const pointers = rows.map((_, i) => (cols === 0 ? 'NULL' : `${name}_r${i}`))
      return {
        decls: [...rowDecls, `static int* ${name}[] = {${pointers.join(', ')}};`],
        args: [name, String(rows.length), String(cols)],
      }
    }
  }
}

function captureResult(returnType: ValueType, callArgs: string[]): { lines: string[]; gotArgs: string[] } {
  const call = (extra: string[]) => `solution(${[...callArgs, ...extra].join(', ')})`
  switch (returnType) {
    case 'int[]':
    case 'string[]':
      return {
        lines: ['int got_len = 0;', `${C_RETURN[returnType]} got = ${call(['&got_len'])};`],
        gotArgs: ['got', 'got_len'],
      }
    case 'int[][]':
      return {
        lines: ['int got_rows = 0, got_cols = 0;', `int** got = ${call(['&got_rows', '&got_cols'])};`],
        gotArgs: ['got', 'got_rows', 'got_cols'],
      }
    default:
      return { lines: [`${C_RETURN[returnType]} got = ${call([])};`], gotArgs: ['got'] }
  }
}

function caseFunction(problem: ProblemContent, index: number, c: OrderedCase): string {
  const { params, returnType } = problem.signature
  const kind = c.kind === 'Example' ? 0 : 1
  const args = params.map((p, i) => cValue(p.type, `a${i}`, c.args[i]))
  const expected = cValue(returnType, 'ex', c.expected)
  const result = captureResult(
    returnType,
    args.flatMap((a) => a.args)
  )
  const equalsFn = C_EQUALS[returnType]
  const ok = equalsFn
    ? `${equalsFn}(${[...result.gotArgs, ...expected.args].join(', ')})`
    : `${result.gotArgs[0]} == ${expected.args[0]}`
  const show = C_SHOW[returnType]

  return [
    `static void case_${index}(void) {`,
    ...[...args.flatMap((a) => a.decls), ...expected.decls].map((d) => `    ${d}`),
    `    h_start(${kind}, ${cString(c.label)});`,
    '    clock_t h_t0 = clock();',
    ...result.lines.map((l) => `    ${l}`),
    '    long h_ms = h_elapsed(h_t0);',
    `    if (!h_report(${kind}, ${ok}, h_ms)) {`,
    `        h_begin("expected: "); ${show}(${expected.args.join(', ')}); h_end();`,
    `        h_begin("got:      "); ${show}(${result.gotArgs.join(', ')}); h_end();`,
    '    }',
    '}',
  ].join('\n')
}

const C_RUNTIME = String.raw`static int h_passed[2], h_total[2];
static int h_all_ok = 1;
static int h_budget;

static void h_start(int kind, const char* label) {
    h_total[kind]++;
    printf("[%s] ", label);
    fflush(stdout);
}

static long h_elapsed(clock_t t0) {
    return (long)((clock() - t0) * 1000.0 / CLOCKS_PER_SEC);
}

static int h_report(int kind, int ok, long ms) {
    printf("%s  %ldms", ok ? "PASS" : "FAIL", ms);
    if (ms > H_TIME_LIMIT_MS) printf("  WARN time limit exceeded (%dms)", H_TIME_LIMIT_MS);
    printf("\n");
    if (ok) h_passed[kind]++;
    else h_all_ok = 0;
    return ok;
}

/* Prints at most 200 characters of a value, then "...". */
static void h_out(const char* s) {
    for (; *s; s++) {
        if (h_budget > 0) putchar(*s);
        else if (h_budget == 0) fputs("...", stdout);
        h_budget--;
    }
}

static void h_begin(const char* label) {
    printf("    %s", label);
    h_budget = 200;
}

static void h_end(void) {
    printf("\n");
}

/* Hand-rolled because older MinGW printf does not support %lld. */
static void h_show_ll(long long v) {
    char buf[32];
    int i = 31;
    int neg = v < 0;
    unsigned long long u = neg ? 0ULL - (unsigned long long)v : (unsigned long long)v;
    buf[i] = '\0';
    do {
        buf[--i] = (char)('0' + u % 10);
        u /= 10;
    } while (u > 0);
    if (neg) buf[--i] = '-';
    h_out(buf + i);
}

static void h_show_d(double v) {
    char buf[64];
    sprintf(buf, "%.10g", v);
    h_out(buf);
}

static void h_show_b(bool v) {
    h_out(v ? "true" : "false");
}

static void h_show_s(const char* s) {
    if (s == NULL) {
        h_out("null");
        return;
    }
    h_out("\"");
    for (; *s; s++) {
        char c[2] = {*s, '\0'};
        if (*s == '"') h_out("\\\"");
        else if (*s == '\\') h_out("\\\\");
        else if (*s == '\n') h_out("\\n");
        else h_out(c);
    }
    h_out("\"");
}

static void h_show_ia(const int* a, int n) {
    if (a == NULL && n > 0) {
        h_out("null");
        return;
    }
    h_out("[");
    for (int i = 0; i < n; i++) {
        if (i) h_out(", ");
        h_show_ll(a[i]);
    }
    h_out("]");
}

static void h_show_sa(char** a, int n) {
    if (a == NULL && n > 0) {
        h_out("null");
        return;
    }
    h_out("[");
    for (int i = 0; i < n; i++) {
        if (i) h_out(", ");
        h_show_s(a[i]);
    }
    h_out("]");
}

static void h_show_ig(int** a, int rows, int cols) {
    if (a == NULL && rows > 0) {
        h_out("null");
        return;
    }
    h_out("[");
    for (int i = 0; i < rows; i++) {
        if (i) h_out(", ");
        h_show_ia(a[i], cols);
    }
    h_out("]");
}

static int h_eq_d(double a, double b) {
    double d = a - b;
    double m = b < 0 ? -b : b;
    if (d < 0) d = -d;
    return d <= 1e-6 * (m > 1.0 ? m : 1.0);
}

static int h_eq_s(const char* a, const char* b) {
    return a != NULL && strcmp(a, b) == 0;
}

static int h_eq_ia(const int* a, int an, const int* b, int bn) {
    if (an != bn) return 0;
    if (bn == 0) return 1;
    if (a == NULL) return 0;
    for (int i = 0; i < bn; i++)
        if (a[i] != b[i]) return 0;
    return 1;
}

static int h_eq_sa(char** a, int an, char** b, int bn) {
    if (an != bn) return 0;
    if (bn == 0) return 1;
    if (a == NULL) return 0;
    for (int i = 0; i < bn; i++)
        if (!h_eq_s(a[i], b[i])) return 0;
    return 1;
}

static int h_eq_ig(int** a, int ar, int ac, int** b, int br, int bc) {
    if (ar != br) return 0;
    if (br == 0) return 1;
    if (ac != bc) return 0;
    if (bc == 0) return 1;
    if (a == NULL) return 0;
    for (int i = 0; i < br; i++)
        if (!h_eq_ia(a[i], ac, b[i], bc)) return 0;
    return 1;
}`

/** Keeps a comment line from turning into something else: `??/` is a trigraph for `\`, and a trailing `\` splices the next line in. */
function sanitizeCComment(line: string): string {
  const noTrigraphs = line.replace(/\?(?=\?)/g, '? ')
  return noTrigraphs.endsWith('\\') ? noTrigraphs + '.' : noTrigraphs
}

export function generateC(problem: ProblemContent, opts: GenerateOptions): GeneratedFile {
  const { params, returnType } = problem.signature
  const cases = orderCases(problem.testCases)
  const signatureParams = [...params.map(cParam), ...C_RETURN_OUT_PARAMS[returnType]].join(', ')

  const content = [
    commentBlock(
      headerLines(problem, opts, 'gcc -std=c99 -O2 solution.c -o solution && ./solution'),
      '//',
      sanitizeCComment
    ),
    '#include <stdbool.h>',
    '#include <stdio.h>',
    '#include <stdlib.h>',
    '#include <string.h>',
    '#include <time.h>',
    '',
    `// ${SOLUTION_MARKER}`,
    '// 배열/문자열을 반환할 때는 malloc으로 할당하고, 배열 길이는 ret_len(2차원은 ret_rows/ret_cols)에 넣으세요.',
    `${C_RETURN[returnType]} solution(${signatureParams}) {`,
    '    // TODO',
    ...C_DEFAULT_BODY[returnType].map((l) => `    ${l}`),
    '}',
    '',
    `// ${HARNESS_MARKER}`,
    `#define H_TIME_LIMIT_MS ${problem.timeLimitMs}`,
    '',
    C_RUNTIME,
    '',
    ...cases.map((c, i) => caseFunction(problem, i + 1, c) + '\n'),
    'int main(void) {',
    // Only some helpers are used for a given return type; referencing all of them keeps -Wall quiet.
    '    (void)h_show_ll; (void)h_show_d; (void)h_show_b; (void)h_show_s; (void)h_show_ia; (void)h_show_sa; (void)h_show_ig;',
    '    (void)h_eq_d; (void)h_eq_s; (void)h_eq_ia; (void)h_eq_sa; (void)h_eq_ig;',
    ...cases.map((_, i) => `    case_${i + 1}();`),
    '    printf("----\\n");',
    '    printf("Examples: %d/%d passed | Extra: %d/%d passed | %s\\n", h_passed[0], h_total[0], h_passed[1], h_total[1],',
    '           h_all_ok ? "ALL PASSED" : "SOME FAILED");',
    '    return h_all_ok ? 0 : 1;',
    '}',
  ].join('\n')

  return { filename: 'solution.c', content: content + '\n' }
}
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/generate/c.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/generate/c.ts lib/problems/generate/c.test.ts
git commit -m "feat: generate self-grading C problem files"
```

---

### Task 7: Generator dispatch and real-toolchain verification

**Suggested model:** sonnet

**Files:**
- Create: `lib/problems/generate/index.ts`
- Create: `lib/problems/generate/toolchain-fixtures.ts`
- Test: `lib/problems/generate/toolchain.test.ts`

- [ ] **Step 1: Create the dispatcher**

`lib/problems/generate/index.ts`:

````ts
import type { ProblemContent } from '../types'
import { generateC } from './c'
import { generateJava } from './java'
import { generateJs } from './js'
import { generatePython } from './python'
import type { GenerateOptions, GeneratedFile, Language } from './shared'

export type { GenerateOptions, GeneratedFile, Language } from './shared'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'c', label: 'C' },
  { id: 'js', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
]

export function generate(problem: ProblemContent, lang: Language, opts: GenerateOptions): GeneratedFile {
  switch (lang) {
    case 'c':
      return generateC(problem, opts)
    case 'js':
      return generateJs(problem, opts)
    case 'python':
      return generatePython(problem, opts)
    case 'java':
      return generateJava(problem, opts)
  }
}
````

- [ ] **Step 2: Create the fixtures**

Eight problems that together cover every param type and every return type, each with a description built to break comments (`*/`, `\u000a`, a trailing backslash, a trigraph, an image, U+2028), and a correct reference solution per language. Every fixture has at least one case the stub's default return fails.

`lib/problems/generate/toolchain-fixtures.ts`:

````ts
import type { ProblemContent, Signature, TestCase } from '../types'
import type { Language } from './shared'

export interface ToolchainFixture {
  name: string
  problem: ProblemContent
  /** A correct `solution` per language, spliced between the generated file's markers. */
  solutions: Record<Language, string>
}

// Every line here is something that has broken a comment in at least one target language:
// `*/`, a Java `\u` escape, a trailing backslash (C line splice), a trigraph, an image, and U+2028.
const HOSTILE_DESCRIPTION = [
  '설명 */ 끝',
  'javac가 읽는 \\u000a 이스케이프',
  '역슬래시로 끝나는 줄 \\',
  '트라이그래프 ??/',
  '![그림](https://example.com/a.png) 그림 뒤',
  `줄 구분자${String.fromCharCode(0x2028)}다음 줄`,
].join('\n')

function problem(title: string, signature: Signature, testCases: TestCase[]): ProblemContent {
  return {
    company: '테스트',
    title,
    descriptionMd: HOSTILE_DESCRIPTION,
    constraintsMd: '- n ≤ 10^5',
    timeLimitMs: 1000,
    signature,
    testCases,
  }
}

export const TOOLCHAIN_FIXTURES: ToolchainFixture[] = [
  {
    name: 'sum',
    problem: problem(
      '합',
      { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
      [
        { args: [[1, 2, 3], 2], expected: 8, isExample: true },
        { args: [[], 5], expected: 5, isExample: false },
        { args: [[-1, -2], 0], expected: -3, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(arr, k):\n    return sum(arr) + k',
      js: 'function solution(arr, k) {\n  return arr.reduce((a, b) => a + b, 0) + k\n}',
      java: '    public int solution(int[] arr, int k) {\n        int s = k;\n        for (int v : arr) s += v;\n        return s;\n    }',
      c: 'int solution(int arr[], int arr_len, int k) {\n    int s = k;\n    for (int i = 0; i < arr_len; i++) s += arr[i];\n    return s;\n}',
    },
  },
  {
    name: 'mix',
    problem: problem(
      '혼합',
      {
        params: [
          { name: 'a', type: 'long' },
          { name: 'b', type: 'double' },
          { name: 'flag', type: 'bool' },
        ],
        returnType: 'double',
      },
      [
        { args: [10000000000, 0.5, true], expected: 10000000000.5, isExample: true },
        { args: [3, 1.25, false], expected: 1.75, isExample: false },
        { args: [-5, 0.1, true], expected: -4.9, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(a, b, flag):\n    return a + b if flag else a - b',
      js: 'function solution(a, b, flag) {\n  return flag ? a + b : a - b\n}',
      java: '    public double solution(long a, double b, boolean flag) {\n        return flag ? a + b : a - b;\n    }',
      c: 'double solution(long long a, double b, bool flag) {\n    return flag ? a + b : a - b;\n}',
    },
  },
  {
    name: 'prefix',
    problem: problem(
      '접두사',
      { params: [{ name: 's', type: 'string' }, { name: 'words', type: 'string[]' }], returnType: 'string[]' },
      [
        { args: ['가', ['a', 'b']], expected: ['가a', '가b'], isExample: true },
        { args: ['x"\\?', []], expected: [], isExample: false },
        { args: ['', ['??/', '줄\n바꿈', '😀']], expected: ['??/', '줄\n바꿈', '😀'], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(s, words):\n    return [s + w for w in words]',
      js: 'function solution(s, words) {\n  return words.map((w) => s + w)\n}',
      java: '    public String[] solution(String s, String[] words) {\n        String[] r = new String[words.length];\n        for (int i = 0; i < words.length; i++) r[i] = s + words[i];\n        return r;\n    }',
      c: [
        'char** solution(char* s, char* words[], int words_len, int* ret_len) {',
        '    char** r = malloc(sizeof(char*) * (words_len > 0 ? words_len : 1));',
        '    for (int i = 0; i < words_len; i++) {',
        '        r[i] = malloc(strlen(s) + strlen(words[i]) + 1);',
        '        strcpy(r[i], s);',
        '        strcat(r[i], words[i]);',
        '    }',
        '    *ret_len = words_len;',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'transpose',
    problem: problem(
      '전치',
      { params: [{ name: 'grid', type: 'int[][]' }], returnType: 'int[][]' },
      [
        { args: [[[1, 2, 3], [4, 5, 6]]], expected: [[1, 4], [2, 5], [3, 6]], isExample: true },
        { args: [[]], expected: [], isExample: false },
        { args: [[[], []]], expected: [], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(grid):\n    return [list(row) for row in zip(*grid)]',
      js: 'function solution(grid) {\n  if (grid.length === 0) return []\n  return grid[0].map((_, j) => grid.map((row) => row[j]))\n}',
      java: [
        '    public int[][] solution(int[][] grid) {',
        '        if (grid.length == 0 || grid[0].length == 0) return new int[0][0];',
        '        int[][] t = new int[grid[0].length][grid.length];',
        '        for (int i = 0; i < grid.length; i++)',
        '            for (int j = 0; j < grid[0].length; j++) t[j][i] = grid[i][j];',
        '        return t;',
        '    }',
      ].join('\n'),
      c: [
        'int** solution(int** grid, int grid_rows, int grid_cols, int* ret_rows, int* ret_cols) {',
        '    if (grid_rows == 0 || grid_cols == 0) {',
        '        *ret_rows = 0;',
        '        *ret_cols = 0;',
        '        return NULL;',
        '    }',
        '    int** t = malloc(sizeof(int*) * grid_cols);',
        '    for (int j = 0; j < grid_cols; j++) {',
        '        t[j] = malloc(sizeof(int) * grid_rows);',
        '        for (int i = 0; i < grid_rows; i++) t[j][i] = grid[i][j];',
        '    }',
        '    *ret_rows = grid_cols;',
        '    *ret_cols = grid_rows;',
        '    return t;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'repeat',
    problem: problem(
      '반복',
      { params: [{ name: 's', type: 'string' }, { name: 'n', type: 'int' }], returnType: 'string' },
      [
        { args: ['ab', 2], expected: 'abab', isExample: true },
        { args: ['한', 3], expected: '한한한', isExample: false },
        { args: ['x', 0], expected: '', isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(s, n):\n    return s * n',
      js: 'function solution(s, n) {\n  return s.repeat(n)\n}',
      java: '    public String solution(String s, int n) {\n        return s.repeat(n);\n    }',
      c: [
        'char* solution(char* s, int n) {',
        '    char* r = malloc(strlen(s) * n + 1);',
        '    r[0] = 0;',
        '    for (int i = 0; i < n; i++) strcat(r, s);',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'isEven',
    problem: problem(
      '짝수',
      { params: [{ name: 'x', type: 'long' }], returnType: 'bool' },
      [
        { args: [4], expected: true, isExample: true },
        { args: [7], expected: false, isExample: false },
        { args: [-9007199254740990], expected: true, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(x):\n    return x % 2 == 0',
      js: 'function solution(x) {\n  return x % 2 === 0\n}',
      java: '    public boolean solution(long x) {\n        return x % 2 == 0;\n    }',
      c: 'bool solution(long long x) {\n    return x % 2 == 0;\n}',
    },
  },
  {
    name: 'square',
    problem: problem(
      '제곱',
      { params: [{ name: 'x', type: 'int' }], returnType: 'long' },
      [
        { args: [3], expected: 9, isExample: true },
        { args: [46341], expected: 2147488281, isExample: false },
        { args: [-2], expected: 4, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(x):\n    return x * x',
      js: 'function solution(x) {\n  return x * x\n}',
      java: '    public long solution(int x) {\n        return (long) x * x;\n    }',
      c: 'long long solution(int x) {\n    return (long long)x * x;\n}',
    },
  },
  {
    name: 'evens',
    problem: problem(
      '짝수만',
      { params: [{ name: 'arr', type: 'int[]' }], returnType: 'int[]' },
      [
        { args: [[1, 2, 3, 4]], expected: [2, 4], isExample: true },
        { args: [[1, 3]], expected: [], isExample: false },
        { args: [[]], expected: [], isExample: false },
        { args: [[-2147483648, 1]], expected: [-2147483648], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(arr):\n    return [v for v in arr if v % 2 == 0]',
      js: 'function solution(arr) {\n  return arr.filter((v) => v % 2 === 0)\n}',
      java: '    public int[] solution(int[] arr) {\n        return Arrays.stream(arr).filter(v -> v % 2 == 0).toArray();\n    }',
      c: [
        'int* solution(int arr[], int arr_len, int* ret_len) {',
        '    int* r = malloc(sizeof(int) * (arr_len > 0 ? arr_len : 1));',
        '    int n = 0;',
        '    for (int i = 0; i < arr_len; i++)',
        '        if (arr[i] % 2 == 0) r[n++] = arr[i];',
        '    *ret_len = n;',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
]
````

- [ ] **Step 3: Create the opt-in toolchain test**

`lib/problems/generate/toolchain.test.ts`:

````ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from './index'
import { HARNESS_MARKER, SOLUTION_MARKER, type Language } from './shared'
import { TOOLCHAIN_FIXTURES } from './toolchain-fixtures'

/**
 * Compiles and runs every generated file with the real toolchains. Opt-in because it needs
 * gcc, node, python and a JDK on PATH and takes tens of seconds:
 *
 *   VERIFY_TOOLCHAINS=1 npx vitest run lib/problems/generate/toolchain.test.ts
 *
 * For each fixture and language it runs the generated file twice: as downloaded (the stub's
 * default return must fail at least one case → exit 1) and with a correct solution spliced in
 * (every case must pass → exit 0).
 */

const ENABLED = Boolean(process.env.VERIFY_TOOLCHAINS)
const IS_WINDOWS = process.platform === 'win32'

function available(cmd: string, args: string[]): boolean {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: false }).status === 0
}

const PYTHON = available('python3', ['--version']) ? 'python3' : 'python'

const TOOLCHAINS: Record<Language, boolean> = ENABLED
  ? {
      c: available('gcc', ['--version']),
      js: available('node', ['--version']),
      python: available(PYTHON, ['--version']),
      java: available('javac', ['-version']) && available('java', ['-version']),
    }
  : { c: false, js: false, python: false, java: false }

function splice(content: string, solution: string): string {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.includes(SOLUTION_MARKER))
  const end = lines.findIndex((l) => l.includes(HARNESS_MARKER))
  return [...lines.slice(0, start + 1), solution, '', ...lines.slice(end)].join('\n')
}

function run(cmd: string, args: string[], cwd: string) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** Builds (if needed) and runs one file; returns the program's exit status and combined output. */
function execute(lang: Language, dir: string, filename: string) {
  switch (lang) {
    case 'c': {
      const build = run('gcc', ['-std=c99', '-O2', '-Wall', '-Werror', filename, '-o', 'solution'], dir)
      if (build.status !== 0) return build
      return run(path.join(dir, IS_WINDOWS ? 'solution.exe' : 'solution'), [], dir)
    }
    case 'js':
      return run('node', [filename], dir)
    case 'python':
      return run(PYTHON, [filename], dir)
    case 'java': {
      const build = run('javac', ['-encoding', 'UTF-8', filename], dir)
      if (build.status !== 0) return build
      return run('java', ['-cp', '.', 'Solution'], dir)
    }
  }
}

const root = ENABLED ? mkdtempSync(path.join(tmpdir(), 'problem-bank-verify-')) : ''
const LANGS: Language[] = ['c', 'js', 'python', 'java']

describe.skipIf(!ENABLED)('generated files run under real toolchains', () => {
  for (const lang of LANGS) {
    describe.skipIf(!TOOLCHAINS[lang])(lang, () => {
      for (const fixture of TOOLCHAIN_FIXTURES) {
        it(`${fixture.name}: correct solution passes, stub fails`, () => {
          const file = generate(fixture.problem, lang, { problemUrl: 'https://example.com/problems/1' })

          const stubDir = path.join(root, `${lang}-${fixture.name}-stub`)
          mkdirSync(stubDir, { recursive: true })
          writeFileSync(path.join(stubDir, file.filename), file.content)
          const stub = execute(lang, stubDir, file.filename)
          expect(stub.output).toContain('SOME FAILED')
          expect(stub.status, stub.output).toBe(1)

          const okDir = path.join(root, `${lang}-${fixture.name}-ok`)
          mkdirSync(okDir, { recursive: true })
          writeFileSync(path.join(okDir, file.filename), splice(file.content, fixture.solutions[lang]))
          const ok = execute(lang, okDir, file.filename)
          expect(ok.output).toContain('ALL PASSED')
          expect(ok.status, ok.output).toBe(0)
        }, 120_000)
      }
    })
  }
})
````

- [ ] **Step 4: Confirm it is skipped in a normal run**

Run: `npx vitest run lib/problems/generate`
Expected: PASS, with the 32 toolchain tests reported as skipped.

- [ ] **Step 5: Run it against the real toolchains**

Run: `VERIFY_TOOLCHAINS=1 npx vitest run lib/problems/generate/toolchain.test.ts`
Expected: PASS (32 tests; takes about a minute). If a language's toolchain is missing it is skipped; say so in your report rather than treating it as a pass. If a run fails, the assertion message includes the compiler/program output.

- [ ] **Step 6: Commit**

```bash
git add lib/problems/generate/index.ts lib/problems/generate/toolchain-fixtures.ts lib/problems/generate/toolchain.test.ts
git commit -m "test: verify generated problem files under real compilers"
```

---

### Task 8: Database migration

**Suggested model:** haiku to write; **sonnet reviewer** (new RLS policies and storage policies)

**Files:**
- Create: `supabase/migrations/0016_problem_bank.sql`

- [ ] **Step 1: Create the migration**

`supabase/migrations/0016_problem_bank.sql`:

````sql
-- Problem bank (문제은행): member-authored coding problems with a typed function signature and
-- test cases, downloaded as self-grading files in C/JS/Python/Java. Unlike coding_problems, any
-- approved member can create one; only the author or an admin can edit or delete it.
-- See docs/superpowers/specs/2026-10-18-problem-bank-design.md.

create table bank_problems (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 1 and 30),
  title text not null check (char_length(title) between 1 and 100),
  description_md text not null check (char_length(description_md) between 1 and 20000),
  constraints_md text not null default '' check (char_length(constraints_md) <= 5000),
  time_limit_ms integer not null default 1000 check (time_limit_ms between 100 and 60000),
  signature jsonb not null,
  test_cases jsonb not null,
  -- Storage keys in problem-images referenced by the Markdown, so delete/edit can clean them up.
  image_paths text[] not null default '{}',
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bank_problems_company_idx on bank_problems (company);
create index bank_problems_created_at_idx on bank_problems (created_at desc);

alter table bank_problems enable row level security;

create policy "Approved members can read bank problems"
  on bank_problems for select
  using (public.is_approved());

create policy "Approved members can create own bank problems"
  on bank_problems for insert
  with check (created_by = auth.uid() and public.is_approved());

-- The with check repeats the using clause so an author cannot hand a row to someone else by
-- rewriting created_by; an admin edit keeps the original author because the action never sends it.
create policy "Authors and admins can update bank problems"
  on bank_problems for update
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_approved() and (created_by = auth.uid() or public.is_admin()));

create policy "Authors and admins can delete bank problems"
  on bank_problems for delete
  using (public.is_approved() and (created_by = auth.uid() or public.is_admin()));

insert into storage.buckets (id, name, public)
values ('problem-images', 'problem-images', true)
on conflict (id) do nothing;

create policy "Approved members can upload problem images to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'problem-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

create policy "Anyone can view problem images"
  on storage.objects for select
  using (bucket_id = 'problem-images');

create policy "Owners and admins can delete problem images"
  on storage.objects for delete
  using (
    bucket_id = 'problem-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
````

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0016_problem_bank.sql
git commit -m "feat: add bank_problems table and problem-images bucket"
```

- [ ] **Step 3: Ask the user to apply the migration**

Migrations in this repo are applied by hand. Tell the user: "Supabase dashboard → SQL Editor → paste `supabase/migrations/0016_problem_bank.sql` → Run." Continue with the next tasks (unit tests don't need the database), but do not start Task 18's manual browser check until the user confirms it ran.

---

### Task 9: Cache tag, cached queries, list filtering

**Suggested model:** sonnet (caching)

**Files:**
- Modify: `lib/cache-tags.ts` (append)
- Create: `lib/problems/queries.ts`
- Create: `lib/problems/filter.ts`
- Test: `lib/problems/queries.test.ts`
- Test: `lib/problems/filter.test.ts`

- [ ] **Step 1: Add the tag constant**

Append to the end of `lib/cache-tags.ts`:

```ts

/**
 * The problem bank's cache tag, shared by every `'use cache'` read in lib/problems/queries.ts and
 * invalidated by `updateTag` in app/(app)/problems/actions.ts. A named export for the same reason as
 * `CODING_BOARD_TAG`: a typo in a bare string literal would silently disable invalidation.
 */
export const PROBLEM_BANK_TAG = 'problem-bank'
```

- [ ] **Step 2: Write the failing filter tests**

`lib/problems/filter.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { companyCounts, filterProblems } from './filter'
import type { BankProblemSummary } from './types'

function summary(id: string, company: string, title: string): BankProblemSummary {
  return { id, company, title, authorName: '김민수', createdAt: '2026-10-18T00:00:00.000Z', returnType: 'int', paramCount: 1 }
}

const problems = [summary('1', '카카오', '두 수의 합'), summary('2', '네이버', '최단 경로'), summary('3', '카카오', 'Two Pointers')]

describe('companyCounts', () => {
  it('counts per company and sorts by name', () => {
    expect(companyCounts(problems)).toEqual([
      { company: '네이버', count: 1 },
      { company: '카카오', count: 2 },
    ])
  })
})

describe('filterProblems', () => {
  it('returns everything without a filter', () => {
    expect(filterProblems(problems, {})).toHaveLength(3)
  })

  it('filters by exact company', () => {
    expect(filterProblems(problems, { company: '카카오' }).map((p) => p.id)).toEqual(['1', '3'])
  })

  it('searches the display title case-insensitively, including the company part', () => {
    expect(filterProblems(problems, { q: 'two' }).map((p) => p.id)).toEqual(['3'])
    expect(filterProblems(problems, { q: '[네이버]' }).map((p) => p.id)).toEqual(['2'])
  })

  it('combines company and query', () => {
    expect(filterProblems(problems, { company: '카카오', q: '합' }).map((p) => p.id)).toEqual(['1'])
  })
})
````

- [ ] **Step 3: Write the failing query tests**

`lib/problems/queries.test.ts`:

````ts
import { describe, it, expect, vi } from 'vitest'

const profiles = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이영희' },
]

const rows = [
  {
    id: 'p-2',
    company: '네이버',
    title: '최단 경로',
    signature: { params: [{ name: 'graph', type: 'int[][]' }], returnType: 'int' },
    created_by: 'user-2',
    created_at: '2026-10-18T00:00:00.000Z',
  },
  {
    id: 'p-1',
    company: '카카오',
    title: '두 수의 합',
    signature: { params: [{ name: 'a', type: 'int' }, { name: 'b', type: 'int' }], returnType: 'long' },
    created_by: 'gone',
    created_at: '2026-10-17T00:00:00.000Z',
  },
]

const detailRow = {
  id: 'p-1',
  company: '카카오',
  title: '두 수의 합',
  description_md: '설명',
  constraints_md: '',
  time_limit_ms: 1500,
  signature: rows[1].signature,
  test_cases: [{ args: [1, 2], expected: 3, isExample: true }],
  created_by: 'user-1',
  created_at: '2026-10-17T00:00:00.000Z',
  updated_at: '2026-10-18T00:00:00.000Z',
}

const cacheTagMock = vi.fn()
const orderSpy = vi.fn()
let detail: typeof detailRow | null = detailRow

vi.mock('next/cache', () => ({
  cacheTag: (...tags: string[]) => cacheTagMock(...tags),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () =>
            Object.assign(Promise.resolve({ data: profiles }), {
              eq: (_column: string, id: string) => ({
                maybeSingle: async () => ({ data: profiles.find((p) => p.id === id) ?? null }),
              }),
            }),
        }
      }
      if (table === 'bank_problems') {
        return {
          select: () => ({
            order: async (column: string, options: unknown) => {
              orderSpy(column, options)
              return { data: rows }
            },
            eq: () => ({ maybeSingle: async () => ({ data: detail }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import { getProblem, getProblemSummaries } from './queries'
import { MEMBER_NAMES_TAG, PROBLEM_BANK_TAG } from '@/lib/cache-tags'

describe('getProblemSummaries', () => {
  it('returns newest-first summaries with author names and signature shape', async () => {
    const summaries = await getProblemSummaries()
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(summaries).toEqual([
      { id: 'p-2', company: '네이버', title: '최단 경로', authorName: '이영희', createdAt: '2026-10-18T00:00:00.000Z', returnType: 'int', paramCount: 1 },
      { id: 'p-1', company: '카카오', title: '두 수의 합', authorName: '알 수 없음', createdAt: '2026-10-17T00:00:00.000Z', returnType: 'long', paramCount: 2 },
    ])
    expect(cacheTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG, MEMBER_NAMES_TAG)
  })
})

describe('getProblem', () => {
  it('maps a row to a BankProblem with the author name', async () => {
    expect(await getProblem('p-1')).toEqual({
      id: 'p-1',
      company: '카카오',
      title: '두 수의 합',
      descriptionMd: '설명',
      constraintsMd: '',
      timeLimitMs: 1500,
      signature: rows[1].signature,
      testCases: detailRow.test_cases,
      createdBy: 'user-1',
      authorName: '김민수',
      createdAt: '2026-10-17T00:00:00.000Z',
      updatedAt: '2026-10-18T00:00:00.000Z',
    })
  })

  it('returns null for an unknown id', async () => {
    detail = null
    expect(await getProblem('nope')).toBeNull()
    detail = detailRow
  })
})
````

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/filter.test.ts lib/problems/queries.test.ts`
Expected: FAIL — `Failed to resolve import "./filter"` and `"./queries"`.

- [ ] **Step 5: Implement filtering**

`lib/problems/filter.ts`:

````ts
import { displayTitle, type BankProblemSummary } from './types'

export interface CompanyCount {
  company: string
  count: number
}

/** One entry per company, sorted by name (Korean collation), for the list filter and the form's datalist. */
export function companyCounts(problems: BankProblemSummary[]): CompanyCount[] {
  const counts = new Map<string, number>()
  for (const problem of problems) counts.set(problem.company, (counts.get(problem.company) ?? 0) + 1)
  return [...counts]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => a.company.localeCompare(b.company, 'ko'))
}

/** `company` must match exactly; `q` is a case-insensitive substring of the display title `[company]-title`. */
export function filterProblems(
  problems: BankProblemSummary[],
  filter: { company?: string; q?: string }
): BankProblemSummary[] {
  const query = (filter.q ?? '').trim().toLowerCase()
  return problems.filter(
    (problem) =>
      (!filter.company || problem.company === filter.company) &&
      (!query || displayTitle(problem.company, problem.title).toLowerCase().includes(query))
  )
}
````

- [ ] **Step 6: Implement the cached queries**

`lib/problems/queries.ts`:

````ts
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { MEMBER_NAMES_TAG, PROBLEM_BANK_TAG } from '@/lib/cache-tags'
import type { BankProblem, BankProblemSummary, Signature, TestCase } from './types'

/**
 * Cached problem-bank reads for /problems, /problems/new, /problems/[id] and its edit page.
 *
 * RLS check (supabase/migrations/0016_problem_bank.sql and 0003_coding.sql): bank_problems and
 * profiles both grant SELECT to any approved member with no per-row ownership clause, so the
 * cookie-free cache client is safe here. Every route reaching these functions is gated by proxy.ts.
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
  return (rows ?? []).map((row) => {
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

  const { data: author } = await supabase.from('profiles').select('name').eq('id', row.created_by).maybeSingle()
  return {
    id: row.id,
    company: row.company,
    title: row.title,
    descriptionMd: row.description_md,
    constraintsMd: row.constraints_md,
    timeLimitMs: row.time_limit_ms,
    signature: row.signature as Signature,
    testCases: row.test_cases as TestCase[],
    createdBy: row.created_by,
    authorName: (author?.name as string | undefined) ?? UNKNOWN_AUTHOR,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
````

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/filter.test.ts lib/problems/queries.test.ts lib/cache-tags.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/cache-tags.ts lib/problems/queries.ts lib/problems/queries.test.ts lib/problems/filter.ts lib/problems/filter.test.ts
git commit -m "feat: add cached problem bank queries and list filtering"
```

---

### Task 10: Storage helpers

**Suggested model:** haiku

**Files:**
- Create: `lib/storage/file-extension.ts`
- Test: `lib/storage/file-extension.test.ts`
- Modify: `app/(app)/checkin/actions.ts` (use the shared helper)
- Create: `lib/problems/images.ts`
- Test: `lib/problems/images.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/storage/file-extension.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { resolveExtension } from './file-extension'

describe('resolveExtension', () => {
  it('keeps an ASCII extension and drops everything else', () => {
    expect(resolveExtension('스크린샷 2026-08-14 143253.png')).toBe('.png')
    expect(resolveExtension('photo.JPEG')).toBe('.JPEG')
    expect(resolveExtension('no-extension')).toBe('')
  })
})
````

`lib/problems/images.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import { extractImagePaths, problemImagePublicPrefix } from './images'

const prefix = problemImagePublicPrefix('https://proj.supabase.co/')

describe('problemImagePublicPrefix', () => {
  it('builds the public object URL prefix without a double slash', () => {
    expect(prefix).toBe('https://proj.supabase.co/storage/v1/object/public/problem-images/')
  })
})

describe('extractImagePaths', () => {
  it('collects keys of this bucket only, deduplicated across sources', () => {
    const description = `그림 ![a](${prefix}u1/x.png) 와 ![](${prefix}u1/y.gif)`
    const constraints = `다시 ![a](${prefix}u1/x.png) 외부 ![b](https://other.example/z.png)`
    expect(extractImagePaths([description, constraints], prefix)).toEqual(['u1/x.png', 'u1/y.gif'])
  })

  it('ignores plain links and bare prefixes', () => {
    expect(extractImagePaths([`[링크](${prefix}u1/x.png) ![](${prefix})`], prefix)).toEqual([])
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/storage/file-extension.test.ts lib/problems/images.test.ts`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Move `resolveExtension` into a shared module**

Create:

`lib/storage/file-extension.ts`:

````ts
// Supabase Storage rejects keys containing spaces or non-ASCII characters
// (e.g. Korean screenshot filenames like "스크린샷 2026-08-14 143253.png"),
// so the original filename can't be used as-is in the upload path.
export function resolveExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}
````

Then in `app/(app)/checkin/actions.ts`, delete the local copy — this whole block:

```ts
// Supabase Storage rejects keys containing spaces or non-ASCII characters
// (e.g. Korean screenshot filenames like "스크린샷 2026-08-14 143253.png"),
// so the original filename can't be used as-is in the upload path.
function resolveExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}
```

and add this import next to the other `@/lib/...` imports at the top of the file:

```ts
import { resolveExtension } from '@/lib/storage/file-extension'
```

- [ ] **Step 4: Create the image helpers**

`lib/problems/images.ts`:

````ts
export const PROBLEM_IMAGES_BUCKET = 'problem-images'

/** Below `serverActions.bodySizeLimit` (5 MB in next.config.ts) with room for the multipart overhead. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** The URL prefix `getPublicUrl()` produces for this bucket; everything after it is the object key. */
export function problemImagePublicPrefix(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${PROBLEM_IMAGES_BUCKET}/`
}

const MARKDOWN_IMAGE_URL = /!\[[^\]]*\]\(\s*([^)\s]+)/g

/** Object keys of this bucket's images referenced by `![...](url)` in any of the sources, deduplicated. */
export function extractImagePaths(markdownSources: string[], publicPrefix: string): string[] {
  const paths = new Set<string>()
  for (const source of markdownSources) {
    for (const match of source.matchAll(MARKDOWN_IMAGE_URL)) {
      const url = match[1]
      if (url.startsWith(publicPrefix) && url.length > publicPrefix.length) paths.add(url.slice(publicPrefix.length))
    }
  }
  return [...paths]
}
````

- [ ] **Step 5: Run the tests to verify they pass, and that checkin still passes**

Run: `npx vitest run lib/storage lib/problems/images.test.ts "app/(app)/checkin"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/storage lib/problems/images.ts lib/problems/images.test.ts "app/(app)/checkin/actions.ts"
git commit -m "refactor: share resolveExtension and add problem image helpers"
```

---

### Task 11: Server actions

**Suggested model:** sonnet (auth, RLS outcomes, cache invalidation)

**Files:**
- Create: `app/(app)/problems/actions.ts`
- Test: `app/(app)/problems/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

`app/(app)/problems/actions.test.ts`:

````ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getClaimsMock = vi.fn()
const fromMock = vi.fn()
const storageFromMock = vi.fn()
const removeMock = vi.fn()
const uploadMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const updateTagMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
    from: fromMock,
    storage: { from: storageFromMock },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))

import { createProblem, deleteProblem, updateProblem, uploadProblemImage } from './actions'
import { PROBLEM_BANK_TAG } from '@/lib/cache-tags'

const SUPABASE_URL = 'https://proj.supabase.co'
const IMAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/problem-images/`

const content = {
  company: ' 카카오 ',
  title: '두 수의 합',
  descriptionMd: `설명 ![](${IMAGE_PREFIX}user-1/a.png)`,
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
}

function payloadForm(value: unknown = content) {
  const formData = new FormData()
  formData.set('payload', JSON.stringify(value))
  return formData
}

const initial = { error: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  removeMock.mockResolvedValue({ error: null })
  uploadMock.mockResolvedValue({ error: null })
  storageFromMock.mockReturnValue({
    remove: removeMock,
    upload: uploadMock,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `${IMAGE_PREFIX}${path}` } }),
  })
})

describe('createProblem', () => {
  it('returns the validation error without touching the database', async () => {
    const result = await createProblem(initial, payloadForm({ ...content, company: '' }))
    expect(result).toEqual({ error: '회사 이름은 1~30자여야 합니다' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('rejects a missing or unparsable payload', async () => {
    expect(await createProblem(initial, new FormData())).toEqual({ error: '입력값을 확인해주세요' })
    const bad = new FormData()
    bad.set('payload', '{nope')
    expect(await createProblem(initial, bad)).toEqual({ error: '요청 형식이 올바르지 않습니다' })
  })

  it('inserts a normalized row with derived image paths, then redirects to the new problem', async () => {
    const insertMock = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'p-1' }, error: null }) }) }))
    fromMock.mockReturnValue({ insert: insertMock })

    await expect(createProblem(initial, payloadForm())).rejects.toThrow('REDIRECT:/problems/p-1?success=')
    expect(fromMock).toHaveBeenCalledWith('bank_problems')
    expect(insertMock).toHaveBeenCalledWith({
      company: '카카오',
      title: '두 수의 합',
      description_md: content.descriptionMd,
      constraints_md: '',
      time_limit_ms: 1000,
      signature: content.signature,
      test_cases: content.testCases,
      image_paths: ['user-1/a.png'],
      created_by: 'user-1',
    })
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('sends an unauthenticated caller to /login', async () => {
    getClaimsMock.mockResolvedValue({ data: null })
    await expect(createProblem(initial, payloadForm())).rejects.toThrow('REDIRECT:/login')
  })
})

describe('updateProblem', () => {
  function mockUpdate(existingPaths: string[] | null, updatedRows: { id: string }[]) {
    const updateMock = vi.fn<(row: Record<string, unknown>) => unknown>(() => ({
      eq: () => ({ select: async () => ({ data: updatedRows, error: null }) }),
    }))
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: existingPaths ? { image_paths: existingPaths } : null }),
        }),
      }),
      update: updateMock,
    })
    return updateMock
  }

  it('updates the row and removes images no longer referenced', async () => {
    const updateMock = mockUpdate(['user-1/a.png', 'user-1/old.png'], [{ id: 'p-1' }])

    await expect(updateProblem('p-1', initial, payloadForm())).rejects.toThrow('REDIRECT:/problems/p-1?success=')
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ company: '카카오', image_paths: ['user-1/a.png'] }))
    expect(updateMock.mock.calls[0][0]).not.toHaveProperty('created_by')
    expect(removeMock).toHaveBeenCalledWith(['user-1/old.png'])
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('reports a missing problem', async () => {
    mockUpdate(null, [])
    expect(await updateProblem('p-1', initial, payloadForm())).toEqual({ error: '존재하지 않는 문제입니다' })
  })

  it('treats an RLS-filtered update (zero rows) as a permission error', async () => {
    mockUpdate(['user-1/a.png'], [])
    expect(await updateProblem('p-1', initial, payloadForm())).toEqual({ error: '권한이 없습니다' })
    expect(removeMock).not.toHaveBeenCalled()
    expect(updateTagMock).not.toHaveBeenCalled()
  })
})

describe('deleteProblem', () => {
  function mockDelete(rows: { image_paths: string[] }[]) {
    fromMock.mockReturnValue({
      delete: () => ({ eq: () => ({ select: async () => ({ data: rows, error: null }) }) }),
    })
  }

  it('deletes the row, removes its images, and returns to the list', async () => {
    mockDelete([{ image_paths: ['user-1/a.png'] }])
    await expect(deleteProblem('p-1')).rejects.toThrow('REDIRECT:/problems?success=')
    expect(removeMock).toHaveBeenCalledWith(['user-1/a.png'])
    expect(updateTagMock).toHaveBeenCalledWith(PROBLEM_BANK_TAG)
  })

  it('redirects back with a permission error when RLS filtered the delete', async () => {
    mockDelete([])
    await expect(deleteProblem('p-1')).rejects.toThrow(
      'REDIRECT:/problems/p-1?error=' + encodeURIComponent('권한이 없습니다')
    )
    expect(updateTagMock).not.toHaveBeenCalled()
  })
})

describe('uploadProblemImage', () => {
  function imageForm(file: File) {
    const formData = new FormData()
    formData.set('image', file)
    return formData
  }

  it('rejects non-images and oversized files before uploading', async () => {
    expect(await uploadProblemImage(imageForm(new File(['x'], 'a.txt', { type: 'text/plain' })))).toEqual({
      error: 'PNG, JPEG, GIF, WebP 이미지만 올릴 수 있어요',
    })
    const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })
    expect(await uploadProblemImage(imageForm(big))).toEqual({ error: '이미지는 4MB 이하여야 해요' })
    expect(uploadMock).not.toHaveBeenCalled()
  })

  it("uploads under the caller's folder with an ASCII key and returns the public URL", async () => {
    const result = await uploadProblemImage(imageForm(new File(['x'], '스크린샷 1.png', { type: 'image/png' })))
    const [path] = uploadMock.mock.calls[0]
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.png$/)
    expect(result).toEqual({ url: `${IMAGE_PREFIX}${path}` })
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/problems/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Step 3: Implement the actions**

`'use server'` files may only export async functions at runtime; the exported `FormState`/`UploadResult` are types and are erased.

`app/(app)/problems/actions.ts`:

````ts
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

  const removed = (existing.image_paths as string[]).filter((path) => !imagePaths.includes(path))
  if (removed.length > 0) {
    // Best effort: a leftover image is harmless, a failed edit is not.
    await supabase.storage.from(PROBLEM_IMAGES_BUCKET).remove(removed)
  }

  updateTag(PROBLEM_BANK_TAG)
  redirect(`/problems/${id}?success=` + encodeURIComponent('문제를 수정했어요'))
}

export async function deleteProblem(id: string) {
  const supabase = await createClient()
  const user = await getVerifiedUser(supabase)
  if (!user) redirect('/login')

  const { data: deleted, error } = await supabase.from('bank_problems').delete().eq('id', id).select('image_paths')
  if (error) redirect(`/problems/${id}?error=` + encodeURIComponent(error.message))
  if (!deleted || deleted.length === 0) redirect(`/problems/${id}?error=` + encodeURIComponent('권한이 없습니다'))

  const paths = deleted[0].image_paths as string[]
  if (paths.length > 0) await supabase.storage.from(PROBLEM_IMAGES_BUCKET).remove(paths)

  updateTag(PROBLEM_BANK_TAG)
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
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/problems/actions.test.ts"`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/problems/actions.ts" "app/(app)/problems/actions.test.ts"
git commit -m "feat: add problem bank server actions"
```

---

### Task 12: Authoring draft model

**Suggested model:** haiku

**Files:**
- Create: `lib/problems/draft.ts`
- Test: `lib/problems/draft.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/problems/draft.test.ts`:

````ts
import { describe, it, expect } from 'vitest'
import {
  addCase,
  addParam,
  cellKey,
  checkDraft,
  draftFromContent,
  emptyDraft,
  removeCase,
  removeParam,
  updateCase,
  updateCaseArg,
  updateParam,
  type Draft,
} from './draft'
import type { ProblemContent } from './types'

const content: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: true },
    { args: [[], 0], expected: 0, isExample: false },
  ],
}

function filled(): Draft {
  return draftFromContent(content)
}

describe('emptyDraft', () => {
  it('starts with one int param and one example case with empty cells', () => {
    const draft = emptyDraft()
    expect(draft.params.map((p) => [p.name, p.type])).toEqual([['n', 'int']])
    expect(draft.cases).toHaveLength(1)
    expect(draft.cases[0]).toMatchObject({ args: [''], expected: '', isExample: true })
  })
})

describe('draftFromContent', () => {
  it('turns values back into JSON text cells', () => {
    const draft = filled()
    expect(draft.timeLimitMs).toBe('1000')
    expect(draft.cases[0]).toMatchObject({ args: ['[1,2]', '3'], expected: '6', isExample: true })
  })
})

describe('param edits reshape every case', () => {
  it('adds an empty cell per case for a new param', () => {
    const draft = addParam(filled())
    expect(draft.params).toHaveLength(3)
    expect(draft.cases.every((c) => c.args.length === 3 && c.args[2] === '')).toBe(true)
  })

  it('drops the removed column from every case', () => {
    const draft = removeParam(filled(), 0)
    expect(draft.params.map((p) => p.name)).toEqual(['k'])
    expect(draft.cases.map((c) => c.args)).toEqual([['3'], ['0']])
  })

  it('updates one param in place', () => {
    expect(updateParam(filled(), 1, { type: 'long' }).params[1]).toMatchObject({ name: 'k', type: 'long' })
  })
})

describe('case edits', () => {
  it('marks only the first two rows as examples by default', () => {
    let draft: Draft = { ...emptyDraft(), cases: [] }
    draft = addCase(addCase(addCase(draft)))
    expect(draft.cases.map((c) => c.isExample)).toEqual([true, true, false])
  })

  it('removes, toggles, and edits cells by case id', () => {
    const draft = filled()
    const id = draft.cases[1].id
    expect(removeCase(draft, id).cases).toHaveLength(1)
    expect(updateCase(draft, id, { isExample: true }).cases[1].isExample).toBe(true)
    expect(updateCaseArg(draft, id, 1, '9').cases[1].args).toEqual(['[]', '9'])
  })
})

describe('checkDraft', () => {
  it('produces a validated JSON payload for a complete draft', () => {
    const check = checkDraft(filled())
    expect(check.formError).toBeNull()
    expect(JSON.parse(check.payload!)).toEqual(content)
  })

  it('reports per-cell errors keyed by case id and column', () => {
    const base = filled()
    const id = base.cases[0].id
    const check = checkDraft(updateCase(updateCaseArg(base, id, 0, '[1, "a"]'), id, { expected: 'x' }))
    expect(check.cellErrors[cellKey(id, 0)]).toBe('int[]의 원소는 int 범위의 정수여야 합니다')
    expect(check.cellErrors[cellKey(id, 'expected')]).toMatch(/JSON 형식이 아닙니다/)
    expect(check.formError).toBe('테스트 케이스에 비어 있거나 잘못된 칸이 있습니다')
    expect(check.payload).toBeNull()
  })

  it('surfaces signature errors before anything else', () => {
    const check = checkDraft(updateParam(filled(), 0, { name: 'class' }))
    expect(check.signatureError).toMatch(/예약어/)
    expect(check.formError).toBe(check.signatureError)
    expect(check.payload).toBeNull()
  })

  it('falls through to problem-level errors once cells are valid', () => {
    const check = checkDraft({ ...filled(), company: ' ' })
    expect(check.formError).toBe('회사 이름은 1~30자여야 합니다')
    expect(check.payload).toBeNull()
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/problems/draft.test.ts`
Expected: FAIL — `Failed to resolve import "./draft"`.

- [ ] **Step 3: Implement the draft model**

`lib/problems/draft.ts`:

````ts
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
````

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/problems/draft.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/problems/draft.ts lib/problems/draft.test.ts
git commit -m "feat: add problem authoring draft model"
```

---

### Task 13: Markdown rendering

**Suggested model:** haiku

**Files:**
- Modify: `package.json`, `package-lock.json` (dependencies)
- Create: `components/markdown.tsx`
- Test: `components/markdown.test.tsx`
- Modify: `app/globals.css` (append)

- [ ] **Step 1: Install the dependencies**

Run: `npm install react-markdown@10.1.0 remark-gfm@4.0.1`
Expected: both appear under `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

`components/markdown.test.tsx`:

````tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from './markdown'

describe('Markdown', () => {
  it('renders GFM: emphasis, lists, tables, images', () => {
    const { container } = render(
      <Markdown source={'**굵게** 와 `code`\n\n- 하나\n- 둘\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n![그림](https://x.example/a.png)'} />
    )
    expect(screen.getByText('굵게').tagName).toBe('STRONG')
    expect(screen.getByText('code').tagName).toBe('CODE')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '그림' })).toHaveAttribute('src', 'https://x.example/a.png')
    expect(container.firstElementChild).toHaveClass('markdown')
  })

  it('never renders raw HTML or javascript: links', () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script><b>x</b>\n\n[클릭](javascript:alert(1))'} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('클릭').getAttribute('href') ?? '').not.toContain('javascript:')
  })
})
````

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run components/markdown.test.tsx`
Expected: FAIL — `Failed to resolve import "./markdown"`.

- [ ] **Step 4: Implement the component**

`components/markdown.tsx`:

````tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders author-written Markdown (GFM tables, lists, code). Raw HTML is never rendered —
 * react-markdown ignores it unless `rehype-raw` is added — and its default `urlTransform`
 * drops `javascript:` URLs, so stored text cannot inject markup. Styles live under `.markdown`
 * in app/globals.css.
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
````

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/markdown.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the Markdown styles**

Append to the end of `app/globals.css`:

````css

/* Author-written Markdown on /problems (components/markdown.tsx). Tailwind's preflight strips
   list and heading styles, so they are restored here instead of pulling in @tailwindcss/typography. */
.markdown {
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.markdown > * + * {
  margin-top: 0.75rem;
}
.markdown h1 {
  font-size: 1.25rem;
  font-weight: 700;
}
.markdown h2 {
  font-size: 1.125rem;
  font-weight: 700;
}
.markdown h3 {
  font-weight: 600;
}
.markdown ul {
  list-style: disc;
  padding-left: 1.5rem;
}
.markdown ol {
  list-style: decimal;
  padding-left: 1.5rem;
}
.markdown a {
  text-decoration: underline;
}
.markdown code {
  font-family: var(--font-mono), monospace;
  font-size: 0.875em;
  background: rgb(127 127 127 / 0.15);
  border-radius: 0.25rem;
  padding: 0.1rem 0.3rem;
}
.markdown pre {
  overflow-x: auto;
  background: rgb(127 127 127 / 0.1);
  border-radius: 0.375rem;
  padding: 0.75rem;
}
.markdown pre code {
  background: none;
  padding: 0;
}
.markdown table {
  border-collapse: collapse;
}
.markdown th,
.markdown td {
  border: 1px solid rgb(127 127 127 / 0.35);
  padding: 0.25rem 0.5rem;
}
.markdown img {
  max-width: 100%;
  border-radius: 0.375rem;
}
.markdown blockquote {
  border-left: 3px solid rgb(127 127 127 / 0.4);
  padding-left: 0.75rem;
  color: rgb(127 127 127);
}
````

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json components/markdown.tsx components/markdown.test.tsx app/globals.css
git commit -m "feat: add safe Markdown renderer for problem bodies"
```

---

### Task 14: Authoring form

**Suggested model:** sonnet

**Files:**
- Create: `app/(app)/problems/markdown-field.tsx`
- Create: `app/(app)/problems/signature-editor.tsx`
- Create: `app/(app)/problems/case-table.tsx`
- Create: `app/(app)/problems/problem-form.tsx`
- Test: `app/(app)/problems/problem-form.test.tsx`

- [ ] **Step 1: Write the failing form tests**

`app/(app)/problems/problem-form.test.tsx`:

````tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  uploadProblemImage: vi.fn(),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

import { ProblemForm } from './problem-form'
import type { ProblemContent } from '@/lib/problems/types'

const action = vi.fn(async () => ({ error: null }))

const initial: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }], returnType: 'int' },
  testCases: [{ args: [[1, 2]], expected: 3, isExample: true }],
}

function renderForm(content?: ProblemContent) {
  return render(<ProblemForm action={action} initial={content} companies={['네이버', '카카오']} submitLabel="등록" cancelHref="/problems" />)
}

describe('ProblemForm', () => {
  it('blocks submission of an empty form and says why', () => {
    renderForm()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
    expect(screen.getByText('테스트 케이스에 비어 있거나 잘못된 칸이 있습니다')).toBeInTheDocument()
  })

  it('enables submission and fills the hidden payload once everything is valid', () => {
    const { container } = renderForm(initial)
    expect(screen.getByRole('button', { name: '등록' })).toBeEnabled()
    const payload = container.querySelector<HTMLInputElement>('input[name="payload"]')!
    expect(JSON.parse(payload.value)).toEqual(initial)
  })

  it('previews the display title and offers existing companies', () => {
    const { container } = renderForm(initial)
    expect(screen.getByText('게시글 제목: [카카오]-두 수의 합')).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll('#company-options option')).map((o) => o.getAttribute('value'))).toEqual([
      '네이버',
      '카카오',
    ])
  })

  it('shows a typed cell error inline and disables submit', () => {
    renderForm(initial)
    fireEvent.change(screen.getByLabelText('케이스 1 arr'), { target: { value: '[1, "a"]' } })
    expect(screen.getByText('int[]의 원소는 int 범위의 정수여야 합니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled()
  })

  it('adds a column to every case when a param is added', () => {
    renderForm(initial)
    fireEvent.click(screen.getByRole('button', { name: '+ 파라미터 추가' }))
    fireEvent.change(screen.getByLabelText('파라미터 2 이름'), { target: { value: 'k' } })
    expect(screen.getByLabelText('케이스 1 k')).toHaveValue('')
  })

  it('marks new cases as examples only for the first two rows', () => {
    renderForm(initial)
    fireEvent.click(screen.getByRole('button', { name: '+ 케이스 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 케이스 추가' }))
    expect(screen.getByLabelText('케이스 2 예시')).toBeChecked()
    expect(screen.getByLabelText('케이스 3 예시')).not.toBeChecked()
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/problems/problem-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./problem-form"`.

- [ ] **Step 3: Create the Markdown field**

React 19 passes `ref` through as a normal prop, so `Textarea` (which spreads its props) forwards it without `forwardRef`.

`app/(app)/problems/markdown-field.tsx`:

````tsx
'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Label, Textarea } from '@/components/ui/input'
import { Markdown } from '@/components/markdown'
import { ALLOWED_IMAGE_TYPES } from '@/lib/problems/images'
import { cn } from '@/lib/ui/cn'
import { uploadProblemImage } from './actions'

export function MarkdownField({
  id,
  label,
  value,
  onChange,
  rows,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setUploadError(null)
    const formData = new FormData()
    formData.set('image', file)
    const result = await uploadProblemImage(formData)
    setUploading(false)

    if ('error' in result) {
      setUploadError(result.error)
      return
    }
    const start = textareaRef.current?.selectionStart ?? value.length
    const end = textareaRef.current?.selectionEnd ?? value.length
    onChange(`${value.slice(0, start)}![](${result.url})${value.slice(end)}`)
  }

  const tabClass = (active: boolean) =>
    cn('rounded px-2 py-1', active ? 'bg-gray-200 font-medium dark:bg-gray-800' : 'text-gray-500 dark:text-gray-400')

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <div className="flex gap-1 text-xs" role="tablist" aria-label={`${label} 보기 방식`}>
          <button type="button" role="tab" aria-selected={tab === 'write'} className={tabClass(tab === 'write')} onClick={() => setTab('write')}>
            작성
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} className={tabClass(tab === 'preview')} onClick={() => setTab('preview')}>
            미리보기
          </button>
        </div>
      </div>
      {tab === 'write' ? (
        <Textarea id={id} ref={textareaRef} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      ) : (
        <div className="min-h-24 rounded border border-gray-300 p-3 dark:border-gray-700">
          {value.trim() ? <Markdown source={value} /> : <p className="text-sm text-gray-400">미리볼 내용이 없어요.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          className="underline disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || tab !== 'write'}
        >
          {uploading ? '업로드 중…' : '이미지 추가'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(',')}
          className="hidden"
          aria-label={`${label} 이미지 파일`}
          onChange={handleFile}
        />
        <span className="text-gray-500 dark:text-gray-400">마크다운을 쓸 수 있어요.</span>
        {uploadError && <span className="text-red-600 dark:text-red-400">{uploadError}</span>}
      </div>
    </div>
  )
}
````

- [ ] **Step 4: Create the signature editor**

`app/(app)/problems/signature-editor.tsx`:

````tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { VALUE_TYPES, formatSignature, type ValueType } from '@/lib/problems/types'
import { addParam, removeParam, updateParam, type Draft } from '@/lib/problems/draft'
import { LIMITS } from '@/lib/problems/validate'

export function SignatureEditor({
  draft,
  onChange,
  error,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  error: string | null
}) {
  function handleRemove(index: number) {
    const hasValues = draft.cases.some((c) => c.args[index]?.trim())
    const name = draft.params[index].name || `파라미터 ${index + 1}`
    if (hasValues && !window.confirm(`"${name}" 열의 테스트 값도 함께 지워져요. 삭제할까요?`)) return
    onChange(removeParam(draft, index))
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">함수 시그니처</legend>
      {draft.params.map((param, i) => (
        <div key={param.id} className="flex gap-2">
          <Input
            aria-label={`파라미터 ${i + 1} 이름`}
            placeholder="이름 (예: arr)"
            value={param.name}
            onChange={(e) => onChange(updateParam(draft, i, { name: e.target.value }))}
            className="font-mono"
          />
          <Select
            aria-label={`파라미터 ${i + 1} 타입`}
            value={param.type}
            onChange={(e) => onChange(updateParam(draft, i, { type: e.target.value as ValueType }))}
            className="w-36 shrink-0"
          >
            {VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            aria-label={`파라미터 ${i + 1} 삭제`}
            disabled={draft.params.length <= LIMITS.minParams}
            onClick={() => handleRemove(i)}
          >
            삭제
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={draft.params.length >= LIMITS.maxParams}
          onClick={() => onChange(addParam(draft))}
        >
          + 파라미터 추가
        </Button>
        <Label htmlFor="returnType" className="ml-auto">
          반환 타입
        </Label>
        <Select
          id="returnType"
          value={draft.returnType}
          onChange={(e) => onChange({ ...draft, returnType: e.target.value as ValueType })}
          className="w-36"
        >
          {VALUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>
      <code className="text-sm">{formatSignature({ params: draft.params, returnType: draft.returnType })}</code>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  )
}
````

- [ ] **Step 5: Create the case table**

`app/(app)/problems/case-table.tsx`:

````tsx
'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addCase, cellKey, removeCase, updateCase, updateCaseArg, type Draft } from '@/lib/problems/draft'
import { LIMITS } from '@/lib/problems/validate'
import { cn } from '@/lib/ui/cn'

export function CaseTable({
  draft,
  onChange,
  cellErrors,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  cellErrors: Record<string, string>
}) {
  const columnName = (i: number) => draft.params[i].name || `파라미터 ${i + 1}`

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">테스트 케이스</legend>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        각 칸에 JSON 값을 입력하세요. 예: 5, &quot;abc&quot;, [1, 2, 3], [[0, 1], [1, 0]]. &quot;예시&quot;로 체크한 케이스만 문제
        페이지의 입출력 예에 보여요. 다운로드한 파일에는 모든 케이스가 들어가요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-1 font-normal text-gray-500">#</th>
              {draft.params.map((param, i) => (
                <th key={param.id} className="p-1 font-mono font-medium">
                  {columnName(i)} <span className="text-xs font-normal text-gray-500">{param.type}</span>
                </th>
              ))}
              <th className="p-1 font-medium">
                기대값 <span className="font-mono text-xs font-normal text-gray-500">{draft.returnType}</span>
              </th>
              <th className="p-1 font-medium">예시</th>
              <th className="p-1">
                <span className="sr-only">삭제</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.cases.map((row, r) => (
              <tr key={row.id} className="align-top">
                <td className="p-1 pt-3 text-gray-500">{r + 1}</td>
                {row.args.map((text, i) => (
                  <td key={draft.params[i].id} className="p-1">
                    <Cell
                      label={`케이스 ${r + 1} ${columnName(i)}`}
                      value={text}
                      error={cellErrors[cellKey(row.id, i)]}
                      onChange={(value) => onChange(updateCaseArg(draft, row.id, i, value))}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <Cell
                    label={`케이스 ${r + 1} 기대값`}
                    value={row.expected}
                    error={cellErrors[cellKey(row.id, 'expected')]}
                    onChange={(value) => onChange(updateCase(draft, row.id, { expected: value }))}
                  />
                </td>
                <td className="p-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={`케이스 ${r + 1} 예시`}
                    checked={row.isExample}
                    onChange={(e) => onChange(updateCase(draft, row.id, { isExample: e.target.checked }))}
                    className="mt-3 h-4 w-4"
                  />
                </td>
                <td className="p-1">
                  <button
                    type="button"
                    aria-label={`케이스 ${r + 1} 삭제`}
                    disabled={draft.cases.length <= LIMITS.minCases}
                    onClick={() => onChange(removeCase(draft, row.id))}
                    className="mt-3 text-xs text-red-600 disabled:opacity-40 dark:text-red-400"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={draft.cases.length >= LIMITS.maxCases}
          onClick={() => onChange(addCase(draft))}
        >
          + 케이스 추가
        </Button>
      </div>
    </fieldset>
  )
}

/** Empty cells only block submission (via the form-level message); typed-but-invalid cells explain why. */
function Cell({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: string
  error: string | undefined
  onChange: (value: string) => void
}) {
  const showError = Boolean(error) && value.trim() !== ''
  return (
    <div className="flex min-w-32 flex-col gap-0.5">
      <Input
        size="sm"
        aria-label={label}
        aria-invalid={showError || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('font-mono', showError && 'border-red-500 dark:border-red-500')}
      />
      {showError && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
````

- [ ] **Step 6: Create the form**

`app/(app)/problems/problem-form.tsx`:

````tsx
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
    <form action={formAction} className="flex flex-col gap-6">
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
````

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/problems/problem-form.test.tsx"`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/problems/markdown-field.tsx" "app/(app)/problems/signature-editor.tsx" "app/(app)/problems/case-table.tsx" "app/(app)/problems/problem-form.tsx" "app/(app)/problems/problem-form.test.tsx"
git commit -m "feat: add problem authoring form"
```

---

### Task 15: List page and navigation

**Suggested model:** sonnet

**Files:**
- Create: `app/(app)/problems/page.tsx`
- Test: `app/(app)/problems/page.test.tsx`
- Modify: `components/nav.tsx:9-15`
- Modify: `components/nav.test.tsx:16-24`

- [ ] **Step 1: Write the failing list tests**

`app/(app)/problems/page.test.tsx`:

````tsx
import { describe, it, expect, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/problems',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('next/form', () => ({
  default: (props: ComponentProps<'form'>) => createElement('form', props),
}))

const summaries = [
  { id: 'p-1', company: '카카오', title: '두 수의 합', authorName: '김민수', createdAt: '2026-10-17T15:30:00.000Z', returnType: 'int', paramCount: 2 },
  { id: 'p-2', company: '네이버', title: '최단 경로', authorName: '이영희', createdAt: '2026-10-16T00:00:00.000Z', returnType: 'int[]', paramCount: 1 },
]
const getProblemSummaries = vi.fn(async () => summaries)

vi.mock('@/lib/problems/queries', () => ({
  getProblemSummaries: () => getProblemSummaries(),
}))

import ProblemsPage, { ProblemList } from './page'

describe('ProblemsPage', () => {
  it('renders the shell and the write link without awaiting data', () => {
    render(ProblemsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { name: '문제은행' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 작성' })).toHaveAttribute('href', '/problems/new')
  })
})

describe('ProblemList', () => {
  it('lists every problem with display title, author, and KST date', async () => {
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    expect(screen.getByRole('link', { name: /\[카카오\]-두 수의 합/ })).toHaveAttribute('href', '/problems/p-1')
    expect(screen.getByText('김민수 · 2026-10-18')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /\[네이버\]-최단 경로/ })).toBeInTheDocument()
  })

  it('offers each company with its count, sorted by name', async () => {
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['전체 (2)', '네이버 (1)', '카카오 (1)'])
  })

  it('applies ?company and ?q', async () => {
    render(await ProblemList({ searchParamsPromise: Promise.resolve({ company: '카카오' }) }))
    expect(screen.queryByText(/최단 경로/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '회사' })).toHaveValue('카카오')
  })

  it('distinguishes "no problems yet" from "no matches"', async () => {
    const { unmount } = render(await ProblemList({ searchParamsPromise: Promise.resolve({ q: '없는 문제' }) }))
    expect(screen.getByText('조건에 맞는 문제가 없어요.')).toBeInTheDocument()
    unmount()

    getProblemSummaries.mockResolvedValueOnce([])
    render(await ProblemList({ searchParamsPromise: Promise.resolve({}) }))
    expect(screen.getByText('아직 등록된 문제가 없어요. 첫 문제를 작성해보세요.')).toBeInTheDocument()
  })
})
````

- [ ] **Step 2: Add the nav expectation**

In `components/nav.test.tsx`, inside `it('renders links to the dashboard and each board', ...)`, add after the `'코테 스터디'` line:

```ts
    expect(screen.getByRole('link', { name: '문제은행' })).toHaveAttribute('href', '/problems')
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/problems/page.test.tsx" components/nav.test.tsx`
Expected: FAIL — unresolved `./page`, and the nav test can't find the `문제은행` link.

- [ ] **Step 4: Create the list page**

`app/(app)/problems/page.tsx`:

````tsx
import { Suspense } from 'react'
import Form from 'next/form'
import Link from 'next/link'
import { getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts, filterProblems } from '@/lib/problems/filter'
import { displayTitle } from '@/lib/problems/types'
import { getKstDateString } from '@/lib/checkin/time'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/skeleton'

type ProblemsSearchParams = { company?: string; q?: string; error?: string; success?: string }

export default function ProblemsPage({ searchParams }: { searchParams: Promise<ProblemsSearchParams> }) {
  return (
    <PageShell
      title="문제은행"
      headerExtra={
        <Link
          href="/problems/new"
          className="inline-flex min-h-11 items-center rounded bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          문제 작성
        </Link>
      }
    >
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <ProblemList searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
  const { error, success } = await searchParamsPromise
  return (
    <>
      <Toast message={success} />
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
    </>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  )
}

/**
 * Filtering and counting happen here, outside the `'use cache'` read, so `?company`/`?q`
 * never become cache keys — every visitor shares the one cached summary list.
 */
export async function ProblemList({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
  const { company = '', q = '' } = await searchParamsPromise
  const problems = await getProblemSummaries()
  const counts = companyCounts(problems)
  const visible = filterProblems(problems, { company, q })

  return (
    <>
      <Form action="/problems" className="mb-4 flex flex-wrap gap-2">
        <Select name="company" aria-label="회사" defaultValue={company} className="w-auto">
          <option value="">전체 ({problems.length})</option>
          {counts.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} ({c.count})
            </option>
          ))}
        </Select>
        <Input name="q" aria-label="검색" placeholder="회사명 또는 제목으로 검색" defaultValue={q} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </Form>

      {problems.length === 0 ? (
        <EmptyState message="아직 등록된 문제가 없어요. 첫 문제를 작성해보세요." />
      ) : visible.length === 0 ? (
        <EmptyState message="조건에 맞는 문제가 없어요." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((problem) => (
            <li key={problem.id}>
              <Link href={`/problems/${problem.id}`} className="block">
                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{displayTitle(problem.company, problem.title)}</span>
                    <span className="shrink-0 rounded border border-gray-300 px-2 py-0.5 font-mono text-xs dark:border-gray-700">
                      {problem.paramCount}개 인자 → {problem.returnType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {problem.authorName} · {getKstDateString(problem.createdAt)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
````

- [ ] **Step 5: Add the nav link**

In `components/nav.tsx`, change the `links` array to:

```ts
const links = [
  { href: '/', label: '홈' },
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/problems', label: '문제은행' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/problems/page.test.tsx" components/nav.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/problems/page.tsx" "app/(app)/problems/page.test.tsx" components/nav.tsx components/nav.test.tsx
git commit -m "feat: add problem bank list page and nav link"
```

---

### Task 16: Create and edit pages

**Suggested model:** sonnet

**Files:**
- Create: `app/(app)/problems/new/page.tsx`
- Create: `app/(app)/problems/[id]/loading.tsx`
- Create: `app/(app)/problems/[id]/edit/page.tsx`
- Test: `app/(app)/problems/[id]/edit/page.test.tsx`

- [ ] **Step 1: Write the failing edit-page tests**

`app/(app)/problems/[id]/edit/page.test.tsx`:

````tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('../../actions', () => ({
  updateProblem: vi.fn(),
  uploadProblemImage: vi.fn(),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div>{source}</div>,
}))

const ID = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b'
const problem = {
  id: ID,
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
  createdBy: 'author-1',
  authorName: '김민수',
  createdAt: '2026-10-18T01:00:00.000Z',
  updatedAt: '2026-10-18T01:00:00.000Z',
}

vi.mock('@/lib/problems/queries', () => ({
  getProblem: vi.fn(async () => problem),
  getProblemSummaries: vi.fn(async () => []),
}))

const session = { userId: 'author-1', role: 'member', status: 'approved' }
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => session),
}))

import EditProblemPage from './page'

beforeEach(() => {
  session.userId = 'author-1'
  session.role = 'member'
})

describe('EditProblemPage', () => {
  it('prefills the form for the author', async () => {
    render(await EditProblemPage({ params: Promise.resolve({ id: ID }) }))
    expect(screen.getByLabelText('회사')).toHaveValue('카카오')
    expect(screen.getByRole('button', { name: '수정 완료' })).toBeEnabled()
  })

  it('sends anyone else back to the problem with an error', async () => {
    session.userId = 'someone-else'
    await expect(EditProblemPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow(
      `REDIRECT:/problems/${ID}?error=` + encodeURIComponent('수정 권한이 없습니다')
    )
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/problems/[id]/edit"`
Expected: FAIL — `Failed to resolve import "./page"`.

- [ ] **Step 3: Create the loading boundary**

With `cacheComponents`, a page that awaits `params` at the top level needs a Suspense boundary above it; `loading.tsx` at `[id]/` provides one for both the detail page and `edit/` (same pattern as `app/(app)/feedback/[id]/loading.tsx`).

`app/(app)/problems/[id]/loading.tsx`:

````tsx
import { Skeleton } from '@/components/skeleton'

export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 lg:max-w-4xl xl:max-w-5xl">
      <Skeleton className="mb-2 h-8 w-72" />
      <Skeleton className="mb-8 h-4 w-48" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    </main>
  )
}
````

- [ ] **Step 4: Create the edit page**

`app/(app)/problems/[id]/edit/page.tsx`:

````tsx
import { notFound, redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getProblem, getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts } from '@/lib/problems/filter'
import { isUuid } from '@/lib/problems/validate'
import { PageShell } from '@/components/ui/page-shell'
import { updateProblem } from '../../actions'
import { ProblemForm } from '../../problem-form'

export default async function EditProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const [problem, session, summaries] = await Promise.all([getProblem(id), getSessionProfile(), getProblemSummaries()])
  if (!problem) notFound()
  if (session?.userId !== problem.createdBy && session?.role !== 'admin') {
    redirect(`/problems/${id}?error=` + encodeURIComponent('수정 권한이 없습니다'))
  }

  return (
    <PageShell title="문제 수정">
      <ProblemForm
        action={updateProblem.bind(null, id)}
        initial={problem}
        companies={companyCounts(summaries).map((c) => c.company)}
        submitLabel="수정 완료"
        cancelHref={`/problems/${id}`}
      />
    </PageShell>
  )
}
````

- [ ] **Step 5: Create the create page**

`app/(app)/problems/new/page.tsx`:

````tsx
import { Suspense } from 'react'
import { getProblemSummaries } from '@/lib/problems/queries'
import { companyCounts } from '@/lib/problems/filter'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { createProblem } from '../actions'
import { ProblemForm } from '../problem-form'

export default function NewProblemPage() {
  return (
    <PageShell title="문제 작성">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <NewProblemForm />
      </Suspense>
    </PageShell>
  )
}

export async function NewProblemForm() {
  const summaries = await getProblemSummaries()
  return (
    <ProblemForm
      action={createProblem}
      companies={companyCounts(summaries).map((c) => c.company)}
      submitLabel="등록"
      cancelHref="/problems"
    />
  )
}
````

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/problems/[id]/edit"`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/problems/new" "app/(app)/problems/[id]/loading.tsx" "app/(app)/problems/[id]/edit"
git commit -m "feat: add problem create and edit pages"
```

---

### Task 17: Detail page with download

**Suggested model:** sonnet

**Files:**
- Create: `app/(app)/problems/[id]/example-table.tsx`
- Create: `app/(app)/problems/[id]/download-panel.tsx`
- Create: `app/(app)/problems/[id]/delete-problem-button.tsx`
- Create: `app/(app)/problems/[id]/page.tsx`
- Test: `app/(app)/problems/[id]/download-panel.test.tsx`
- Test: `app/(app)/problems/[id]/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

`app/(app)/problems/[id]/download-panel.test.tsx`:

````tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DownloadPanel } from './download-panel'
import type { ProblemContent } from '@/lib/problems/types'

const problem: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'a', type: 'int' }], returnType: 'int' },
  testCases: [{ args: [1], expected: 1, isExample: true }],
}

describe('DownloadPanel', () => {
  it('previews the generated file for the selected language', () => {
    render(<DownloadPanel problemId="p-1" problem={problem} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Java' }))
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }))
    expect(screen.getByText('Solution.java')).toBeInTheDocument()
    expect(screen.getByText(/public class Solution/)).toBeInTheDocument()
    expect(screen.getByText(/문제 페이지: http:\/\/localhost(:\d+)?\/problems\/p-1/)).toBeInTheDocument()
  })

  it('downloads a blob named after the language file', () => {
    const createObjectURL = vi.fn(() => 'blob:mock')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<DownloadPanel problemId="p-1" problem={problem} />)
    fireEvent.click(screen.getByRole('radio', { name: 'C' }))
    fireEvent.click(screen.getByRole('button', { name: '파일 다운로드' }))

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect((click.mock.instances[0] as unknown as HTMLAnchorElement).download).toBe('solution.c')
    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
````

`app/(app)/problems/[id]/page.test.tsx`:

````tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const notFoundMock = vi.fn(() => {
  throw new Error('NOT_FOUND')
})

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => '/problems/x',
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('@/components/markdown', () => ({
  Markdown: ({ source }: { source: string }) => <div data-testid="markdown">{source}</div>,
}))

vi.mock('../actions', () => ({
  deleteProblem: vi.fn(),
}))

const ID = '3f2b8c1e-9d4a-4f6b-8e2a-1c3d5e7f9a0b'

const problem = {
  id: ID,
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '배열의 합을 구하세요.',
  constraintsMd: '- n ≤ 10',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: true },
    { args: [[9, 9], 9], expected: 27, isExample: false },
  ],
  createdBy: 'author-1',
  authorName: '김민수',
  createdAt: '2026-10-18T01:00:00.000Z',
  updatedAt: '2026-10-18T01:00:00.000Z',
}

const getProblem = vi.fn<(id: string) => Promise<typeof problem | null>>(async () => problem)
vi.mock('@/lib/problems/queries', () => ({
  getProblem: (id: string) => getProblem(id),
}))

const session = { userId: 'viewer-1', role: 'member', status: 'approved' }
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => session),
}))

import ProblemDetailPage from './page'

function renderPage(id = ID) {
  return ProblemDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })
}

beforeEach(() => {
  session.userId = 'viewer-1'
  session.role = 'member'
  getProblem.mockClear()
})

describe('ProblemDetailPage', () => {
  it('renders title, meta, body, signature, and only the example cases', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { name: '[카카오]-두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText(/김민수 · 2026-10-18/)).toBeInTheDocument()
    expect(screen.getByText('배열의 합을 구하세요.')).toBeInTheDocument()
    expect(screen.getByText('solution(arr: int[], k: int) -> int')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '[1,2]' })).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: '[9,9]' })).not.toBeInTheDocument()
  })

  it('hides edit and delete from other members', async () => {
    render(await renderPage())
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows edit and delete to the author and to admins', async () => {
    session.userId = 'author-1'
    const { unmount } = render(await renderPage())
    expect(screen.getByRole('link', { name: '수정' })).toHaveAttribute('href', `/problems/${ID}/edit`)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
    unmount()

    session.userId = 'someone'
    session.role = 'admin'
    render(await renderPage())
    expect(screen.getByRole('link', { name: '수정' })).toBeInTheDocument()
  })

  it('404s on a malformed id without reading the cache', async () => {
    await expect(renderPage('../etc')).rejects.toThrow('NOT_FOUND')
    expect(getProblem).not.toHaveBeenCalled()
  })

  it('404s on an unknown id', async () => {
    getProblem.mockResolvedValueOnce(null)
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })
})
````

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/problems/[id]/page.test.tsx" "app/(app)/problems/[id]/download-panel.test.tsx"`
Expected: FAIL — unresolved `./page` and `./download-panel`.

- [ ] **Step 3: Create the example table**

`app/(app)/problems/[id]/example-table.tsx`:

````tsx
import type { Signature, TestCase } from '@/lib/problems/types'

const cellClass = 'border border-gray-200 px-2 py-1 font-mono break-all dark:border-gray-800'

export function ExampleTable({ signature, cases }: { signature: Signature; cases: TestCase[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left dark:bg-gray-900">
            {signature.params.map((param) => (
              <th key={param.name} className={cellClass}>
                {param.name}
              </th>
            ))}
            <th className={cellClass}>return</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((testCase, row) => (
            <tr key={row}>
              {testCase.args.map((arg, i) => (
                <td key={i} className={cellClass}>
                  {JSON.stringify(arg)}
                </td>
              ))}
              <td className={cellClass}>{JSON.stringify(testCase.expected)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
````

- [ ] **Step 4: Create the download panel**

`app/(app)/problems/[id]/download-panel.tsx`:

````tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { generate, LANGUAGES, type Language } from '@/lib/problems/generate'
import type { ProblemContent } from '@/lib/problems/types'
import { cn } from '@/lib/ui/cn'

/**
 * Generation runs in the browser: the file is built from the problem already on the page, and
 * the header's problem URL needs `window.location.origin`. That is also why the preview is only
 * rendered after a click — rendering it during SSR would mismatch on hydration.
 */
export function DownloadPanel({ problemId, problem }: { problemId: string; problem: ProblemContent }) {
  const [lang, setLang] = useState<Language>('python')
  const [showPreview, setShowPreview] = useState(false)

  function build() {
    return generate(problem, lang, { problemUrl: `${window.location.origin}/problems/${problemId}` })
  }

  function download() {
    const file = build()
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = file.filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const preview = showPreview ? build() : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="언어 선택">
        {LANGUAGES.map((language) => (
          <button
            key={language.id}
            type="button"
            role="radio"
            aria-checked={lang === language.id}
            onClick={() => setLang(language.id)}
            className={cn(
              'min-h-11 rounded border px-3 text-sm',
              lang === language.id
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'
            )}
          >
            {language.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={download}>
          파일 다운로드
        </Button>
        <Button type="button" variant="secondary" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? '미리보기 닫기' : '미리보기'}
        </Button>
      </div>
      {preview && (
        <div>
          <p className="mb-1 font-mono text-xs text-gray-500">{preview.filename}</p>
          <pre className="max-h-[32rem] overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-900">
            <code>{preview.content}</code>
          </pre>
        </div>
      )}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        파일 맨 위 주석에 실행 방법이 있어요. 풀이를 작성하고 실행하면 모든 테스트 케이스를 채점해요.
      </p>
    </div>
  )
}
````

- [ ] **Step 5: Create the delete button**

`app/(app)/problems/[id]/delete-problem-button.tsx`:

````tsx
'use client'

import { Button } from '@/components/ui/button'

export function DeleteProblemButton({ action }: { action: () => Promise<void> }) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm('이 문제를 삭제할까요? 되돌릴 수 없어요.')) event.preventDefault()
      }}
    >
      <Button type="submit" variant="secondary" size="sm">
        삭제
      </Button>
    </form>
  )
}
````

- [ ] **Step 6: Create the detail page**

`app/(app)/problems/[id]/page.tsx`:

````tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { getKstDateString } from '@/lib/checkin/time'
import { getProblem } from '@/lib/problems/queries'
import { isUuid } from '@/lib/problems/validate'
import { displayTitle, formatSignature } from '@/lib/problems/types'
import { Markdown } from '@/components/markdown'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { deleteProblem } from '../actions'
import { DeleteProblemButton } from './delete-problem-button'
import { DownloadPanel } from './download-panel'
import { ExampleTable } from './example-table'

export default async function ProblemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { id } = await params
  const { error, success } = await searchParams
  if (!isUuid(id)) notFound()

  const [problem, session] = await Promise.all([getProblem(id), getSessionProfile()])
  if (!problem) notFound()

  const canManage = session?.userId === problem.createdBy || session?.role === 'admin'
  const examples = problem.testCases.filter((testCase) => testCase.isExample)
  const updated = problem.updatedAt.slice(0, 16) !== problem.createdAt.slice(0, 16)

  return (
    <PageShell
      title={displayTitle(problem.company, problem.title)}
      headerExtra={
        canManage ? (
          <div className="flex gap-2">
            <Link
              href={`/problems/${id}/edit`}
              className="inline-flex min-h-11 items-center rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              수정
            </Link>
            <DeleteProblemButton action={deleteProblem.bind(null, id)} />
          </div>
        ) : undefined
      }
    >
      <Toast message={success} />
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <p className="-mt-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
        {problem.authorName} · {getKstDateString(problem.createdAt)}
        {updated && ` (수정 ${getKstDateString(problem.updatedAt)})`} · 시간 제한 {problem.timeLimitMs}ms
      </p>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 text-lg font-semibold">문제 설명</h2>
          <Markdown source={problem.descriptionMd} />
        </section>
        {problem.constraintsMd && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">제한사항</h2>
            <Markdown source={problem.constraintsMd} />
          </section>
        )}
        <section>
          <h2 className="mb-2 text-lg font-semibold">함수 시그니처</h2>
          <code className="text-sm">{formatSignature(problem.signature)}</code>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">입출력 예</h2>
          <ExampleTable signature={problem.signature} cases={examples} />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">풀이 파일 다운로드</h2>
          <DownloadPanel problemId={id} problem={problem} />
        </section>
      </div>
    </PageShell>
  )
}
````

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/problems/[id]"`
Expected: PASS (9 tests across page, edit page and download panel).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/problems/[id]"
git commit -m "feat: add problem detail page with file download"
```

---

### Task 18: Final verification

**Suggested model:** opus (final whole-feature review per `AGENTS.md`)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: all tests pass; the 32 toolchain tests are skipped.

- [ ] **Step 2: Real toolchains**

Run: `VERIFY_TOOLCHAINS=1 npx vitest run lib/problems/generate/toolchain.test.ts`
Expected: 32 passed (report any language skipped for a missing toolchain).

- [ ] **Step 3: Types and lint**

Run: `npx tsc --noEmit` then `npm run lint`
Expected: no errors (warnings in untouched files are fine; none in new files).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: succeeds. `/problems`, `/problems/new`, `/problems/[id]` and `/problems/[id]/edit` appear in the route list.

- [ ] **Step 5: Manual check in the browser** (only after the user confirmed Task 8 Step 3)

Start `npm run dev`, sign in as an approved member, and verify:
1. 문제은행 appears in the nav; the list is empty with the "아직 등록된 문제가 없어요" state.
2. 문제 작성: fill company `카카오`, title, a description with an uploaded image (the `![](...)` lands at the cursor and shows in 미리보기), a signature `arr: int[]`, `k: int` → `int`, and three cases. Typing `[1, "a"]` in a cell shows the inline error and disables 등록. Submit lands on the detail page with a toast.
3. The detail page shows only the example cases in 입출력 예. Download each language; run the Python and JS files locally and confirm the stub prints `SOME FAILED`.
4. Back on the list, the company filter shows `카카오 (1)`; searching by part of the title finds it.
5. As a different non-admin member: no 수정/삭제 buttons, and opening `/problems/<id>/edit` redirects back with `수정 권한이 없습니다`.
6. As the author: edit (remove the image from the Markdown, save), then delete; the list is empty again. In Supabase Storage, the removed image is gone.

- [ ] **Step 6: Report**

Summarize what passed, anything skipped (toolchains, manual steps not done), and hand off to superpowers:finishing-a-development-branch.
