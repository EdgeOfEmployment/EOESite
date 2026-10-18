import type { Json, ProblemContent, ValueType } from '../types'
import {
  commentBlock,
  headerLines,
  orderCases,
  HARNESS_MARKER,
  SOLUTION_MARKER,
  type GenerateOptions,
  type GeneratedFile,
} from './shared'

const JAVA_TYPE: Record<ValueType, string> = {
  int: 'int',
  long: 'long',
  double: 'double',
  bool: 'boolean',
  string: 'String',
  'int[]': 'int[]',
  'string[]': 'String[]',
  'int[][]': 'int[][]',
}

const JAVA_DEFAULT: Record<ValueType, string> = {
  int: '0',
  long: '0L',
  double: '0.0',
  bool: 'false',
  string: '""',
  'int[]': 'new int[0]',
  'string[]': 'new String[0]',
  'int[][]': 'new int[0][0]',
}

const JAVA_CONVERTER: Record<ValueType, string> = {
  int: 'toInt',
  long: 'toLong',
  double: 'toDouble',
  bool: 'toBool',
  string: 'toStr',
  'int[]': 'toIntArr',
  'string[]': 'toStrArr',
  'int[][]': 'toIntGrid',
}

// Case data is embedded as JSON text and parsed at runtime instead of as Java array literals:
// array initializers compile to bytecode per element, so a few thousand elements would blow the
// 64 KB method limit, and distinct large ints would exhaust the 65,535-entry constant pool.
// Chunks stay well under the 65,535-byte limit on a single string constant.
const CHUNK = 8000

/**
 * A Java string literal that compiles under any platform encoding: non-ASCII becomes `\uXXXX`.
 * Control characters use named or octal escapes, never `\u`, because javac expands `\u000a`
 * into a real newline before lexing and the literal would no longer close.
 */
export function javaString(text: string): string {
  let out = '"'
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = text.charCodeAt(i)
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20) out += '\\' + code.toString(8).padStart(3, '0')
    else if (code < 0x7f) out += ch
    else out += '\\u' + code.toString(16).padStart(4, '0')
  }
  return out + '"'
}

function jsonChunks(value: Json): string {
  const json = JSON.stringify(value)
  const parts: string[] = []
  for (let i = 0; i < json.length; i += CHUNK) parts.push(javaString(json.slice(i, i + CHUNK)))
  return parts.join(', ')
}

const JAVA_RUNTIME = String.raw`    static final int[] PASSED = new int[2];
    static final int[] TOTAL = new int[2];
    static boolean allOk = true;

    static void start(int kind, String label) {
        TOTAL[kind]++;
        System.out.print("[" + label + "] ");
        System.out.flush();
    }

    static void error(Throwable e) {
        allOk = false;
        System.out.println("ERROR  " + e.getClass().getSimpleName() + ": " + e.getMessage());
    }

    static boolean report(int kind, boolean ok, long ms) {
        StringBuilder line = new StringBuilder(ok ? "PASS" : "FAIL").append("  ").append(ms).append("ms");
        if (ms > TIME_LIMIT_MS) line.append("  WARN time limit exceeded (").append(TIME_LIMIT_MS).append("ms)");
        System.out.println(line);
        if (ok) PASSED[kind]++;
        else allOk = false;
        return ok;
    }

    static void detail(String expected, String got) {
        System.out.println("    expected: " + cut(expected));
        System.out.println("    got:      " + cut(got));
    }

    static String cut(String s) {
        return s.length() > 200 ? s.substring(0, 200) + "..." : s;
    }

    static String j(String... parts) {
        StringBuilder b = new StringBuilder();
        for (String p : parts) b.append(p);
        return b.toString();
    }

    static Object parse(String s) {
        return new JsonParser(s).value();
    }

    /** Minimal JSON reader for the shapes the site emits. Numbers stay as text until a converter reads them. */
    static final class JsonParser {
        private final String s;
        private int i = 0;

        JsonParser(String s) {
            this.s = s;
        }

        Object value() {
            char c = s.charAt(i);
            if (c == '[') {
                i++;
                List<Object> list = new ArrayList<>();
                if (s.charAt(i) == ']') {
                    i++;
                    return list;
                }
                while (true) {
                    list.add(value());
                    char d = s.charAt(i++);
                    if (d == ']') return list;
                }
            }
            if (c == '"') {
                i++;
                StringBuilder b = new StringBuilder();
                while (true) {
                    char d = s.charAt(i++);
                    if (d == '"') return b.toString();
                    if (d != '\\') {
                        b.append(d);
                        continue;
                    }
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n': b.append('\n'); break;
                        case 't': b.append('\t'); break;
                        case 'r': b.append('\r'); break;
                        case 'b': b.append('\b'); break;
                        case 'f': b.append('\f'); break;
                        case 'u': b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: b.append(e);
                    }
                }
            }
            if (s.startsWith("true", i)) {
                i += 4;
                return Boolean.TRUE;
            }
            if (s.startsWith("false", i)) {
                i += 5;
                return Boolean.FALSE;
            }
            int begin = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            return new StringBuilder(s.substring(begin, i));
        }
    }

    @SuppressWarnings("unchecked")
    static List<Object> list(Object o) {
        return (List<Object>) o;
    }

    static int toInt(Object o) { return Integer.parseInt(o.toString()); }
    static long toLong(Object o) { return Long.parseLong(o.toString()); }
    static double toDouble(Object o) { return Double.parseDouble(o.toString()); }
    static boolean toBool(Object o) { return (Boolean) o; }
    static String toStr(Object o) { return (String) o; }

    static int[] toIntArr(Object o) {
        List<Object> l = list(o);
        int[] r = new int[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toInt(l.get(i));
        return r;
    }

    static String[] toStrArr(Object o) {
        List<Object> l = list(o);
        String[] r = new String[l.size()];
        for (int i = 0; i < r.length; i++) r[i] = toStr(l.get(i));
        return r;
    }

    static int[][] toIntGrid(Object o) {
        List<Object> l = list(o);
        int[][] r = new int[l.size()][];
        for (int i = 0; i < r.length; i++) r[i] = toIntArr(l.get(i));
        return r;
    }

    static boolean eq(int a, int b) { return a == b; }
    static boolean eq(long a, long b) { return a == b; }
    static boolean eq(double a, double b) { return Math.abs(a - b) <= 1e-6 * Math.max(1.0, Math.abs(b)); }
    static boolean eq(boolean a, boolean b) { return a == b; }
    static boolean eq(String a, String b) { return a != null && a.equals(b); }
    static boolean eq(int[] a, int[] b) { return a != null && Arrays.equals(a, b); }
    static boolean eq(String[] a, String[] b) { return a != null && Arrays.equals(a, b); }

    static boolean eq(int[][] a, int[][] b) {
        if (a == null || a.length != b.length) return false;
        for (int i = 0; i < b.length; i++) if (!Arrays.equals(a[i], b[i])) return false;
        return true;
    }

    static String show(int v) { return String.valueOf(v); }
    static String show(long v) { return String.valueOf(v); }
    static String show(double v) { return String.valueOf(v); }
    static String show(boolean v) { return String.valueOf(v); }

    static String show(String v) {
        if (v == null) return "null";
        return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\"";
    }

    static String show(int[] v) {
        return v == null ? "null" : Arrays.toString(v);
    }

    static String show(String[] v) {
        if (v == null) return "null";
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) b.append(i == 0 ? "" : ", ").append(show(v[i]));
        return b.append("]").toString();
    }

    static String show(int[][] v) {
        if (v == null) return "null";
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < v.length; i++) b.append(i == 0 ? "" : ", ").append(show(v[i]));
        return b.append("]").toString();
    }`

function caseMethod(problem: ProblemContent, index: number, c: ReturnType<typeof orderCases>[number]): string {
  const { params, returnType } = problem.signature
  const kind = c.kind === 'Example' ? 0 : 1
  const argLines = params.map(
    (p, i) => `        ${JAVA_TYPE[p.type]} a${i} = ${JAVA_CONVERTER[p.type]}(parse(j(${jsonChunks(c.args[i])})));`
  )
  return [
    `    static void case${index}() {`,
    `        start(${kind}, ${javaString(c.label)});`,
    ...argLines,
    `        ${JAVA_TYPE[returnType]} ex = ${JAVA_CONVERTER[returnType]}(parse(j(${jsonChunks(c.expected)})));`,
    '        Solution s = new Solution();',
    '        long t0 = System.nanoTime();',
    `        ${JAVA_TYPE[returnType]} got;`,
    '        try {',
    `            got = s.solution(${params.map((_, i) => `a${i}`).join(', ')});`,
    '        } catch (Throwable e) {',
    '            error(e);',
    '            return;',
    '        }',
    '        long ms = (System.nanoTime() - t0) / 1000000L;',
    `        if (!report(${kind}, eq(got, ex), ms)) detail(show(ex), show(got));`,
    '    }',
  ].join('\n')
}

// The harness lives in a nested class so its helper names cannot collide with the solver's own members.
const indent = (text: string) => text.replace(/^(?=.)/gm, '    ')

export function generateJava(problem: ProblemContent, opts: GenerateOptions): GeneratedFile {
  const { params, returnType } = problem.signature
  const cases = orderCases(problem.testCases)
  // javac expands `\u` escapes even inside comments, so `\u000a` in a description would end the comment.
  const header = commentBlock(
    headerLines(problem, opts, 'javac -encoding UTF-8 Solution.java && java Solution'),
    '//',
    (line) => line.replace(/\\u/g, '\\ u')
  )

  const content = [
    header,
    'import java.util.*;',
    '',
    'public class Solution {',
    `    // ${SOLUTION_MARKER}`,
    `    public ${JAVA_TYPE[returnType]} solution(${params.map((p) => `${JAVA_TYPE[p.type]} ${p.name}`).join(', ')}) {`,
    '        // TODO',
    `        return ${JAVA_DEFAULT[returnType]};`,
    '    }',
    '',
    `    // ${HARNESS_MARKER}`,
    `    static final long TIME_LIMIT_MS = ${problem.timeLimitMs}L;`,
    '',
    '    public static void main(String[] args) {',
    '        Harness.run();',
    '    }',
    '',
    '    static final class Harness {',
    indent(JAVA_RUNTIME),
    '',
    ...cases.map((c, i) => indent(caseMethod(problem, i + 1, c)) + '\n'),
    '        static void run() {',
    ...cases.map((_, i) => `            case${i + 1}();`),
    '            System.out.println("----");',
    '            System.out.println("Examples: " + PASSED[0] + "/" + TOTAL[0] + " passed | Extra: " + PASSED[1] + "/" + TOTAL[1]',
    '                + " passed | " + (allOk ? "ALL PASSED" : "SOME FAILED"));',
    '            System.exit(allOk ? 0 : 1);',
    '        }',
    '    }',
    '}',
  ].join('\n')

  return { filename: 'Solution.java', content: content + '\n' }
}
