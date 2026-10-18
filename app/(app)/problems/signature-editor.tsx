'use client'

import { Button } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/input'
import { VALUE_TYPES, formatSignature, type ValueType } from '@/lib/problems/types'
import { addParam, removeParam, updateParam, type Draft } from '@/lib/problems/draft'
import { LIMITS } from '@/lib/problems/validate'

export function SignatureEditor({
  draft,
  onChange,
  error,
}: {
  draft: Draft
  onChange: (draft: Draft) => void
  error: string | null
}) {
  function handleRemove(index: number) {
    const hasValues = draft.cases.some((c) => c.args[index]?.trim())
    const name = draft.params[index].name || `파라미터 ${index + 1}`
    if (hasValues && !window.confirm(`"${name}" 열의 테스트 값도 함께 지워져요. 삭제할까요?`)) return
    onChange(removeParam(draft, index))
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">함수 시그니처</legend>
      {draft.params.map((param, i) => (
        <div key={param.id} className="flex gap-2">
          <Input
            aria-label={`파라미터 ${i + 1} 이름`}
            placeholder="이름 (예: arr)"
            value={param.name}
            onChange={(e) => onChange(updateParam(draft, i, { name: e.target.value }))}
            className="font-mono"
          />
          <Select
            aria-label={`파라미터 ${i + 1} 타입`}
            value={param.type}
            onChange={(e) => onChange(updateParam(draft, i, { type: e.target.value as ValueType }))}
            className="w-36 shrink-0"
          >
            {VALUE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            aria-label={`파라미터 ${i + 1} 삭제`}
            disabled={draft.params.length <= LIMITS.minParams}
            onClick={() => handleRemove(i)}
          >
            삭제
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={draft.params.length >= LIMITS.maxParams}
          onClick={() => onChange(addParam(draft))}
        >
          + 파라미터 추가
        </Button>
        <Label htmlFor="returnType" className="ml-auto">
          반환 타입
        </Label>
        <Select
          id="returnType"
          value={draft.returnType}
          onChange={(e) => onChange({ ...draft, returnType: e.target.value as ValueType })}
          className="w-36"
        >
          {VALUE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
      </div>
      <code className="text-sm">{formatSignature({ params: draft.params, returnType: draft.returnType })}</code>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </fieldset>
  )
}
