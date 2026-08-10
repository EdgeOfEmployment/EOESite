# Coding Study Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 코테 스터디 board (`/coding`) — the second of the four study-site boards — where admins register weekly coding-test problems (title, link, target week) and every approved member self-checks off problems they've solved (verified manually against the group's shared GitHub repo, not via any GitHub API). Past weeks accumulate as history on the same page.

**Architecture:** Two new Postgres tables (`coding_problems`, `coding_checks`) gated by RLS to approved members, with insert/delete on `coding_problems` restricted to admins. A pure `lib/coding/week.ts` module computes the "most recent Tuesday" default and groups/labels problems by week — the only non-trivial logic, and the only thing worth unit testing directly. Server Actions handle problem creation (admin), self-check toggling, and admin deletion. The page composes everything with plain multi-query Supabase fetches, the same approach used successfully in the checkin board.

**Tech Stack:** Next.js (App Router, TypeScript) Server Actions, Supabase (Postgres + Auth + RLS), Tailwind CSS, Vitest + React Testing Library. Builds on the foundation (`docs/superpowers/plans/2026-07-29-study-site-foundation.md`) and follows the same patterns established in the checkin board (`docs/superpowers/plans/2026-08-10-checkin-board.md`).

**Spec:** `docs/superpowers/specs/2026-07-29-study-site-design.md` (코테 스터디 section)

**Bug found while planning this board (fixed in Task 1):** `supabase/migrations/0001_init.sql` only grants `profiles` SELECT to the row owner (`auth.uid() = id`) or to admins (`is_admin()`). Non-admin approved members currently cannot read other members' profile rows at all — meaning the checkin board's author names, comment names, and dashboard status table are almost certainly showing correctly only when viewed as an admin, and broken (missing/blank names, single-row status table) for ordinary members. This plan's migration adds an "approved members can read all profiles" policy to fix this for both boards. **After Task 1's migration is applied, log in as a non-admin approved member and re-check `/checkin`, `/checkin/calendar`, and `/` to confirm other members' names now show correctly** — this isn't optional cleanup, it's confirming a real fix to already-shipped code.

**Assumptions (not fully specified in the spec — flag if wrong):**
- Self-check is a toggle (checking again un-checks), matching the reaction-toggle UX already used in the checkin board, for the same "let people fix mistakes" reason.
- Only admins can delete problems (the spec's board-moderation "게시글 삭제" permission, same reasoning as the checkin board's admin-only post deletion).
- "대상 주차" is stored as the literal Tuesday date (a `date` column), which lets weeks sort and group naturally; the admin's registration form defaults it to the most recent Tuesday but the field stays editable.
- No separate calendar/history page — unlike checkin's `/checkin/calendar`, the spec only names `/coding` for this board, so "히스토리로 누적" is satisfied by listing all weeks (newest first) on the same page.

---

## File Structure

```
supabase/
  migrations/
    0003_coding.sql          # profiles RLS fix + coding_problems/coding_checks tables + RLS
lib/
  coding/
    types.ts                  # Member, CodingProblem
    week.ts                    # getMostRecentTuesday, formatWeekLabel, groupByWeek
    week.test.ts
app/
  (app)/
    coding/
      actions.ts                # createProblem (admin), toggleCheck, deleteProblem (admin)
      actions.test.ts
      problem-form.tsx           # admin-only problem registration form
      problem-form.test.tsx
      problem-card.tsx            # one problem: title/link, member checklist, self-check, admin delete
      problem-card.test.tsx
      page.tsx                     # /coding board, grouped by week
      page.test.tsx
```

---

## Task 1: Database schema migration — profiles RLS fix + coding board tables

**Files:**

- Create: `supabase/migrations/0003_coding.sql`

- [x] **Step 1: Write the migration**

Create `supabase/migrations/0003_coding.sql`:

```sql
-- Fix: only the row owner or an admin could read a profile (see
-- 0001_init.sql). Non-admin approved members couldn't read each other's
-- names, which the checkin board relies on for author/comment names and
-- the dashboard status table. Add a security-definer helper (same pattern
-- as is_admin()) and a policy so any approved member can read all profiles.
create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and status = 'approved'
  );
$$;

create policy "Approved members can read all profiles"
  on profiles for select
  using (public.is_approved());

create table coding_problems (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  link text not null,
  week_of date not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table coding_checks (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references coding_problems(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  checked_at timestamptz not null default now(),
  unique (problem_id, user_id)
);

alter table coding_problems enable row level security;
alter table coding_checks enable row level security;

create policy "Approved members can read coding problems"
  on coding_problems for select
  using (public.is_approved());

create policy "Admins can create coding problems"
  on coding_problems for insert
  with check (public.is_admin());

create policy "Admins can delete coding problems"
  on coding_problems for delete
  using (public.is_admin());

create policy "Approved members can read coding checks"
  on coding_checks for select
  using (public.is_approved());

create policy "Members can create own coding checks"
  on coding_checks for insert
  with check (user_id = auth.uid() and public.is_approved());

create policy "Members can delete own coding checks"
  on coding_checks for delete
  using (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration manually**

Open the Supabase project dashboard → SQL Editor → paste the contents of `0003_coding.sql` → Run.

- [ ] **Step 3: Verify manually**

In the Supabase dashboard → Table Editor, confirm `coding_problems` and `coding_checks` tables exist. In Authentication/Database → Policies (or the SQL Editor with `select * from pg_policies where tablename = 'profiles';`), confirm a new "Approved members can read all profiles" policy exists on `profiles`.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/0003_coding.sql
git commit -m "Fix profiles RLS so approved members can read each other, add coding board tables"
```

---

## Task 2: Coding domain types and week logic

**Files:**

- Create: `lib/coding/types.ts`
- Create: `lib/coding/week.ts`
- Test: `lib/coding/week.test.ts`

- [x] **Step 1: Write the domain types**

Create `lib/coding/types.ts`:

```ts
export interface Member {
  id: string
  name: string
}

export interface CodingProblem {
  id: string
  title: string
  link: string
  weekOf: string
  createdBy: string
  createdAt: string
  checkedUserIds: string[]
}
```

- [x] **Step 2: Write the failing tests for the week logic**

Create `lib/coding/week.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getMostRecentTuesday, formatWeekLabel, groupByWeek } from './week'

describe('getMostRecentTuesday', () => {
  it('returns the same date when given a Tuesday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-11T12:00:00.000Z'))).toBe('2026-08-11')
  })

  it('returns the prior Tuesday when given a Wednesday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-12T12:00:00.000Z'))).toBe('2026-08-11')
  })

  it('returns the prior Tuesday when given a Monday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-10T12:00:00.000Z'))).toBe('2026-08-04')
  })

  it('returns the prior Tuesday when given a Sunday', () => {
    expect(getMostRecentTuesday(new Date('2026-08-09T12:00:00.000Z'))).toBe('2026-08-04')
  })
})

describe('formatWeekLabel', () => {
  it('formats a week-of date as "M/D 주차"', () => {
    expect(formatWeekLabel('2026-08-11')).toBe('8/11 주차')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(formatWeekLabel('2026-01-06')).toBe('1/6 주차')
  })
})

describe('groupByWeek', () => {
  it('groups items by weekOf and sorts newest week first', () => {
    const items = [
      { id: 'a', weekOf: '2026-08-04' },
      { id: 'b', weekOf: '2026-08-11' },
      { id: 'c', weekOf: '2026-08-04' },
    ]

    const groups = groupByWeek(items)

    expect(groups.map((g) => g.weekOf)).toEqual(['2026-08-11', '2026-08-04'])
    expect(groups[1].items.map((i) => i.id)).toEqual(['a', 'c'])
  })
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: FAIL — `Cannot find module './week'`.

- [x] **Step 4: Implement the week logic**

Create `lib/coding/week.ts`:

```ts
export interface WeekGroup<T> {
  weekOf: string
  items: T[]
}

export function getMostRecentTuesday(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = (day - 2 + 7) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

export function formatWeekLabel(weekOf: string): string {
  const [, month, day] = weekOf.split('-')
  return `${Number(month)}/${Number(day)} 주차`
}

export function groupByWeek<T extends { weekOf: string }>(items: T[]): WeekGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const list = map.get(item.weekOf) ?? []
    list.push(item)
    map.set(item.weekOf, list)
  }
  return Array.from(map.entries())
    .map(([weekOf, items]) => ({ weekOf, items }))
    .sort((a, b) => b.weekOf.localeCompare(a.weekOf))
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: PASS — all 7 tests green.

- [x] **Step 6: Commit**

```bash
git add lib/coding/types.ts lib/coding/week.ts lib/coding/week.test.ts
git commit -m "Add coding board domain types and week logic"
```

---

## Task 3: `createProblem` server action (admin-only)

**Files:**

- Create: `app/(app)/coding/actions.ts`
- Test: `app/(app)/coding/actions.test.ts`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/coding/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { createProblem } from './actions'

function buildFormData(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return formData
}

function mockAdminCheck(role: 'admin' | 'member') {
  fromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
    }
    if (table === 'coding_problems') {
      return { insert: insertMock }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getUserMock.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  insertMock.mockResolvedValue({ error: null })
  mockAdminCheck('admin')
})

describe('createProblem', () => {
  it('redirects with an error when a required field is missing', async () => {
    const formData = buildFormData({ title: '두 수의 합', link: '', weekOf: '2026-08-11' })

    await expect(createProblem(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the caller is not an admin', async () => {
    mockAdminCheck('member')
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
    })

    await expect(createProblem(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates the problem and revalidates /coding', async () => {
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
    })

    await createProblem(formData)

    expect(insertMock).toHaveBeenCalledWith({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      week_of: '2026-08-11',
      created_by: 'admin-1',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `Cannot find module './actions'`.

- [x] **Step 3: Implement the action**

Create `app/(app)/coding/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createProblem(formData: FormData) {
  const title = formData.get('title') as string
  const link = formData.get('link') as string
  const weekOf = formData.get('weekOf') as string

  if (!title || !link || !weekOf) {
    redirect('/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요'))
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

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_problems')
    .insert({ title, link, week_of: weekOf, created_by: user.id })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 3 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add admin-only createProblem server action"
```

---

## Task 4: `toggleCheck` server action

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

- [x] **Step 1: Add the failing tests**

Append to `app/(app)/coding/actions.test.ts` (add `import { toggleCheck } from './actions'` at the top alongside the existing import):

```ts
describe('toggleCheck', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'coding_checks') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
          }),
        }),
        insert,
        delete: () => ({ eq: deleteEq }),
      }
    })

    return { deleteEq, insert }
  }

  it('inserts a check when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleCheck('problem-1')

    expect(insert).toHaveBeenCalledWith({ problem_id: 'problem-1', user_id: 'admin-1' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('deletes the existing check when the user already checked it', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'check-1' })

    await toggleCheck('problem-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'check-1')
    expect(insert).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `Cannot find export 'toggleCheck'`.

- [x] **Step 3: Implement the action**

Add to `app/(app)/coding/actions.ts`:

```ts
export async function toggleCheck(problemId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('coding_checks')
    .select('id')
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('coding_checks').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('coding_checks')
      .insert({ problem_id: problemId, user_id: user.id })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/coding')
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 5 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add toggleCheck server action for coding problems"
```

---

## Task 5: `deleteProblem` server action (admin-only)

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

- [x] **Step 1: Add the failing tests**

Append to `app/(app)/coding/actions.test.ts` (add `import { deleteProblem } from './actions'` at the top):

```ts
describe('deleteProblem', () => {
  it('deletes the problem when the caller is an admin', async () => {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    mockAdminCheck('admin')
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }) }
      }
      if (table === 'coding_problems') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await deleteProblem('problem-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'problem-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws when the caller is not an admin', async () => {
    const deleteEq = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'member' }, error: null }) }) }) }
      }
      if (table === 'coding_problems') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(deleteProblem('problem-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `Cannot find export 'deleteProblem'`.

- [x] **Step 3: Implement the action**

Add to `app/(app)/coding/actions.ts`:

```ts
export async function deleteProblem(problemId: string) {
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

  const { error } = await supabase.from('coding_problems').delete().eq('id', problemId)

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 7 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add admin-only deleteProblem server action"
```

---

## Task 6: Problem registration form component

**Files:**

- Create: `app/(app)/coding/problem-form.tsx`
- Test: `app/(app)/coding/problem-form.test.tsx`

- [x] **Step 1: Write the failing test**

Create `app/(app)/coding/problem-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblem: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getMostRecentTuesday: () => '2026-08-11',
}))

import { ProblemForm } from './problem-form'

describe('ProblemForm', () => {
  it('renders title, link, and week-of inputs plus a submit button', () => {
    render(<ProblemForm />)

    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    expect(screen.getByLabelText('대상 주차')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it('defaults the week-of field to the most recent Tuesday', () => {
    render(<ProblemForm />)
    expect(screen.getByLabelText('대상 주차')).toHaveValue('2026-08-11')
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: FAIL — `Cannot find module './problem-form'`.

- [x] **Step 3: Implement the component**

Create `app/(app)/coding/problem-form.tsx`:

```tsx
import { createProblem } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'

export function ProblemForm() {
  const defaultWeek = getMostRecentTuesday(new Date())

  return (
    <form action={createProblem} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="title" className="sr-only">
        문제명
      </label>
      <input id="title" name="title" placeholder="문제명" required className="rounded border px-3 py-2" />
      <label htmlFor="link" className="sr-only">
        문제 링크
      </label>
      <input
        id="link"
        name="link"
        type="url"
        placeholder="문제 링크"
        required
        className="rounded border px-3 py-2"
      />
      <label htmlFor="weekOf" className="sr-only">
        대상 주차
      </label>
      <input
        id="weekOf"
        name="weekOf"
        type="date"
        defaultValue={defaultWeek}
        required
        className="rounded border px-3 py-2"
      />
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        문제 등록
      </button>
    </form>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: PASS — both tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/problem-form.tsx" "app/(app)/coding/problem-form.test.tsx"
git commit -m "Add coding problem registration form"
```

---

## Task 7: Problem card component

**Files:**

- Create: `app/(app)/coding/problem-card.tsx`
- Test: `app/(app)/coding/problem-card.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/coding/problem-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  toggleCheck: vi.fn(),
  deleteProblem: vi.fn(),
}))

import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

const problem: CodingProblem = {
  id: 'problem-1',
  title: '두 수의 합',
  link: 'https://example.com/problem/1',
  weekOf: '2026-08-11',
  createdBy: 'admin-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  checkedUserIds: ['user-2'],
}

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

describe('ProblemCard', () => {
  it('renders the problem title as a link and lists all members', () => {
    render(<ProblemCard problem={problem} members={members} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      'https://example.com/problem/1'
    )
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('shows a clickable check button for the current user only', () => {
    render(<ProblemCard problem={problem} members={members} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByRole('button', { name: '체크' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료' })).not.toBeInTheDocument()
  })

  it("shows another member's completed status as plain text, not a button", () => {
    render(<ProblemCard problem={problem} members={members} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('완료')).toBeInTheDocument()
  })

  it('does not show a delete button for non-admins', () => {
    render(<ProblemCard problem={problem} members={members} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<ProblemCard problem={problem} members={members} currentUserId="user-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: FAIL — `Cannot find module './problem-card'`.

- [x] **Step 3: Implement the component**

Create `app/(app)/coding/problem-card.tsx`:

```tsx
import type { CodingProblem, Member } from '@/lib/coding/types'
import { toggleCheck, deleteProblem } from './actions'

export function ProblemCard({
  problem,
  members,
  currentUserId,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <div className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <a
          href={problem.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          {problem.title}
        </a>
        {isAdmin && (
          <form action={deleteProblem.bind(null, problem.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {members.map((member) => {
          const checked = problem.checkedUserIds.includes(member.id)
          const isSelf = member.id === currentUserId
          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              {isSelf ? (
                <form action={toggleCheck.bind(null, problem.id)}>
                  <button
                    type="submit"
                    aria-pressed={checked}
                    className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-black text-white' : ''}`}
                  >
                    {checked ? '완료' : '체크'}
                  </button>
                </form>
              ) : (
                <span className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-gray-200' : ''}`}>
                  {checked ? '완료' : '미완료'}
                </span>
              )}
              <span>{member.name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: PASS — all 5 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/problem-card.tsx" "app/(app)/coding/problem-card.test.tsx"
git commit -m "Add coding problem card with member checklist"
```

---

## Task 8: Coding board page

**Files:**

- Create: `app/(app)/coding/page.tsx`
- Test: `app/(app)/coding/page.test.tsx`

- [x] **Step 1: Write the failing test**

Create `app/(app)/coding/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const problems = [
  {
    id: 'problem-1',
    title: '두 수의 합',
    link: 'https://example.com/problem/1',
    week_of: '2026-08-11',
    created_by: 'admin-1',
    created_at: '2026-08-11T00:00:00.000Z',
  },
]

const checks = [{ problem_id: 'problem-1', user_id: 'user-1' }]

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
            return { eq: () => Promise.resolve({ data: profiles }) }
          },
        }
      }
      if (table === 'coding_problems') {
        return { select: () => ({ order: async () => ({ data: problems }) }) }
      }
      if (table === 'coding_checks') {
        return { select: () => ({ in: async () => ({ data: checks }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createProblem: vi.fn(),
  toggleCheck: vi.fn(),
  deleteProblem: vi.fn(),
}))

import CodingPage from './page'

describe('CodingPage', () => {
  it('renders the week heading and the problem with member checklist', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('8/11 주차')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.queryByRole('button', { name: '문제 등록' })).not.toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [x] **Step 3: Implement the page**

Create `app/(app)/coding/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { groupByWeek, formatWeekLabel } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

export default async function CodingPage({
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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('status', 'approved')

  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const { data: problems } = await supabase
    .from('coding_problems')
    .select('id, title, link, week_of, created_by, created_at')
    .order('week_of', { ascending: false })

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = problemIds.length
    ? await supabase.from('coding_checks').select('problem_id, user_id').in('problem_id', problemIds)
    : { data: [] }

  const codingProblems: CodingProblem[] = (problems ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    weekOf: problem.week_of,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    checkedUserIds: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => c.user_id),
  }))

  const weekGroups = groupByWeek(codingProblems)

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">코테 스터디</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      {isAdmin && <ProblemForm />}
      <div className="mt-6 flex flex-col gap-6">
        {weekGroups.map((week) => (
          <section key={week.weekOf}>
            <h2 className="mb-2 text-lg font-semibold">{formatWeekLabel(week.weekOf)}</h2>
            <div className="flex flex-col gap-3">
              {week.items.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  currentUserId={user!.id}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {weekGroups.length === 0 && (
          <p className="text-sm text-gray-500">아직 등록된 문제가 없습니다.</p>
        )}
      </div>
    </main>
  )
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: PASS — both tests green.

- [x] **Step 5: Full test suite + build check**

Run: `npx vitest run && npm run build`
Expected: All tests pass; build succeeds.

- [x] **Step 6: Commit**

```bash
git add "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "Add coding board page grouped by week"
```

---

## Task 9: Verify end-to-end against a real Supabase project

This task has no automated test — it is a manual walkthrough to confirm the coding board works end-to-end, and specifically to confirm the profiles RLS fix from Task 1.

- [ ] **Step 1: Confirm the migration is live**

In the Supabase dashboard, re-check that `0003_coding.sql` ran successfully (Task 1).

- [ ] **Step 2: Confirm the profiles RLS fix (regression check on the checkin board)**

Start the dev server (`npm run dev`) and log in as a **non-admin** approved member (not the admin account). Visit `/checkin` and `/`.
Expected: Other members' real names now show correctly in the feed, comments, and the dashboard status table (previously, before this plan's Task 1 fix, they may have shown as missing/blank or the dashboard table may have shown only your own row).

- [ ] **Step 3: Register a problem as admin**

Log in as the admin account, visit `/coding`. Confirm the registration form is visible (it should not be visible when logged in as a non-admin, per Step 2's session). Submit a problem with a title, a link, and the default (or a custom) week.
Expected: Redirected back to `/coding`, the problem appears under its week heading (e.g. "8/11 주차") with every approved member listed.

- [ ] **Step 4: Self-check as a non-admin member**

Log in as a non-admin approved member. Visit `/coding`, click "체크" next to your own name on the problem.
Expected: Your row switches to "완료" (as a clickable button, still toggleable). Other members' rows still show "미완료" as plain (non-clickable) text. Click "완료" again to confirm it toggles back to "체크".

Log in as a different non-admin member and confirm you cannot check/uncheck the first member's row (no button appears next to their name, only plain text).

- [ ] **Step 5: Confirm admin delete**

Log in as the admin account, click "삭제" on the problem.
Expected: The problem disappears from `/coding` for all users. Confirm non-admin accounts never see a "삭제" button.

- [ ] **Step 6: Confirm history accumulation**

Register two problems under two different weeks (e.g. this week and last week, using the week-of date field).
Expected: Both weeks appear on `/coding`, most recent week first, each with its own problems.

- [ ] **Step 7: Record completion**

No commit needed for this task — it's verification only. If any step fails, fix the underlying code/config before moving on to the next board-feature plan (자소서 피드백 + 회사분석).

---

## Self-Review Notes

- **Spec coverage:** 관리자 전용 문제 등록(문제명/링크/대상 주차), 문제별 멤버 체크리스트(본인만 체크 가능, GitHub API 없이 수동 자가 체크), 지난 주차 히스토리 누적 — all covered by Tasks 1–8. Jobposts/feedback and interviews boards remain out of scope, to be separate plans as before.
- **Type consistency:** `Member` and `CodingProblem` are defined once in `lib/coding/types.ts` and reused by `week.ts`, the actions, and every page/component — not redefined elsewhere. `week_of` (DB column) / `weekOf` (TS field) mapping is applied consistently at the one place data crosses the boundary (`page.tsx`'s composition step and `actions.ts`'s insert call), matching the same pattern already proven in the checkin board.
- **No placeholders:** every step contains complete, runnable code. The only non-automated steps are applying the SQL migration and the final manual end-to-end walkthrough (Task 9), each with explicit expected outcomes.
- **Regression fix included:** Task 1 also fixes a real bug in already-shipped code (non-admin members couldn't read other members' profiles), discovered while designing this board's member-checklist feature. Task 9 Step 2 explicitly re-verifies the checkin board under this fix, not just the new coding board.
- **Assumptions to confirm with the user before/while executing:** self-check-is-a-toggle, admin-only problem deletion, no separate history/calendar page — see the header's Assumptions section. If any of these are wrong, the affected tasks (1, 4, 5, 8) are the ones to revisit.
