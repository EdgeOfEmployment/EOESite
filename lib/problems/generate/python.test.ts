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

  it('rejects bools and floats inside int arrays', () => {
    const { content } = generatePython({ ...problem, signature: { ...problem.signature, returnType: 'int[]' }, testCases: [{ args: [[1], 1], expected: [1], isExample: true }] }, opts)
    expect(content).toContain('all(_is_int(x) for x in got)')
    expect(content).toContain('def _is_int(v):\n    return isinstance(v, int) and not isinstance(v, bool)')
  })

  it('reports SystemExit from a solution as an error instead of stopping the run', () => {
    expect(generatePython(problem, opts).content).toContain('except (Exception, SystemExit) as e:')
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
