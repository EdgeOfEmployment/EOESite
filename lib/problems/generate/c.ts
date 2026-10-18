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
