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
