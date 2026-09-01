'use client'

import { useEffect, useState } from 'react'
import { createCheckinPost } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface PhotoPreview {
  url: string
  name: string
}

export function PostForm() {
  const [goals, setGoals] = useState<string[]>([])
  const [photoPreview, setPhotoPreview] = useState<PhotoPreview | null>(null)

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
    setGoals((prev) => [...prev, ''])
  }

  function removeGoal(index: number) {
    setGoals((prev) => prev.filter((_, i) => i !== index))
  }

  function updateGoal(index: number, value: string) {
    setGoals((prev) => prev.map((g, i) => (i === index ? value : g)))
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
