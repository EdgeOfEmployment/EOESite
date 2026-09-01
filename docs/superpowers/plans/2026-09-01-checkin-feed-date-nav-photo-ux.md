# 인증 피드 날짜별 보기 + 사진 첨부 UX 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/checkin` show one KST calendar day of posts at a time (with ◀/▶ day navigation, defaulting to today, clamped so you can't browse into the future), hide the post-creation form on any day but today, and replace the unstyled native photo `<input type="file">` with a Tailwind-styled button plus a local thumbnail preview.

**Architecture:** Four new pure KST-date helpers are added to `lib/checkin/time.ts` (day-string/day-range/date-shift/date-heading math, following the exact same UTC-offset-arithmetic pattern already used by `computeLateFine`/`formatKstTime`). `app/(app)/checkin/page.tsx` reads a new `date` search param, resolves/validates/clamps it server-side, filters its `checkin_posts` query to that KST day's UTC range, and conditionally renders `<PostForm>` only when the resolved date is today. `app/(app)/checkin/post-form.tsx` gets a Tailwind `file:*`-styled input and client-side `useState` + `URL.createObjectURL` for a thumbnail preview — no change to what's actually submitted to the server.

**Tech Stack:** Next.js 16 App Router (server components + `searchParams`), React `useState`/`useEffect`, Tailwind `file:*` variants, Vitest + Testing Library.

---

## Context for the engineer

- Full design rationale lives in `docs/superpowers/specs/2026-09-01-checkin-feed-date-nav-photo-ux-design.md` — read it for the "why" behind each decision (form-hidden-on-past-days, no remove button on the photo preview, no date-picker beyond ±1 day, etc.). This plan is the "how."
- `lib/checkin/time.ts` already has `computeLateFine`/`formatKstTime`, both using the established trick: `new Date(new Date(iso).getTime() + KST_OFFSET_MS)` then read back via `getUTC*()` methods — **never** `getHours()`/`getMinutes()` (server-local-timezone-dependent, wrong in CI/prod). The four new functions in Task 1 follow this exact same pattern; do not deviate from it.
- `app/(app)/checkin/calendar/page.tsx` already has a working precedent for "server component reads a search param, computes a value, renders prev/next `<Link>`s" (its year/month navigation) — skim it if you want a working reference, though Task 2's code below is already complete and should be used verbatim.
- `app/(app)/jobposts/post-form.tsx` has this codebase's existing precedent for a `'use client'` form component with local `useState`, which `post-form.tsx` already follows for its goals list — Task 3 adds photo-preview state to the same component using the same conventions.
- Run `npm run test` after each task's implementation step, and `npm run lint` + `npx tsc --noEmit` at the end (Task 4).

---

### Task 1: `lib/checkin/time.ts` — KST day-string, day-range, date-shift, and heading helpers ✅ DONE (569bd71, test fix e6f27b7)

**Files:**
- Modify: `lib/checkin/time.ts`
- Modify: `lib/checkin/time.test.ts`

- [ ] **Step 1: Add the failing tests**

Append these two new `describe` blocks to the end of `lib/checkin/time.test.ts` (after the existing `formatKstTime` block — do not remove or alter the existing `computeLateFine`/`formatKstTime` tests):

```typescript
describe('getKstDateString', () => {
  it('returns the KST calendar date for a UTC instant that is still the same KST day', () => {
    expect(getKstDateString('2026-08-10T01:05:00.000Z')).toBe('2026-08-10')
  })

  it('rolls over to the next KST calendar date across the UTC day boundary', () => {
    expect(getKstDateString('2026-08-09T15:00:00.000Z')).toBe('2026-08-10')
  })
})

describe('kstDayRangeUtc', () => {
  it('returns the UTC instant range spanning one KST calendar day', () => {
    expect(kstDayRangeUtc('2026-08-10')).toEqual({
      start: '2026-08-09T15:00:00.000Z',
      end: '2026-08-10T15:00:00.000Z',
    })
  })

  it('round-trips with getKstDateString: any instant inside the range maps back to the same date', () => {
    const { start } = kstDayRangeUtc('2026-08-10')
    expect(getKstDateString(start)).toBe('2026-08-10')
  })
})

describe('shiftKstDateString', () => {
  it('shifts forward by a positive delta', () => {
    expect(shiftKstDateString('2026-08-10', 1)).toBe('2026-08-11')
  })

  it('shifts backward by a negative delta', () => {
    expect(shiftKstDateString('2026-08-10', -1)).toBe('2026-08-09')
  })

  it('rolls over a month boundary', () => {
    expect(shiftKstDateString('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('rolls over a year boundary', () => {
    expect(shiftKstDateString('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('formatKstDateHeading', () => {
  it('formats a date string as a Korean-style heading', () => {
    expect(formatKstDateHeading('2026-08-10')).toBe('2026년 8월 10일')
  })

  it('does not zero-pad the month or day', () => {
    expect(formatKstDateHeading('2026-01-05')).toBe('2026년 1월 5일')
  })
})
```

Also update the existing `import` line at the top of the file to pull in the four new functions:

```typescript
import { describe, it, expect } from 'vitest'
import {
  computeLateFine,
  formatKstTime,
  getKstDateString,
  kstDayRangeUtc,
  shiftKstDateString,
  formatKstDateHeading,
} from './time'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checkin/time.test.ts`
Expected: FAIL with "does not provide an export named 'getKstDateString'" (or similar) — the four new functions don't exist in `time.ts` yet.

- [ ] **Step 3: Add the implementation**

Append these four functions to the end of `lib/checkin/time.ts` (after `formatKstTime` — do not modify `computeLateFine`, `formatKstTime`, or the existing constants/helper above them):

```typescript
export function getKstDateString(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return kst.toISOString().slice(0, 10)
}

export function kstDayRangeUtc(dateStr: string): { start: string; end: string } {
  const startOfDayKst = new Date(`${dateStr}T00:00:00.000Z`)
  const start = new Date(startOfDayKst.getTime() - KST_OFFSET_MS).toISOString()
  const end = new Date(startOfDayKst.getTime() + 24 * 60 * 60 * 1000 - KST_OFFSET_MS).toISOString()
  return { start, end }
}

export function shiftKstDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function formatKstDateHeading(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checkin/time.test.ts`
Expected: PASS (18 tests total — the 8 pre-existing `computeLateFine`/`formatKstTime` tests plus 10 new ones)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/time.ts lib/checkin/time.test.ts
git commit -m "feat: add KST day-string and day-range helpers for checkin feed date nav"
```

---

### Task 2: `app/(app)/checkin/page.tsx` — date-filtered feed with day navigation ✅ DONE (8f963e7, fix d40376f)

**Files:**
- Modify: `app/(app)/checkin/page.tsx`
- Modify: `app/(app)/checkin/page.test.tsx`

- [ ] **Step 1: Write the failing tests (replace the file)**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/checkin',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const posts = [
  {
    id: 'post-1',
    author_id: 'user-1',
    photo_url: 'https://example.com/photo.jpg',
    goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
    created_at: '2026-08-10T01:05:00.000Z',
    is_late: true,
    fine_amount: 11000,
  },
]

const comments = [
  { id: 'c1', post_id: 'post-1', author_id: 'admin-1', body: '축하해요', created_at: '2026-08-10T01:10:00.000Z' },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: () => ({ order: async () => ({ data: posts }) }),
            }),
          }),
        }
      }
      if (table === 'checkin_comments') {
        return { select: () => ({ in: () => ({ order: async () => ({ data: comments }) }) }) }
      }
      if (table === 'checkin_reactions') {
        return { select: () => ({ in: async () => ({ data: reactions }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  toggleGoalCompleted: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import CheckinPage from './page'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z')) // KST 11:00, 2026-08-10
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CheckinPage', () => {
  it('defaults to todays KST date, shows the post form, and disables the next-day link', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/checkin?date=2026-08-09')
    expect(screen.queryByRole('link', { name: '▶' })).not.toBeInTheDocument()
  })

  it('hides the post form and shows an active next-day link for a past date', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({ date: '2026-08-09' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 9일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10시 인증하기' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '▶' })).toHaveAttribute('href', '/checkin?date=2026-08-10')
  })

  it('falls back to todays date for an invalid date parameter', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({ date: 'not-a-date' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('clamps a future date parameter to today', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({ date: '2026-08-15' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/checkin/page.test.tsx`
Expected: FAIL — current page has no `date` handling, no day-nav row, always renders `<PostForm>`, and its mocked `checkin_posts.select()` doesn't chain through `.gte()`/`.lt()`, so the current implementation's `.order()`-only call won't match the new mock shape.

- [ ] **Step 3: Replace the implementation**

Replace `app/(app)/checkin/page.tsx` in full with:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinGoal } from '@/lib/checkin/types'
import { getKstDateString, kstDayRangeUtc, shiftKstDateString, formatKstDateHeading } from '@/lib/checkin/time'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
    return todayKst
  }

  if (Number.isNaN(new Date(`${dateParam}T00:00:00.000Z`).getTime())) {
    return todayKst
  }

  return dateParam > todayKst ? todayKst : dateParam
}

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; date?: string }>
}) {
  const { error: queryError, success, date } = await searchParams
  const todayKst = getKstDateString(new Date().toISOString())
  const selectedDate = resolveSelectedDate(date, todayKst)
  const isToday = selectedDate === todayKst
  const prevDate = shiftKstDateString(selectedDate, -1)
  const nextDate = shiftKstDateString(selectedDate, 1)

  const supabase = await createClient()
  const { start, end } = kstDayRangeUtc(selectedDate)

  const [session, { data: profiles }, { data: posts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, photo_url, goals, created_at, is_late, fine_amount')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: comments }, { data: reactions }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase
        .from('checkin_comments')
        .select('id, post_id, author_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    ),
    queryIfAny(postIds, () =>
      supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
  ])

  const checkinPosts: CheckinPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    photoUrl: post.photo_url,
    goals: (post.goals ?? []) as CheckinGoal[],
    createdAt: post.created_at,
    isLate: post.is_late,
    fineAmount: post.fine_amount,
    comments: (comments ?? [])
      .filter((c) => c.post_id === post.id)
      .map((c) => ({
        id: c.id,
        authorId: c.author_id,
        authorName: nameById.get(c.author_id) ?? '알 수 없음',
        body: c.body,
        createdAt: c.created_at,
      })),
    reactions: (reactions ?? [])
      .filter((r) => r.post_id === post.id)
      .map((r) => ({ id: r.id, authorId: r.author_id, emoji: r.emoji })),
  }))

  return (
    <PageShell
      title="10시 인증"
      headerExtra={
        <Link href="/checkin/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}

      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
        <Link href={`/checkin?date=${prevDate}`} className="underline">
          ◀
        </Link>
        <span className="font-medium">
          {formatKstDateHeading(selectedDate)}
          {isToday ? ' (오늘)' : ''}
        </span>
        {isToday ? (
          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
            ▶
          </span>
        ) : (
          <Link href={`/checkin?date=${nextDate}`} className="underline">
            ▶
          </Link>
        )}
      </div>

      {isToday && <PostForm />}
      <ul className="mt-6 flex flex-col gap-4">
        {checkinPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/checkin/page.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/page.tsx app/\(app\)/checkin/page.test.tsx
git commit -m "feat: filter checkin feed to one KST day with prev/next navigation"
```

---

### Task 3: `app/(app)/checkin/post-form.tsx` — styled photo button + thumbnail preview

**Files:**
- Modify: `app/(app)/checkin/post-form.tsx`
- Modify: `app/(app)/checkin/post-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add a `beforeEach`/`afterEach` pair and a new test to `app/(app)/checkin/post-form.test.tsx`. Replace the whole file with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

const originalCreateObjectURL = global.URL.createObjectURL
const originalRevokeObjectURL = global.URL.revokeObjectURL

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url')
  global.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  global.URL.createObjectURL = originalCreateObjectURL
  global.URL.revokeObjectURL = originalRevokeObjectURL
})

describe('PostForm', () => {
  it('renders a required photo input, no goals by default, and the submit button', () => {
    render(<PostForm />)

    expect(screen.getByLabelText('책상 인증 사진')).toBeRequired()
    expect(screen.queryByPlaceholderText(/목표/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
  })

  it('shows no preview before a photo is selected', () => {
    render(<PostForm />)

    expect(screen.queryByAltText('선택한 사진 미리보기')).not.toBeInTheDocument()
  })

  it('shows a thumbnail preview and file name after selecting a photo', () => {
    render(<PostForm />)

    const photo = new File(['fake-image-bytes'], 'desk.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('책상 인증 사진'), { target: { files: [photo] } })

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(photo)
    expect(screen.getByAltText('선택한 사진 미리보기')).toHaveAttribute('src', 'blob:mock-preview-url')
    expect(screen.getByText('desk.jpg')).toBeInTheDocument()
  })

  it('replaces the preview when a second photo is selected', () => {
    render(<PostForm />)

    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' })
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('책상 인증 사진')

    fireEvent.change(input, { target: { files: [first] } })
    fireEvent.change(input, { target: { files: [second] } })

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview-url')
    expect(screen.getByText('second.jpg')).toBeInTheDocument()
    expect(screen.queryByText('first.jpg')).not.toBeInTheDocument()
  })

  it('adds a goal field when clicking the add-goal button', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
  })

  it('adds a second goal field on a second click', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    expect(screen.getByPlaceholderText('목표 1')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 2')).toBeInTheDocument()
  })

  it('removes a goal field when clicking its delete button', () => {
    render(<PostForm />)
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))
    fireEvent.click(screen.getByRole('button', { name: '+ 목표 추가' }))

    fireEvent.change(screen.getByPlaceholderText('목표 1'), { target: { value: 'A' } })
    fireEvent.change(screen.getByPlaceholderText('목표 2'), { target: { value: 'B' } })

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByPlaceholderText('목표 2')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('목표 1')).toHaveValue('B')
  })
})
```

(The `originalCreateObjectURL`/`originalRevokeObjectURL` save-and-restore pattern is needed because jsdom does not implement `URL.createObjectURL`/`revokeObjectURL` at all — there is nothing to spy on with `vi.spyOn`, so the test stubs them directly on the global and restores whatever was there before, which in this jsdom environment is `undefined`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: FAIL on the three new preview-related tests — the current form has no preview state, so `queryByAltText('선택한 사진 미리보기')` behavior can't be verified as intended and the file-selection tests find no preview image/filename to assert on.

- [ ] **Step 3: Replace the implementation**

Replace `app/(app)/checkin/post-form.tsx` in full with:

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/post-form.tsx app/\(app\)/checkin/post-form.test.tsx
git commit -m "feat: style the checkin photo input and add a local thumbnail preview"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All test files pass, including every file touched in Tasks 1–3.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors in any file this plan touched. The pre-existing, unrelated `feedback-lines.tsx`/`session-cache.test.ts` lint issue (predating this plan) may still appear — leave it as-is, it's out of scope.

- [ ] **Step 3: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Manually verify the day-navigation edge case that automated tests can't easily cover**

Since `resolveSelectedDate`'s future-clamping and invalid-date-fallback logic is exercised by Task 2's tests with mocked system time, but the *actual* browser round-trip (clicking ◀/▶ links, confirming the URL updates, confirming the form disappears/reappears) has not been manually verified — if a dev server is available, load `/checkin`, click ◀ once, confirm the form disappears and the heading updates, then click ▶ twice and confirm it lands back on today with the form visible and the ▶ arrow greyed out (not a link). This is a smoke-test step, not a new automated test.

- [ ] **Step 5: Commit if any fixes were needed**

If Steps 1–3 required fixes, stage and commit them. If no fixes were needed, skip this step (nothing to commit).
