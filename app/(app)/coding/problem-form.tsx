'use client'

import { useRef, useState } from 'react'
import { createProblems } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Member } from '@/lib/coding/types'

interface ProblemRow {
  id: string
}

export function ProblemForm({ members }: { members: Member[] }) {
  const defaultWeek = getMostRecentTuesday(new Date())
  const nextRowId = useRef(2)

  const [rows, setRows] = useState<ProblemRow[]>([{ id: 'row-1' }])

  function addRow() {
    const id = `row-${nextRowId.current}`
    nextRowId.current += 1
    setRows((prev) => [...prev, { id }])
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev))
  }

  return (
    <Card as="form" action={createProblems} className="flex flex-col gap-4">
      <input type="hidden" name="rowIds" value={rows.map((row) => row.id).join(',')} />
      <div>
        <Label htmlFor="weekOf" className="sr-only">
          대상 주차
        </Label>
        <Input id="weekOf" name="weekOf" type="date" defaultValue={defaultWeek} required />
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">문제 {index + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-xs text-red-600 dark:text-red-400"
              >
                제거
              </button>
            )}
          </div>
          <Label htmlFor={`title-${row.id}`} className="sr-only">
            문제명
          </Label>
          <Input id={`title-${row.id}`} name={`title-${row.id}`} placeholder="문제명" required />
          <Label htmlFor={`link-${row.id}`} className="sr-only">
            문제 링크
          </Label>
          <Input id={`link-${row.id}`} name={`link-${row.id}`} type="url" placeholder="문제 링크" required />
          <Label htmlFor={`matchKeyword-${row.id}`} className="sr-only">
            저장소 매칭 키워드 (선택)
          </Label>
          <Input
            id={`matchKeyword-${row.id}`}
            name={`matchKeyword-${row.id}`}
            placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)"
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs text-gray-500 dark:text-gray-400">
              담당자 (선택, 비우면 전체 대상)
            </legend>
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`assigneeIds-${row.id}`} value={member.id} />
                {member.name}
              </label>
            ))}
          </fieldset>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          문제 추가
        </Button>
        <Button type="submit" size="lg">
          문제 등록
        </Button>
      </div>
    </Card>
  )
}
