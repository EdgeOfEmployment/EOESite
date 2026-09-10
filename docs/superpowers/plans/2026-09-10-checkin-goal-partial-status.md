# 10시 인증 할일 반완료(세모) 상태 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/checkin` 목표(할일)에 미완료(☐)/반완료(△)/완료(☑) 3단계 상태를 추가하고, 작성자가 체크리스트 뷰에서 직접 상태를 지정할 수 있게 한다.

**Architecture:** `CheckinGoal.completed: boolean`을 `CheckinGoal.status: 'todo' | 'partial' | 'done'`로 교체한다. 서버 액션 `toggleGoalCompleted`(토글)를 `setGoalStatus(postId, goalIndex, status)`(명시적 지정)로 바꾸고, `GoalsEditor`의 체크리스트 뷰에 상태별 버튼 3개를 렌더링한다. 편집(텍스트/순서) 모드는 변경하지 않는다. 기존에 저장된 게시물은 1회성 SQL 데이터 마이그레이션으로 변환한다.

**Tech Stack:** Next.js(App Router, Server Actions), React 19, TypeScript, Tailwind CSS, Supabase(Postgres jsonb), Vitest + Testing Library

**참고 스펙:** `docs/superpowers/specs/2026-09-10-checkin-goal-partial-status-design.md`

---

## 파일 구조

- `lib/checkin/types.ts` (수정) — `CheckinGoalStatus` 타입 추가, `CheckinGoal.completed` → `status`로 교체
- `app/(app)/checkin/actions.ts` (수정) — `createCheckinPost`/`updateCheckinGoals`가 `status` 필드를 다루도록 변경, `toggleGoalCompleted` → `setGoalStatus`로 교체
- `app/(app)/checkin/actions.test.ts` (수정)
- `supabase/migrations/0014_checkin_goal_status.sql` (신규) — 기존 게시물의 `completed` boolean을 `status` 문자열로 일괄 변환하는 1회성 데이터 마이그레이션
- `app/(app)/checkin/goals-editor.tsx` (수정) — 체크리스트 뷰에 상태별 3버튼 컨트롤(`GoalStatusControl`) 추가, `buildGoalsFormData`가 `status` 필드를 보내도록 변경
- `app/(app)/checkin/goals-editor.test.tsx` (수정)
- `app/(app)/checkin/post-card.test.tsx` (수정) — 목표 픽스처/모킹을 `status` 기반으로 교체
- `app/(app)/checkin/page.test.tsx` (수정) — 목표 픽스처를 `status` 기반으로 교체

---

### Task 1: `CheckinGoal` 타입에 `status` 도입

**Files:**
- Modify: `lib/checkin/types.ts`

- [ ] **Step 1: 타입 교체**

`lib/checkin/types.ts`의 `CheckinGoal` 인터페이스 부분을 다음으로 교체:

```ts
export type CheckinGoalStatus = 'todo' | 'partial' | 'done'

export interface CheckinGoal {
  body: string
  status: CheckinGoalStatus
  completedAt: string | null
}
```

파일 전체는 다음과 같아야 한다:

```ts
export const REACTION_EMOJIS = ['👍', '🎉', '💪'] as const

export type CheckinGoalStatus = 'todo' | 'partial' | 'done'

export interface CheckinGoal {
  body: string
  status: CheckinGoalStatus
  completedAt: string | null
}

export interface CheckinComment {
  id: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface CheckinReaction {
  id: string
  authorId: string
  emoji: string
}

export interface CheckinPost {
  id: string
  authorId: string
  authorName: string
  photoUrl: string
  goals: CheckinGoal[]
  createdAt: string
  isLate: boolean
  fineAmount: number
  comments: CheckinComment[]
  reactions: CheckinReaction[]
}
```

- [ ] **Step 2: 커밋**

이 시점에는 `actions.ts`, `goals-editor.tsx` 등이 아직 옛 `completed` 필드를 참조하고 있어 타입 에러가 발생한다. 이는 Task 2, 4에서 해소되므로 지금은 커밋만 한다.

```bash
git add lib/checkin/types.ts
git commit -m "$(cat <<'EOF'
feat: replace CheckinGoal.completed with a 3-state status field

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 2: 서버 액션 (`setGoalStatus`, `createCheckinPost`, `updateCheckinGoals`)

**Files:**
- Modify: `app/(app)/checkin/actions.ts`
- Modify: `app/(app)/checkin/actions.test.ts`

- [ ] **Step 1: `actions.test.ts`를 아래 내용으로 전체 교체 (실패하는 테스트 포함)**

`app/(app)/checkin/actions.test.ts` 전체를 다음으로 교체:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { CheckinGoalStatus } from '@/lib/checkin/types'

const getClaimsMock = vi.fn()
const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
    from: fromMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import {
  createCheckinPost,
  addComment,
  toggleReaction,
  setGoalStatus,
  updateCheckinGoals,
  deleteCheckinPost,
} from './actions'

function buildFormData(fields: Record<string, FormDataEntryValue>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
  uploadMock.mockResolvedValue({ error: null })
  getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://example.com/photo.jpg' } })
  insertMock.mockResolvedValue({ error: null })
  fromMock.mockReturnValue({ insert: insertMock })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createCheckinPost', () => {
  it('redirects with an error when no photo is provided', async () => {
    const formData = buildFormData({ goalCount: '0' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/checkin?error=' + encodeURIComponent('책상 인증 사진을 첨부해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates a post with no goals when goalCount is 0', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'))
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({ photo, goalCount: '0' })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      photo_url: 'https://example.com/photo.jpg',
      goals: [],
      is_late: false,
      fine_amount: 0,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(redirectMock).toHaveBeenCalledWith('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
  })

  it('strips spaces and non-ASCII characters from the filename before uploading', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T00:00:00.000Z'))
    const photo = new File(['fake-image-bytes'], '스크린샷 2026-08-14 143253.png', { type: 'image/png' })
    const formData = buildFormData({ photo, goalCount: '0' })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(uploadMock).toHaveBeenCalledWith('user-1/1786320000000.png', photo)
  })

  it('inserts non-empty goals with status "todo" and skips blank ones, and computes the late fine', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T01:05:00.000Z')) // 10:05 KST -> late, +1000
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({
      photo,
      goalCount: '2',
      'goal-0': '알고리즘 3문제 풀기',
      'goal-1': '   ',
    })

    await expect(createCheckinPost(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      photo_url: 'https://example.com/photo.jpg',
      goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
      is_late: true,
      fine_amount: 11000,
    })
  })
})

describe('addComment', () => {
  it('redirects with an error when the comment body is empty', async () => {
    const formData = new FormData()
    formData.set('body', '')

    await expect(addComment('post-1', formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/checkin?error=' + encodeURIComponent('댓글 내용을 입력해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts the comment and revalidates the checkin feed', async () => {
    const formData = new FormData()
    formData.set('body', '축하해요')

    await addComment('post-1', formData)

    expect(insertMock).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', body: '축하해요' })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })
})

describe('toggleReaction', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_reactions') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
            }),
          }),
        }),
        insert,
        delete: () => ({ eq: deleteEq }),
      }
    })

    return { deleteEq, insert }
  }

  it('inserts a reaction when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleReaction('post-1', '👍')

    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', emoji: '👍' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('deletes the existing reaction when the user already reacted', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'reaction-1' })

    await toggleReaction('post-1', '👍')

    expect(deleteEq).toHaveBeenCalledWith('id', 'reaction-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('setGoalStatus', () => {
  function mockPost(goals: { body: string; status: CheckinGoalStatus; completedAt: string | null }[], authorId = 'user-1') {
    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq: updateEq }))

    fromMock.mockImplementation((table: string) => {
      if (table !== 'checkin_posts') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({ single: async () => ({ data: { author_id: authorId, goals }, error: null }) }),
        }),
        update,
      }
    })

    return { update, updateEq }
  }

  it('sets status to done and stamps completedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z'))
    const { update, updateEq } = mockPost([{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }])

    await setGoalStatus('post-1', 0, 'done')

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' }],
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('sets status to partial without stamping completedAt', async () => {
    const { update } = mockPost([{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }])

    await setGoalStatus('post-1', 0, 'partial')

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', status: 'partial', completedAt: null }],
    })
  })

  it('clears completedAt when moving away from done', async () => {
    const { update } = mockPost([
      { body: '알고리즘 3문제 풀기', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await setGoalStatus('post-1', 0, 'todo')

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
    })
  })

  it('throws for an unrecognized status value', async () => {
    await expect(
      setGoalStatus('post-1', 0, 'bogus' as unknown as CheckinGoalStatus)
    ).rejects.toThrow('잘못된 상태입니다')
  })

  it('throws when the caller is not the post author', async () => {
    mockPost([{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }], 'other-user')

    await expect(setGoalStatus('post-1', 0, 'done')).rejects.toThrow('권한이 없습니다')
  })
})

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
    goals: { body: string; status?: CheckinGoalStatus; completedAt?: string | null }[]
  ) {
    const formData = new FormData()
    formData.set('goalCount', String(goals.length))
    goals.forEach((g, i) => {
      formData.set(`goal-${i}`, g.body)
      formData.set(`status-${i}`, g.status ?? 'todo')
      formData.set(`completedAt-${i}`, g.completedAt ?? '')
    })
    return formData
  }

  it('updates the goals for the post author, preserving each status', async () => {
    const { update, updateEq } = mockPost()
    const formData = buildGoalsFormData([
      { body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null },
      { body: '영어 단어 20개 외우기', status: 'partial', completedAt: null },
      { body: '이력서 초안 작성', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [
        { body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null },
        { body: '영어 단어 20개 외우기', status: 'partial', completedAt: null },
        { body: '이력서 초안 작성', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' },
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
      goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
    })
  })

  it('falls back to todo and drops completedAt for an unrecognized status value', async () => {
    const { update } = mockPost()
    const formData = new FormData()
    formData.set('goalCount', '1')
    formData.set('goal-0', '알고리즘 3문제 풀기')
    formData.set('status-0', 'bogus')
    formData.set('completedAt-0', '2026-08-10T02:00:00.000Z')

    await updateCheckinGoals('post-1', formData)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
    })
  })

  it('throws when the caller is not the post author', async () => {
    mockPost('other-user')
    const formData = buildGoalsFormData([{ body: '알고리즘 3문제 풀기' }])

    await expect(updateCheckinGoals('post-1', formData)).rejects.toThrow('권한이 없습니다')
  })
})

describe('deleteCheckinPost', () => {
  function mockAdminCheck(role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      if (table === 'checkin_posts') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the post when the caller is an admin', async () => {
    const { deleteEq } = mockAdminCheck('admin')

    await deleteCheckinPost('post-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('throws when the caller is not an admin', async () => {
    const { deleteEq } = mockAdminCheck('member')

    await expect(deleteCheckinPost('post-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: FAIL — `setGoalStatus` is not exported from `./actions`, 그리고 남아있는 `completed` 기반 어설션들이 실제 `status` 필드와 맞지 않아 다수 실패.

- [ ] **Step 3: `actions.ts`를 아래 내용으로 전체 교체**

`app/(app)/checkin/actions.ts` 전체를 다음으로 교체:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeLateFine } from '@/lib/checkin/time'
import type { CheckinGoal, CheckinGoalStatus } from '@/lib/checkin/types'
import { getVerifiedUser } from '@/lib/auth/verify'

// Supabase Storage rejects keys containing spaces or non-ASCII characters
// (e.g. Korean screenshot filenames like "스크린샷 2026-08-14 143253.png"),
// so the original filename can't be used as-is in the upload path.
function resolveExtension(fileName: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return match ? `.${match[1]}` : ''
}

const GOAL_STATUSES: CheckinGoalStatus[] = ['todo', 'partial', 'done']

function isGoalStatus(value: unknown): value is CheckinGoalStatus {
  return typeof value === 'string' && (GOAL_STATUSES as string[]).includes(value)
}

export async function createCheckinPost(formData: FormData) {
  const photo = formData.get('photo') as File | null
  const goalCount = Number(formData.get('goalCount') ?? '0')

  const goals: CheckinGoal[] = []
  for (let i = 0; i < goalCount; i++) {
    const body = ((formData.get(`goal-${i}`) as string) || '').trim()
    if (body) {
      goals.push({ body, status: 'todo', completedAt: null })
    }
  }

  if (!photo || photo.size === 0) {
    redirect('/checkin?error=' + encodeURIComponent('책상 인증 사진을 첨부해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const path = `${user.id}/${Date.now()}${resolveExtension(photo.name)}`
  const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(path, photo)

  if (uploadError) {
    redirect('/checkin?error=' + encodeURIComponent(uploadError.message))
    return
  }

  const { data: publicUrlData } = supabase.storage.from('checkin-photos').getPublicUrl(path)
  const photoUrl = publicUrlData.publicUrl

  const { isLate, fineAmount } = computeLateFine(new Date().toISOString())

  const { error } = await supabase.from('checkin_posts').insert({
    author_id: user.id,
    photo_url: photoUrl,
    goals,
    is_late: isLate,
    fine_amount: fineAmount,
  })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/checkin')
  revalidatePath('/')
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
}

export async function addComment(postId: string, formData: FormData) {
  const body = formData.get('body') as string

  if (!body) {
    redirect('/checkin?error=' + encodeURIComponent('댓글 내용을 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) {
    redirect('/login')
    return
  }

  const { error } = await supabase
    .from('checkin_comments')
    .insert({ post_id: postId, author_id: user.id, body })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/checkin')
}

export async function toggleReaction(postId: string, emoji: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('checkin_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('author_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('checkin_reactions').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('checkin_reactions')
      .insert({ post_id: postId, author_id: user.id, emoji })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/checkin')
}

export async function setGoalStatus(postId: string, goalIndex: number, status: CheckinGoalStatus) {
  if (!isGoalStatus(status)) throw new Error('잘못된 상태입니다')

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: post, error: fetchError } = await supabase
    .from('checkin_posts')
    .select('author_id, goals')
    .eq('id', postId)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  if (!post || post.author_id !== user.id) throw new Error('권한이 없습니다')

  const goals = (post.goals ?? []) as CheckinGoal[]
  const goal = goals[goalIndex]
  if (!goal) throw new Error('목표를 찾을 수 없습니다')

  const updatedGoals = goals.map((g, i) =>
    i === goalIndex
      ? { ...g, status, completedAt: status === 'done' ? new Date().toISOString() : null }
      : g
  )

  const { error } = await supabase.from('checkin_posts').update({ goals: updatedGoals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function updateCheckinGoals(postId: string, formData: FormData) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

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

    const statusRaw = formData.get(`status-${i}`)
    const status: CheckinGoalStatus = isGoalStatus(statusRaw) ? statusRaw : 'todo'
    const completedAt = status === 'done' ? ((formData.get(`completedAt-${i}`) as string) || null) : null
    goals.push({ body, status, completedAt })
  }

  const { error } = await supabase.from('checkin_posts').update({ goals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function deleteCheckinPost(postId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase.from('checkin_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: PASS (모든 테스트)

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "$(cat <<'EOF'
feat: replace goal completion toggle with explicit 3-state status action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 3: 기존 데이터 마이그레이션

**Files:**
- Create: `supabase/migrations/0014_checkin_goal_status.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0014_checkin_goal_status.sql`:

```sql
-- Data-only migration: existing checkin_posts.goals entries only have a
-- `completed: boolean` field. Convert them to the new `status` string
-- ('todo' | 'partial' | 'done') so the app's runtime code (which no longer
-- reads `completed`) keeps working for posts created before this change.
update checkin_posts
set goals = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'body', g->>'body',
        'status', case when (g->>'completed')::boolean then 'done' else 'todo' end,
        'completedAt', g->'completedAt'
      )
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(goals) as g
)
where goals is not null and jsonb_array_length(goals) > 0;
```

- [ ] **Step 2: 로컬 Supabase에 적용해 확인 (Supabase CLI가 설정되어 있다면)**

Run: `npx supabase db reset` (로컬 개발 DB를 마이그레이션 전체로 재구성)
Expected: 에러 없이 완료. 에러가 나거나 Supabase CLI가 이 환경에 설정되어 있지 않다면 이 단계는 건너뛰고 다음 커밋으로 진행한다 — 마이그레이션 SQL 자체는 배포 시 프로덕션 Supabase에 적용된다.

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0014_checkin_goal_status.sql
git commit -m "$(cat <<'EOF'
chore: migrate existing checkin goal data from completed to status

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 4: `GoalsEditor` 체크리스트 뷰에 3단계 상태 컨트롤 추가

**Files:**
- Modify: `app/(app)/checkin/goals-editor.tsx`
- Modify: `app/(app)/checkin/goals-editor.test.tsx`

- [ ] **Step 1: `goals-editor.test.tsx`를 아래 내용으로 전체 교체 (실패하는 테스트 포함)**

`app/(app)/checkin/goals-editor.test.tsx` 전체를 다음으로 교체:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const setGoalStatusMock = vi.fn()
const updateCheckinGoalsMock = vi.fn().mockResolvedValue(undefined)

vi.mock('./actions', () => ({
  setGoalStatus: (...args: unknown[]) => setGoalStatusMock(...args),
  updateCheckinGoals: (...args: unknown[]) => updateCheckinGoalsMock(...args),
}))

import { GoalsEditor } from './goals-editor'
import type { CheckinGoal } from '@/lib/checkin/types'

const goals: CheckinGoal[] = [
  { body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null },
  { body: '이력서 초안 작성', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' },
]

describe('GoalsEditor', () => {
  it('renders goals with completion state and completion time', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('완료 오전 11:00')).toBeInTheDocument()
  })

  it('renders three status buttons per goal for the author', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    expect(screen.getAllByRole('button', { name: '미완료로 표시' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '반완료로 표시' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '완료로 표시' })).toHaveLength(2)
  })

  it('does not render status buttons for a non-author viewer', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={false} />)

    expect(screen.queryByRole('button', { name: '완료로 표시' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '반완료로 표시' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '미완료로 표시' })).not.toBeInTheDocument()
  })

  it('calls setGoalStatus with the target status when a status button is clicked', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getAllByRole('button', { name: '반완료로 표시' })[0])

    expect(setGoalStatusMock).toHaveBeenCalledWith('post-1', 0, 'partial')
  })

  it('shows partial goals in muted text without a strikethrough or time label', () => {
    const partialGoals: CheckinGoal[] = [{ body: '영어 단어 20개 외우기', status: 'partial', completedAt: null }]
    render(<GoalsEditor postId="post-1" goals={partialGoals} isAuthor={true} />)

    const text = screen.getByText('영어 단어 20개 외우기')
    expect(text).toHaveClass('text-gray-400')
    expect(text).not.toHaveClass('line-through')
    expect(screen.queryByText(/완료 /)).not.toBeInTheDocument()
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

  it('renders a drag handle for each goal in edit mode', () => {
    render(<GoalsEditor postId="post-1" goals={goals} isAuthor={true} />)

    fireEvent.click(screen.getByRole('button', { name: '수정' }))

    expect(screen.getAllByRole('button', { name: '순서 변경' })).toHaveLength(2)
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

  it('saves edited goals with status and completedAt preserved', async () => {
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
    expect(formData.get('status-0')).toBe('todo')
    expect(formData.get('goal-1')).toBe('이력서 초안 작성')
    expect(formData.get('status-1')).toBe('done')
    expect(formData.get('completedAt-1')).toBe('2026-08-10T02:00:00.000Z')

    await waitFor(() => expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run "app/(app)/checkin/goals-editor.test.tsx"`
Expected: FAIL — `setGoalStatus` is not exported from `./actions`, 상태 버튼(`미완료로 표시` 등)을 찾지 못해 여러 테스트 실패.

- [ ] **Step 3: `goals-editor.tsx`를 아래 내용으로 전체 교체**

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
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run "app/(app)/checkin/goals-editor.test.tsx"`
Expected: PASS (모든 테스트)

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/checkin/goals-editor.tsx" "app/(app)/checkin/goals-editor.test.tsx"
git commit -m "$(cat <<'EOF'
feat: add a 3-state status control to the checkin goal checklist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0199N9dFgZXAkS9TzCufPvK4
EOF
)"
```

---

### Task 5: 나머지 테스트 픽스처를 `status` 기반으로 정리

**Files:**
- Modify: `app/(app)/checkin/post-card.test.tsx`
- Modify: `app/(app)/checkin/page.test.tsx`

`post-card.tsx`와 `page.tsx` 자체는 `completed` 필드를 직접 읽지 않으므로(각각 `GoalsEditor`에 위임하거나 타입 캐스팅만 함) 변경할 코드가 없다. 테스트 픽스처/모킹만 새 타입에 맞춘다.

- [ ] **Step 1: `post-card.test.tsx` 수정**

`app/(app)/checkin/post-card.test.tsx`에서 `vi.mock('./actions', ...)` 블록을:

```ts
vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  toggleGoalCompleted: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))
```

다음으로 교체:

```ts
vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  setGoalStatus: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))
```

`post` 픽스처의 `goals` 배열을:

```ts
  goals: [
    { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
    { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
  ],
```

다음으로 교체:

```ts
  goals: [
    { body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null },
    { body: '이력서 초안 작성', status: 'done', completedAt: '2026-08-10T02:00:00.000Z' },
  ],
```

`'lets the author toggle their own goal completion'` 테스트를:

```ts
  it('lets the author toggle their own goal completion', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '알고리즘 3문제 풀기' })).toBeInTheDocument()
  })
```

다음으로 교체:

```ts
  it('lets the author change their own goal status', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getAllByRole('button', { name: '완료로 표시' })).toHaveLength(2)
  })
```

`'does not render a toggle button for a non-author viewer'` 테스트를:

```ts
  it('does not render a toggle button for a non-author viewer', () => {
    render(<PostCard post={post} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '알고리즘 3문제 풀기' })).not.toBeInTheDocument()
  })
```

다음으로 교체:

```ts
  it('does not render status buttons for a non-author viewer', () => {
    render(<PostCard post={post} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '완료로 표시' })).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: `page.test.tsx` 수정**

`app/(app)/checkin/page.test.tsx`의 `posts` 픽스처에서:

```ts
    goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
```

다음으로 교체:

```ts
    goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
```

- [ ] **Step 3: 두 파일 테스트 실행해서 통과 확인**

Run: `npx vitest run "app/(app)/checkin/post-card.test.tsx" "app/(app)/checkin/page.test.tsx"`
Expected: PASS (모든 테스트)

- [ ] **Step 4: 커밋**

```bash
git add "app/(app)/checkin/post-card.test.tsx" "app/(app)/checkin/page.test.tsx"
git commit -m "$(cat <<'EOF'
test: update checkin goal fixtures for the new status field

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
Expected: 에러 0건. `app/(app)/feedback/[id]/feedback-lines.tsx`의 기존 무관 lint 에러 1건은 이번 작업 범위 밖이므로 그대로 둔다.

- [ ] **Step 3: 프로덕션 빌드로 타입 에러 확인**

Run: `npm run build`
Expected: 타입 에러 없이 빌드 성공

- [ ] **Step 4: 개발 서버에서 수동 확인 (로그인 가능한 사람이 진행)**

Run: `npm run dev`

브라우저에서 `/checkin` 접속 후 로그인한 상태로:
- 본인이 작성한 게시물에서 목표 옆에 ☐ △ ☑ 세 버튼이 나란히 보이는지 확인한다.
- △(반완료)를 클릭하면 텍스트가 취소선 없이 회색으로 바뀌고, 시간 라벨은 나타나지 않는지 확인한다.
- ☑(완료)를 클릭하면 취소선 + "완료 {시각}"이 나타나는지 확인한다.
- ☐(미완료)를 클릭하면 원래대로 돌아가는지 확인한다.
- 다른 사람의 게시물을 볼 때는 버튼 없이 현재 상태 아이콘만 보이는지 확인한다.
- "수정" 버튼을 눌러 편집 모드에 들어갔을 때 상태 버튼 없이 텍스트/순서 편집만 가능한지, "저장" 후 상태가 그대로 유지되는지 확인한다.
- (이미 게시물이 있는 로컬/스테이징 DB라면) 마이그레이션 적용 후 기존 게시물의 완료/미완료 표시가 깨지지 않는지 확인한다.

개발 서버는 확인 후 종료한다.
