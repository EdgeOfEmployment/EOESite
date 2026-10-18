import { displayTitle, type BankProblemSummary } from './types'

export interface CompanyCount {
  company: string
  count: number
}

/** One entry per company, sorted by name (Korean collation), for the list filter and the form's datalist. */
export function companyCounts(problems: BankProblemSummary[]): CompanyCount[] {
  const counts = new Map<string, number>()
  for (const problem of problems) counts.set(problem.company, (counts.get(problem.company) ?? 0) + 1)
  return [...counts]
    .map(([company, count]) => ({ company, count }))
    .sort((a, b) => a.company.localeCompare(b.company, 'ko'))
}

/** `company` must match exactly; `q` is a case-insensitive substring of the display title `[company]-title`. */
export function filterProblems(
  problems: BankProblemSummary[],
  filter: { company?: string; q?: string }
): BankProblemSummary[] {
  const query = (filter.q ?? '').trim().toLowerCase()
  return problems.filter(
    (problem) =>
      (!filter.company || problem.company === filter.company) &&
      (!query || displayTitle(problem.company, problem.title).toLowerCase().includes(query))
  )
}
