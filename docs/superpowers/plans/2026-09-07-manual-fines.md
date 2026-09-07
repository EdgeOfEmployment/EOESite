# Manual Fine Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin manually charge a member a fine unrelated to a late check-in, and cancel/delete either kind of fine (auto late-fine or manual), from the `/admin` page.

**Architecture:** A new `manual_fines` Supabase table (admin-only write, approved-member read) parallels the existing `checkin_posts` late-fine columns. `lib/checkin/fines.ts`'s late-fine-only helpers generalize into a `FineRow`/`groupFinesByMonth` shape that covers both sources. Four new Server Actions in `app/(app)/admin/fine-actions.ts` follow the existing `setCheckinPostPaid`/`setUserStatus` permission-check boilerplate exactly (no shared helper — none exists today, so none is introduced). The admin page merges both fine sources into one grouped list with an add-fine form up top; the dashboard folds `manual_fines` into its existing monthly per-member totals.

**Tech Stack:** Next.js 16 App Router Server Actions, Supabase (Postgres + RLS), Vitest + Testing Library.

Full design decisions and rationale: `docs/superpowers/specs/2026-09-07-manual-fines-design.md`.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/0011_manual_fines.sql`

- [ ] **Step 1: Write the migration**

```sql
create table manual_fines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  paid boolean not null default false,
  paid_at timestamptz,
  paid_by uuid references profiles(id)
);

alter table manual_fines enable row level security;

create policy "Approved members can read manual fines"
  on manual_fines for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved'));

create policy "Admins can create manual fines"
  on manual_fines for insert
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can update manual fines"
  on manual_fines for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Admins can delete manual fines"
  on manual_fines for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0011_manual_fines.sql
git commit -m "feat: add manual_fines table for admin-assigned fines"
```

This migration has no automated test (matching the existing migrations — none of `0001`–`0010` have one). It is applied against the real Supabase project separately from this codebase.

---

## Task 2: Generalize `lib/checkin/fines.ts` for both fine sources

**Files:**
- Modify: `lib/checkin/fines.ts`
- Test: `lib/checkin/fines.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `lib/checkin/fines.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { buildMonthlyFineTotals, groupFinesByMonth, type FineRow } from './fines'

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

describe('groupFinesByMonth', () => {
  it('groups rows by UTC calendar month, newest month first', () => {
    const rows: FineRow[] = [
      {
        id: 'p1',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-05T01:00:00.000Z',
        amount: 11000,
        paid: false,
      },
      {
        id: 'p2',
        kind: 'late',
        memberName: '이지은',
        createdAt: '2026-08-20T01:00:00.000Z',
        amount: 10000,
        paid: true,
      },
      {
        id: 'p3',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-01T01:00:00.000Z',
        amount: 12000,
        paid: false,
      },
    ]

    expect(groupFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          {
            id: 'p1',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-05T01:00:00.000Z',
            amount: 11000,
            paid: false,
          },
          {
            id: 'p3',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-01T01:00:00.000Z',
            amount: 12000,
            paid: false,
          },
        ],
      },
      {
        monthLabel: '2026년 8월',
        rows: [
          {
            id: 'p2',
            kind: 'late',
            memberName: '이지은',
            createdAt: '2026-08-20T01:00:00.000Z',
            amount: 10000,
            paid: true,
          },
        ],
      },
    ])
  })

  it('groups late and manual fines together within the same month', () => {
    const rows: FineRow[] = [
      {
        id: 'p1',
        kind: 'late',
        memberName: '김민수',
        createdAt: '2026-09-05T01:00:00.000Z',
        amount: 11000,
        paid: false,
      },
      {
        id: 'm1',
        kind: 'manual',
        memberName: '김민수',
        createdAt: '2026-09-03T01:00:00.000Z',
        amount: 5000,
        paid: false,
        reason: '지각 3회 누적',
      },
    ]

    expect(groupFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          {
            id: 'p1',
            kind: 'late',
            memberName: '김민수',
            createdAt: '2026-09-05T01:00:00.000Z',
            amount: 11000,
            paid: false,
          },
          {
            id: 'm1',
            kind: 'manual',
            memberName: '김민수',
            createdAt: '2026-09-03T01:00:00.000Z',
            amount: 5000,
            paid: false,
            reason: '지각 3회 누적',
          },
        ],
      },
    ])
  })

  it('preserves the input order of rows within a group', () => {
    const rows: FineRow[] = [
      { id: 'p1', kind: 'late', memberName: 'a', createdAt: '2026-09-01T00:00:00.000Z', amount: 1000, paid: false },
      { id: 'p2', kind: 'late', memberName: 'b', createdAt: '2026-09-02T00:00:00.000Z', amount: 2000, paid: false },
    ]

    expect(groupFinesByMonth(rows)[0].rows.map((r) => r.id)).toEqual(['p1', 'p2'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupFinesByMonth([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/checkin/fines.test.ts`
Expected: FAIL — `groupFinesByMonth` and `FineRow` are not exported from `./fines` (the module still only exports `groupLateFinesByMonth`/`LateFineRow`).

- [ ] **Step 3: Replace `lib/checkin/fines.ts`**

```ts
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

export type FineKind = 'late' | 'manual'

export interface FineRow {
  id: string
  kind: FineKind
  memberName: string
  createdAt: string
  amount: number
  paid: boolean
  reason?: string
}

export interface MonthlyFineGroup {
  monthLabel: string
  rows: FineRow[]
}

export function groupFinesByMonth(rows: FineRow[]): MonthlyFineGroup[] {
  const rowsByMonthKey = new Map<string, FineRow[]>()

  for (const row of rows) {
    const date = new Date(row.createdAt)
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    const existing = rowsByMonthKey.get(monthKey)
    if (existing) {
      existing.push(row)
    } else {
      rowsByMonthKey.set(monthKey, [row])
    }
  }

  return Array.from(rowsByMonthKey.entries())
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([monthKey, monthRows]) => ({ monthLabel: formatMonthLabel(monthKey), rows: monthRows }))
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  return `${year}년 ${month}월`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/checkin/fines.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/fines.ts lib/checkin/fines.test.ts
git commit -m "refactor: generalize late-fine grouping helpers to cover manual fines too"
```

**Note:** `app/(app)/admin/page.tsx` still imports `groupLateFinesByMonth`/`LateFineRow` at this point and will fail to type-check/build until Task 7. This is expected mid-plan breakage between tasks and is resolved by Task 7 — do not attempt to fix it here.

---

## Task 3: `cancelCheckinFine` server action

**Files:**
- Modify: `app/(app)/admin/fine-actions.ts`
- Test: `app/(app)/admin/fine-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `app/(app)/admin/fine-actions.test.ts`, change the import line:

```ts
import { setCheckinPostPaid, cancelCheckinFine } from './fine-actions'
```

Then add this new `describe` block at the end of the file (after the existing `describe('setCheckinPostPaid', ...)` block):

```ts
describe('cancelCheckinFine', () => {
  it('zeroes the fine amount and revalidates', async () => {
    await cancelCheckinFine(POST_ID)

    expect(fromMock).toHaveBeenCalledWith('checkin_posts')
    expect(updateMock).toHaveBeenCalledWith({ fine_amount: 0 })
    expect(updateEqMock).toHaveBeenCalledWith('id', POST_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('throws when the caller is not an admin, without updating', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(cancelCheckinFine(POST_ID)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(cancelCheckinFine(POST_ID)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: FAIL — `cancelCheckinFine` is not exported from `./fine-actions`.

- [ ] **Step 3: Add the function to `app/(app)/admin/fine-actions.ts`**

Append after `setCheckinPostPaid`:

```ts
export async function cancelCheckinFine(postId: string) {
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

  const { error } = await supabase.from('checkin_posts').update({ fine_amount: 0 }).eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: PASS (all `setCheckinPostPaid` tests plus the 3 new `cancelCheckinFine` tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/fine-actions.ts app/\(app\)/admin/fine-actions.test.ts
git commit -m "feat: let admins cancel a late check-in fine"
```

---

## Task 4: `addManualFine` server action

**Files:**
- Modify: `app/(app)/admin/fine-actions.ts`
- Test: `app/(app)/admin/fine-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the entire top-of-file setup block in `app/(app)/admin/fine-actions.test.ts` — everything from the top of the file through the `afterEach` block (i.e. everything before the first `describe`) — with:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ADMIN_ID = 'admin-1'
const MEMBER_ID = 'member-1'
const POST_ID = 'post-1'

const selectMock = vi.fn()
const updateEqMock = vi.fn()
const updateMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const getUserMock = vi.fn()
const revalidatePathMock = vi.fn()

let roleById: Record<string, string | null>
let statusById: Record<string, string | null>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { setCheckinPostPaid, cancelCheckinFine, addManualFine } from './fine-actions'

function manualFineFormData(fields: Partial<Record<'userId' | 'amount' | 'reason', string>>): FormData {
  const formData = new FormData()
  formData.set('userId', fields.userId ?? MEMBER_ID)
  formData.set('amount', fields.amount ?? '5000')
  formData.set('reason', fields.reason ?? '지각 3회 누적')
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))

  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })

  roleById = { [ADMIN_ID]: 'admin', [MEMBER_ID]: 'member' }
  statusById = { [MEMBER_ID]: 'approved' }
  selectMock.mockImplementation((columns: string) => ({
    eq: (_col: string, id: string) => ({
      single: vi.fn().mockResolvedValue(
        columns === 'status'
          ? { data: { status: statusById[id] ?? null }, error: null }
          : { data: { role: roleById[id] ?? null }, error: null }
      ),
    }),
  }))

  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEqMock })

  insertMock.mockResolvedValue({ error: null })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock, insert: insertMock })
})

afterEach(() => {
  vi.useRealTimers()
})
```

(This removes the now-unused `selectEqMock` — its behavior is inlined into `selectMock.mockImplementation` above so the mock can branch on which columns were requested, which `addManualFine`'s target-member lookup needs.)

Then add this new `describe` block at the end of the file:

```ts
describe('addManualFine', () => {
  it('inserts a manual fine for an approved member and revalidates', async () => {
    await addManualFine(manualFineFormData({}))

    expect(fromMock).toHaveBeenCalledWith('manual_fines')
    expect(insertMock).toHaveBeenCalledWith({
      user_id: MEMBER_ID,
      amount: 5000,
      reason: '지각 3회 누적',
      created_by: ADMIN_ID,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('throws when the caller is not an admin, without inserting', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when no member is selected', async () => {
    await expect(addManualFine(manualFineFormData({ userId: '' }))).rejects.toThrow('대상 멤버를 선택해주세요')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the amount is not a positive integer', async () => {
    await expect(addManualFine(manualFineFormData({ amount: '0' }))).rejects.toThrow(
      '금액은 1 이상의 정수여야 합니다'
    )
    await expect(addManualFine(manualFineFormData({ amount: 'abc' }))).rejects.toThrow(
      '금액은 1 이상의 정수여야 합니다'
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the reason is blank', async () => {
    await expect(addManualFine(manualFineFormData({ reason: '   ' }))).rejects.toThrow('사유를 입력해주세요')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the target member is not approved', async () => {
    statusById[MEMBER_ID] = 'pending'

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow(
      '승인된 멤버에게만 벌금을 부과할 수 있습니다'
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the insert fails', async () => {
    insertMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(addManualFine(manualFineFormData({}))).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: FAIL — `addManualFine` is not exported from `./fine-actions`.

- [ ] **Step 3: Add the function to `app/(app)/admin/fine-actions.ts`**

Append after `cancelCheckinFine`:

```ts
export async function addManualFine(formData: FormData) {
  const userId = (formData.get('userId') as string) || ''
  const amount = Number(formData.get('amount'))
  const reason = ((formData.get('reason') as string) || '').trim()

  if (!userId) throw new Error('대상 멤버를 선택해주세요')
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('금액은 1 이상의 정수여야 합니다')
  if (!reason) throw new Error('사유를 입력해주세요')

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

  const { data: targetProfile, error: targetError } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', userId)
    .single()

  if (targetError) throw new Error(targetError.message)
  if (!targetProfile || targetProfile.status !== 'approved') {
    throw new Error('승인된 멤버에게만 벌금을 부과할 수 있습니다')
  }

  const { error } = await supabase.from('manual_fines').insert({
    user_id: userId,
    amount,
    reason,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: PASS (all previous tests plus the 7 new `addManualFine` tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/fine-actions.ts app/\(app\)/admin/fine-actions.test.ts
git commit -m "feat: let admins manually charge a member a fine"
```

---

## Task 5: `deleteManualFine` server action

**Files:**
- Modify: `app/(app)/admin/fine-actions.ts`
- Test: `app/(app)/admin/fine-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

In `app/(app)/admin/fine-actions.test.ts`:

Add a new constant next to `POST_ID`:

```ts
const MANUAL_FINE_ID = 'manual-fine-1'
```

Add two new mocks next to `insertMock`:

```ts
const deleteEqMock = vi.fn()
const deleteMock = vi.fn()
```

In `beforeEach`, add (after the `insertMock.mockResolvedValue(...)` line) and update the `fromMock.mockReturnValue` call:

```ts
  insertMock.mockResolvedValue({ error: null })

  deleteEqMock.mockResolvedValue({ error: null })
  deleteMock.mockReturnValue({ eq: deleteEqMock })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock, insert: insertMock, delete: deleteMock })
```

(This replaces the old `fromMock.mockReturnValue({ select: selectMock, update: updateMock, insert: insertMock })` line from Task 4.)

Update the import line:

```ts
import { setCheckinPostPaid, cancelCheckinFine, addManualFine, deleteManualFine } from './fine-actions'
```

Add this new `describe` block at the end of the file:

```ts
describe('deleteManualFine', () => {
  it('deletes the manual fine and revalidates', async () => {
    await deleteManualFine(MANUAL_FINE_ID)

    expect(fromMock).toHaveBeenCalledWith('manual_fines')
    expect(deleteEqMock).toHaveBeenCalledWith('id', MANUAL_FINE_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('throws when the caller is not an admin, without deleting', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(deleteManualFine(MANUAL_FINE_ID)).rejects.toThrow('권한이 없습니다')
    expect(deleteMock).not.toHaveBeenCalled()
  })

  it('throws when the delete fails', async () => {
    deleteEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(deleteManualFine(MANUAL_FINE_ID)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: FAIL — `deleteManualFine` is not exported from `./fine-actions`.

- [ ] **Step 3: Add the function to `app/(app)/admin/fine-actions.ts`**

Append after `addManualFine`:

```ts
export async function deleteManualFine(fineId: string) {
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

  const { error } = await supabase.from('manual_fines').delete().eq('id', fineId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: PASS (all previous tests plus the 3 new `deleteManualFine` tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/fine-actions.ts app/\(app\)/admin/fine-actions.test.ts
git commit -m "feat: let admins delete a manual fine"
```

---

## Task 6: `setManualFinePaid` server action

**Files:**
- Modify: `app/(app)/admin/fine-actions.ts`
- Test: `app/(app)/admin/fine-actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Update the import line in `app/(app)/admin/fine-actions.test.ts`:

```ts
import { setCheckinPostPaid, cancelCheckinFine, addManualFine, deleteManualFine, setManualFinePaid } from './fine-actions'
```

Add this new `describe` block at the end of the file:

```ts
describe('setManualFinePaid', () => {
  it('marks a manual fine paid with a timestamp and the caller id, then revalidates', async () => {
    await setManualFinePaid(MANUAL_FINE_ID, true)

    expect(fromMock).toHaveBeenCalledWith('manual_fines')
    expect(updateMock).toHaveBeenCalledWith({
      paid: true,
      paid_at: '2026-09-02T00:00:00.000Z',
      paid_by: ADMIN_ID,
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', MANUAL_FINE_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('marks a manual fine unpaid and clears paid_at/paid_by', async () => {
    await setManualFinePaid(MANUAL_FINE_ID, false)

    expect(updateMock).toHaveBeenCalledWith({ paid: false, paid_at: null, paid_by: null })
  })

  it('throws when the caller is not an admin, without updating', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(setManualFinePaid(MANUAL_FINE_ID, true)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: FAIL — `setManualFinePaid` is not exported from `./fine-actions`.

- [ ] **Step 3: Add the function to `app/(app)/admin/fine-actions.ts`**

Append after `deleteManualFine`:

```ts
export async function setManualFinePaid(fineId: string, paid: boolean) {
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

  const { error } = await supabase
    .from('manual_fines')
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
      paid_by: paid ? user.id : null,
    })
    .eq('id', fineId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/admin/fine-actions.test.ts`
Expected: PASS (all tests in the file — `setCheckinPostPaid` (5), `cancelCheckinFine` (3), `addManualFine` (7), `deleteManualFine` (3), `setManualFinePaid` (3) = 21 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/fine-actions.ts app/\(app\)/admin/fine-actions.test.ts
git commit -m "feat: let admins toggle a manual fine's paid status"
```

---

## Task 7: Admin page UI — merged fine list + add-fine form

**Files:**
- Modify: `app/(app)/admin/page.tsx`
- Test: `app/(app)/admin/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `app/(app)/admin/page.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const pendingUsers = [{ id: 'u1', name: '김민수', created_at: '2026-07-01T00:00:00Z' }]
const approvedMembers = [
  { id: 'u2', name: '관리자', role: 'admin' },
  { id: 'u3', name: '이지은', role: 'member' },
]
// u4 is neither pending nor approved (e.g. kicked/rejected after posting a late
// check-in) — only reachable via the unfiltered all-profiles lookup.
const allProfiles = [
  { id: 'u1', name: '김민수' },
  { id: 'u2', name: '관리자' },
  { id: 'u3', name: '이지은' },
  { id: 'u4', name: '박서준' },
]
const lateFines = [
  { id: 'post-1', author_id: 'u3', created_at: '2026-09-05T01:00:00.000Z', fine_amount: 11000, paid: false },
  { id: 'post-2', author_id: 'u3', created_at: '2026-08-20T01:00:00.000Z', fine_amount: 10000, paid: true },
  { id: 'post-3', author_id: 'u4', created_at: '2026-09-03T01:00:00.000Z', fine_amount: 12000, paid: false },
]
const manualFines = [
  {
    id: 'manual-1',
    user_id: 'u3',
    amount: 5000,
    reason: '지각 3회 누적',
    created_at: '2026-09-04T01:00:00.000Z',
    paid: false,
  },
]

function makeSupabaseMock({
  late = lateFines,
  manual = manualFines,
}: { late?: typeof lateFines; manual?: typeof manualFines } = {}) {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'id, name') {
              return Promise.resolve({ data: allProfiles })
            }
            return {
              eq: (_col: string, value: string) => ({
                order: () => ({
                  data: value === 'pending' ? pendingUsers : approvedMembers,
                }),
              }),
            }
          },
        }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: async () => ({ data: late }),
              }),
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: () => ({
            order: async () => ({ data: manual }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabaseMock()),
}))

vi.mock('./actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

vi.mock('./fine-actions', () => ({
  setCheckinPostPaid: vi.fn(),
  cancelCheckinFine: vi.fn(),
  addManualFine: vi.fn(),
  deleteManualFine: vi.fn(),
  setManualFinePaid: vi.fn(),
}))

import AdminPage from './page'

describe('AdminPage', () => {
  it('lists pending signups and approved members', async () => {
    const ui = await AdminPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getByText('관리자')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '승인' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '거부' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '강퇴' })).toHaveLength(1)
  })

  describe('벌금 관리', () => {
    it('renders the manual fine form with a member dropdown, amount and reason fields', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByRole('heading', { name: '벌금 관리' })).toBeInTheDocument()
      expect(screen.getByLabelText('대상 멤버')).toBeInTheDocument()
      expect(screen.getByText('관리자', { selector: 'option' })).toBeInTheDocument()
      expect(screen.getByText('이지은', { selector: 'option' })).toBeInTheDocument()
      expect(screen.getByLabelText('금액')).toBeInTheDocument()
      expect(screen.getByLabelText('사유')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '벌금 추가' })).toBeInTheDocument()
    })

    it('shows only unpaid fines by default, grouped by month, merging late and manual fines', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.queryByText('2026년 8월')).not.toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '납부완료로 표시' })).toHaveLength(3)
      expect(screen.getByText('지각 3회 누적', { exact: false })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '납부 내역 보기' })).toHaveAttribute('href', '/admin?showPaid=1')
    })

    it('gives late fines a 취소 button and manual fines a 삭제 button', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: '삭제' })).toHaveLength(1)
    })

    it('resolves a fine owner name even if they are no longer pending or approved', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText(/박서준/)).toBeInTheDocument()
      expect(screen.queryByText(/알 수 없음/)).not.toBeInTheDocument()
    })

    it('reveals paid fines with a reverse toggle when showPaid=1', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({ showPaid: '1' }) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.getByText('2026년 8월')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '납부완료로 표시' }).length).toBeGreaterThan(0)
      expect(screen.getByRole('button', { name: '미납으로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '미납 건만 보기' })).toHaveAttribute('href', '/admin')
    })

    it('shows an empty state when there are no unpaid fines', async () => {
      vi.doMock('@/lib/supabase/server', () => ({
        createClient: vi.fn(async () => makeSupabaseMock({ late: [], manual: [] })),
      }))
      vi.resetModules()
      const { default: FreshAdminPage } = await import('./page')

      const ui = await FreshAdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('미납된 벌금이 없습니다.')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/admin/page.test.tsx`
Expected: FAIL — the page still imports `groupLateFinesByMonth`/`LateFineRow` (removed in Task 2) and doesn't query `manual_fines`, render the add-fine form, or expose `cancelCheckinFine`/`deleteManualFine`/`setManualFinePaid` actions.

- [ ] **Step 3: Replace `app/(app)/admin/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import {
  setCheckinPostPaid,
  cancelCheckinFine,
  addManualFine,
  deleteManualFine,
  setManualFinePaid,
} from './fine-actions'
import { groupFinesByMonth, type FineRow } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input, Select, Label } from '@/components/ui/input'

function formatFineDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ showPaid?: string }>
}) {
  const { showPaid: showPaidParam } = await searchParams
  const showPaid = showPaidParam === '1'

  const supabase = await createClient()

  const [
    { data: pendingUsers, error: pendingError },
    { data: approvedMembers, error: approvedError },
    { data: allProfiles, error: allProfilesError },
    { data: lateFines, error: lateFinesError },
    { data: manualFines, error: manualFinesError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, name, role')
      .eq('status', 'approved')
      .order('name', { ascending: true }),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, fine_amount, paid')
      .eq('is_late', true)
      .gt('fine_amount', 0)
      .order('created_at', { ascending: false }),
    supabase
      .from('manual_fines')
      .select('id, user_id, amount, reason, created_at, paid')
      .order('created_at', { ascending: false }),
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  if (allProfilesError) {
    console.error('admin page: failed to fetch profiles for fine list names', allProfilesError)
  }

  if (lateFinesError) {
    console.error('admin page: failed to fetch late fines', lateFinesError)
  }

  if (manualFinesError) {
    console.error('admin page: failed to fetch manual fines', manualFinesError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []
  // Looked up from all profiles (not just approved) so a member who was later
  // rejected/kicked still shows by name against any fine they still owe.
  const nameById = new Map((allProfiles ?? []).map((p) => [p.id, p.name as string]))

  const lateFineRows: FineRow[] = (lateFines ?? [])
    .filter((post) => showPaid || !post.paid)
    .map((post) => ({
      id: post.id,
      kind: 'late' as const,
      memberName: nameById.get(post.author_id) ?? '알 수 없음',
      createdAt: post.created_at,
      amount: post.fine_amount,
      paid: post.paid,
    }))

  const manualFineRows: FineRow[] = (manualFines ?? [])
    .filter((fine) => showPaid || !fine.paid)
    .map((fine) => ({
      id: fine.id,
      kind: 'manual' as const,
      memberName: nameById.get(fine.user_id) ?? '알 수 없음',
      createdAt: fine.created_at,
      amount: fine.amount,
      paid: fine.paid,
      reason: fine.reason,
    }))

  const fineGroups = groupFinesByMonth([...lateFineRows, ...manualFineRows])

  return (
    <PageShell title="관리자 페이지">
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingList.length})</h2>
        {pendingList.length === 0 ? (
          <EmptyState message="대기 중인 가입 신청이 없습니다." />
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingList.map((user) => (
              <Card key={user.id} as="li" padding="sm" className="flex items-center justify-between">
                <span>{user.name}</span>
                <div className="flex gap-2">
                  <form action={approveUser.bind(null, user.id)}>
                    <Button type="submit">승인</Button>
                  </form>
                  <form action={rejectUser.bind(null, user.id)}>
                    <Button type="submit" variant="secondary">
                      거부
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">멤버 ({approvedList.length})</h2>
        <ul className="flex flex-col gap-3">
          {approvedList.map((member) => (
            <Card key={member.id} as="li" padding="sm" className="flex items-center justify-between">
              <span>{member.name}</span>
              {member.role !== 'admin' && (
                <form action={rejectUser.bind(null, member.id)}>
                  <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                    강퇴
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">벌금 관리</h2>
          <Link
            href={showPaid ? '/admin' : '/admin?showPaid=1'}
            className="text-sm text-gray-500 underline dark:text-gray-400"
          >
            {showPaid ? '미납 건만 보기' : '납부 내역 보기'}
          </Link>
        </div>

        <Card
          as="form"
          action={addManualFine}
          padding="sm"
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Label htmlFor="manual-fine-user" className="sr-only">
              대상 멤버
            </Label>
            <Select id="manual-fine-user" name="userId" required defaultValue="">
              <option value="" disabled>
                멤버 선택
              </option>
              {approvedList.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1">
            <Label htmlFor="manual-fine-amount" className="sr-only">
              금액
            </Label>
            <Input id="manual-fine-amount" name="amount" type="number" min="1" step="1" placeholder="금액" required />
          </div>
          <div className="flex-[2]">
            <Label htmlFor="manual-fine-reason" className="sr-only">
              사유
            </Label>
            <Input id="manual-fine-reason" name="reason" type="text" placeholder="사유" required />
          </div>
          <Button type="submit">벌금 추가</Button>
        </Card>

        {fineGroups.length === 0 ? (
          <EmptyState message={showPaid ? '벌금 내역이 없습니다.' : '미납된 벌금이 없습니다.'} />
        ) : (
          <div className="flex flex-col gap-6">
            {fineGroups.map((group) => (
              <div key={group.monthLabel}>
                <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">{group.monthLabel}</h3>
                <ul className="flex flex-col gap-3">
                  {group.rows.map((row) => (
                    <Card key={row.id} as="li" padding="sm" className="flex items-center justify-between gap-3">
                      <span>
                        {formatFineDate(row.createdAt)} · {row.memberName} · {row.amount.toLocaleString('ko-KR')}원
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {row.kind === 'late' ? '지각' : '수동'}
                        </span>
                        {row.reason && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({row.reason})</span>
                        )}
                      </span>
                      <div className="flex gap-2">
                        <form
                          action={
                            row.kind === 'late'
                              ? setCheckinPostPaid.bind(null, row.id, !row.paid)
                              : setManualFinePaid.bind(null, row.id, !row.paid)
                          }
                        >
                          <Button type="submit" variant="secondary">
                            {row.paid ? '미납으로 표시' : '납부완료로 표시'}
                          </Button>
                        </form>
                        <form
                          action={
                            row.kind === 'late'
                              ? cancelCheckinFine.bind(null, row.id)
                              : deleteManualFine.bind(null, row.id)
                          }
                        >
                          <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                            {row.kind === 'late' ? '취소' : '삭제'}
                          </Button>
                        </form>
                      </div>
                    </Card>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/admin/page.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/admin/page.tsx app/\(app\)/admin/page.test.tsx
git commit -m "feat: merge manual and late fines into one admin fine-management section"
```

---

## Task 8: Dashboard — fold manual fines into monthly totals

**Files:**
- Modify: `app/(app)/page.tsx`
- Test: `app/(app)/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `app/(app)/page.test.tsx` with:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const checkinCalls: { fields: string; gte: string; lt: string }[] = []
const manualFineCalls: { fields: string; gte: string; lt: string }[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: (fields: string) => ({
            gte: (_col: string, gteValue: string) => ({
              lt: async (_col2: string, ltValue: string) => {
                checkinCalls.push({ fields, gte: gteValue, lt: ltValue })
                return {
                  data: [
                    { author_id: 'user-2', fine_amount: 11000, paid: false },
                    { author_id: 'user-2', fine_amount: 5000, paid: true },
                  ],
                }
              },
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: (fields: string) => ({
            gte: (_col: string, gteValue: string) => ({
              lt: async (_col2: string, ltValue: string) => {
                manualFineCalls.push({ fields, gte: gteValue, lt: ltValue })
                return { data: [{ user_id: 'user-2', amount: 3000, paid: false }] }
              },
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
    expect(screen.getAllByText('김민수')).toHaveLength(2)
    expect(screen.getAllByText('이지은')).toHaveLength(2)
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })

  it('shows this months unpaid fine total per member, including unpaid manual fines', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expect(screen.getByText('미납액')).toBeInTheDocument()
    expect(screen.getByText('14,000원')).toBeInTheDocument()
    expect(screen.getAllByText('0원')).toHaveLength(2)
  })

  it('shows this months total fine (paid and unpaid) per member, including manual fines', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('벌금 총액')).toBeInTheDocument()
    expect(screen.getByText('19,000원')).toBeInTheDocument()
  })

  it('links to the checkin feed', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('DashboardPage KST date boundaries', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("queries today's checkin_posts using the KST calendar day, not the UTC day", async () => {
    // 2026-08-10T20:00:00Z is still Aug 10 in UTC, but already 2026-08-11 05:00 KST.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-10T20:00:00.000Z'))
    checkinCalls.length = 0

    const ui = await DashboardPage()
    render(ui)

    const todayCall = checkinCalls.find((c) => c.fields === 'author_id')
    expect(todayCall).toEqual({
      fields: 'author_id',
      gte: '2026-08-10T15:00:00.000Z',
      lt: '2026-08-11T15:00:00.000Z',
    })
  })

  it("queries this month's checkin_posts and manual_fines using the KST calendar month, not the UTC month", async () => {
    // 2026-08-31T20:00:00Z is still August in UTC, but already 2026-09-01 05:00 KST.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T20:00:00.000Z'))
    checkinCalls.length = 0
    manualFineCalls.length = 0

    const ui = await DashboardPage()
    render(ui)

    const monthCall = checkinCalls.find((c) => c.fields === 'author_id, fine_amount, paid')
    expect(monthCall).toEqual({
      fields: 'author_id, fine_amount, paid',
      gte: '2026-08-31T15:00:00.000Z',
      lt: '2026-09-30T15:00:00.000Z',
    })

    const manualCall = manualFineCalls.find((c) => c.fields === 'user_id, amount, paid')
    expect(manualCall).toEqual({
      fields: 'user_id, amount, paid',
      gte: '2026-08-31T15:00:00.000Z',
      lt: '2026-09-30T15:00:00.000Z',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/\(app\)/page.test.tsx`
Expected: FAIL — the dashboard doesn't query `manual_fines`, so totals don't include the extra 3,000원 (`14,000원`/`19,000원` assertions fail) and `manualFineCalls` stays empty.

- [ ] **Step 3: Replace `app/(app)/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import { getKstDateString, kstDayRangeUtc, kstMonthRangeUtc } from '@/lib/checkin/time'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

export default async function DashboardPage() {
  const supabase = await createClient()
  const todayKst = getKstDateString(new Date().toISOString())
  const { start: todayStart, end: todayEnd } = kstDayRangeUtc(todayKst)
  const { start: monthStart, end: monthEnd } = kstMonthRangeUtc(todayKst)

  const [session, { data: members }, { data: todaysPosts }, { data: monthPosts }, { data: monthManualFines }] =
    await Promise.all([
      getSessionProfile(),
      supabase.from('profiles').select('id, name').eq('status', 'approved'),
      supabase.from('checkin_posts').select('author_id').gte('created_at', todayStart).lt('created_at', todayEnd),
      supabase
        .from('checkin_posts')
        .select('author_id, fine_amount, paid')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd),
      supabase
        .from('manual_fines')
        .select('user_id, amount, paid')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd),
    ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const todaysAuthorIds = (todaysPosts ?? []).map((p) => p.author_id as string)

  const monthCheckinFines = (monthPosts ?? []).map((p) => ({
    authorId: p.author_id as string,
    fineAmount: p.fine_amount as number,
    paid: p.paid as boolean,
  }))
  const monthManualFinesList = (monthManualFines ?? []).map((f) => ({
    authorId: f.user_id as string,
    fineAmount: f.amount as number,
    paid: f.paid as boolean,
  }))
  const allMonthFines = [...monthCheckinFines, ...monthManualFinesList]

  const allMonthFinePosts = allMonthFines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
  const unpaidMonthFinePosts = allMonthFines
    .filter((f) => !f.paid)
    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))

  const statusRows = buildTodayStatus(memberSummaries, todaysAuthorIds)
  const unpaidFineRows = buildMonthlyFineTotals(memberSummaries, unpaidMonthFinePosts)
  const totalFineRows = buildMonthlyFineTotals(memberSummaries, allMonthFinePosts)
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
            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금 총액</th>
          </tr>
        </thead>
        <tbody>
          {unpaidFineRows.map((row, index) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.totalFine.toLocaleString('ko-KR')}원
              </td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {totalFineRows[index].totalFine.toLocaleString('ko-KR')}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/\(app\)/page.test.tsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/page.tsx app/\(app\)/page.test.tsx
git commit -m "feat: include manual fines in dashboard monthly fine totals"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Check for stray git worktrees**

Run: `git worktree list`

If any merged/stale worktrees are listed besides the main one, a prior full-suite run may report false vitest/eslint failures from them (known issue in this repo — see project memory). Do not attempt to remove worktrees you didn't create as part of this plan; if any are present, run the affected test files in isolation (`npx vitest run <file>`) instead of trusting a full-suite failure.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS, all suites green — including every file touched in Tasks 2–8. If any single spec fails while the rest pass, re-run just that file in isolation (`npx vitest run <path>`) before treating it as a real regression — this suite is known to hit flaky 5s timeouts under concurrent load.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS, no new lint errors. (One pre-existing unrelated lint issue is already known/accepted in this repo per project memory — do not attempt to fix it as part of this change.)

- [ ] **Step 4: Run the TypeScript build**

Run: `npm run build`
Expected: succeeds with no type errors — this is the only step that will catch a mismatched `FineRow`/`groupFinesByMonth` usage between `lib/checkin/fines.ts` and `app/(app)/admin/page.tsx` if one was missed.

- [ ] **Step 5: Note the manual follow-up**

This plan cannot exercise the real Supabase project (no live credentials in this environment). After merging, the migration in Task 1 (`supabase/migrations/0011_manual_fines.sql`) must be applied to the actual Supabase project (e.g. via the Supabase CLI or dashboard SQL editor) before the admin page's manual-fine form will work end-to-end. Report this to the user rather than attempting to apply it yourself.
