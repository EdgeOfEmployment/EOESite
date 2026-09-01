# 10시 인증(책상+목표) 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three checkin types (`wake`/`study`/`goal`) with a single "10시 인증" post type that requires a desk photo, lets the author attach any number of goals that can each be checked off later (with a completion timestamp), computes a KST-based lateness fine at submission time, and adds a monthly fine summary plus back-navigation between the checkin feed and its calendar.

**Architecture:** `checkin_posts` becomes a single-type table (`photo_url` required, a `goals` JSONB array, `is_late`/`fine_amount` computed at insert time). Goal identity is the array index — goals are immutable after creation, only their `completed`/`completedAt` fields are updated in place via a new `toggleGoalCompleted` server action restricted to the post author by both UI and a new RLS update policy. A pure `lib/checkin/time.ts` module does all KST-offset math (lateness/fine calculation and time-of-day display) without depending on the server's local timezone, so it is deterministically testable. The dashboard (`app/(app)/page.tsx`) gains a second table showing this calendar month's fine total per member.

**Tech Stack:** Next.js 16 App Router (server actions + server components), Supabase (Postgres + Storage), Vitest + Testing Library, Tailwind.

---

## Context for the engineer

- The existing checkin feature lives under `app/(app)/checkin/` (feed + calendar) and `lib/checkin/` (pure helpers). `app/(app)/page.tsx` is the "대시보드" home page that summarizes today's checkins.
- There is **no existing timezone-handling code** in this repo — all date-range queries currently use UTC directly (see `todayRangeUtc` in `app/(app)/page.tsx`). "10시" is Korean local time (KST, UTC+9), so all lateness/time-of-day logic must do its own +9h offset math. Do **not** use `Date.prototype.getHours()` (depends on the machine's local timezone, which is wrong in CI/prod) — always compute via `new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).getUTCHours()` etc., as shown in Task 2.
- The `jobposts` feature (`app/(app)/jobposts/`) already has two patterns we are reusing:
  - A repeatable-field form (`post-form.tsx`'s "+ 문항 추가" button, backed by a `questionCount` hidden field and `question-${i}`/`answer-${i}` named inputs, parsed by index in `actions.ts`). We copy this shape for goals.
  - Storing a variable-length list as a **JSONB column** on the parent row (`job_posts.questions`) rather than a child table. We do the same for `checkin_posts.goals` — this avoids a second table, a second set of RLS policies, and join queries, and matches how this codebase already models "list of typed sub-items owned entirely by one row."
- Per user decision, this migration **drops and recreates** `checkin_posts`, `checkin_comments`, and `checkin_reactions` (existing data is intentionally discarded — confirmed with the user, not an accident).
- The `type` column/enum and all three old checkin types (`wake`, `study`, `goal`) are removed entirely — there is only one post type now, labeled "10시 인증" as static text (no dropdown).
- Run `npm run test` after each task's implementation step, and `npm run lint` + `npx tsc --noEmit` at the end (Task 13). Tests currently run via `vitest run` per `package.json`.

---

### Task 1: Database migration — drop and recreate checkin schema ✅ DONE (191ba8f)

**Files:**
- Create: `supabase/migrations/0009_checkin_desk_goal.sql`

- [ ] **Step 1: Write the migration**

```sql
drop table if exists checkin_reactions cascade;
drop table if exists checkin_comments cascade;
drop table if exists checkin_posts cascade;
drop type if exists checkin_type;

create table checkin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  photo_url text not null,
  goals jsonb not null default '[]'::jsonb,
  is_late boolean not null default false,
  fine_amount integer not null default 0,
  created_at timestamptz not null default now()
);

create table checkin_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references checkin_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table checkin_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references checkin_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_id, emoji)
);

alter table checkin_posts enable row level security;
alter table checkin_comments enable row level security;
alter table checkin_reactions enable row level security;

create policy "Approved members can read checkin posts"
  on checkin_posts for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin posts"
  on checkin_posts for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Authors can update their own checkin posts"
  on checkin_posts for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Admins can delete checkin posts"
  on checkin_posts for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Approved members can read checkin comments"
  on checkin_comments for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin comments"
  on checkin_comments for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Approved members can read checkin reactions"
  on checkin_reactions for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Approved members can create checkin reactions"
  on checkin_reactions for insert
  with check (
    author_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Members can delete own checkin reactions"
  on checkin_reactions for delete
  using (author_id = auth.uid());
```

Note: this intentionally does **not** touch the `checkin-photos` storage bucket or its policies from `0002_checkin.sql` — those are not type-specific and remain valid unchanged.

- [ ] **Step 2: Confirm no other migration references `checkin_type`**

Run: `grep -rn "checkin_type" supabase/migrations`
Expected: only `0002_checkin.sql` (creates it, now superseded) and `0009_checkin_desk_goal.sql` (drops it).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0009_checkin_desk_goal.sql
git commit -m "feat: replace checkin schema with single desk+goal post type"
```

---

### Task 2: `lib/checkin/time.ts` — KST lateness/fine math and time formatting ✅ DONE (fb548ab)

**Files:**
- Create: `lib/checkin/time.ts`
- Test: `lib/checkin/time.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { computeLateFine, formatKstTime } from './time'

describe('computeLateFine', () => {
  it('is not late before 10:00:00 KST', () => {
    expect(computeLateFine('2026-08-10T00:59:59.000Z')).toEqual({ isLate: false, fineAmount: 0 })
  })

  it('charges the base fine at exactly 10:00:00 KST', () => {
    expect(computeLateFine('2026-08-10T01:00:00.000Z')).toEqual({ isLate: true, fineAmount: 10000 })
  })

  it('keeps the base fine through 10:04:59 KST', () => {
    expect(computeLateFine('2026-08-10T01:04:59.000Z')).toEqual({ isLate: true, fineAmount: 10000 })
  })

  it('adds 1000 won at 10:05:00 KST', () => {
    expect(computeLateFine('2026-08-10T01:05:00.000Z')).toEqual({ isLate: true, fineAmount: 11000 })
  })

  it('adds another 1000 won for each further 5-minute bracket', () => {
    expect(computeLateFine('2026-08-10T01:10:00.000Z')).toEqual({ isLate: true, fineAmount: 12000 })
    expect(computeLateFine('2026-08-10T01:15:00.000Z')).toEqual({ isLate: true, fineAmount: 13000 })
  })
})

describe('formatKstTime', () => {
  it('formats a morning time in KST', () => {
    expect(formatKstTime('2026-08-10T01:05:00.000Z')).toBe('오전 10:05')
  })

  it('formats an afternoon time in KST', () => {
    expect(formatKstTime('2026-08-10T09:30:00.000Z')).toBe('오후 6:30')
  })

  it('formats midnight KST as 오전 12', () => {
    expect(formatKstTime('2026-08-09T15:00:00.000Z')).toBe('오전 12:00')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/time.test.ts`
Expected: FAIL with "Cannot find module './time'"

- [ ] **Step 3: Write the implementation**

```typescript
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const LATE_THRESHOLD_SECONDS = 10 * 3600
const BASE_FINE = 10000
const FINE_INCREMENT = 1000
const FINE_INCREMENT_SECONDS = 5 * 60

function kstSecondsSinceMidnight(iso: string): number {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  return kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds()
}

export function computeLateFine(iso: string): { isLate: boolean; fineAmount: number } {
  const secondsSinceMidnight = kstSecondsSinceMidnight(iso)

  if (secondsSinceMidnight < LATE_THRESHOLD_SECONDS) {
    return { isLate: false, fineAmount: 0 }
  }

  const secondsLate = secondsSinceMidnight - LATE_THRESHOLD_SECONDS
  const increments = Math.floor(secondsLate / FINE_INCREMENT_SECONDS)
  return { isLate: true, fineAmount: BASE_FINE + increments * FINE_INCREMENT }
}

export function formatKstTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MS)
  const hours = kst.getUTCHours()
  const minutes = kst.getUTCMinutes()
  const period = hours < 12 ? '오전' : '오후'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${period} ${displayHours}:${String(minutes).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/time.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/time.ts lib/checkin/time.test.ts
git commit -m "feat: add KST lateness/fine and time formatting helpers"
```

---

### Task 3: `lib/checkin/types.ts` — collapse to a single post type with goals ✅ DONE (40bec5d)

**Files:**
- Modify: `lib/checkin/types.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
export const REACTION_EMOJIS = ['👍', '🎉', '💪'] as const

export interface CheckinGoal {
  body: string
  completed: boolean
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

This removes `CheckinType` and `CHECKIN_TYPE_LABELS`. There is no dedicated test file for this module (it is pure type/constant definitions and `REACTION_EMOJIS` is unchanged); downstream compile errors from the removed exports are expected until Tasks 4–12 update every consumer.

- [ ] **Step 2: Commit**

```bash
git add lib/checkin/types.ts
git commit -m "feat: collapse checkin types to a single desk+goal post shape"
```

---

### Task 4: `lib/checkin/status.ts` — simplify to a single "posted today" boolean

**Files:**
- Modify: `lib/checkin/status.ts`
- Test: `lib/checkin/status.test.ts`

- [ ] **Step 1: Write the failing test (replace the file)**

```typescript
import { describe, it, expect } from 'vitest'
import { buildTodayStatus, hasPostedToday } from './status'

describe('buildTodayStatus', () => {
  it('marks a member posted when their id is in the list of authors who posted today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildTodayStatus(members, ['u1'])).toEqual([{ member: { id: 'u1', name: '김민수' }, posted: true }])
  })

  it('marks a member not posted when their id is absent', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildTodayStatus(members, [])).toEqual([{ member: { id: 'u1', name: '김민수' }, posted: false }])
  })
})

describe('hasPostedToday', () => {
  it('returns true when the user id is present', () => {
    expect(hasPostedToday('u1', ['u1', 'u2'])).toBe(true)
  })

  it('returns false when the user id is absent', () => {
    expect(hasPostedToday('u1', ['u2'])).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/status.test.ts`
Expected: FAIL (`buildTodayStatus`/`hasPostedToday` don't match old signatures, or module errors)

- [ ] **Step 3: Replace the implementation**

```typescript
export interface MemberSummary {
  id: string
  name: string
}

export interface TodayStatusRow {
  member: MemberSummary
  posted: boolean
}

export function buildTodayStatus(members: MemberSummary[], todaysAuthorIds: string[]): TodayStatusRow[] {
  return members.map((member) => ({ member, posted: todaysAuthorIds.includes(member.id) }))
}

export function hasPostedToday(userId: string, todaysAuthorIds: string[]): boolean {
  return todaysAuthorIds.includes(userId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/status.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/status.ts lib/checkin/status.test.ts
git commit -m "feat: simplify checkin status to a single posted-today flag"
```

---

### Task 5: `lib/checkin/fines.ts` — monthly fine totals per member

**Files:**
- Create: `lib/checkin/fines.ts`
- Test: `lib/checkin/fines.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildMonthlyFineTotals } from './fines'

describe('buildMonthlyFineTotals', () => {
  it('sums fine amounts per member for the given posts', () => {
    const members = [
      { id: 'u1', name: '김민수' },
      { id: 'u2', name: '이지은' },
    ]
    const posts = [
      { authorId: 'u1', fineAmount: 10000 },
      { authorId: 'u1', fineAmount: 11000 },
      { authorId: 'u2', fineAmount: 0 },
    ]

    expect(buildMonthlyFineTotals(members, posts)).toEqual([
      { member: { id: 'u1', name: '김민수' }, totalFine: 21000 },
      { member: { id: 'u2', name: '이지은' }, totalFine: 0 },
    ])
  })

  it('returns zero for a member with no posts this month', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    expect(buildMonthlyFineTotals(members, [])).toEqual([{ member: { id: 'u1', name: '김민수' }, totalFine: 0 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/fines.test.ts`
Expected: FAIL with "Cannot find module './fines'"

- [ ] **Step 3: Write the implementation**

```typescript
import type { MemberSummary } from './status'

export interface MonthlyFinePost {
  authorId: string
  fineAmount: number
}

export interface FineTotalRow {
  member: MemberSummary
  totalFine: number
}

export function buildMonthlyFineTotals(members: MemberSummary[], monthPosts: MonthlyFinePost[]): FineTotalRow[] {
  return members.map((member) => ({
    member,
    totalFine: monthPosts
      .filter((post) => post.authorId === member.id)
      .reduce((sum, post) => sum + post.fineAmount, 0),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/fines.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/fines.ts lib/checkin/fines.test.ts
git commit -m "feat: add monthly checkin fine total aggregation"
```

---

### Task 6: `lib/checkin/calendar.ts` — drop `type`, add `isLate`

**Files:**
- Modify: `lib/checkin/calendar.ts`
- Test: `lib/checkin/calendar.test.ts`

- [ ] **Step 1: Write the failing test (replace the file)**

```typescript
import { describe, it, expect } from 'vitest'
import { buildMonthCalendar, groupPostsByMember } from './calendar'

describe('buildMonthCalendar', () => {
  it('places a post on the correct day cell', () => {
    const posts = [
      { id: 'p1', authorId: 'u1', authorName: '김민수', createdAt: '2026-08-10T03:00:00.000Z', isLate: false },
    ]

    const weeks = buildMonthCalendar(2026, 8, posts)
    const day10 = weeks.flat().find((day) => day.date === '2026-08-10')

    expect(day10?.posts).toHaveLength(1)
    expect(day10?.posts[0].id).toBe('p1')
  })

  it('marks days outside the target month as not in month', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    const outsideDays = weeks.flat().filter((day) => !day.inMonth)

    for (const day of outsideDays) {
      expect(day.date.startsWith('2026-08')).toBe(false)
    }
  })

  it('returns 6 weeks of 7 days each', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    expect(weeks).toHaveLength(6)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
    }
  })
})

describe('groupPostsByMember', () => {
  it('groups posts under their author and sorts by author name', () => {
    const posts = [
      { id: 'p1', authorId: 'u2', authorName: '이지은', createdAt: '2026-08-10T00:00:00.000Z', isLate: false },
      { id: 'p2', authorId: 'u1', authorName: '김민수', createdAt: '2026-08-11T00:00:00.000Z', isLate: true },
      { id: 'p3', authorId: 'u1', authorName: '김민수', createdAt: '2026-08-12T00:00:00.000Z', isLate: false },
    ]

    const grouped = groupPostsByMember(posts)

    expect(grouped.map((g) => g.authorName)).toEqual(['김민수', '이지은'])
    expect(grouped[0].posts).toHaveLength(2)
    expect(grouped[1].posts).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/checkin/calendar.test.ts`
Expected: FAIL (type errors / mismatched `CalendarPost` shape referencing removed `type` field)

- [ ] **Step 3: Update the `CalendarPost` interface**

In `lib/checkin/calendar.ts`:

1. Delete line 1 (`import type { CheckinType } from './types'`) — `CheckinType` no longer exists.
2. Replace the `CalendarPost` interface (originally lines 3–9) with:

```typescript
export interface CalendarPost {
  id: string
  authorId: string
  authorName: string
  createdAt: string
  isLate: boolean
}
```

The rest of `lib/checkin/calendar.ts` (`toDateKey`, `buildMonthCalendar`, `groupPostsByMember`) is generic over the post shape and needs no other changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/checkin/calendar.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/calendar.ts lib/checkin/calendar.test.ts
git commit -m "feat: drop checkin type from calendar grouping, add lateness flag"
```

---

### Task 7: `app/(app)/checkin/actions.ts` — single-type create + goal toggle

**Files:**
- Modify: `app/(app)/checkin/actions.ts`
- Test: `app/(app)/checkin/actions.test.ts`

- [ ] **Step 1: Write the failing test (replace the file)**

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getUserMock = vi.fn()
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
    auth: { getUser: getUserMock },
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

import { createCheckinPost, addComment, toggleReaction, toggleGoalCompleted, deleteCheckinPost } from './actions'

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
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
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

  it('inserts non-empty goals as unfinished and skips blank ones, and computes the late fine', async () => {
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
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
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

describe('toggleGoalCompleted', () => {
  function mockPost(
    goals: { body: string; completed: boolean; completedAt: string | null }[],
    authorId = 'user-1'
  ) {
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

  it('marks the goal completed and stamps completedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z'))
    const { update, updateEq } = mockPost([{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }])

    await toggleGoalCompleted('post-1', 0)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: true, completedAt: '2026-08-10T02:00:00.000Z' }],
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
  })

  it('unchecks a completed goal and clears completedAt', async () => {
    const { update } = mockPost([
      { body: '알고리즘 3문제 풀기', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
    ])

    await toggleGoalCompleted('post-1', 0)

    expect(update).toHaveBeenCalledWith({
      goals: [{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }],
    })
  })

  it('throws when the caller is not the post author', async () => {
    mockPost([{ body: '알고리즘 3문제 풀기', completed: false, completedAt: null }], 'other-user')

    await expect(toggleGoalCompleted('post-1', 0)).rejects.toThrow('권한이 없습니다')
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/checkin/actions.test.ts`
Expected: FAIL (`toggleGoalCompleted` doesn't exist yet; `createCheckinPost` still expects `type`/`body` fields)

- [ ] **Step 3: Replace the implementation**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { computeLateFine } from '@/lib/checkin/time'
import type { CheckinGoal } from '@/lib/checkin/types'

export async function createCheckinPost(formData: FormData) {
  const photo = formData.get('photo') as File | null
  const goalCount = Number(formData.get('goalCount') ?? '0')

  const goals: CheckinGoal[] = []
  for (let i = 0; i < goalCount; i++) {
    const body = ((formData.get(`goal-${i}`) as string) || '').trim()
    if (body) {
      goals.push({ body, completed: false, completedAt: null })
    }
  }

  if (!photo || photo.size === 0) {
    redirect('/checkin?error=' + encodeURIComponent('책상 인증 사진을 첨부해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
    return
  }

  const path = `${user.id}/${Date.now()}-${photo.name}`
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

export async function toggleGoalCompleted(postId: string, goalIndex: number) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const nextCompleted = !goal.completed
  const updatedGoals = goals.map((g, i) =>
    i === goalIndex
      ? { ...g, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
      : g
  )

  const { error } = await supabase.from('checkin_posts').update({ goals: updatedGoals }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
}

export async function deleteCheckinPost(postId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/checkin/actions.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/actions.ts app/\(app\)/checkin/actions.test.ts
git commit -m "feat: rewrite checkin actions for single-type posts with goal toggling"
```

---

### Task 8: `app/(app)/checkin/post-form.tsx` — photo required + dynamic goal list

**Files:**
- Modify: `app/(app)/checkin/post-form.tsx`
- Test: `app/(app)/checkin/post-form.test.tsx`

- [ ] **Step 1: Write the failing test (replace the file)**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders a required photo input, no goals by default, and the submit button', () => {
    render(<PostForm />)

    expect(screen.getByLabelText('책상 인증 사진')).toBeRequired()
    expect(screen.queryByPlaceholderText(/목표/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
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

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.queryByPlaceholderText('목표 2')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: FAIL (current form renders a type `<select>` and single textarea, not a photo-only + goal-list form)

- [ ] **Step 3: Replace the implementation**

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/checkin/post-form.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/post-form.tsx app/\(app\)/checkin/post-form.test.tsx
git commit -m "feat: rebuild checkin post form with required photo and dynamic goals"
```

---

### Task 9: `app/(app)/checkin/post-card.tsx` — photo, goals with author-only toggle, late badge

**Files:**
- Modify: `app/(app)/checkin/post-card.tsx`
- Test: `app/(app)/checkin/post-card.test.tsx`

- [ ] **Step 1: Write the failing test (replace the file)**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  toggleGoalCompleted: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { CheckinPost } from '@/lib/checkin/types'

const post: CheckinPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  photoUrl: 'https://example.com/photo.jpg',
  goals: [
    { body: '알고리즘 3문제 풀기', completed: false, completedAt: null },
    { body: '이력서 초안 작성', completed: true, completedAt: '2026-08-10T02:00:00.000Z' },
  ],
  createdAt: '2026-08-10T01:05:00.000Z',
  isLate: true,
  fineAmount: 11000,
  comments: [
    { id: 'c1', authorId: 'user-2', authorName: '이지은', body: '축하해요', createdAt: '2026-08-10T01:10:00.000Z' },
  ],
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the type label, author, created time, photo, goals, and comments', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('10시 인증')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('오전 10:05')).toBeInTheDocument()
    expect(screen.getByAltText('책상 인증 사진')).toHaveAttribute('src', 'https://example.com/photo.jpg')
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })

  it('shows a late badge with the fine amount', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('지각 · 11,000원')).toBeInTheDocument()
  })

  it('lets the author toggle their own goal completion', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '알고리즘 3문제 풀기' })).toBeInTheDocument()
  })

  it('does not render a toggle button for a non-author viewer', () => {
    render(<PostCard post={post} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '알고리즘 3문제 풀기' })).not.toBeInTheDocument()
  })

  it('shows the completion time for a completed goal', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('완료 오전 11:00')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
  })

  it('does not show a delete button for non-admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/checkin/post-card.test.tsx`
Expected: FAIL (current card renders `CHECKIN_TYPE_LABELS`/`post.body`, no goals/photo/late badge)

- [ ] **Step 3: Replace the implementation**

```tsx
import { REACTION_EMOJIS, type CheckinPost } from '@/lib/checkin/types'
import { formatKstTime } from '@/lib/checkin/time'
import { addComment, toggleReaction, toggleGoalCompleted, deleteCheckinPost } from './actions'
import { Card } from '@/components/ui/card'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: CheckinPost
  currentUserId: string
  isAdmin: boolean
}) {
  const isAuthor = post.authorId === currentUserId

  return (
    <Card as="article">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-800">10시 인증</span>
          <span className="font-medium">{post.authorName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{formatKstTime(post.createdAt)}</span>
          {post.isLate && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
              지각 · {post.fineAmount.toLocaleString('ko-KR')}원
            </span>
          )}
        </div>
        {isAdmin && (
          <form action={deleteCheckinPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={post.photoUrl} alt="책상 인증 사진" className="mt-2 max-h-64 rounded object-cover" />

      {post.goals.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {post.goals.map((goal, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
              {isAuthor ? (
                <form action={toggleGoalCompleted.bind(null, post.id, index)}>
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

      <div className="mt-3 flex gap-2">
        {REACTION_EMOJIS.map((emoji) => {
          const count = post.reactions.filter((r) => r.emoji === emoji).length
          const reacted = post.reactions.some((r) => r.emoji === emoji && r.authorId === currentUserId)
          return (
            <form key={emoji} action={toggleReaction.bind(null, post.id, emoji)}>
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${
                  reacted
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {emoji}
                {count > 0 ? ` ${count}` : ''}
              </button>
            </form>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {post.comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <span className="font-medium">{comment.authorName}</span> {comment.body}
          </li>
        ))}
      </ul>

      <form action={addComment.bind(null, post.id)} className="mt-2 flex gap-2">
        <input
          name="body"
          placeholder="댓글 달기"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700"
        />
        <button type="submit" className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700">
          등록
        </button>
      </form>
    </Card>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/checkin/post-card.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/post-card.tsx app/\(app\)/checkin/post-card.test.tsx
git commit -m "feat: render desk photo, goal checklist, and late badge on checkin cards"
```

---

### Task 10: `app/(app)/checkin/page.tsx` — feed query without `type`

**Files:**
- Modify: `app/(app)/checkin/page.tsx`
- Test: `app/(app)/checkin/page.test.tsx`

- [ ] **Step 1: Write the failing test (replace the file)**

```tsx
import { describe, it, expect, vi } from 'vitest'
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
        return { select: () => ({ order: async () => ({ data: posts }) }) }
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

describe('CheckinPage', () => {
  it('renders the post form and the feed of posts with author names, goals, and comments', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/checkin/page.test.tsx`
Expected: FAIL (current page selects `type, body` columns and maps them onto the old `CheckinPost` shape)

- [ ] **Step 3: Update the query and mapping**

In `app/(app)/checkin/page.tsx`, change the `checkin_posts` select and the `checkinPosts` mapping:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinGoal } from '@/lib/checkin/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
  const supabase = await createClient()

  const [session, { data: profiles }, { data: posts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, photo_url, goals, created_at, is_late, fine_amount')
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
      <PostForm />
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/checkin/page.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/page.tsx app/\(app\)/checkin/page.test.tsx
git commit -m "feat: query single-type checkin posts with goals on the feed page"
```

---

### Task 11: `app/(app)/checkin/calendar/page.tsx` — drop type, show lateness, add back link

**Files:**
- Modify: `app/(app)/checkin/calendar/page.tsx`
- Test: `app/(app)/checkin/calendar/page.test.tsx`

- [ ] **Step 1: Write the failing test (replace the file)**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', created_at: '2026-08-10T00:00:00.000Z', is_late: true }]

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
              lt: async () => ({ data: posts }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import CheckinCalendarPage from './page'

describe('CheckinCalendarPage', () => {
  it('renders the month heading, the date/member view toggle, and a link back to the checkin feed', async () => {
    const ui = await CheckinCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '인증 달력 (2026년 8월)' })).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 인증으로 돌아가기' })).toHaveAttribute('href', '/checkin')
  })

  it('shows the member view grouped by author when view=member', async () => {
    const ui = await CheckinCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8', view: 'member' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '김민수' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/checkin/calendar/page.test.tsx`
Expected: FAIL (no back link yet; query still selects `type`)

- [ ] **Step 3: Replace the implementation**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
import { PageShell } from '@/components/ui/page-shell'

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 1)).toISOString()
  return { start, end }
}

export default async function CheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const { start, end } = monthRange(year, month)
  const supabase = await createClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, is_late')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const calendarPosts: CalendarPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    createdAt: post.created_at,
    isLate: post.is_late,
  }))

  return (
    <PageShell
      title={`인증 달력 (${year}년 ${month}월)`}
      width="3xl"
      headerExtra={
        <Link href="/checkin" className="text-sm text-gray-500 underline dark:text-gray-400">
          ← 인증으로 돌아가기
        </Link>
      }
    >
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName}
                          {post.isLate ? ' · 지각' : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="flex flex-col gap-4">
          {groupPostsByMember(calendarPosts).map((member) => (
            <li key={member.authorId}>
              <h2 className="font-semibold">{member.authorName}</h2>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.createdAt.slice(0, 10)}
                    {post.isLate ? ' · 지각' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/checkin/calendar/page.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/checkin/calendar/page.tsx app/\(app\)/checkin/calendar/page.test.tsx
git commit -m "feat: show lateness on the checkin calendar and link back to the feed"
```

---

### Task 12: `app/(app)/page.tsx` — dashboard with today status + this month's fine totals

**Files:**
- Modify: `app/(app)/page.tsx`
- Test: `app/(app)/page.test.tsx`

- [ ] **Step 1: Write the failing test (replace the file)**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({ data: [{ author_id: 'user-2', fine_amount: 11000 }] }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

import DashboardPage from './page'

describe('DashboardPage', () => {
  it('renders the dashboard heading', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  it('shows the not-yet-posted message when the current user has no post today', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('오늘 아직 10시 인증을 하지 않았어요.')).toBeInTheDocument()
  })

  it('renders a status row per approved member with a checkmark for who posted today', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })

  it('shows this months fine total per member', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expect(screen.getByText('11,000원')).toBeInTheDocument()
    expect(screen.getByText('0원')).toBeInTheDocument()
  })

  it('links to the checkin feed', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(app\)/page.test.tsx`
Expected: FAIL (current page renders a 3-column type table and no fine summary)

- [ ] **Step 3: Replace the implementation**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

function monthRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { start: todayStart, end: todayEnd } = todayRangeUtc()
  const { start: monthStart, end: monthEnd } = monthRangeUtc()

  const [session, { data: members }, { data: todaysPosts }, { data: monthPosts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id').gte('created_at', todayStart).lt('created_at', todayEnd),
    supabase
      .from('checkin_posts')
      .select('author_id, fine_amount')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd),
  ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const todaysAuthorIds = (todaysPosts ?? []).map((p) => p.author_id as string)
  const monthFinePosts = (monthPosts ?? []).map((p) => ({
    authorId: p.author_id as string,
    fineAmount: p.fine_amount as number,
  }))

  const statusRows = buildTodayStatus(memberSummaries, todaysAuthorIds)
  const fineRows = buildMonthlyFineTotals(memberSummaries, monthFinePosts)
  const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false

  return (
    <PageShell title="대시보드" width="3xl">
      {posted ? (
        <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
      ) : (
        <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
      )}

      <Link href="/checkin" className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400">
        인증 보러가기
      </Link>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">10시 인증</th>
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.posted ? '✅' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 text-lg font-semibold">이번 달 벌금 정산</h2>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금</th>
          </tr>
        </thead>
        <tbody>
          {fineRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.totalFine.toLocaleString('ko-KR')}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(app\)/page.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/page.tsx app/\(app\)/page.test.tsx
git commit -m "feat: show todays checkin status and this months fine totals on the dashboard"
```

---

### Task 13: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: All test files pass, including every file touched in Tasks 4–12.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: No errors in any file this plan touched. If an unrelated pre-existing lint issue surfaces in a file this plan did not modify, leave it as-is and note it rather than fixing it out of scope.

- [ ] **Step 3: Run the TypeScript compiler**

Run: `npx tsc --noEmit`
Expected: No errors. Pay special attention to any remaining reference to `CheckinType`, `CHECKIN_TYPE_LABELS`, `CHECKIN_TYPES`, or `getMissingTypes` — all were intentionally removed in Tasks 3–4.

Run: `grep -rn "CheckinType\|CHECKIN_TYPE_LABELS\|CHECKIN_TYPES\|getMissingTypes" app lib --include=*.ts --include=*.tsx`
Expected: no matches.

- [ ] **Step 4: Confirm no leftover references to old checkin post fields**

Run: `grep -rn "\.body\b" app/\(app\)/checkin lib/checkin --include=*.ts --include=*.tsx`
Expected: no matches referring to a checkin post's old free-text `body` field (comments still use `body`, which is unrelated and fine — this check is a sanity pass to confirm the old post `body`/`type` fields are gone, not a hard gate).

- [ ] **Step 5: Commit if any fixes were needed**

If Steps 1–4 required fixes, stage and commit them:

```bash
git add -A
git commit -m "fix: address lint/typecheck fallout from checkin desk+goal revamp"
```

If no fixes were needed, skip this step (nothing to commit).
