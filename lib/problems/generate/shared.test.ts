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

describe('orderCases numbering', () => {
  it('numbers examples and extras independently', () => {
    const c = (isExample: boolean) => ({ args: [], expected: 0, isExample })
    expect(orderCases([c(false), c(true), c(false), c(true)]).map((x) => x.label)).toEqual([
      'Example 1',
      'Example 2',
      'Extra 1',
      'Extra 2',
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

  it('leaves a malformed image alone instead of swallowing the text after it', () => {
    const lines = headerLines({ ...problem, descriptionMd: '![x](oops\n\n중요한 설명 문장)' }, opts, 'x')
    expect(lines).toContain('중요한 설명 문장)')
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
