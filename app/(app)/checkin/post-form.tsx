'use client'

import { useState } from 'react'
import { createCheckinPost } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PostForm() {
  const [goals, setGoals] = useState<string[]>([])

  function addGoal() {
    setGoals((prev) => [...prev, ''])
  }

  function removeGoal(index: number) {
    setGoals((prev) => prev.filter((_, i) => i !== index))
  }

  function updateGoal(index: number, value: string) {
    setGoals((prev) => prev.map((g, i) => (i === index ? value : g)))
  }

  return (
    <Card as="form" action={createCheckinPost} className="flex flex-col gap-3">
      <Label htmlFor="photo">책상 인증 사진</Label>
      <input id="photo" type="file" name="photo" accept="image/*" required className="text-sm" />

      <input type="hidden" name="goalCount" value={goals.length} />

      <div className="flex flex-col gap-2">
        {goals.map((goal, index) => (
          <div key={index} className="flex items-center gap-2">
            <Label htmlFor={`goal-${index}`} className="sr-only">
              목표 {index + 1}
            </Label>
            <Input
              id={`goal-${index}`}
              name={`goal-${index}`}
              placeholder={`목표 ${index + 1}`}
              value={goal}
              onChange={(e) => updateGoal(index, e.target.value)}
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
      </div>

      <Button type="button" variant="secondary" onClick={addGoal} className="self-start">
        + 목표 추가
      </Button>

      <Button type="submit" size="lg" className="self-start">
        10시 인증하기
      </Button>
    </Card>
  )
}
