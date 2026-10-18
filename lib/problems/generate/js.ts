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
  'int[]': 'return Array.isArray(got) && got.length === expected.length && Array.from(got).every((v, i) => v === expected[i])',
  'string[]': 'return Array.isArray(got) && got.length === expected.length && Array.from(got).every((v, i) => v === expected[i])',
  'int[][]':
    'return Array.isArray(got) && got.length === expected.length && Array.from(got).every((row, i) => Array.isArray(row) && row.length === expected[i].length && Array.from(row).every((v, j) => v === expected[i][j]))',
}

// Deliberately written without template literals so the emitted JS never needs `${` escaping here.
const JS_RUNTIME = String.raw`function fmt(v) {
  if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
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
    '{',
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
    '}',
  ].join('\n')

  return { filename: 'solution.js', content: content + '\n' }
}
