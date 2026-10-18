'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addCase, cellKey, removeCase, updateCase, updateCaseArg, type Draft } from '@/lib/problems/draft'
import { LIMITS } from '@/lib/problems/validate'
import { cn } from '@/lib/ui/cn'

export function CaseTable({
  draft,
  onChange,
  cellErrors,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  cellErrors: Record<string, string>
}) {
  const columnName = (i: number) => draft.params[i].name || `파라미터 ${i + 1}`

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">테스트 케이스</legend>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        각 칸에 JSON 값을 입력하세요. 예: 5, &quot;abc&quot;, [1, 2, 3], [[0, 1], [1, 0]]. &quot;예시&quot;로 체크한 케이스만 문제
        페이지의 입출력 예에 보여요. 다운로드한 파일에는 모든 케이스가 들어가요.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-1 font-normal text-gray-500">#</th>
              {draft.params.map((param, i) => (
                <th key={param.id} className="p-1 font-mono font-medium">
                  {columnName(i)} <span className="text-xs font-normal text-gray-500">{param.type}</span>
                </th>
              ))}
              <th className="p-1 font-medium">
                기대값 <span className="font-mono text-xs font-normal text-gray-500">{draft.returnType}</span>
              </th>
              <th className="whitespace-nowrap p-1 font-medium">예시</th>
              <th className="p-1">
                <span className="sr-only">삭제</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.cases.map((row, r) => (
              <tr key={row.id} className="align-top">
                <td className="p-1 pt-3 text-gray-500">{r + 1}</td>
                {row.args.map((text, i) => (
                  <td key={draft.params[i].id} className="p-1">
                    <Cell
                      label={`케이스 ${r + 1} ${columnName(i)}`}
                      value={text}
                      error={cellErrors[cellKey(row.id, i)]}
                      onChange={(value) => onChange(updateCaseArg(draft, row.id, i, value))}
                    />
                  </td>
                ))}
                <td className="p-1">
                  <Cell
                    label={`케이스 ${r + 1} 기대값`}
                    value={row.expected}
                    error={cellErrors[cellKey(row.id, 'expected')]}
                    onChange={(value) => onChange(updateCase(draft, row.id, { expected: value }))}
                  />
                </td>
                <td className="p-1 text-center">
                  <input
                    type="checkbox"
                    aria-label={`케이스 ${r + 1} 예시`}
                    checked={row.isExample}
                    onChange={(e) => onChange(updateCase(draft, row.id, { isExample: e.target.checked }))}
                    className="mt-3 h-4 w-4"
                  />
                </td>
                <td className="p-1">
                  <button
                    type="button"
                    aria-label={`케이스 ${r + 1} 삭제`}
                    disabled={draft.cases.length <= LIMITS.minCases}
                    onClick={() => onChange(removeCase(draft, row.id))}
                    className="mt-3 whitespace-nowrap text-xs text-red-600 disabled:opacity-40 dark:text-red-400"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button
          type="button"
          variant="secondary"
          disabled={draft.cases.length >= LIMITS.maxCases}
          onClick={() => onChange(addCase(draft))}
        >
          + 케이스 추가
        </Button>
      </div>
    </fieldset>
  )
}

/** Empty cells only block submission (via the form-level message); typed-but-invalid cells explain why. */
function Cell({
  label,
  value,
  error,
  onChange,
}: {
  label: string
  value: string
  error: string | undefined
  onChange: (value: string) => void
}) {
  const showError = Boolean(error) && value.trim() !== ''
  return (
    <div className="flex min-w-32 flex-col gap-0.5">
      <Input
        size="sm"
        aria-label={label}
        aria-invalid={showError || undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('font-mono', showError && 'border-red-500 dark:border-red-500')}
      />
      {showError && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
