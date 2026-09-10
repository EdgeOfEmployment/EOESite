'use client'

import { useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { CheckinGoal, CheckinGoalStatus } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { setGoalStatus, updateCheckinGoals } from './actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DragHandleIcon, SortableItem } from '@/components/ui/sortable-item'
import { reorderById } from '@/lib/ui/reorder'

type DraftGoal = CheckinGoal & { _id: string }

const GOAL_STATUSES: CheckinGoalStatus[] = ['todo', 'partial', 'done']

const GOAL_STATUS_ICON: Record<CheckinGoalStatus, string> = {
  todo: '☐',
  partial: '△',
  done: '☑',
}

const GOAL_STATUS_LABEL: Record<CheckinGoalStatus, string> = {
  todo: '미완료로 표시',
  partial: '반완료로 표시',
  done: '완료로 표시',
}

function goalTextClassName(status: CheckinGoalStatus) {
  if (status === 'done') return 'text-gray-400 line-through'
  if (status === 'partial') return 'text-gray-400'
  return ''
}

function GoalStatusControl({
  postId,
  goalIndex,
  status,
}: {
  postId: string
  goalIndex: number
  status: CheckinGoalStatus
}) {
  return (
    <span className="flex items-center gap-1">
      {GOAL_STATUSES.map((candidate) => (
        <form key={candidate} action={setGoalStatus.bind(null, postId, goalIndex, candidate)}>
          <button
            type="submit"
            aria-label={GOAL_STATUS_LABEL[candidate]}
            aria-pressed={status === candidate}
            className={
              status === candidate
                ? 'text-base leading-none'
                : 'text-base leading-none text-gray-300 dark:text-gray-700'
            }
          >
            {GOAL_STATUS_ICON[candidate]}
          </button>
        </form>
      ))}
    </span>
  )
}

function buildGoalsFormData(goals: CheckinGoal[]) {
  const formData = new FormData()
  formData.set('goalCount', String(goals.length))
  goals.forEach((goal, index) => {
    formData.set(`goal-${index}`, goal.body)
    formData.set(`status-${index}`, goal.status)
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
  const [draft, setDraft] = useState<DraftGoal[]>([])
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function startEditing() {
    setDraft(goals.map((goal) => ({ ...goal, _id: crypto.randomUUID() })))
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
  }

  function updateGoalBody(id: string, value: string) {
    setDraft((prev) => prev.map((goal) => (goal._id === id ? { ...goal, body: value } : goal)))
  }

  function removeGoal(id: string) {
    setDraft((prev) => prev.filter((goal) => goal._id !== id))
  }

  function addGoal() {
    setDraft((prev) => [...prev, { body: '', status: 'todo', completedAt: null, _id: crypto.randomUUID() }])
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    if (!overId) return
    setDraft((prev) => reorderById(prev, String(event.active.id), String(overId), (goal) => goal._id))
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={draft.map((goal) => goal._id)} strategy={verticalListSortingStrategy}>
            {draft.map((goal, index) => (
              <SortableItem key={goal._id} id={goal._id} className="flex items-center gap-2">
                {({ attributes, listeners }) => (
                  <>
                    <button
                      type="button"
                      aria-label="순서 변경"
                      className="cursor-grab touch-none text-gray-400 active:cursor-grabbing dark:text-gray-500"
                      {...attributes}
                      {...listeners}
                    >
                      <DragHandleIcon />
                    </button>
                    <Input
                      size="sm"
                      value={goal.body}
                      onChange={(e) => updateGoalBody(goal._id, e.target.value)}
                      placeholder={`목표 ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeGoal(goal._id)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      삭제
                    </button>
                  </>
                )}
              </SortableItem>
            ))}
          </SortableContext>
        </DndContext>
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
                <GoalStatusControl postId={postId} goalIndex={index} status={goal.status} />
              ) : (
                <span aria-hidden="true">{GOAL_STATUS_ICON[goal.status]}</span>
              )}
              <span className={goalTextClassName(goal.status)}>{goal.body}</span>
              {goal.status === 'done' && goal.completedAt && (
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
