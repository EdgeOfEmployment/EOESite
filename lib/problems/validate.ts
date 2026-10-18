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
