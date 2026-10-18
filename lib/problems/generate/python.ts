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
  'int[]': 'return isinstance(got, (list, tuple)) and all(_is_int(x) for x in got) and list(got) == expected',
  'string[]': 'return isinstance(got, (list, tuple)) and list(got) == expected',
  'int[][]':
    'return isinstance(got, (list, tuple)) and all(isinstance(r, (list, tuple)) and all(_is_int(x) for x in r) for r in got) and [list(r) for r in got] == expected',
}

/** JSON is already valid Python for ints, strings and lists of them; only floats and bools differ. */
export function pyLiteral(type: ValueType, value: Json): string {
  if (type === 'double') return floatText(value as number)
  if (type === 'bool') return value ? 'True' : 'False'
  return JSON.stringify(value)
}

const PY_RUNTIME = String.raw`def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _fmt(v):
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
        except (Exception, SystemExit) as e:
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
    commentBlock(headerLines(problem, opts, 'python solution.py (macOS/Linux에서는 python3 solution.py)'), '#'),
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
