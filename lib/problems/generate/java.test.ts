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
  it('documents how to compile and run', () => {
    const { content } = generateJava(problem, opts)
    expect(content).toContain('실행 방법: javac -encoding UTF-8 Solution.java 컴파일 후 java Solution 실행')
  })

  it('emits a Solution class with an instance solution method', () => {
    const { filename, content } = generateJava(problem, opts)
    expect(filename).toBe('Solution.java')
    expect(content).toContain('public class Solution {')
    expect(content).toContain('    public int solution(int[] arr, int k) {\n        // TODO\n        return 0;\n    }')
    expect(content).toContain('    static final long TIME_LIMIT_MS = 1500L;')
  })

  it('decodes each case from JSON text in its own method and calls them in order', () => {
    const { content } = generateJava(problem, opts)
    expect(content).toContain('            start(0, "Example 1");\n            int[] a0 = toIntArr(parse(j("[]")));')
    expect(content).toContain('            int ex = toInt(parse(j("6")));')
    expect(content).toContain('            case1();\n            case2();')
  })

  it('keeps the harness in a nested class so it cannot clash with the solver\'s helpers', () => {
    const { content } = generateJava(problem, opts)
    expect(content).toContain('    public static void main(String[] args) {\n        Harness.run();\n    }')
    expect(content).toContain('    static final class Harness {')
  })

  it('constructs the solution inside the per-case try', () => {
    const { content } = generateJava(problem, opts)
    expect(content).toContain('try {\n                got = new Solution().solution(a0, a1);')
    expect(content).not.toContain('Solution s = new Solution();')
  })

  it('omits the message when an error has none', () => {
    expect(generateJava(problem, opts).content).toContain('(e.getMessage() == null ? "" : ": " + e.getMessage())')
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
