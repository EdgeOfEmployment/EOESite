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
  it('documents how to compile and run on every platform', () => {
    const { content } = generateC(problem, opts)
    expect(content).toContain('실행 방법: gcc -std=c99 -O2 solution.c -o solution 컴파일 후 ./solution 실행 (Windows: solution.exe)')
  })

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
