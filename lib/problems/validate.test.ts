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
