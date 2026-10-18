import { describe, it, expect } from 'vitest'
import {
  addCase,
  addParam,
  cellKey,
  checkDraft,
  draftFromContent,
  emptyDraft,
  removeCase,
  removeParam,
  updateCase,
  updateCaseArg,
  updateParam,
  type Draft,
} from './draft'
import type { ProblemContent } from './types'

const content: ProblemContent = {
  company: '카카오',
  title: '두 수의 합',
  descriptionMd: '설명',
  constraintsMd: '',
  timeLimitMs: 1000,
  signature: { params: [{ name: 'arr', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'int' },
  testCases: [
    { args: [[1, 2], 3], expected: 6, isExample: true },
    { args: [[], 0], expected: 0, isExample: false },
  ],
}

function filled(): Draft {
  return draftFromContent(content)
}

describe('emptyDraft', () => {
  it('starts with one int param and one example case with empty cells', () => {
    const draft = emptyDraft()
    expect(draft.params.map((p) => [p.name, p.type])).toEqual([['n', 'int']])
    expect(draft.cases).toHaveLength(1)
    expect(draft.cases[0]).toMatchObject({ args: [''], expected: '', isExample: true })
  })
})

describe('draftFromContent', () => {
  it('turns values back into JSON text cells', () => {
    const draft = filled()
    expect(draft.timeLimitMs).toBe('1000')
    expect(draft.cases[0]).toMatchObject({ args: ['[1,2]', '3'], expected: '6', isExample: true })
  })
})

describe('param edits reshape every case', () => {
  it('adds an empty cell per case for a new param', () => {
    const draft = addParam(filled())
    expect(draft.params).toHaveLength(3)
    expect(draft.cases.every((c) => c.args.length === 3 && c.args[2] === '')).toBe(true)
  })

  it('drops the removed column from every case', () => {
    const draft = removeParam(filled(), 0)
    expect(draft.params.map((p) => p.name)).toEqual(['k'])
    expect(draft.cases.map((c) => c.args)).toEqual([['3'], ['0']])
  })

  it('updates one param in place', () => {
    expect(updateParam(filled(), 1, { type: 'long' }).params[1]).toMatchObject({ name: 'k', type: 'long' })
  })
})

describe('case edits', () => {
  it('marks only the first two rows as examples by default', () => {
    let draft: Draft = { ...emptyDraft(), cases: [] }
    draft = addCase(addCase(addCase(draft)))
    expect(draft.cases.map((c) => c.isExample)).toEqual([true, true, false])
  })

  it('removes, toggles, and edits cells by case id', () => {
    const draft = filled()
    const id = draft.cases[1].id
    expect(removeCase(draft, id).cases).toHaveLength(1)
    expect(updateCase(draft, id, { isExample: true }).cases[1].isExample).toBe(true)
    expect(updateCaseArg(draft, id, 1, '9').cases[1].args).toEqual(['[]', '9'])
  })
})

describe('checkDraft', () => {
  it('produces a validated JSON payload for a complete draft', () => {
    const check = checkDraft(filled())
    expect(check.formError).toBeNull()
    expect(JSON.parse(check.payload!)).toEqual(content)
  })

  it('reports per-cell errors keyed by case id and column', () => {
    const base = filled()
    const id = base.cases[0].id
    const check = checkDraft(updateCase(updateCaseArg(base, id, 0, '[1, "a"]'), id, { expected: 'x' }))
    expect(check.cellErrors[cellKey(id, 0)]).toBe('int[]의 원소는 int 범위의 정수여야 합니다')
    expect(check.cellErrors[cellKey(id, 'expected')]).toMatch(/JSON 형식이 아닙니다/)
    expect(check.formError).toBe('테스트 케이스에 비어 있거나 잘못된 칸이 있습니다')
    expect(check.payload).toBeNull()
  })

  it('surfaces signature errors before anything else', () => {
    const check = checkDraft(updateParam(filled(), 0, { name: 'class' }))
    expect(check.signatureError).toMatch(/예약어/)
    expect(check.formError).toBe(check.signatureError)
    expect(check.payload).toBeNull()
  })

  it('falls through to problem-level errors once cells are valid', () => {
    const check = checkDraft({ ...filled(), company: ' ' })
    expect(check.formError).toBe('회사 이름은 1~30자여야 합니다')
    expect(check.payload).toBeNull()
  })
})
