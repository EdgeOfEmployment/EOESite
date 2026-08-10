# Checkin Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 인증 게시판 (`/checkin`) — the first of the four study-site boards — where approved members post 기상/스터디/목표달성 check-ins with an optional photo, comment and react on each other's posts, browse a monthly calendar of check-ins, and see a live "today's status" table on the dashboard. Admins can delete inappropriate posts.

**Architecture:** Three new Postgres tables (`checkin_posts`, `checkin_comments`, `checkin_reactions`) plus a public Supabase Storage bucket (`checkin-photos`) for photos, all gated by Row Level Security to approved members. Server Actions handle every mutation (create post, comment, toggle reaction, admin delete). Two pure/testable logic modules (`lib/checkin/status.ts`, `lib/checkin/calendar.ts`) drive the dashboard status table and the calendar grid so the hardest logic is unit-tested without hitting Supabase. Pages compose data with plain multi-query fetches (no PostgREST embedding) to keep the Supabase mocking in tests simple.

**Tech Stack:** Next.js (App Router, TypeScript) Server Actions, Supabase (Postgres + Auth + Storage + RLS), Tailwind CSS, Vitest + React Testing Library. Builds directly on the foundation from `docs/superpowers/plans/2026-07-29-study-site-foundation.md` (auth, `profiles` table, app shell, admin role checks).

**Spec:** `docs/superpowers/specs/2026-07-29-study-site-design.md` (인증 게시판 + 대시보드 오늘의 현황판 sections)

**Assumptions (not fully specified in the spec — call these out if wrong):**
- Photo upload is optional per post, not required (spec lists it alongside text/type without marking it mandatory).
- Only admins can delete check-in posts (the spec's "게시글 삭제" is listed only under 관리자 permissions); members cannot delete their own posts or comments in this plan.
- Reactions use a fixed 3-emoji set (👍 🎉 💪) rather than a free-form emoji picker, to keep the UI and tests simple. Clicking an emoji again removes your reaction (toggle).
- "오늘" for the dashboard status table and check-in grouping is computed in UTC, matching how Postgres/Supabase store `timestamptz`.

---

## File Structure

```
supabase/
  migrations/
    0002_checkin.sql        # checkin_posts/comments/reactions tables, RLS, storage bucket + policies
lib/
  checkin/
    types.ts                # CheckinType, CHECKIN_TYPE_LABELS, REACTION_EMOJIS, CheckinPost/Comment/Reaction
    status.ts                # CHECKIN_TYPES, buildTodayStatus, getMissingTypes (pure, used by dashboard)
    status.test.ts
    calendar.ts               # buildMonthCalendar, groupPostsByMember (pure, used by calendar page)
    calendar.test.ts
app/
  (app)/
    page.tsx                  # MODIFY: dashboard now shows today's check-in status table
    page.test.tsx             # MODIFY: mocks Supabase, asserts status table + missing-checkin message
    checkin/
      actions.ts               # createCheckinPost, addComment, toggleReaction, deleteCheckinPost
      actions.test.ts
      post-form.tsx             # check-in creation form (type + body + optional photo)
      post-form.test.tsx
      post-card.tsx              # single post: badge, body, photo, reactions, comments, comment form
      post-card.test.tsx
      page.tsx                   # /checkin feed
      page.test.tsx
      calendar/
        page.tsx                  # /checkin/calendar (날짜별 / 멤버별 toggle)
        page.test.tsx
next.config.ts                # MODIFY: raise serverActions.bodySizeLimit for photo uploads
```

---

## Task 1: Database schema migration for the checkin board

**Files:**

- Create: `supabase/migrations/0002_checkin.sql`

- [x] **Step 1: Write the migration**

Create `supabase/migrations/0002_checkin.sql`:

```sql
create type checkin_type as enum ('wake', 'study', 'goal');

create table checkin_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  type checkin_type not null,
  photo_url text,
  body text not null,
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

insert into storage.buckets (id, name, public)
values ('checkin-photos', 'checkin-photos', true)
on conflict (id) do nothing;

create policy "Approved members can upload checkin photos"
  on storage.objects for insert
  with check (
    bucket_id = 'checkin-photos'
    and exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')
  );

create policy "Anyone can view checkin photos"
  on storage.objects for select
  using (bucket_id = 'checkin-photos');
```

- [x] **Step 2: Apply the migration manually**

Open your Supabase project dashboard → SQL Editor → paste the contents of `0002_checkin.sql` → Run.

- [x] **Step 3: Verify manually**

In the Supabase dashboard → Table Editor, confirm `checkin_posts`, `checkin_comments`, `checkin_reactions` tables exist. In Storage, confirm a public `checkin-photos` bucket exists.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/0002_checkin.sql
git commit -m "Add checkin board tables, RLS, and photo storage bucket"
```

---

## Task 2: Check-in domain types and today-status logic

**Files:**

- Create: `lib/checkin/types.ts`
- Create: `lib/checkin/status.ts`
- Test: `lib/checkin/status.test.ts`

- [x] **Step 1: Write the domain types**

Create `lib/checkin/types.ts`:

```ts
export type CheckinType = 'wake' | 'study' | 'goal'

export const CHECKIN_TYPE_LABELS: Record<CheckinType, string> = {
  wake: '기상',
  study: '스터디',
  goal: '목표달성',
}

export const REACTION_EMOJIS = ['👍', '🎉', '💪'] as const

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
  type: CheckinType
  photoUrl: string | null
  body: string
  createdAt: string
  comments: CheckinComment[]
  reactions: CheckinReaction[]
}
```

- [x] **Step 2: Write the failing tests for the status logic**

Create `lib/checkin/status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from './status'

describe('buildTodayStatus', () => {
  it('marks a type complete when the member has a matching post today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    const posts = [{ authorId: 'u1', type: 'wake' as const }]

    const rows = buildTodayStatus(members, posts)

    expect(rows).toEqual([
      { member: { id: 'u1', name: '김민수' }, completed: { wake: true, study: false, goal: false } },
    ])
  })

  it('marks all types incomplete when the member has no posts today', () => {
    const members = [{ id: 'u1', name: '김민수' }]
    const rows = buildTodayStatus(members, [])

    expect(rows[0].completed).toEqual({ wake: false, study: false, goal: false })
  })
})

describe('getMissingTypes', () => {
  it('returns all types when the user has no posts today', () => {
    expect(getMissingTypes('u1', [])).toEqual(CHECKIN_TYPES)
  })

  it('excludes types the user already posted today', () => {
    const posts = [{ authorId: 'u1', type: 'wake' as const }]
    expect(getMissingTypes('u1', posts)).toEqual(['study', 'goal'])
  })

  it('ignores posts from other users', () => {
    const posts = [{ authorId: 'u2', type: 'wake' as const }]
    expect(getMissingTypes('u1', posts)).toEqual(CHECKIN_TYPES)
  })
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/checkin/status.test.ts`
Expected: FAIL — `Cannot find module './status'`.

- [x] **Step 4: Implement the status logic**

Create `lib/checkin/status.ts`:

```ts
import type { CheckinType } from './types'

export const CHECKIN_TYPES: CheckinType[] = ['wake', 'study', 'goal']

export interface MemberSummary {
  id: string
  name: string
}

export interface TodayPost {
  authorId: string
  type: CheckinType
}

export interface TodayStatusRow {
  member: MemberSummary
  completed: Record<CheckinType, boolean>
}

export function buildTodayStatus(members: MemberSummary[], todaysPosts: TodayPost[]): TodayStatusRow[] {
  return members.map((member) => {
    const completed = {} as Record<CheckinType, boolean>
    for (const type of CHECKIN_TYPES) {
      completed[type] = todaysPosts.some((post) => post.authorId === member.id && post.type === type)
    }
    return { member, completed }
  })
}

export function getMissingTypes(userId: string, todaysPosts: TodayPost[]): CheckinType[] {
  return CHECKIN_TYPES.filter(
    (type) => !todaysPosts.some((post) => post.authorId === userId && post.type === type)
  )
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/checkin/status.test.ts`
Expected: PASS — all 5 tests green.

- [x] **Step 6: Commit**

```bash
git add lib/checkin/types.ts lib/checkin/status.ts lib/checkin/status.test.ts
git commit -m "Add checkin domain types and today-status logic"
```

---

## Task 3: Calendar grid logic

**Files:**

- Create: `lib/checkin/calendar.ts`
- Test: `lib/checkin/calendar.test.ts`

- [x] **Step 1: Write the failing tests**

Create `lib/checkin/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildMonthCalendar, groupPostsByMember } from './calendar'

describe('buildMonthCalendar', () => {
  it('places a post on the correct day cell', () => {
    const posts = [
      {
        id: 'p1',
        authorId: 'u1',
        authorName: '김민수',
        type: 'wake' as const,
        createdAt: '2026-08-10T03:00:00.000Z',
      },
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
      {
        id: 'p1',
        authorId: 'u2',
        authorName: '이지은',
        type: 'wake' as const,
        createdAt: '2026-08-10T00:00:00.000Z',
      },
      {
        id: 'p2',
        authorId: 'u1',
        authorName: '김민수',
        type: 'study' as const,
        createdAt: '2026-08-11T00:00:00.000Z',
      },
      {
        id: 'p3',
        authorId: 'u1',
        authorName: '김민수',
        type: 'goal' as const,
        createdAt: '2026-08-12T00:00:00.000Z',
      },
    ]

    const grouped = groupPostsByMember(posts)

    expect(grouped.map((g) => g.authorName)).toEqual(['김민수', '이지은'])
    expect(grouped[0].posts).toHaveLength(2)
    expect(grouped[1].posts).toHaveLength(1)
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/checkin/calendar.test.ts`
Expected: FAIL — `Cannot find module './calendar'`.

- [x] **Step 3: Implement the calendar logic**

Create `lib/checkin/calendar.ts`:

```ts
import type { CheckinType } from './types'

export interface CalendarPost {
  id: string
  authorId: string
  authorName: string
  type: CheckinType
  createdAt: string
}

export interface CalendarDay {
  date: string
  inMonth: boolean
  posts: CalendarPost[]
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildMonthCalendar(year: number, month: number, posts: CalendarPost[]): CalendarDay[][] {
  const postsByDate = new Map<string, CalendarPost[]>()
  for (const post of posts) {
    const key = post.createdAt.slice(0, 10)
    const list = postsByDate.get(key) ?? []
    list.push(post)
    postsByDate.set(key, list)
  }

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startWeekday = firstOfMonth.getUTCDay()
  const cursor = new Date(firstOfMonth)
  cursor.setUTCDate(cursor.getUTCDate() - startWeekday)

  const weeks: CalendarDay[][] = []

  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = []
    for (let day = 0; day < 7; day++) {
      const key = toDateKey(cursor)
      days.push({
        date: key,
        inMonth: cursor.getUTCMonth() === month - 1,
        posts: postsByDate.get(key) ?? [],
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(days)
  }

  return weeks
}

export function groupPostsByMember(
  posts: CalendarPost[]
): { authorId: string; authorName: string; posts: CalendarPost[] }[] {
  const map = new Map<string, { authorId: string; authorName: string; posts: CalendarPost[] }>()

  for (const post of posts) {
    const existing = map.get(post.authorId)
    if (existing) {
      existing.posts.push(post)
    } else {
      map.set(post.authorId, { authorId: post.authorId, authorName: post.authorName, posts: [post] })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.authorName.localeCompare(b.authorName))
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/checkin/calendar.test.ts`
Expected: PASS — all 4 tests green.

- [x] **Step 5: Commit**

```bash
git add lib/checkin/calendar.ts lib/checkin/calendar.test.ts
git commit -m "Add checkin calendar grid logic"
```

---

## Task 4: `createCheckinPost` server action

**Files:**

- Modify: `next.config.ts` (raise Server Action body size limit for photo uploads)
- Create: `app/(app)/checkin/actions.ts`
- Test: `app/(app)/checkin/actions.test.ts`

- [x] **Step 1: Raise the Server Action body size limit**

Modify `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
```

- [x] **Step 2: Write the failing tests**

Create `app/(app)/checkin/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { createCheckinPost } from './actions'

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

describe('createCheckinPost', () => {
  it('redirects with an error when the body is missing', async () => {
    const formData = buildFormData({ type: 'wake', body: '' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid checkin type', async () => {
    const formData = buildFormData({ type: 'invalid', body: '오늘의 인증' })

    await expect(createCheckinPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요')
    )
  })

  it('creates a post without a photo when none is provided', async () => {
    const formData = buildFormData({ type: 'wake', body: '오늘의 인증' })

    await createCheckinPost(formData)

    expect(uploadMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('uploads the photo and stores its public URL when provided', async () => {
    const photo = new File(['fake-image-bytes'], 'photo.jpg', { type: 'image/jpeg' })
    const formData = buildFormData({ type: 'wake', body: '오늘의 인증', photo })

    await createCheckinPost(formData)

    expect(uploadMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      author_id: 'user-1',
      type: 'wake',
      body: '오늘의 인증',
      photo_url: 'https://example.com/photo.jpg',
    })
  })
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [x] **Step 4: Implement the action**

Create `app/(app)/checkin/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CHECKIN_TYPES } from '@/lib/checkin/status'
import type { CheckinType } from '@/lib/checkin/types'

function isCheckinType(value: string): value is CheckinType {
  return (CHECKIN_TYPES as string[]).includes(value)
}

export async function createCheckinPost(formData: FormData) {
  const type = formData.get('type') as string
  const body = formData.get('body') as string
  const photo = formData.get('photo') as File | null

  if (!type || !isCheckinType(type) || !body) {
    redirect('/checkin?error=' + encodeURIComponent('인증 종류와 내용을 입력해주세요'))
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

  let photoUrl: string | null = null

  if (photo && photo.size > 0) {
    const path = `${user.id}/${Date.now()}-${photo.name}`
    const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(path, photo)

    if (uploadError) {
      redirect('/checkin?error=' + encodeURIComponent(uploadError.message))
      return
    }

    const { data: publicUrlData } = supabase.storage.from('checkin-photos').getPublicUrl(path)
    photoUrl = publicUrlData.publicUrl
  }

  const { error } = await supabase
    .from('checkin_posts')
    .insert({ author_id: user.id, type, body, photo_url: photoUrl })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/checkin')
  revalidatePath('/')
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: PASS — all 4 tests green.

- [x] **Step 6: Commit**

```bash
git add next.config.ts "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "Add createCheckinPost server action with optional photo upload"
```

---

## Task 5: `addComment` server action

**Files:**

- Modify: `app/(app)/checkin/actions.ts`
- Modify: `app/(app)/checkin/actions.test.ts`

- [x] **Step 1: Add the failing tests**

Append to `app/(app)/checkin/actions.test.ts`:

```ts
import { addComment } from './actions'

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
```

(Add the `import { addComment } from './actions'` line next to the existing `createCheckinPost` import at the top of the file instead of re-importing inside the block above.)

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: FAIL — `addComment is not a function` / `Cannot find export 'addComment'`.

- [x] **Step 3: Implement the action**

Add to `app/(app)/checkin/actions.ts`:

```ts
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
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: PASS — all 6 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "Add addComment server action for checkin posts"
```

---

## Task 6: `toggleReaction` server action

**Files:**

- Modify: `app/(app)/checkin/actions.ts`
- Modify: `app/(app)/checkin/actions.test.ts`

- [x] **Step 1: Add the failing tests**

Append to `app/(app)/checkin/actions.test.ts` (and add `import { toggleReaction } from './actions'` at the top):

```ts
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
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: FAIL — `Cannot find export 'toggleReaction'`.

- [x] **Step 3: Implement the action**

Add to `app/(app)/checkin/actions.ts`:

```ts
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
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: PASS — all 8 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "Add toggleReaction server action for checkin posts"
```

---

## Task 7: `deleteCheckinPost` server action (admin-only)

**Files:**

- Modify: `app/(app)/checkin/actions.ts`
- Modify: `app/(app)/checkin/actions.test.ts`

- [x] **Step 1: Add the failing tests**

Append to `app/(app)/checkin/actions.test.ts` (and add `import { deleteCheckinPost } from './actions'` at the top):

```ts
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

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: FAIL — `Cannot find export 'deleteCheckinPost'`.

- [x] **Step 3: Implement the action**

Add to `app/(app)/checkin/actions.ts`:

```ts
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

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts"`
Expected: PASS — all 10 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "Add admin-only deleteCheckinPost server action"
```

---

## Task 8: Post creation form component

**Files:**

- Create: `app/(app)/checkin/post-form.tsx`
- Test: `app/(app)/checkin/post-form.test.tsx`

- [x] **Step 1: Write the failing test**

Create `app/(app)/checkin/post-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the type select, body textarea, photo input, and submit button', () => {
    render(<PostForm />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('오늘의 인증 내용을 남겨주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument()
  })

  it('lists all three checkin types as options', () => {
    render(<PostForm />)

    expect(screen.getByRole('option', { name: '기상' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '스터디' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '목표달성' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/checkin/post-form.test.tsx"`
Expected: FAIL — `Cannot find module './post-form'`.

- [x] **Step 3: Implement the component**

Create `app/(app)/checkin/post-form.tsx`:

```tsx
import { createCheckinPost } from './actions'
import { CHECKIN_TYPE_LABELS } from '@/lib/checkin/types'

export function PostForm() {
  return (
    <form action={createCheckinPost} className="flex flex-col gap-3 rounded border p-4">
      <select name="type" required defaultValue="" className="rounded border px-3 py-2">
        <option value="" disabled>
          인증 종류 선택
        </option>
        {Object.entries(CHECKIN_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <textarea
        name="body"
        placeholder="오늘의 인증 내용을 남겨주세요"
        required
        className="rounded border px-3 py-2"
      />
      <input type="file" name="photo" accept="image/*" className="text-sm" />
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        인증하기
      </button>
    </form>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/checkin/post-form.test.tsx"`
Expected: PASS — both tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/post-form.tsx" "app/(app)/checkin/post-form.test.tsx"
git commit -m "Add checkin post creation form"
```

---

## Task 9: Post card component

**Files:**

- Create: `app/(app)/checkin/post-card.tsx`
- Test: `app/(app)/checkin/post-card.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/checkin/post-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { CheckinPost } from '@/lib/checkin/types'

const post: CheckinPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  type: 'wake',
  photoUrl: null,
  body: '오늘도 기상 성공!',
  createdAt: '2026-08-10T00:00:00.000Z',
  comments: [
    { id: 'c1', authorId: 'user-2', authorName: '이지은', body: '축하해요', createdAt: '2026-08-10T01:00:00.000Z' },
  ],
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the type label, author, body, and comments', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('기상')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('오늘도 기상 성공!')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
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

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/checkin/post-card.test.tsx"`
Expected: FAIL — `Cannot find module './post-card'`.

- [x] **Step 3: Implement the component**

Create `app/(app)/checkin/post-card.tsx`:

```tsx
import { CHECKIN_TYPE_LABELS, REACTION_EMOJIS, type CheckinPost } from '@/lib/checkin/types'
import { addComment, toggleReaction, deleteCheckinPost } from './actions'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: CheckinPost
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <article className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium">
            {CHECKIN_TYPE_LABELS[post.type]}
          </span>
          <span className="font-medium">{post.authorName}</span>
        </div>
        {isAdmin && (
          <form action={deleteCheckinPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm">{post.body}</p>

      {post.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.photoUrl} alt="인증 사진" className="mt-2 max-h-64 rounded object-cover" />
      )}

      <div className="mt-3 flex gap-2">
        {REACTION_EMOJIS.map((emoji) => {
          const count = post.reactions.filter((r) => r.emoji === emoji).length
          const reacted = post.reactions.some((r) => r.emoji === emoji && r.authorId === currentUserId)
          return (
            <form key={emoji} action={toggleReaction.bind(null, post.id, emoji)}>
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${reacted ? 'bg-black text-white' : ''}`}
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
        <input name="body" placeholder="댓글 달기" required className="flex-1 rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-3 py-1 text-sm">
          등록
        </button>
      </form>
    </article>
  )
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/checkin/post-card.test.tsx"`
Expected: PASS — all 4 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/post-card.tsx" "app/(app)/checkin/post-card.test.tsx"
git commit -m "Add checkin post card with reactions and comments"
```

---

## Task 10: Checkin feed page

**Files:**

- Create: `app/(app)/checkin/page.tsx`
- Test: `app/(app)/checkin/page.test.tsx`

- [x] **Step 1: Write the failing test**

Create `app/(app)/checkin/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const posts = [
  {
    id: 'post-1',
    author_id: 'user-1',
    type: 'wake',
    body: '기상 완료',
    photo_url: null,
    created_at: '2026-08-10T00:00:00.000Z',
  },
]

const comments = [
  { id: 'c1', post_id: 'post-1', author_id: 'admin-1', body: '축하해요', created_at: '2026-08-10T01:00:00.000Z' },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return { eq: () => ({ single: async () => ({ data: { role: 'member' } }) }) }
            }
            return Promise.resolve({ data: profiles })
          },
        }
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

vi.mock('./actions', () => ({
  createCheckinPost: vi.fn(),
  addComment: vi.fn(),
  toggleReaction: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import CheckinPage from './page'

describe('CheckinPage', () => {
  it('renders the post form and the feed of posts with author names and comments', async () => {
    const ui = await CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '인증하기' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('기상 완료')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/checkin/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [x] **Step 3: Implement the page**

Create `app/(app)/checkin/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinType } from '@/lib/checkin/types'

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: posts } = await supabase
    .from('checkin_posts')
    .select('id, author_id, type, body, photo_url, created_at')
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map((p) => p.id)

  const { data: comments } = postIds.length
    ? await supabase
        .from('checkin_comments')
        .select('id, post_id, author_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  const { data: reactions } = postIds.length
    ? await supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    : { data: [] }

  const checkinPosts: CheckinPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    type: post.type as CheckinType,
    photoUrl: post.photo_url,
    body: post.body,
    createdAt: post.created_at,
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
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">인증</h1>
        <a href="/checkin/calendar" className="text-sm text-gray-500 underline">
          달력 보기
        </a>
      </div>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {checkinPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/checkin/page.test.tsx"`
Expected: PASS.

- [x] **Step 5: Full test suite + build check**

Run: `npx vitest run && npm run build`
Expected: All tests pass; build succeeds.

- [x] **Step 6: Commit**

```bash
git add "app/(app)/checkin/page.tsx" "app/(app)/checkin/page.test.tsx"
git commit -m "Add checkin feed page"
```

---

## Task 11: Checkin calendar page

**Files:**

- Create: `app/(app)/checkin/calendar/page.tsx`
- Test: `app/(app)/checkin/calendar/page.test.tsx`

- [x] **Step 1: Write the failing test**

Create `app/(app)/checkin/calendar/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', type: 'wake', created_at: '2026-08-10T00:00:00.000Z' }]

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
  it('renders the month heading and the date/member view toggle', async () => {
    const ui = await CheckinCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '인증 달력 (2026년 8월)' })).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
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

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/checkin/calendar/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [x] **Step 3: Implement the page**

Create `app/(app)/checkin/calendar/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'

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

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: posts } = await supabase
    .from('checkin_posts')
    .select('id, author_id, type, created_at')
    .gte('created_at', start)
    .lt('created_at', end)

  const calendarPosts: CalendarPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    type: post.type as CheckinType,
    createdAt: post.created_at,
  }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        인증 달력 ({year}년 {month}월)
      </h1>

      <div className="mb-4 flex gap-3 text-sm">
        <a
          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </a>
        <a
          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </a>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td key={day.date} className={`border p-2 align-top ${day.inMonth ? '' : 'text-gray-300'}`}>
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName} · {CHECKIN_TYPE_LABELS[post.type]}
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.createdAt.slice(0, 10)} · {CHECKIN_TYPE_LABELS[post.type]}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/checkin/calendar/page.test.tsx"`
Expected: PASS — both tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/checkin/calendar/page.tsx" "app/(app)/checkin/calendar/page.test.tsx"
git commit -m "Add checkin calendar page with date/member views"
```

---

## Task 12: Wire the dashboard's today-status table

**Files:**

- Modify: `app/(app)/page.tsx`
- Modify: `app/(app)/page.test.tsx`

- [x] **Step 1: Replace the failing test with Supabase-backed assertions**

Replace the contents of `app/(app)/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({ data: [{ author_id: 'user-2', type: 'wake' }] }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import DashboardPage from './page'

describe('DashboardPage', () => {
  it('renders the dashboard heading', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
  })

  it('shows the missing-checkin message for the current user', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText(/기상, 스터디, 목표달성 인증을 하지 않았어요/)).toBeInTheDocument()
  })

  it('renders a status row per approved member with a checkmark for completed types', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/page.test.tsx"`
Expected: FAIL — the current `DashboardPage` is synchronous and renders neither the status message nor a table, so `getByText(/기상, 스터디, 목표달성/)` and the member names will not be found.

- [x] **Step 3: Implement the dashboard**

Replace the contents of `app/(app)/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from '@/lib/checkin/status'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: members } = await supabase.from('profiles').select('id, name').eq('status', 'approved')

  const { start, end } = todayRangeUtc()
  const { data: todaysPosts } = await supabase
    .from('checkin_posts')
    .select('author_id, type')
    .gte('created_at', start)
    .lt('created_at', end)

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const posts = (todaysPosts ?? []).map((p) => ({ authorId: p.author_id, type: p.type as CheckinType }))

  const statusRows = buildTodayStatus(memberSummaries, posts)
  const missingTypes = user ? getMissingTypes(user.id, posts) : []

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {missingTypes.length > 0 ? (
        <p className="mt-2 text-sm text-amber-600">
          오늘 아직 {missingTypes.map((t) => CHECKIN_TYPE_LABELS[t]).join(', ')} 인증을 하지 않았어요.
        </p>
      ) : (
        <p className="mt-2 text-sm text-green-600">오늘의 인증을 모두 완료했어요!</p>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">멤버</th>
            {CHECKIN_TYPES.map((type) => (
              <th key={type} className="border p-2">
                {CHECKIN_TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border p-2">{row.member.name}</td>
              {CHECKIN_TYPES.map((type) => (
                <td key={type} className="border p-2 text-center">
                  {row.completed[type] ? '✅' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/page.test.tsx"`
Expected: PASS — all 3 tests green.

- [x] **Step 5: Full test suite + build check**

Run: `npx vitest run && npm run build`
Expected: All tests pass; build succeeds.

- [x] **Step 6: Commit**

```bash
git add "app/(app)/page.tsx" "app/(app)/page.test.tsx"
git commit -m "Wire dashboard today-status table into checkin data"
```

---

## Task 13: Verify end-to-end against a real Supabase project

This task has no automated test — it is a manual walkthrough to confirm the checkin board works end-to-end with real Supabase Storage and RLS.

- [x] **Step 1: Confirm the migration and bucket are live**

In the Supabase dashboard, re-check that `0002_checkin.sql` ran successfully (Task 1) and that the `checkin-photos` bucket appears under Storage.

- [x] **Step 2: Start the dev server**

```bash
npm run dev
```

- [x] **Step 3: Post a check-in without a photo**

Log in as an approved member, visit `http://localhost:3000/checkin`, submit the form with type=기상 and some text, no photo.
Expected: Redirected back to `/checkin`, the new post appears at the top of the feed with the "기상" badge.

- [x] **Step 4: Post a check-in with a photo**

Submit the form again with a photo attached.
Expected: Post appears with the photo rendered inline (loaded from the public `checkin-photos` bucket URL).

- [x] **Step 5: Comment and react**

Log in as a second approved member. Add a comment on the first member's post; click a reaction emoji, then click it again.
Expected: Comment appears immediately under the post; the emoji count increases by 1 then returns to 0 after the second click (toggle).

- [x] **Step 6: Confirm admin delete**

Log in as the admin account, open `/checkin`, click "삭제" on a post.
Expected: Post disappears from the feed for all users. Confirm a non-admin does not see a "삭제" button on any post.

- [x] **Step 7: Confirm the calendar**

Visit `/checkin/calendar`. Expected: the current month renders with today's post(s) shown on the correct day cell. Switch to "멤버별" and confirm posts are grouped correctly by author.

- [x] **Step 8: Confirm the dashboard status table**

Visit `/`. Expected: a member × type table shows a checkmark for every check-in posted today, and the banner message reflects the current user's own remaining check-ins for today (or the "모두 완료" message if none are missing).

- [x] **Step 9: Record completion**

No commit needed for this task — it's verification only. If any step fails, fix the underlying code/config before moving on to the next board-feature plan (코테 스터디).

---

## Self-Review Notes

- **Spec coverage:** 기상/스터디/목표달성 3종 피드 + 태그 표시, 글쓰기(사진+텍스트+종류), 댓글, 이모지 반응, `/checkin/calendar` 날짜별/멤버별 뷰, 대시보드 오늘의 현황판(멤버×종류 표 + 본인 미완료 항목 안내), 관리자 게시글 삭제 — all covered by Tasks 1–12. Coding/jobposts/interviews boards remain out of scope, to be separate plans as before.
- **Type consistency:** `CheckinType`, `CHECKIN_TYPE_LABELS`, and `CheckinPost`/`CheckinComment`/`CheckinReaction` are defined once in `lib/checkin/types.ts` and reused by `status.ts`, `calendar.ts`, the actions, and every page/component. `CHECKIN_TYPES` (the canonical array) lives in `status.ts` and is imported by `actions.ts` for validation and by the dashboard — not redefined elsewhere.
- **No placeholders:** every step contains complete, runnable code. The only non-automated steps are applying the SQL migration/storage bucket and the final manual end-to-end walkthrough (Task 13), each with explicit expected outcomes.
- **Assumptions to confirm with the user before/while executing:** photo-optional, admin-only post deletion, fixed 3-emoji reaction set — see the header's Assumptions section. If any of these are wrong, the affected tasks (1, 4, 7, 9) are the ones to revisit.
