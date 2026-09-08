'use client'

import { useEffect, useState } from 'react'
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
import { createCheckinPost } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DragHandleIcon, SortableItem } from '@/components/ui/sortable-item'
import { reorderById } from '@/lib/ui/reorder'

interface PhotoPreview {
  url: string
  name: string
}

interface GoalField {
  id: string
  value: string
}

export function PostForm() {
  const [goals, setGoals] = useState<GoalField[]>([])
  const [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // React runs this cleanup for the *previous* render's photoPreview value right before
  // re-running the effect whenever `photoPreview` changes (not only on unmount) — so this
  // single effect revokes the old object URL on every replace AND on unmount. Do not also
  // revoke inside handlePhotoChange; that would double-revoke the same URL.
  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview.url)
      }
    }
  }, [photoPreview])

  function addGoal() {
    setGoals((prev) => [...prev, { id: crypto.randomUUID(), value: '' }])
  }

  function removeGoal(id: string) {
    setGoals((prev) => prev.filter((goal) => goal.id !== id))
  }

  function updateGoal(id: string, value: string) {
    setGoals((prev) => prev.map((goal) => (goal.id === id ? { ...goal, value } : goal)))
  }

  function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    if (!overId) return
    setGoals((prev) => reorderById(prev, String(event.active.id), String(overId), (goal) => goal.id))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPhotoPreview({ url: URL.createObjectURL(file), name: file.name })
  }

  return (
    <Card as="form" action={createCheckinPost} className="flex flex-col gap-3">
      <Label htmlFor="photo">책상 인증 사진</Label>
      <input
        id="photo"
        type="file"
        name="photo"
        accept="image/*"
        required
        onChange={handlePhotoChange}
        className="text-sm file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-foreground hover:file:bg-accent/90"
      />
      {photoPreview && (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoPreview.url}
            alt="선택한 사진 미리보기"
            className="h-20 w-20 rounded object-cover"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400">{photoPreview.name}</span>
        </div>
      )}

      <input type="hidden" name="goalCount" value={goals.length} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={goals.map((goal) => goal.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {goals.map((goal, index) => (
              <SortableItem key={goal.id} id={goal.id} className="flex items-center gap-2">
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
                    <Label htmlFor={`goal-${goal.id}`} className="sr-only">
                      목표 {index + 1}
                    </Label>
                    <Input
                      id={`goal-${goal.id}`}
                      name={`goal-${index}`}
                      placeholder={`목표 ${index + 1}`}
                      value={goal.value}
                      onChange={(e) => updateGoal(goal.id, e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeGoal(goal.id)}
                      className="text-xs text-red-600 dark:text-red-400"
                    >
                      삭제
                    </button>
                  </>
                )}
              </SortableItem>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <Button type="button" variant="secondary" onClick={addGoal} className="self-start">
        + 목표 추가
      </Button>

      <Button type="submit" size="lg" className="self-start">
        10시 인증하기
      </Button>
    </Card>
  )
}
