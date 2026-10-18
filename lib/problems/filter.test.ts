import { describe, it, expect } from 'vitest'
import { companyCounts, filterProblems } from './filter'
import type { BankProblemSummary } from './types'

function summary(id: string, company: string, title: string): BankProblemSummary {
  return { id, company, title, authorName: '김민수', createdAt: '2026-10-18T00:00:00.000Z', returnType: 'int', paramCount: 1 }
}

const problems = [summary('1', '카카오', '두 수의 합'), summary('2', '네이버', '최단 경로'), summary('3', '카카오', 'Two Pointers')]

describe('companyCounts', () => {
  it('counts per company and sorts by name', () => {
    expect(companyCounts(problems)).toEqual([
      { company: '네이버', count: 1 },
      { company: '카카오', count: 2 },
    ])
  })
})

describe('filterProblems', () => {
  it('returns everything without a filter', () => {
    expect(filterProblems(problems, {})).toHaveLength(3)
  })

  it('filters by exact company', () => {
    expect(filterProblems(problems, { company: '카카오' }).map((p) => p.id)).toEqual(['1', '3'])
  })

  it('searches the display title case-insensitively, including the company part', () => {
    expect(filterProblems(problems, { q: 'two' }).map((p) => p.id)).toEqual(['3'])
    expect(filterProblems(problems, { q: '[네이버]' }).map((p) => p.id)).toEqual(['2'])
  })

  it('combines company and query', () => {
    expect(filterProblems(problems, { company: '카카오', q: '합' }).map((p) => p.id)).toEqual(['1'])
  })
})
