import type { ProblemContent, Signature, TestCase } from '../types'
import type { Language } from './shared'

export interface ToolchainFixture {
  name: string
  problem: ProblemContent
  /** A correct `solution` per language, spliced between the generated file's markers. */
  solutions: Record<Language, string>
}

// Every line here is something that has broken a comment in at least one target language:
// `*/`, a Java `\u` escape, a trailing backslash (C line splice), a trigraph, an image, and U+2028.
const HOSTILE_DESCRIPTION = [
  '설명 */ 끝',
  'javac가 읽는 \\u000a 이스케이프',
  '역슬래시로 끝나는 줄 \\',
  '트라이그래프 ??/',
  '![그림](https://example.com/a.png) 그림 뒤',
  `줄 구분자${String.fromCharCode(0x2028)}다음 줄`,
].join('\n')

function problem(title: string, signature: Signature, testCases: TestCase[]): ProblemContent {
  return {
    company: '테스트',
    title,
    descriptionMd: HOSTILE_DESCRIPTION,
    constraintsMd: '- n ≤ 10^5',
    timeLimitMs: 1000,
    signature,
    testCases,
  }
}

export const TOOLCHAIN_FIXTURES: ToolchainFixture[] = [
  {
    name: 'sum',
    problem: problem(
      '합',
      { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
      [
        { args: [[1, 2, 3], 2], expected: 8, isExample: true },
        { args: [[], 5], expected: 5, isExample: false },
        { args: [[-1, -2], 0], expected: -3, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(arr, k):\n    return sum(arr) + k',
      js: 'function solution(arr, k) {\n  return arr.reduce((a, b) => a + b, 0) + k\n}',
      java: '    public int solution(int[] arr, int k) {\n        int s = k;\n        for (int v : arr) s += v;\n        return s;\n    }',
      c: 'int solution(int arr[], int arr_len, int k) {\n    int s = k;\n    for (int i = 0; i < arr_len; i++) s += arr[i];\n    return s;\n}',
    },
  },
  {
    name: 'mix',
    problem: problem(
      '혼합',
      {
        params: [
          { name: 'a', type: 'long' },
          { name: 'b', type: 'double' },
          { name: 'flag', type: 'bool' },
        ],
        returnType: 'double',
      },
      [
        { args: [10000000000, 0.5, true], expected: 10000000000.5, isExample: true },
        { args: [3, 1.25, false], expected: 1.75, isExample: false },
        { args: [-5, 0.1, true], expected: -4.9, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(a, b, flag):\n    return a + b if flag else a - b',
      js: 'function solution(a, b, flag) {\n  return flag ? a + b : a - b\n}',
      java: '    public double solution(long a, double b, boolean flag) {\n        return flag ? a + b : a - b;\n    }',
      c: 'double solution(long long a, double b, bool flag) {\n    return flag ? a + b : a - b;\n}',
    },
  },
  {
    name: 'prefix',
    problem: problem(
      '접두사',
      { params: [{ name: 's', type: 'string' }, { name: 'words', type: 'string[]' }], returnType: 'string[]' },
      [
        { args: ['가', ['a', 'b']], expected: ['가a', '가b'], isExample: true },
        { args: ['x"\\?', []], expected: [], isExample: false },
        { args: ['', ['??/', '줄\n바꿈', '😀']], expected: ['??/', '줄\n바꿈', '😀'], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(s, words):\n    return [s + w for w in words]',
      js: 'function solution(s, words) {\n  return words.map((w) => s + w)\n}',
      java: '    public String[] solution(String s, String[] words) {\n        String[] r = new String[words.length];\n        for (int i = 0; i < words.length; i++) r[i] = s + words[i];\n        return r;\n    }',
      c: [
        'char** solution(char* s, char* words[], int words_len, int* ret_len) {',
        '    char** r = malloc(sizeof(char*) * (words_len > 0 ? words_len : 1));',
        '    for (int i = 0; i < words_len; i++) {',
        '        r[i] = malloc(strlen(s) + strlen(words[i]) + 1);',
        '        strcpy(r[i], s);',
        '        strcat(r[i], words[i]);',
        '    }',
        '    *ret_len = words_len;',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'transpose',
    problem: problem(
      '전치',
      { params: [{ name: 'grid', type: 'int[][]' }], returnType: 'int[][]' },
      [
        { args: [[[1, 2, 3], [4, 5, 6]]], expected: [[1, 4], [2, 5], [3, 6]], isExample: true },
        { args: [[]], expected: [], isExample: false },
        { args: [[[], []]], expected: [], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(grid):\n    return [list(row) for row in zip(*grid)]',
      js: 'function solution(grid) {\n  if (grid.length === 0) return []\n  return grid[0].map((_, j) => grid.map((row) => row[j]))\n}',
      java: [
        '    public int[][] solution(int[][] grid) {',
        '        if (grid.length == 0 || grid[0].length == 0) return new int[0][0];',
        '        int[][] t = new int[grid[0].length][grid.length];',
        '        for (int i = 0; i < grid.length; i++)',
        '            for (int j = 0; j < grid[0].length; j++) t[j][i] = grid[i][j];',
        '        return t;',
        '    }',
      ].join('\n'),
      c: [
        'int** solution(int** grid, int grid_rows, int grid_cols, int* ret_rows, int* ret_cols) {',
        '    if (grid_rows == 0 || grid_cols == 0) {',
        '        *ret_rows = 0;',
        '        *ret_cols = 0;',
        '        return NULL;',
        '    }',
        '    int** t = malloc(sizeof(int*) * grid_cols);',
        '    for (int j = 0; j < grid_cols; j++) {',
        '        t[j] = malloc(sizeof(int) * grid_rows);',
        '        for (int i = 0; i < grid_rows; i++) t[j][i] = grid[i][j];',
        '    }',
        '    *ret_rows = grid_cols;',
        '    *ret_cols = grid_rows;',
        '    return t;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'repeat',
    problem: problem(
      '반복',
      { params: [{ name: 's', type: 'string' }, { name: 'n', type: 'int' }], returnType: 'string' },
      [
        { args: ['ab', 2], expected: 'abab', isExample: true },
        { args: ['한', 3], expected: '한한한', isExample: false },
        { args: ['x', 0], expected: '', isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(s, n):\n    return s * n',
      js: 'function solution(s, n) {\n  return s.repeat(n)\n}',
      java: '    public String solution(String s, int n) {\n        return s.repeat(n);\n    }',
      c: [
        'char* solution(char* s, int n) {',
        '    char* r = malloc(strlen(s) * n + 1);',
        '    r[0] = 0;',
        '    for (int i = 0; i < n; i++) strcat(r, s);',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
  {
    name: 'isEven',
    problem: problem(
      '짝수',
      { params: [{ name: 'x', type: 'long' }], returnType: 'bool' },
      [
        { args: [4], expected: true, isExample: true },
        { args: [7], expected: false, isExample: false },
        { args: [-9007199254740990], expected: true, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(x):\n    return x % 2 == 0',
      js: 'function solution(x) {\n  return x % 2 === 0\n}',
      java: '    public boolean solution(long x) {\n        return x % 2 == 0;\n    }',
      c: 'bool solution(long long x) {\n    return x % 2 == 0;\n}',
    },
  },
  {
    name: 'square',
    problem: problem(
      '제곱',
      { params: [{ name: 'x', type: 'int' }], returnType: 'long' },
      [
        { args: [3], expected: 9, isExample: true },
        { args: [46341], expected: 2147488281, isExample: false },
        { args: [-2], expected: 4, isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(x):\n    return x * x',
      js: 'function solution(x) {\n  return x * x\n}',
      java: '    public long solution(int x) {\n        return (long) x * x;\n    }',
      c: 'long long solution(int x) {\n    return (long long)x * x;\n}',
    },
  },
  {
    name: 'evens',
    problem: problem(
      '짝수만',
      { params: [{ name: 'arr', type: 'int[]' }], returnType: 'int[]' },
      [
        { args: [[1, 2, 3, 4]], expected: [2, 4], isExample: true },
        { args: [[1, 3]], expected: [], isExample: false },
        { args: [[]], expected: [], isExample: false },
        { args: [[-2147483648, 1]], expected: [-2147483648], isExample: false },
      ]
    ),
    solutions: {
      python: 'def solution(arr):\n    return [v for v in arr if v % 2 == 0]',
      js: 'function solution(arr) {\n  return arr.filter((v) => v % 2 === 0)\n}',
      java: '    public int[] solution(int[] arr) {\n        return Arrays.stream(arr).filter(v -> v % 2 == 0).toArray();\n    }',
      c: [
        'int* solution(int arr[], int arr_len, int* ret_len) {',
        '    int* r = malloc(sizeof(int) * (arr_len > 0 ? arr_len : 1));',
        '    int n = 0;',
        '    for (int i = 0; i < arr_len; i++)',
        '        if (arr[i] % 2 == 0) r[n++] = arr[i];',
        '    *ret_len = n;',
        '    return r;',
        '}',
      ].join('\n'),
    },
  },
]
