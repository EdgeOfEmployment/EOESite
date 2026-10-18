import type { ProblemContent } from '../types'
import { generateC } from './c'
import { generateJava } from './java'
import { generateJs } from './js'
import { generatePython } from './python'
import type { GenerateOptions, GeneratedFile, Language } from './shared'

export type { GenerateOptions, GeneratedFile, Language } from './shared'

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'c', label: 'C' },
  { id: 'js', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
]

export function generate(problem: ProblemContent, lang: Language, opts: GenerateOptions): GeneratedFile {
  switch (lang) {
    case 'c':
      return generateC(problem, opts)
    case 'js':
      return generateJs(problem, opts)
    case 'python':
      return generatePython(problem, opts)
    case 'java':
      return generateJava(problem, opts)
  }
}
