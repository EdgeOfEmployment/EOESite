import { displayTitle, formatSignature, type ProblemContent, type TestCase } from '../types'

export type Language = 'c' | 'js' | 'python' | 'java'

export interface GenerateOptions {
  /** Absolute URL of the problem's detail page, printed in the header comment. */
  problemUrl: string
}

export interface GeneratedFile {
  filename: string
  content: string
}

export interface OrderedCase extends TestCase {
  label: string
  kind: 'Example' | 'Extra'
}

/** Marker comments every generated file carries; the toolchain test splices solutions between them. */
export const SOLUTION_MARKER = '===== 여기에 풀이를 작성하세요 ====='
export const HARNESS_MARKER = '===== 아래는 채점 코드입니다 (수정하지 마세요) ====='

/** Examples first, then extras, each numbered from 1 within its own kind. */
export function orderCases(cases: TestCase[]): OrderedCase[] {
  const examples = cases
    .filter((c) => c.isExample)
    .map((c, i) => ({ ...c, label: `Example ${i + 1}`, kind: 'Example' as const }))
  const extras = cases
    .filter((c) => !c.isExample)
    .map((c, i) => ({ ...c, label: `Extra ${i + 1}`, kind: 'Extra' as const }))
  return [...examples, ...extras]
}

// Every character any of the four languages treats as ending a line comment. JS ends a `//`
// comment at U+2028/U+2029 and Python at a lone `\r`, so splitting only on `\n` would let the
// rest of a description line escape the comment and become code.
const LINE_BREAK = new RegExp('\\r\\n|\\r|\\n|\\u2028|\\u2029')
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g

function markdownLines(markdown: string): string[] {
  return markdown
    .replace(IMAGE, (_match, alt: string) =>
      alt.trim() ? `[이미지: ${alt.trim()} - 사이트에서 확인]` : '[이미지 - 사이트에서 확인]'
    )
    .split(LINE_BREAK)
}

export function headerLines(problem: ProblemContent, opts: GenerateOptions, runCommand: string): string[] {
  const lines = [
    displayTitle(problem.company, problem.title),
    `문제 페이지: ${opts.problemUrl}`,
    `시간 제한: ${problem.timeLimitMs}ms`,
    `실행 방법: ${runCommand}`,
    '',
    '[문제 설명]',
    ...markdownLines(problem.descriptionMd),
  ]
  if (problem.constraintsMd.trim()) {
    lines.push('', '[제한사항]', ...markdownLines(problem.constraintsMd))
  }
  lines.push('', `[함수 시그니처] ${formatSignature(problem.signature)}`)
  return lines
}

/** Renders lines as single-line comments, so a description containing `*` `/` can never close a block. */
export function commentBlock(lines: string[], prefix: string, sanitize: (line: string) => string = (l) => l): string {
  return lines
    .flatMap((line) => line.split(LINE_BREAK))
    .map((line) => {
      const text = sanitize(line.trimEnd())
      return text ? `${prefix} ${text}` : prefix
    })
    .join('\n')
}

/** A number literal that every target language reads as floating point (`5` → `5.0`). */
export function floatText(value: number): string {
  const text = String(value)
  return /[.eE]/.test(text) ? text : `${text}.0`
}
