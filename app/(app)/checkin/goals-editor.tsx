'use client'

import { useState } from 'react'
import type { CheckinGoal } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { toggleGoalCompleted, updateCheckinGoals } from './actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

function buildGoalsFormData(goals: CheckinGoal[]) {
  const formData = new FormData()
  formData.set('goalCount', String(goals.length))
  goals.forEach((goal, index) => {
    formData.set(`goal-${index}`, goal.body)
    formData.set(`completed-${index}`, goal.completed ? 'true' : 'false')
    formData.set(`completedAt-${index}`, goal.completedAt ?? '')
  })
  return formData
}

export function GoalsEditor({
  postId,
  goals,
  isAuthor,
}: {
  postId: string
  goals: CheckinGoal[]
  isAuthor: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<CheckinGoal[]>(goals)
  const [saving, setSaving] = useState(false)

  function startEditing() {
    setDraft(goals.map((goal) => ({ ...goal })))
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
  }

  function updateGoalBody(index: number, value: string) {
    setDraft((prev) => prev.map((goal, i) => (i === index ? { ...goal, body: value } : goal)))
  }

  function removeGoal(index: number) {
    setDraft((prev) => prev.filter((_, i) => i !== index))
  }

  function addGoal() {
    setDraft((prev) => [...prev, { body: '', completed: false, completedAt: null }])
  }

  async function saveGoals() {
    setSaving(true)
    try {
      await updateCheckinGoals(postId, buildGoalsFormData(draft))
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        {draft.map((goal, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              size="sm"
              value={goal.body}
              onChange={(e) => updateGoalBody(index, e.target.value)}
              placeholder={`목표 ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeGoal(index)}
              className="text-xs text-red-600 dark:text-red-400"
            >
              삭제
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={addGoal} disabled={saving}>
            + 항목 추가
          </Button>
          <Button type="button" size="sm" onClick={saveGoals} disabled={saving}>
            저장
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={cancelEditing} disabled={saving}>
            취소
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {goals.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {goals.map((goal, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
              {isAuthor ? (
                <form action={toggleGoalCompleted.bind(null, postId, index)}>
                  <button type="submit" className="flex items-center gap-2">
                    <span aria-hidden="true">{goal.completed ? '☑' : '☐'}</span>
                    <span className={goal.completed ? 'text-gray-400 line-through' : ''}>{goal.body}</span>
                  </button>
                </form>
              ) : (
                <>
                  <span aria-hidden="true">{goal.completed ? '☑' : '☐'}</span>
                  <span className={goal.completed ? 'text-gray-400 line-through' : ''}>{goal.body}</span>
                </>
              )}
              {goal.completed && goal.completedAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  완료 {formatKstTime(goal.completedAt)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAuthor && (
        <button
          type="button"
          onClick={startEditing}
          className="mt-2 block text-xs text-gray-500 underline dark:text-gray-400"
        >
          수정
        </button>
      )}
    </>
  )
}
