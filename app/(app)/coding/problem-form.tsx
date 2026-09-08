'use client'

import { useRef, useState } from 'react'
import { createProblems } from './actions'
import { getTodayDate, addDays, formatWeekHeader } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Member, CodingWeek } from '@/lib/coding/types'

interface ProblemRow {
  id: string
}

export function ProblemForm({
  members,
  currentWeek,
}: {
  members: Member[]
  currentWeek: CodingWeek | null
}) {
  const idCounter = useRef(1)

  function makeRow(): ProblemRow {
    idCounter.current += 1
    return { id: `row-${idCounter.current}` }
  }

  const [rows, setRows] = useState<ProblemRow[]>([{ id: 'row-1' }])
  const [weekMode, setWeekMode] = useState<'existing' | 'new'>(currentWeek ? 'existing' : 'new')

  const [prevWeekId, setPrevWeekId] = useState(currentWeek?.id)
  if (currentWeek?.id !== prevWeekId) {
    setPrevWeekId(currentWeek?.id)
    setWeekMode(currentWeek ? 'existing' : 'new')
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev))
  }

  const defaultStart = getTodayDate()
  const defaultEnd = addDays(defaultStart, 6)

  return (
    <Card as="form" action={createProblems} className="flex flex-col gap-4">
      <input type="hidden" name="rowIds" value={rows.map((row) => row.id).join(',')} />
      <input type="hidden" name="weekMode" value={weekMode} />

      <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {weekMode === 'existing' && currentWeek ? formatWeekHeader(currentWeek) : '새 주차 만들기'}
          </span>
          {currentWeek && (
            <button
              type="button"
              onClick={() => setWeekMode((prev) => (prev === 'existing' ? 'new' : 'existing'))}
              className="text-xs underline"
            >
              {weekMode === 'existing' ? '새 주차 만들기' : '기존 주차에 등록'}
            </button>
          )}
        </div>

        {weekMode === 'existing' && currentWeek ? (
          <>
            <input type="hidden" name="weekId" value={currentWeek.id} />
            <Label htmlFor="currentWeekDisplay" className="sr-only">
              등록 대상 주차
            </Label>
            <Input id="currentWeekDisplay" value={formatWeekHeader(currentWeek)} disabled readOnly />
          </>
        ) : (
          <>
            <Label htmlFor="weekLabel" className="sr-only">
              주차명
            </Label>
            <Input id="weekLabel" name="weekLabel" placeholder="주차명 (예: 1주차)" required />
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="weekStartDate" className="sr-only">
                  시작일
                </Label>
                <Input
                  id="weekStartDate"
                  name="weekStartDate"
                  type="date"
                  defaultValue={defaultStart}
                  required
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="weekEndDate" className="sr-only">
                  종료일
                </Label>
                <Input id="weekEndDate" name="weekEndDate" type="date" defaultValue={defaultEnd} required />
              </div>
            </div>
          </>
        )}
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
