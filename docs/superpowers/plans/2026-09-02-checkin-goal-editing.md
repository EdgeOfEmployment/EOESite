# 10시 인증 할일(목표) 수정 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10시 인증 게시물의 작성자가 게시 후에도 목표(할일) 텍스트를 수정하고 항목을 추가/삭제할 수 있게 한다.

**Architecture:** `app/(app)/checkin/post-card.tsx`의 목표 렌더링 블록을 새 클라이언트 컴포넌트 `goals-editor.tsx`로 분리하고, 편집 모드(로컬 state)를 추가한다. 저장 시 새 서버 액션 `updateCheckinGoals`를 직접(폼이 아닌 함수 호출로) 실행해 `checkin_posts.goals`를 통째로 갱신한다.

**Tech Stack:** Next.js App Router, React (client component + server action), Supabase, Vitest + Testing Library.

참고 설계 문서: `docs/superpowers/specs/2026-09-02-checkin-goal-editing-design.md`

---

### Task 1: 서버 액션 `updateCheckinGoals` 추가

**Files:**
- Modify: `app/(app)/checkin/actions.ts`
- Test: `app/(app)/checkin/actions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`app/(app)/checkin/actions.test.ts`의 import 줄을 다음으로 교체한다:

```ts
import {
  createCheckinPost,
  addComment,
  toggleReaction,
  toggleGoalCompleted,
  updateCheckinGoals,
  deleteCheckinPost,
} from './actions'
```

`describe('deleteCheckinPost', ...)` 블록 바로 앞에 아래 블록을 추가한다:

```ts
describe('updateCheckinGoals', () => {
  function mockPost(authorId = 'user-1') {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq: updateEq }))

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_posts') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { author_id: authorId }, error: null }) }),
        }),
        update,
      }
    })

    return { update, updateEq }
  }

  function buildGoalsFormData(
    goals: { body: string; completed?: boolean; completedAt?: string | null }[]
  ) {
    const formData = new FormData()
    formData.set('goalCount', String(goals.length))
    goals.forEach((g, i) => {
      formData.set(`goal-${i}`, g.body)
      formData.set(`completed-${i}`, g.completed ? 'true' : 'false')
      formData.set(`completedAt-${i}`, g.completedAt ?? '')
    })
    return formData
  }

  it('updates the goals for the post author', async () => {
    const { update, updateEq } = mockPost()
    const formData = buildGoalsFormData([
      { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
      { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [
        { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
        { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
      ],
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('skips blank goal text', async () => {
    const { update } = mockPost()
    const formData = buildGoalsFormData([{ body: '알고리즘 3문제 풀기' }, { body: '   ' }])

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
    })
  })

  it('throws when the caller is not the post author', async () => {
    mockPost('other-user')
    const formData = buildGoalsFormData([{ body: '알고리즘 3문제 풀기' }])

    await expect(updateCheckinGoals('post-1', formData)).rejects.toThrow('권한이 없습니다')
  })
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run app/\(app\)/checkin/actions.test.ts`
Expected: FAIL — `updateCheckinGoals` is not exported from `./actions`

- [ ] **Step 3: 최소 구현 작성**

`app/(app)/checkin/actions.ts`의 `toggleGoalCompleted` 함수와 `deleteCheckinPost` 함수 사이에 다음 함수를 추가한다:

```ts
export async function updateCheckinGoals(postId: string, formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: post, error: fetchError } = await supabase
    .from('checkin_posts')
    .select('author_id')
    .eq('id', postId)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!post || post.author_id !== user.id) throw new Error('권한이 없습니다')

  const goalCount = Number(formData.get('goalCount') ?? '0')
  const goals: CheckinGoal[] = []
  for (let i = 0; i < goalCount; i++) {
    const body = ((formData.get(`goal-${i}`) as string) || '').trim()
    if (!body) continue

    const completed = formData.get(`completed-${i}`) === 'true'
    const completedAt = completed ? ((formData.get(`completedAt-${i}`) as string) || null) : null
    goals.push({ body, completed, completedAt })
  }

  const { error } = await supabase.from('checkin_posts').update({ goals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run app/\(app\)/checkin/actions.test.ts`
Expected: PASS (전체 `actions.test.ts` 스위트)

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/checkin/actions.ts app/\(app\)/checkin/actions.test.ts
git commit -m "feat: add updateCheckinGoals server action"
```

---

### Task 2: `GoalsEditor` 클라이언트 컴포넌트 작성

**Files:**
- Create: `app/(app)/checkin/goals-editor.tsx`
- Test: `app/(app)/checkin/goals-editor.test.tsx`

- [ ] **Step 1: 실패하는 테스트 작성**

`app/(app)/checkin/goals-editor.test.tsx`를 새로 만든다:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const toggleGoalCompletedMock = vi.fn()
const updateCheckinGoalsMock = vi.fn().mockResolvedValue(undefined)

vi.mock('./actions', () => ({
  toggleGoalCompleted: (...args: unknown[]) => toggleGoalCompletedMock(...args),
  updateCheckinGoals: (...args: unknown[]) => updateCheckinGoalsMock(...args),
}))

import { GoalsEditor } from './goals-editor'
import type { CheckinGoal } from '@/lib/checkin/types'

const goals: CheckinGoal[] = [
  { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
  { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
]

describe('GoalsEditor', () => {
  it('renders goals with completion state and completion time', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('완료 오전 11:00')).toBeInTheDocument()
  })

  it('lets the author toggle a goal via the existing action', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '알고리즘 3문제 풀기' }))
  })

  it('shows an edit button for the author', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
  })

  it('does not show an edit button for a non-author viewer', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={false} />)
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  })

  it('enters edit mode with text inputs when the edit button is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getByDisplayValue('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByDisplayValue('이력서 초안 작성')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('adds a new empty input when "+ 항목 추가" is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 항목 추가' }))

    expect(screen.getByPlaceholderText('목표 3')).toBeInTheDocument()
  })

  it('removes an item when its delete button is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByDisplayValue('알고리즘 3문제 풀기')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('이력서 초안 작성')).toBeInTheDocument()
  })

  it('discards changes and exits edit mode when "취소" is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByDisplayValue('알고리즘 3문제 풀기'), {
      target: { value: '바뀐 텍스트' },
    })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.queryByText('바뀐 텍스트')).not.toBeInTheDocument()
  })

  it('saves edited goals with completion state preserved', async () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.change(screen.getByDisplayValue('알고리즘 3문제 풀기'), {
      target: { value: '알고리즘 5문제 풀기' },
    })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    await waitFor(() => expect(updateCheckinGoalsMock).toHaveBeenCalledTimes(1))

    const [postId, formData] = updateCheckinGoalsMock.mock.calls[0] as [string, FormData]
    expect(postId).toBe('post-1')
    expect(formData.get('goalCount')).toBe('2')
    expect(formData.get('goal-0')).toBe('알고리즘 5문제 풀기')
    expect(formData.get('completed-0')).toBe('false')
    expect(formData.get('goal-1')).toBe('이력서 초안 작성')
    expect(formData.get('completed-1')).toBe('true')
    expect(formData.get('completedAt-1')).toBe('2026-08-10T02:00:00.000Z')

    await waitFor(() => expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 테스트 실행하여 실패 확인**

Run: `npx vitest run app/\(app\)/checkin/goals-editor.test.tsx`
Expected: FAIL — `./goals-editor` 모듈을 찾을 수 없음

- [ ] **Step 3: 구현 작성**

`app/(app)/checkin/goals-editor.tsx`를 새로 만든다:

```tsx
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
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run app/\(app\)/checkin/goals-editor.test.tsx`
Expected: PASS (전체 스위트)

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/checkin/goals-editor.tsx app/\(app\)/checkin/goals-editor.test.tsx
git commit -m "feat: add GoalsEditor with inline goal editing"
```

---

### Task 3: `PostCard`에 `GoalsEditor` 연결

**Files:**
- Modify: `app/(app)/checkin/post-card.tsx:1-4, 42-67`
- Modify: `app/(app)/checkin/post-card.test.tsx:4-9`

- [ ] **Step 1: `post-card.test.tsx` 목 갱신**

`app/(app)/checkin/post-card.test.tsx` 상단의 mock을 다음으로 교체한다 (`updateCheckinGoals` 추가):

```ts
vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  toggleGoalCompleted: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))
```

기존 테스트 케이스들(목표 텍스트/토글 버튼/완료 시각 표시 관련 단언 포함)은 그대로 둔다 — `PostCard`가 `GoalsEditor`를 통해 동일한 마크업을 렌더링하므로 변경 없이 통과해야 한다.

- [ ] **Step 2: 리팩터링 전 베이스라인 확인**

Run: `npx vitest run app/\(app\)/checkin/post-card.test.tsx`
Expected: PASS — 이 태스크는 마크업을 옮기기만 하는 리팩터링이라 이 시점엔 기존 코드로도 통과한다. 리팩터링 후(Step 4)에도 동일하게 PASS해야 한다.

- [ ] **Step 3: `post-card.tsx`에서 `GoalsEditor` 사용**

`app/(app)/checkin/post-card.tsx` 상단 import를 교체한다:

```tsx
import { REACTION_EMOJIS, type CheckinPost } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { addComment, toggleReaction, deleteCheckinPost } from './actions'
import { Card } from '@/components/ui/card'
import { GoalsEditor } from './goals-editor'
```

목표 렌더링 블록(기존 42~67행, `{post.goals.length > 0 && ( ... )}` 전체)을 다음으로 교체한다:

```tsx
      <GoalsEditor postId={post.id} goals={post.goals} isAuthor={isAuthor} />
```

- [ ] **Step 4: 테스트 실행하여 통과 확인**

Run: `npx vitest run app/\(app\)/checkin/post-card.test.tsx app/\(app\)/checkin/goals-editor.test.tsx app/\(app\)/checkin/actions.test.ts`
Expected: PASS (세 파일 모두)

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/checkin/post-card.tsx app/\(app\)/checkin/post-card.test.tsx
git commit -m "refactor: wire GoalsEditor into PostCard"
```

---

### Task 4: 전체 검증 및 푸시

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npx vitest run`
Expected: 모든 테스트 PASS. 실패가 있다면 원인을 파악해 수정 후 재실행한다 (스트레이 워크트리로 인한 오탐 가능성은 `git worktree list`로 먼저 배제할 것).

- [ ] **Step 2: 타입 체크 및 린트**

Run: `npx tsc --noEmit`
Run: `npx eslint app/\(app\)/checkin`
Expected: 에러 없음.

- [ ] **Step 3: 최종 커밋 상태 확인 후 푸시**

```bash
git status
git push
```
Expected: 로컬 브랜치가 원격과 동기화됨.
