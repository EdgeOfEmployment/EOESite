// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generate } from './index'
import { HARNESS_MARKER, SOLUTION_MARKER, type Language } from './shared'
import { TOOLCHAIN_FIXTURES } from './toolchain-fixtures'

/**
 * Compiles and runs every generated file with the real toolchains. Opt-in because it needs
 * gcc, node, python and a JDK on PATH and takes tens of seconds:
 *
 *   VERIFY_TOOLCHAINS=1 npx vitest run lib/problems/generate/toolchain.test.ts
 *
 * For each fixture and language it runs the generated file twice: as downloaded (the stub's
 * default return must fail at least one case → exit 1) and with a correct solution spliced in
 * (every case must pass → exit 0).
 */

const ENABLED = Boolean(process.env.VERIFY_TOOLCHAINS)
const IS_WINDOWS = process.platform === 'win32'

function available(cmd: string, args: string[]): boolean {
  return spawnSync(cmd, args, { encoding: 'utf8', shell: false }).status === 0
}

const PYTHON = available('python3', ['--version']) ? 'python3' : 'python'

const TOOLCHAINS: Record<Language, boolean> = ENABLED
  ? {
      c: available('gcc', ['--version']),
      js: available('node', ['--version']),
      python: available(PYTHON, ['--version']),
      java: available('javac', ['-version']) && available('java', ['-version']),
    }
  : { c: false, js: false, python: false, java: false }

function splice(content: string, solution: string): string {
  const lines = content.split('\n')
  const start = lines.findIndex((l) => l.includes(SOLUTION_MARKER))
  const end = lines.findIndex((l) => l.includes(HARNESS_MARKER))
  return [...lines.slice(0, start + 1), solution, '', ...lines.slice(end)].join('\n')
}

function run(cmd: string, args: string[], cwd: string) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
}

/** Builds (if needed) and runs one file; returns the program's exit status and combined output. */
function execute(lang: Language, dir: string, filename: string) {
  switch (lang) {
    case 'c': {
      const build = run('gcc', ['-std=c99', '-O2', '-Wall', '-Werror', filename, '-o', 'solution'], dir)
      if (build.status !== 0) return build
      return run(path.join(dir, IS_WINDOWS ? 'solution.exe' : 'solution'), [], dir)
    }
    case 'js':
      return run('node', [filename], dir)
    case 'python':
      return run(PYTHON, [filename], dir)
    case 'java': {
      const build = run('javac', ['-encoding', 'UTF-8', filename], dir)
      if (build.status !== 0) return build
      return run('java', ['-cp', '.', 'Solution'], dir)
    }
  }
}

const root = ENABLED ? mkdtempSync(path.join(tmpdir(), 'problem-bank-verify-')) : ''
const LANGS: Language[] = ['c', 'js', 'python', 'java']

describe.skipIf(!ENABLED)('generated files run under real toolchains', () => {
  for (const lang of LANGS) {
    describe.skipIf(!TOOLCHAINS[lang])(lang, () => {
      for (const fixture of TOOLCHAIN_FIXTURES) {
        it(`${fixture.name}: correct solution passes, stub fails`, () => {
          const file = generate(fixture.problem, lang, { problemUrl: 'https://example.com/problems/1' })

          const stubDir = path.join(root, `${lang}-${fixture.name}-stub`)
          mkdirSync(stubDir, { recursive: true })
          writeFileSync(path.join(stubDir, file.filename), file.content)
          const stub = execute(lang, stubDir, file.filename)
          expect(stub.output).toContain('SOME FAILED')
          expect(stub.status, stub.output).toBe(1)

          const okDir = path.join(root, `${lang}-${fixture.name}-ok`)
          mkdirSync(okDir, { recursive: true })
          writeFileSync(path.join(okDir, file.filename), splice(file.content, fixture.solutions[lang]))
          const ok = execute(lang, okDir, file.filename)
          expect(ok.output).toContain('ALL PASSED')
          expect(ok.status, ok.output).toBe(0)
        }, 120_000)
      }
    })
  }
})
