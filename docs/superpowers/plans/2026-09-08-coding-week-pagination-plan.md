# Coding Board Week Pagination & Manual Weeks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coding board's implicit, date-computed "week" with an explicit `coding_weeks` entity that admins author directly (label + start/end date), and change `/coding` from stacking every week's problems in one scroll to showing exactly one week at a time with prev/next navigation.

**Architecture:** A new `coding_weeks` table (id, label, start_date, end_date) replaces `coding_problems.week_of` (a computed date column) with `coding_problems.week_id` (a real foreign key). Existing data is auto-backfilled in the same migration so nothing visibly changes until an admin creates a new week. The registration form defaults to adding problems to whichever week the admin is currently viewing (a hidden `weekId` field), with a "새 주차 만들기" toggle that switches to blank label/start/end inputs for creating a brand new week. The page reads a `?week=<id>` search param to pick which week's problems to show, defaulting to the newest, with prev/next links computed by a pure `resolveCurrentWeek` helper.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + RLS), Vitest + Testing Library.

**Design doc:** `docs/superpowers/specs/2026-09-08-coding-week-pagination-design.md` — read it for the locked decisions and rationale; this plan implements it directly.

---

## Expected intermediate breakage across tasks

This plan touches files with real import/type dependencies between them, so — like most refactors of this shape — some files are deliberately left non-compiling or test-failing between tasks, resolved by a later task in the same plan. Specifically:

- **After Task 2** (`lib/coding/types.ts`): `app/(app)/coding/page.tsx` gets one new `tsc` error (it still builds a `weekOf` property that `CodingProblem` no longer declares). This is fixed in Task 6. Do not fix it early.
- **After Task 3** (`lib/coding/week.ts` rewritten): `app/(app)/coding/page.tsx` and `app/(app)/coding/problem-form.tsx` get import errors (they still import exports `week.ts` no longer has: `groupByWeek`, `formatWeekLabel`, `getWeekDueDate`, `formatDueDateLabel`, `getMostRecentTuesday`). `page.test.tsx` will also start failing at runtime (it doesn't mock `@/lib/coding/week`, so `page.tsx` calls now-undefined functions). `problem-form.test.tsx` keeps passing — it mocks `'@/lib/coding/week'` entirely, so the real file's shape doesn't reach it at runtime, only `tsc` sees the mismatch. Fixed in Tasks 5 and 6.
- **After Task 4** (`actions.ts`): no ripple — `problem-form.test.tsx` and `page.test.tsx` both mock `'./actions'` wholesale, so the real `createProblems` implementation never reaches them.
- **After Task 5** (`problem-form.tsx`): `page.tsx` still passes the old `<ProblemForm members={members} />` (no `currentWeek` prop) — this is a `tsc` prop-mismatch error in `page.tsx`, fixed in Task 6.

Each task below states exactly what breakage is expected after it and where it gets fixed. If you're implementing one of these tasks and `tsc`/tests show failures **outside the file you're touching**, check this table before treating it as your bug.

---

### Task 1: Database migration — `coding_weeks` table, `week_id` column, backfill

**Files:**
- Create: `supabase/migrations/0013_coding_weeks.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Coding board: replace the implicit, date-computed "week" (coding_problems.week_of
-- snapped to the nearest Tuesday, deadline always week_of + 6 days) with an explicit
-- coding_weeks entity that admins author directly (label + start/end date), so the
-- board can show one week at a time with real prev/next navigation instead of an
-- ever-growing stacked list. See docs/superpowers/specs/2026-09-08-coding-week-pagination-design.md.

create table coding_weeks (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table coding_weeks enable row level security;

create policy "Approved members can read coding weeks"
  on coding_weeks for select
  using (public.is_approved());

create policy "Admins can create coding weeks"
  on coding_weeks for insert
  with check (public.is_admin());

alter table coding_problems add column week_id uuid references coding_weeks(id) on delete cascade;

-- Backfill: one coding_weeks row per distinct prior week_of, preserving the exact
-- label/date-range every admin and member currently sees (formatWeekLabel's "M/D 주차"
-- and week_of + 6 days), so nothing changes for existing data until an admin creates
-- a new week the new way.
insert into coding_weeks (label, start_date, end_date, created_by, created_at)
select
  trim(leading '0' from to_char(week_of, 'MM')) || '/' || trim(leading '0' from to_char(week_of, 'DD')) || ' 주차',
  week_of,
  week_of + 6,
  (array_agg(created_by order by created_at))[1],
  min(created_at)
from coding_problems
group by week_of;

update coding_problems cp
set week_id = cw.id
from coding_weeks cw
where cp.week_of = cw.start_date;

alter table coding_problems alter column week_id set not null;
alter table coding_problems drop column week_of;
```

- [ ] **Step 2: Attempt to apply it**

Run: `npx supabase db push`

If this fails because there's no linked Supabase project in this environment (consistent with how `0012_coding_assignee_and_commit_links.sql` was handled — see project memory), that's expected and not a blocker. Note it in your report and move on. Do not attempt to link a project or work around missing credentials.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_coding_weeks.sql
git commit -m "$(cat <<'EOF'
feat: add coding_weeks table and back-fill coding_problems.week_id

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 2: Coding domain types — add `CodingWeek`, drop `weekOf`

**Files:**
- Modify: `lib/coding/types.ts`
- Modify: `app/(app)/coding/problem-card.test.tsx`

- [ ] **Step 1: Replace `lib/coding/types.ts`**

```ts
export interface Member {
  id: string
  name: string
}

export interface CodingWeek {
  id: string
  label: string
  startDate: string
  endDate: string
}

export interface CodingCheck {
  userId: string
  commitSha: string | null
  filePath: string | null
}

export interface CodingProblem {
  id: string
  title: string
  link: string
  createdBy: string
  createdAt: string
  assigneeIds: string[]
  checks: CodingCheck[]
}
```

- [ ] **Step 2: Fix the now-invalid `problem-card.test.tsx` fixture**

`problem-card.tsx` itself never reads `problem.weekOf` (confirmed — it only uses `id`, `title`, `link`, `assigneeIds`, `checks`), so this is purely a fixture cleanup, not a behavior change. In `app/(app)/coding/problem-card.test.tsx`, remove the now-invalid `weekOf` line from `baseProblem`:

```diff
 const baseProblem: CodingProblem = {
   id: 'problem-1',
   title: '두 수의 합',
   link: 'https://example.com/problem/1',
-  weekOf: '2026-08-11',
   createdBy: 'admin-1',
   createdAt: '2026-08-11T00:00:00.000Z',
   assigneeIds: [],
   checks: [{ userId: 'user-2', commitSha: null, filePath: null }],
 }
```

- [ ] **Step 3: Run the problem-card tests to confirm they still pass**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: PASS (all 10 tests) — this file's own logic is unaffected, only its fixture's shape changed.

- [ ] **Step 4: Confirm the one expected remaining break**

Run: `npx tsc --noEmit`
Expected: exactly one error, in `app/(app)/coding/page.tsx`, where it still builds a `weekOf:` property inside a `CodingProblem[]`-typed array literal. This is fixed in Task 6 — do not fix it here.

- [ ] **Step 5: Commit**

```bash
git add lib/coding/types.ts "app/(app)/coding/problem-card.test.tsx"
git commit -m "$(cat <<'EOF'
feat: add CodingWeek type and drop the computed weekOf field from CodingProblem

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 3: Week helpers — header formatting, date defaults, prev/next resolution

**Files:**
- Modify: `lib/coding/week.ts` (full rewrite — every current export is superseded)
- Modify: `lib/coding/week.test.ts` (full rewrite)

This file currently exports `getMostRecentTuesday`, `formatWeekLabel`, `groupByWeek`, `getWeekDueDate`, `formatDueDateLabel` — all of these existed to compute a week's identity/label/deadline from a single date. None of that is needed anymore: weeks are now admin-authored rows with their own `label`/`startDate`/`endDate`, and grouping happens via a DB query (`week_id`), not client-side date bucketing. This task replaces the whole file with four small, unrelated pure functions.

- [ ] **Step 1: Replace `lib/coding/week.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatWeekHeader, getTodayDate, addDays, resolveCurrentWeek } from './week'

describe('formatWeekHeader', () => {
  it('formats a week as "{label} ({M/D}~{M/D})"', () => {
    expect(
      formatWeekHeader({ label: '1주차', startDate: '2026-09-08', endDate: '2026-09-14' })
    ).toBe('1주차 (9/8~9/14)')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(
      formatWeekHeader({ label: '2주차', startDate: '2026-01-06', endDate: '2026-01-09' })
    ).toBe('2주차 (1/6~1/9)')
  })
})

describe('getTodayDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T15:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current date as YYYY-MM-DD', () => {
    expect(getTodayDate()).toBe('2026-08-11')
  })
})

describe('addDays', () => {
  it('adds the given number of days to a date', () => {
    expect(addDays('2026-08-11', 6)).toBe('2026-08-17')
  })

  it('rolls over the month boundary correctly', () => {
    expect(addDays('2026-08-28', 6)).toBe('2026-09-03')
  })
})

describe('resolveCurrentWeek', () => {
  const weeks = [{ id: 'week-3' }, { id: 'week-2' }, { id: 'week-1' }]

  it('defaults to the newest (first) week when no id is requested', () => {
    const result = resolveCurrentWeek(weeks)
    expect(result.current?.id).toBe('week-3')
    expect(result.prevId).toBe('week-2')
    expect(result.nextId).toBeNull()
  })

  it('resolves to the requested week and computes older/newer neighbors', () => {
    const result = resolveCurrentWeek(weeks, 'week-2')
    expect(result.current?.id).toBe('week-2')
    expect(result.prevId).toBe('week-1')
    expect(result.nextId).toBe('week-3')
  })

  it('hides the older-week link on the oldest week', () => {
    const result = resolveCurrentWeek(weeks, 'week-1')
    expect(result.current?.id).toBe('week-1')
    expect(result.prevId).toBeNull()
    expect(result.nextId).toBe('week-2')
  })

  it('falls back to the newest week when the requested id does not exist', () => {
    const result = resolveCurrentWeek(weeks, 'unknown-id')
    expect(result.current?.id).toBe('week-3')
  })

  it('returns nulls when there are no weeks at all', () => {
    const result = resolveCurrentWeek([])
    expect(result.current).toBeNull()
    expect(result.prevId).toBeNull()
    expect(result.nextId).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: FAIL — none of `formatWeekHeader`, `getTodayDate`, `addDays`, `resolveCurrentWeek` exist yet.

- [ ] **Step 3: Replace `lib/coding/week.ts`**

```ts
export interface WeekNav<T> {
  current: T | null
  prevId: string | null
  nextId: string | null
}

function formatMonthDay(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function formatWeekHeader(week: { label: string; startDate: string; endDate: string }): string {
  return `${week.label} (${formatMonthDay(week.startDate)}~${formatMonthDay(week.endDate)})`
}

export function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function resolveCurrentWeek<T extends { id: string }>(
  weeks: T[],
  requestedId?: string
): WeekNav<T> {
  if (weeks.length === 0) {
    return { current: null, prevId: null, nextId: null }
  }

  const requestedIndex = requestedId ? weeks.findIndex((week) => week.id === requestedId) : -1
  const currentIndex = requestedIndex === -1 ? 0 : requestedIndex
  const current = weeks[currentIndex]

  return {
    current,
    prevId: currentIndex < weeks.length - 1 ? weeks[currentIndex + 1].id : null,
    nextId: currentIndex > 0 ? weeks[currentIndex - 1].id : null,
  }
}
```

`resolveCurrentWeek` assumes `weeks` is already sorted newest-first (the query in Task 6 orders by `start_date desc`) — `prevId` points to the next-older week (higher index, "이전 주차"), `nextId` points to the next-newer week (lower index, "다음 주차 →").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Confirm the expected new breakage**

Run: `npx tsc --noEmit`
Expected: errors in `app/(app)/coding/page.tsx` (imports `groupByWeek`/`formatWeekLabel`/`getWeekDueDate`/`formatDueDateLabel`, none of which exist anymore, plus the pre-existing `weekOf` error from Task 2) and `app/(app)/coding/problem-form.tsx` (imports `getMostRecentTuesday`, which no longer exists). Fixed in Tasks 5 and 6 — do not fix them here.

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: FAIL — `page.tsx` calls now-undefined functions at runtime (it doesn't mock `@/lib/coding/week`). This is expected; fixed in Task 6.

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: PASS — this file mocks `'@/lib/coding/week'` entirely, so the real file's new shape doesn't reach it at runtime (only `tsc` sees the mismatch, confirmed above).

- [ ] **Step 6: Commit**

```bash
git add lib/coding/week.ts lib/coding/week.test.ts
git commit -m "$(cat <<'EOF'
feat: replace date-computed week helpers with header formatting and prev/next resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 4: `createProblems` — target an existing week or create a new one

**Files:**
- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

**Do not touch** `page.tsx`, `problem-form.tsx`, `problem-card.tsx`, `week.ts`, or `types.ts` — those belong to other tasks. `problem-form.test.tsx` and `page.test.tsx` both mock `'./actions'` wholesale (`vi.mock('./actions', () => ({ createProblems: vi.fn(), ... }))`), so changing the real `createProblems` implementation here has zero effect on them — you don't need to touch those test files either.

- [ ] **Step 1: Replace the `createProblems` describe block and supporting mocks**

In `app/(app)/coding/actions.test.ts`, add a `codingWeeksInsertMock` alongside the existing mocks near the top of the file:

```diff
 const getClaimsMock = vi.fn()
 const insertMock = vi.fn()
+const codingWeeksInsertMock = vi.fn()
 const fromMock = vi.fn()
 const rpcMock = vi.fn()
```

Update `mockAdminCheck` to also handle the `coding_weeks` table:

```ts
function mockAdminCheck(role: 'admin' | 'member') {
  fromMock.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
    }
    if (table === 'coding_problems') {
      return { insert: insertMock }
    }
    if (table === 'coding_weeks') {
      return { insert: codingWeeksInsertMock }
    }
    throw new Error(`unexpected table ${table}`)
  })
}
```

Update `beforeEach` to give `codingWeeksInsertMock` a default successful chain:

```diff
 beforeEach(() => {
   vi.clearAllMocks()
   redirectMock.mockImplementation((url: string) => {
     throw new Error(`REDIRECT:${url}`)
   })
   getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'admin-1' } } })
   insertMock.mockResolvedValue({ error: null })
+  codingWeeksInsertMock.mockReturnValue({
+    select: () => ({ single: async () => ({ data: { id: 'new-week-1' }, error: null }) }),
+  })
   mockAdminCheck('admin')
   rpcMock.mockResolvedValue({ error: null })
 })
```

Replace the entire `describe('createProblems', ...)` block with:

```ts
describe('createProblems', () => {
  it('redirects with an error when no problem rows are present', async () => {
    const formData = buildFormData({ weekMode: 'existing', weekId: 'week-1', rowIds: '' })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when adding to an existing week without a weekId', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('대상 주차를 선택해주세요'))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when creating a new week without a label, start date, or end date', async () => {
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '',
      weekStartDate: '2026-09-08',
      weekEndDate: '',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('새 주차의 이름, 시작일, 종료일을 모두 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
    expect(codingWeeksInsertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when a row is missing its title or link', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      weekId: 'week-1',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': '',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the caller is not an admin', async () => {
    mockAdminCheck('member')
    const formData = buildFormData({
      weekMode: 'existing',
      weekId: 'week-1',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates problems against an existing week without touching coding_weeks', async () => {
    const formData = buildFormData({
      weekMode: 'existing',
      weekId: 'week-1',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'matchKeyword-row-1': 'two-sum',
      'assigneeIds-row-1': ['user-1', 'user-2'],
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(codingWeeksInsertMock).not.toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_id: 'week-1',
        created_by: 'admin-1',
        match_keyword: 'two-sum',
        assignee_ids: ['user-1', 'user-2'],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?week=week-1&success=' + encodeURIComponent('문제 1개를 등록했어요')
    )
  })

  it('creates a new week, then creates problems against its returned id', async () => {
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '1주차',
      weekStartDate: '2026-09-08',
      weekEndDate: '2026-09-14',
      rowIds: 'row-1,row-2',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'title-row-2': '세 수의 합',
      'link-row-2': 'https://example.com/problem/2',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(codingWeeksInsertMock).toHaveBeenCalledWith({
      label: '1주차',
      start_date: '2026-09-08',
      end_date: '2026-09-14',
      created_by: 'admin-1',
    })
    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_id: 'new-week-1',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
      {
        title: '세 수의 합',
        link: 'https://example.com/problem/2',
        week_id: 'new-week-1',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?week=new-week-1&success=' + encodeURIComponent('문제 2개를 등록했어요')
    )
  })

  it('redirects with the error when creating the new week fails', async () => {
    codingWeeksInsertMock.mockReturnValue({
      select: () => ({ single: async () => ({ data: null, error: { message: 'db error' } }) }),
    })
    const formData = buildFormData({
      weekMode: 'new',
      weekLabel: '1주차',
      weekStartDate: '2026-09-08',
      weekEndDate: '2026-09-14',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('db error'))
    expect(insertMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — the current `createProblems` still reads a single `weekOf` field and inserts `week_of`, not `week_id`; it has no concept of `weekMode` or `coding_weeks`.

- [ ] **Step 3: Replace the `createProblems` function**

In `app/(app)/coding/actions.ts`:

```ts
export async function createProblems(formData: FormData) {
  const rowIds = ((formData.get('rowIds') as string) || '').split(',').filter(Boolean)

  if (rowIds.length === 0) {
    redirect('/coding?error=' + encodeURIComponent('문제를 최소 1개 이상 입력해주세요'))
    return
  }

  const weekMode = (formData.get('weekMode') as string) === 'new' ? 'new' : 'existing'
  const weekId = (formData.get('weekId') as string) || ''
  const weekLabel = (formData.get('weekLabel') as string) || ''
  const weekStartDate = (formData.get('weekStartDate') as string) || ''
  const weekEndDate = (formData.get('weekEndDate') as string) || ''

  if (weekMode === 'new') {
    if (!weekLabel || !weekStartDate || !weekEndDate) {
      redirect('/coding?error=' + encodeURIComponent('새 주차의 이름, 시작일, 종료일을 모두 입력해주세요'))
      return
    }
  } else if (!weekId) {
    redirect('/coding?error=' + encodeURIComponent('대상 주차를 선택해주세요'))
    return
  }

  const rows = rowIds.map((rowId) => ({
    title: (formData.get(`title-${rowId}`) as string) || '',
    link: (formData.get(`link-${rowId}`) as string) || '',
    matchKeyword: (formData.get(`matchKeyword-${rowId}`) as string) || null,
    assigneeIds: formData.getAll(`assigneeIds-${rowId}`) as string[],
  }))

  if (rows.some((row) => !row.title || !row.link)) {
    redirect('/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

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

  let targetWeekId = weekId

  if (weekMode === 'new') {
    const { data: newWeek, error: weekError } = await supabase
      .from('coding_weeks')
      .insert({
        label: weekLabel,
        start_date: weekStartDate,
        end_date: weekEndDate,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (weekError || !newWeek) {
      redirect('/coding?error=' + encodeURIComponent(weekError?.message ?? '주차 생성에 실패했어요'))
      return
    }

    targetWeekId = newWeek.id
  }

  const { error } = await supabase.from('coding_problems').insert(
    rows.map((row) => ({
      title: row.title,
      link: row.link,
      week_id: targetWeekId,
      created_by: user.id,
      match_keyword: row.matchKeyword,
      assignee_ids: row.assigneeIds,
    }))
  )

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
  redirect(`/coding?week=${targetWeekId}&success=` + encodeURIComponent(`문제 ${rows.length}개를 등록했어요`))
}
```

Leave `updateGithubUsername`, `deleteProblem`, and `adminRemoveCheck` untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS (all tests, including the untouched `deleteProblem`/`updateGithubUsername`/`adminRemoveCheck` blocks)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "$(cat <<'EOF'
feat: let createProblems target an existing week or create a new one

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 5: Problem form — default to the current week, toggle to a new one

**Files:**
- Modify: `app/(app)/coding/problem-form.tsx`
- Modify: `app/(app)/coding/problem-form.test.tsx`

Do not touch `page.tsx` — it still passes the old `<ProblemForm members={members} />` (no `currentWeek` prop) until Task 6, which will be a `tsc` error in `page.tsx` after this task. That's expected.

- [ ] **Step 1: Replace `app/(app)/coding/problem-form.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getTodayDate: () => '2026-08-11',
  addDays: (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
  },
  formatWeekHeader: (week: { label: string; startDate: string; endDate: string }) =>
    `${week.label} (${week.startDate}~${week.endDate})`,
}))

import { ProblemForm } from './problem-form'
import type { Member, CodingWeek } from '@/lib/coding/types'

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const currentWeek: CodingWeek = {
  id: 'week-1',
  label: '1주차',
  startDate: '2026-09-08',
  endDate: '2026-09-14',
}

describe('ProblemForm', () => {
  it('defaults to adding to the current week when one exists, with a hidden weekId', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('existing')
    expect(container.querySelector('input[name="weekId"]')).toHaveValue('week-1')
    expect(screen.getByText('1주차 (2026-09-08~2026-09-14)')).toBeInTheDocument()
  })

  it('shows a "새 주차 만들기" toggle when a current week exists', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)
    expect(screen.getByRole('button', { name: '새 주차 만들기' })).toBeInTheDocument()
  })

  it('switches to new-week mode with editable fields when the toggle is clicked', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '새 주차 만들기' }))

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('new')
    expect(screen.getByLabelText('주차명')).toBeInTheDocument()
    expect(screen.getByLabelText('시작일')).toHaveValue('2026-08-11')
    expect(screen.getByLabelText('종료일')).toHaveValue('2026-08-17')
  })

  it('switches back to the existing week when toggled again', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '새 주차 만들기' }))
    fireEvent.click(screen.getByRole('button', { name: '기존 주차에 등록' }))

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('existing')
    expect(container.querySelector('input[name="weekId"]')).toHaveValue('week-1')
  })

  it('starts in new-week mode with no toggle when there is no current week', () => {
    const { container } = render(<ProblemForm members={members} currentWeek={null} />)

    expect(container.querySelector('input[name="weekMode"]')).toHaveValue('new')
    expect(screen.getByLabelText('주차명')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 주차 만들기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '기존 주차에 등록' })).not.toBeInTheDocument()
  })

  it('renders one problem row, an optional match keyword input, and assignee checkboxes', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)

    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    const keywordInput = screen.getByLabelText('저장소 매칭 키워드 (선택)')
    expect(keywordInput).not.toBeRequired()
    expect(screen.getByRole('checkbox', { name: '김민수' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '이지은' })).toBeInTheDocument()
  })

  it('does not show a row-remove button when only one row exists', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })

  it('adds and removes problem rows', () => {
    render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))
    expect(screen.getAllByLabelText('문제명')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '제거' })[0])
    expect(screen.getAllByLabelText('문제명')).toHaveLength(1)
  })

  it("suffixes each row's field names with its row id and keeps rowIds in sync", () => {
    const { container } = render(<ProblemForm members={members} currentWeek={currentWeek} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))

    expect(container.querySelector('input[name="title-row-1"]')).toBeInTheDocument()
    expect(container.querySelector('input[name="title-row-2"]')).toBeInTheDocument()
    expect(container.querySelector('input[name="link-row-2"]')).toBeInTheDocument()
    expect(container.querySelectorAll('input[name="assigneeIds-row-2"]')).toHaveLength(members.length)
    expect(container.querySelector('input[name="rowIds"]')).toHaveValue('row-1,row-2')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: FAIL — `ProblemForm` doesn't accept a `currentWeek` prop yet, has no week-mode toggle, and still renders the old single `weekOf` date input.

- [ ] **Step 3: Replace `app/(app)/coding/problem-form.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { createProblems } from './actions'
import { getTodayDate, addDays, formatWeekHeader } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Member, CodingWeek } from '@/lib/coding/types'

interface ProblemRow {
  id: string
}

export function ProblemForm({
  members,
  currentWeek,
}: {
  members: Member[]
  currentWeek: CodingWeek | null
}) {
  const idCounter = useRef(0)

  function makeRow(): ProblemRow {
    idCounter.current += 1
    return { id: `row-${idCounter.current}` }
  }

  const [rows, setRows] = useState<ProblemRow[]>([{ id: 'row-1' }])
  const [weekMode, setWeekMode] = useState<'existing' | 'new'>(currentWeek ? 'existing' : 'new')

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev))
  }

  const defaultStart = getTodayDate()
  const defaultEnd = addDays(defaultStart, 6)

  return (
    <Card as="form" action={createProblems} className="flex flex-col gap-4">
      <input type="hidden" name="rowIds" value={rows.map((row) => row.id).join(',')} />
      <input type="hidden" name="weekMode" value={weekMode} />

      <div className="flex flex-col gap-2 border-b border-gray-200 pb-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {weekMode === 'existing' && currentWeek ? formatWeekHeader(currentWeek) : '새 주차 만들기'}
          </span>
          {currentWeek && (
            <button
              type="button"
              onClick={() => setWeekMode((prev) => (prev === 'existing' ? 'new' : 'existing'))}
              className="text-xs underline"
            >
              {weekMode === 'existing' ? '새 주차 만들기' : '기존 주차에 등록'}
            </button>
          )}
        </div>

        {weekMode === 'existing' && currentWeek ? (
          <input type="hidden" name="weekId" value={currentWeek.id} />
        ) : (
          <>
            <Label htmlFor="weekLabel" className="sr-only">
              주차명
            </Label>
            <Input id="weekLabel" name="weekLabel" placeholder="주차명 (예: 1주차)" required />
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="weekStartDate" className="sr-only">
                  시작일
                </Label>
                <Input
                  id="weekStartDate"
                  name="weekStartDate"
                  type="date"
                  defaultValue={defaultStart}
                  required
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="weekEndDate" className="sr-only">
                  종료일
                </Label>
                <Input id="weekEndDate" name="weekEndDate" type="date" defaultValue={defaultEnd} required />
              </div>
            </div>
          </>
        )}
      </div>

      {rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">문제 {index + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-xs text-red-600 dark:text-red-400"
              >
                제거
              </button>
            )}
          </div>
          <Label htmlFor={`title-${row.id}`} className="sr-only">
            문제명
          </Label>
          <Input id={`title-${row.id}`} name={`title-${row.id}`} placeholder="문제명" required />
          <Label htmlFor={`link-${row.id}`} className="sr-only">
            문제 링크
          </Label>
          <Input id={`link-${row.id}`} name={`link-${row.id}`} type="url" placeholder="문제 링크" required />
          <Label htmlFor={`matchKeyword-${row.id}`} className="sr-only">
            저장소 매칭 키워드 (선택)
          </Label>
          <Input
            id={`matchKeyword-${row.id}`}
            name={`matchKeyword-${row.id}`}
            placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)"
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs text-gray-500 dark:text-gray-400">
              담당자 (선택, 비우면 전체 대상)
            </legend>
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`assigneeIds-${row.id}`} value={member.id} />
                {member.name}
              </label>
            ))}
          </fieldset>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          문제 추가
        </Button>
        <Button type="submit" size="lg">
          문제 등록
        </Button>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: PASS

- [ ] **Step 5: Confirm the expected remaining breakage**

Run: `npx tsc --noEmit`
Expected: errors only in `app/(app)/coding/page.tsx` now (its stale `weekOf` property, its imports of removed `week.ts` exports, and now also its `<ProblemForm members={members} />` call missing the required `currentWeek` prop). Fixed entirely in Task 6.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/coding/problem-form.tsx" "app/(app)/coding/problem-form.test.tsx"
git commit -m "$(cat <<'EOF'
feat: default problem registration to the current week with a new-week toggle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 6: Coding page — show one week at a time with prev/next navigation

**Files:**
- Modify: `app/(app)/coding/page.tsx`
- Modify: `app/(app)/coding/page.test.tsx`

This is the final wiring task — after it, `npx tsc --noEmit` and the full test suite should both be completely clean.

- [ ] **Step 1: Replace `app/(app)/coding/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/coding',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', start_date: '2026-09-15', end_date: '2026-09-21' },
  { id: 'week-1', label: '1주차', start_date: '2026-09-08', end_date: '2026-09-14' },
]

const problems = [
  {
    id: 'problem-1',
    title: '두 수의 합',
    link: 'https://example.com/problem/1',
    created_by: 'admin-1',
    created_at: '2026-09-08T00:00:00.000Z',
    assignee_ids: [],
  },
]

const checks = [{ problem_id: 'problem-1', user_id: 'user-1', commit_sha: null, file_path: null }]

const weeksOrderMock = vi.fn(async () => ({ data: weeks }))
const problemsEqMock = vi.fn(async () => ({ data: problems }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'github_username') {
              return {
                eq: () => ({
                  single: async () => ({ data: { github_username: 'kimminsu-dev' } }),
                }),
              }
            }
            return { eq: () => Promise.resolve({ data: profiles }) }
          },
        }
      }
      if (table === 'coding_weeks') {
        return { select: () => ({ order: weeksOrderMock }) }
      }
      if (table === 'coding_problems') {
        return { select: () => ({ eq: problemsEqMock }) }
      }
      if (table === 'coding_checks') {
        return { select: () => ({ in: async () => ({ data: checks }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))

import { getSessionProfile } from '@/lib/auth/session'
import CodingPage from './page'

beforeEach(() => {
  weeksOrderMock.mockClear()
  problemsEqMock.mockClear()
})

describe('CodingPage', () => {
  it('renders the newest week by default, queries its problems, and shows the member checklist', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('2주차 (9/15~9/21)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '두 수의 합' })).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
    expect(problemsEqMock).toHaveBeenCalledWith('week_id', 'week-2')
  })

  it('renders the requested week when ?week= matches an existing week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByText('1주차 (9/8~9/14)')).toBeInTheDocument()
    expect(problemsEqMock).toHaveBeenCalledWith('week_id', 'week-1')
  })

  it('falls back to the newest week when ?week= does not match any week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'unknown-id' }) })
    render(ui)

    expect(screen.getByText('2주차 (9/15~9/21)')).toBeInTheDocument()
  })

  it('shows only a previous-week link on the newest week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/coding?week=week-1')
    expect(screen.queryByRole('link', { name: '다음 주차 →' })).not.toBeInTheDocument()
  })

  it('shows only a next-week link on the oldest week', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '다음 주차 →' })).toHaveAttribute('href', '/coding?week=week-2')
    expect(screen.queryByRole('link', { name: '← 이전 주차' })).not.toBeInTheDocument()
  })

  it('shows an empty state when there are no weeks at all', async () => {
    weeksOrderMock.mockResolvedValueOnce({ data: [] })

    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('아직 등록된 문제가 없습니다.')).toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.queryByRole('button', { name: '문제 등록' })).not.toBeInTheDocument()
  })

  it('shows the problem registration form for admins', async () => {
    vi.mocked(getSessionProfile).mockResolvedValueOnce({
      userId: 'admin-1',
      role: 'admin',
      status: 'approved',
    })

    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it("renders the GitHub settings form pre-filled with the caller's registered username", async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: FAIL — `page.tsx` still queries `coding_problems` with `.order('week_of', ...)` (no `coding_weeks` query at all), so none of the new fixtures/assertions match.

- [ ] **Step 3: Replace `app/(app)/coding/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { resolveCurrentWeek, formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import type { CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; week?: string }>
}) {
  const { error: queryError, success, week: requestedWeekId } = await searchParams
  const supabase = await createClient()
  const session = await getSessionProfile()

  const [{ data: callerProfile }, { data: profiles }, { data: weeksData }] = await Promise.all([
    supabase.from('profiles').select('github_username').eq('id', session!.userId).single(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('coding_weeks')
      .select('id, label, start_date, end_date')
      .order('start_date', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const weeks: CodingWeek[] = (weeksData ?? []).map((w) => ({
    id: w.id,
    label: w.label,
    startDate: w.start_date,
    endDate: w.end_date,
  }))

  const { current: currentWeek, prevId, nextId } = resolveCurrentWeek(weeks, requestedWeekId)

  const { data: problemsData } = await queryIfAny(currentWeek ? [currentWeek.id] : [], () =>
    supabase
      .from('coding_problems')
      .select('id, title, link, created_by, created_at, assignee_ids')
      .eq('week_id', currentWeek!.id)
  )

  const problemIds = (problemsData ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path')
      .in('problem_id', problemIds)
  )

  const codingProblems: CodingProblem[] = (problemsData ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    assigneeIds: (problem.assignee_ids as string[] | null) ?? [],
    checks: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => ({
        userId: c.user_id,
        commitSha: c.commit_sha as string | null,
        filePath: c.file_path as string | null,
      })),
  }))

  return (
    <PageShell title="코테 스터디">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
      {isAdmin && <ProblemForm members={members} currentWeek={currentWeek} />}
      <div className="mt-6 flex flex-col gap-4">
        {currentWeek ? (
          <>
            <div className="flex items-center justify-between">
              {prevId ? (
                <Link href={`/coding?week=${prevId}`} className="text-sm underline">
                  ← 이전 주차
                </Link>
              ) : (
                <span />
              )}
              <h2 className="text-lg font-semibold">{formatWeekHeader(currentWeek)}</h2>
              {nextId ? (
                <Link href={`/coding?week=${nextId}`} className="text-sm underline">
                  다음 주차 →
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="flex flex-col gap-3">
              {codingProblems.map((problem) => (
                <ProblemCard key={problem.id} problem={problem} members={members} isAdmin={isAdmin} />
              ))}
              {codingProblems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
            </div>
          </>
        ) : (
          <EmptyState message="아직 등록된 문제가 없습니다." />
        )}
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: PASS (all tests)

- [ ] **Step 5: Confirm the whole repo is clean**

Run: `npx tsc --noEmit`
Expected: zero errors — this was the last file with any stale reference to `week_of`/the old `week.ts` exports/the old `ProblemForm` signature.

Run: `npx vitest run`
Expected: full suite green.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: show one coding week at a time with prev/next navigation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 7: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS, 0 failures. If a stray merged worktree is present under `.claude/worktrees/`, remove it first (`git worktree list` to check) — a leftover worktree directory causes vitest to double-discover test files and report false failures (seen before on this project). If any test times out under concurrent load, re-run just that file in isolation before treating it as a real regression.

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: 0 new errors (there are two pre-existing, unrelated issues already known — a `react-hooks/immutability` error in `app/(app)/feedback/[id]/feedback-lines.tsx` and an unused-var warning in `lib/auth/session-cache.test.ts` — do not attempt to fix them here).

- [ ] **Step 4: Manual smoke test**

Start the dev server (`npm run dev`), sign in as an admin, and on `/coding`:
1. If any weeks already exist (from the backfill or prior testing), confirm the newest one shows by default with correct label and date range, and that prev/next links work and hide correctly at each boundary.
2. Use "새 주차 만들기" to create a brand-new week with a couple of problems in one submission; confirm you land back on that new week (`?week=<id>` in the URL) and it shows the problems you just added.
3. Without reloading in new-week mode, confirm the registration form now defaults back to "existing" mode targeting the week you just created, and add one more problem to it — confirm it appears without creating a duplicate week.
4. Navigate to a different week (prev/next) and confirm the registration form's default target switches to whichever week is currently displayed.

- [ ] **Step 5: Final commit (only if smoke testing surfaced fixes)**

If Step 4 required any code changes, commit them separately with a message describing what the smoke test caught.
