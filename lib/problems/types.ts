export const VALUE_TYPES = ['int', 'long', 'double', 'bool', 'string', 'int[]', 'string[]', 'int[][]'] as const

export type ValueType = (typeof VALUE_TYPES)[number]

export type Json = number | boolean | string | Json[]

export interface Param {
  name: string
  type: ValueType
}

export interface Signature {
  params: Param[]
  returnType: ValueType
}

export interface TestCase {
  args: Json[]
  expected: Json
  isExample: boolean
}

/** Everything an author writes; what the form submits and what the generator consumes. */
export interface ProblemContent {
  company: string
  title: string
  descriptionMd: string
  constraintsMd: string
  timeLimitMs: number
  signature: Signature
  testCases: TestCase[]
}

export interface BankProblem extends ProblemContent {
  id: string
  createdBy: string
  authorName: string
  createdAt: string
  updatedAt: string
}

export interface BankProblemSummary {
  id: string
  company: string
  title: string
  authorName: string
  createdAt: string
  returnType: ValueType
  paramCount: number
}

export function isValueType(value: unknown): value is ValueType {
  return typeof value === 'string' && (VALUE_TYPES as readonly string[]).includes(value)
}

export function displayTitle(company: string, title: string): string {
  return `[${company}]-${title}`
}

export function formatSignature(signature: Signature): string {
  const params = signature.params.map((p) => `${p.name}: ${p.type}`).join(', ')
  return `solution(${params}) -> ${signature.returnType}`
}
