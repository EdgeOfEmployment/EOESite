# 10시 인증 할일 드래그 순서 변경 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/checkin` 작성 폼과 목표 수정 모드에서 드래그(마우스/터치/키보드)로 할일 순서를 바꿀 수 있게 한다.

**Architecture:** `@dnd-kit`으로 순서 재정렬 UI를 만든다. 재정렬 로직은 `reorderById` 순수 함수로 뽑아 유닛 테스트하고, 드래그 핸들+`useSortable` 배선은 재사용 가능한 `SortableItem` 컴포넌트로 뽑는다. `post-form.tsx`와 `goals-editor.tsx`는 각각 로컬 배열 state에 안정적인 id를 부여하고 이 두 조각을 조합해 드래그 재정렬을 붙인다. 서버 액션/DB 스키마는 변경하지 않는다.

**Tech Stack:** Next.js(App Router, Server Actions), React 19, TypeScript, Tailwind CSS, Vitest + Testing Library, `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities`

**참고 스펙:** `docs/superpowers/specs/2026-09-08-checkin-goal-drag-reorder-design.md`

---

## 파일 구조

- `package.json` — `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` 의존성 추가
- `lib/ui/reorder.ts` (신규) — id 기준으로 배열을 재정렬하는 순수 함수 `reorderById`
- `lib/ui/reorder.test.ts` (신규)
- `components/ui/sortable-item.tsx` (신규) — `useSortable` 배선을 감싼 `SortableItem` 컴포넌트 + `DragHandleIcon`
- `components/ui/sortable-item.test.tsx` (신규)
- `app/(app)/checkin/post-form.tsx` (수정) — `goals` state를 `{ id, value }[]`로 바꾸고 드래그 재정렬 적용
- `app/(app)/checkin/post-form.test.tsx` (수정) — 드래그 핸들 렌더링 테스트 추가
- `app/(app)/checkin/goals-editor.tsx` (수정) — 편집 모드 `draft` state에 `_id`를 부여하고 드래그 재정렬 적용
- `app/(app)/checkin/goals-editor.test.tsx` (수정) — 드래그 핸들 렌더링 테스트 추가

---

### Task 1: dnd-kit 의존성 추가

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 패키지 설치**

Run: `npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`

Expected: `package.json`의 `dependencies`에 세 패키지가 추가되고 `package-lock.json`이 갱신된다.

- [ ] **Step 2: 설치 확인**

Run: `npm ls @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
Expected: 세 패키지 모두 버전과 함께 출력되고 에러(UNMET DEPENDENCY 등)가 없다.

- [ ] **Step 3: 커밋**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: add dnd-kit for drag-to-reorder support

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 2: 재정렬 순수 함수 `reorderById`

**Files:**
- Create: `lib/ui/reorder.ts`
- Test: `lib/ui/reorder.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/ui/reorder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { reorderById } from './reorder'

interface Item {
  id: string
  label: string
}

const items: Item[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
]

describe('reorderById', () => {
  it('moves an item to a later position', () => {
    const result = reorderById(items, 'a', 'c', (item) => item.id)
    expect(result.map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item to an earlier position', () => {
    const result = reorderById(items, 'c', 'a', (item) => item.id)
    expect(result.map((item) => item.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns the same order when activeId equals overId', () => {
    const result = reorderById(items, 'b', 'b', (item) => item.id)
    expect(result).toEqual(items)
  })

  it('returns the original array when an id is not found', () => {
    const result = reorderById(items, 'a', 'missing', (item) => item.id)
    expect(result).toEqual(items)
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run lib/ui/reorder.test.ts`
Expected: FAIL — `Cannot find module './reorder'` (또는 동일한 원인의 import 에러)

- [ ] **Step 3: 최소 구현 작성**

`lib/ui/reorder.ts`:

```ts
import { arrayMove } from '@dnd-kit/sortable'

export function reorderById<T>(
  items: T[],
  activeId: string,
  overId: string,
  getId: (item: T) => string
): T[] {
  if (activeId === overId) return items

  const oldIndex = items.findIndex((item) => getId(item) === activeId)
  const newIndex = items.findIndex((item) => getId(item) === overId)

  if (oldIndex === -1 || newIndex === -1) return items

  return arrayMove(items, oldIndex, newIndex)
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run lib/ui/reorder.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/ui/reorder.ts lib/ui/reorder.test.ts
git commit -m "$(cat <<'EOF'
feat: add reorderById helper for id-based array reordering

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 3: 공용 `SortableItem` 컴포넌트 + 드래그 핸들 아이콘

**Files:**
- Create: `components/ui/sortable-item.tsx`
- Test: `components/ui/sortable-item.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`components/ui/sortable-item.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { DragHandleIcon, SortableItem } from './sortable-item'

describe('SortableItem', () => {
  it('renders children and applies drag listeners to the handle element', () => {
    render(
      <DndContext>
        <SortableContext items={['item-1']}>
          <SortableItem id="item-1">
            {({ attributes, listeners }) => (
              <button type="button" aria-label="순서 변경" {...attributes} {...listeners}>
                <DragHandleIcon />
              </button>
            )}
          </SortableItem>
        </SortableContext>
      </DndContext>
    )

    expect(screen.getByRole('button', { name: '순서 변경' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run components/ui/sortable-item.test.tsx`
Expected: FAIL — `Cannot find module './sortable-item'`

- [ ] **Step 3: 최소 구현 작성**

`components/ui/sortable-item.tsx`:

```tsx
'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" className={className} fill="currentColor">
      <circle cx="7" cy="4" r="1.5" />
      <circle cx="13" cy="4" r="1.5" />
      <circle cx="7" cy="10" r="1.5" />
      <circle cx="13" cy="10" r="1.5" />
      <circle cx="7" cy="16" r="1.5" />
      <circle cx="13" cy="16" r="1.5" />
    </svg>
  )
}

interface SortableHandleProps {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
}

export function SortableItem({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: (handle: SortableHandleProps) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({ attributes, listeners })}
    </div>
  )
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run components/ui/sortable-item.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add components/ui/sortable-item.tsx components/ui/sortable-item.test.tsx
git commit -m "$(cat <<'EOF'
feat: add SortableItem drag-handle wrapper component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 4: 작성 폼(`PostForm`)에 드래그 재정렬 적용

**Files:**
- Modify: `app/(app)/checkin/post-form.tsx`
- Modify: `app/(app)/checkin/post-form.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`app/(app)/checkin/post-form.test.tsx`의 `describe('PostForm', ...)` 블록 안, 마지막 테스트(`'removes a goal field...'`) 뒤에 추가:

```tsx
  it('renders a drag handle for each goal field', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getAllByRole('button', { name: '순서 변경' })).toHaveLength(2)
  })
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "순서 변경"`

- [ ] **Step 3: `post-form.tsx`를 아래 내용으로 교체**

`app/(app)/checkin/post-form.tsx` 전체를 다음으로 교체:

```tsx
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
```

- [ ] **Step 4: 전체 파일 테스트 실행해서 통과 확인**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: PASS (모든 기존 테스트 + 새 드래그 핸들 테스트)

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/checkin/post-form.tsx app/\(app\)/checkin/post-form.test.tsx
git commit -m "$(cat <<'EOF'
feat: allow drag-to-reorder goals when creating a checkin post

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 5: 수정 모드(`GoalsEditor`)에 드래그 재정렬 적용

**Files:**
- Modify: `app/(app)/checkin/goals-editor.tsx`
- Modify: `app/(app)/checkin/goals-editor.test.tsx`

- [ ] **Step 1: 실패하는 테스트 추가**

`app/(app)/checkin/goals-editor.test.tsx`의 `'removes an item when its delete button is clicked'` 테스트 뒤에 추가:

```tsx
  it('renders a drag handle for each goal in edit mode', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getAllByRole('button', { name: '순서 변경' })).toHaveLength(2)
  })
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run app/\(app\)/checkin/goals-editor.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "순서 변경"`

- [ ] **Step 3: `goals-editor.tsx`를 아래 내용으로 교체**

`app/(app)/checkin/goals-editor.tsx` 전체를 다음으로 교체:

```tsx
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
import type { CheckinGoal } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { toggleGoalCompleted, updateCheckinGoals } from './actions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DragHandleIcon, SortableItem } from '@/components/ui/sortable-item'
import { reorderById } from '@/lib/ui/reorder'

type DraftGoal = CheckinGoal & { _id: string }

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
    setDraft((prev) => [...prev, { body: '', completed: false, completedAt: null, _id: crypto.randomUUID() }])
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
```

- [ ] **Step 4: 전체 파일 테스트 실행해서 통과 확인**

Run: `npx vitest run app/\(app\)/checkin/goals-editor.test.tsx`
Expected: PASS (모든 기존 테스트 + 새 드래그 핸들 테스트)

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/checkin/goals-editor.tsx app/\(app\)/checkin/goals-editor.test.tsx
git commit -m "$(cat <<'EOF'
feat: allow drag-to-reorder goals when editing a checkin post

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 6: 전체 검증

**Files:** (읽기 전용 — 코드 변경 없음)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: 모든 테스트 PASS, 실패 0건

- [ ] **Step 2: lint 실행**

Run: `npm run lint`
Expected: 에러 0건 (기존에 알려진 무관한 lint 경고가 있다면 그대로 두고 새로 추가된 파일에서만 경고가 없는지 확인)

- [ ] **Step 3: 프로덕션 빌드로 타입 에러 확인**

Run: `npm run build`
Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 4: 개발 서버에서 수동 확인**

Run: `npm run dev`

브라우저에서 `/checkin` 접속 후:
- 작성 폼에서 목표를 3개 이상 추가하고, 각 항목의 드래그 핸들(점 6개 아이콘)을 마우스로 드래그해 순서를 바꿔본다.
- 제출 후 게시물에 저장된 순서가 드래그로 바꾼 순서와 일치하는지 확인한다.
- 본인이 작성한 게시물에서 "수정"을 눌러 편집 모드로 들어가 드래그로 순서를 바꾸고, "저장"을 누른 뒤 화면에 반영되는지 확인한다. "취소"를 누르면 순서 변경이 되돌아가는지도 확인한다.
- 개발자 도구로 모바일 뷰(터치)로 전환해 핸들을 터치 드래그로 순서를 바꿀 수 있는지 확인한다.

개발 서버는 확인 후 종료한다.
