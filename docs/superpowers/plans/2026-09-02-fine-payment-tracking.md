# Fine Payment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin mark individual late check-ins (`checkin_posts` rows that carry a fine) as paid or unpaid, and show the resulting unpaid total on the dashboard.

**Architecture:** Add `paid`/`paid_at`/`paid_by` columns directly to `checkin_posts` (no new table) plus an admin-only update RLS policy. A new server action `setCheckinPostPaid` flips those columns. The admin page grows a new section listing unpaid late check-ins (grouped by month, with a link to also reveal paid ones), and the dashboard's existing monthly fine table is filtered to unpaid posts only and relabeled "미납액".

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), Vitest + Testing Library.

Reference spec: `docs/superpowers/specs/2026-09-02-fine-payment-tracking-design.md`

---

### Task 1: Migration — payment columns + admin update policy on `checkin_posts`

**Files:**
- Create: `supabase/migrations/0010_checkin_fine_payment.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table checkin_posts
  add column paid boolean not null default false,
  add column paid_at timestamptz,
  add column paid_by uuid references profiles(id);

create policy "Admins can update checkin posts"
  on checkin_posts for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0010_checkin_fine_payment.sql
git commit -m "feat: add fine payment columns and admin update policy to checkin_posts"
```

There is no local Postgres to run this migration against in this repo's test setup (Vitest mocks the Supabase client everywhere), so there is no automated check for this file beyond review. Do not run `supabase db push` or similar against a real project without the user's explicit go-ahead — creating this file is the deliverable for this task.

---

### Task 2: `groupLateFinesByMonth` helper

**Files:**
- Modify: `lib/checkin/fines.ts`
- Test: `lib/checkin/fines.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `lib/checkin/fines.test.ts` (keep the existing `buildMonthlyFineTotals` tests above this):

```ts
import { buildMonthlyFineTotals, groupLateFinesByMonth } from './fines'

describe('groupLateFinesByMonth', () => {
  it('groups rows by UTC calendar month, newest month first', () => {
    const rows = [
      { postId: 'p1', memberName: '김민수', createdAt: '2026-09-05T01:00:00.000Z', fineAmount: 11000, paid: false },
      { postId: 'p2', memberName: '이지은', createdAt: '2026-08-20T01:00:00.000Z', fineAmount: 10000, paid: true },
      { postId: 'p3', memberName: '김민수', createdAt: '2026-09-01T01:00:00.000Z', fineAmount: 12000, paid: false },
    ]

    expect(groupLateFinesByMonth(rows)).toEqual([
      {
        monthLabel: '2026년 9월',
        rows: [
          { postId: 'p1', memberName: '김민수', createdAt: '2026-09-05T01:00:00.000Z', fineAmount: 11000, paid: false },
          { postId: 'p3', memberName: '김민수', createdAt: '2026-09-01T01:00:00.000Z', fineAmount: 12000, paid: false },
        ],
      },
      {
        monthLabel: '2026년 8월',
        rows: [
          { postId: 'p2', memberName: '이지은', createdAt: '2026-08-20T01:00:00.000Z', fineAmount: 10000, paid: true },
        ],
      },
    ])
  })

  it('preserves the input order of rows within a group', () => {
    const rows = [
      { postId: 'p1', memberName: 'a', createdAt: '2026-09-01T00:00:00.000Z', fineAmount: 1000, paid: false },
      { postId: 'p2', memberName: 'b', createdAt: '2026-09-02T00:00:00.000Z', fineAmount: 2000, paid: false },
    ]

    expect(groupLateFinesByMonth(rows)[0].rows.map((r) => r.postId)).toEqual(['p1', 'p2'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupLateFinesByMonth([])).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- lib/checkin/fines.test.ts`
Expected: FAIL — `groupLateFinesByMonth` is not exported from `./fines`.

- [ ] **Step 3: Implement the helper**

Add to `lib/checkin/fines.ts` (after the existing `buildMonthlyFineTotals` function):

```ts
export interface LateFineRow {
  postId: string
  memberName: string
  createdAt: string
  fineAmount: number
  paid: boolean
}

export interface MonthlyFineGroup {
  monthLabel: string
  rows: LateFineRow[]
}

export function groupLateFinesByMonth(rows: LateFineRow[]): MonthlyFineGroup[] {
  const rowsByMonthKey = new Map<string, LateFineRow[]>()

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- lib/checkin/fines.test.ts`
Expected: PASS (all `groupLateFinesByMonth` and existing `buildMonthlyFineTotals` tests green)

- [ ] **Step 5: Commit**

```bash
git add lib/checkin/fines.ts lib/checkin/fines.test.ts
git commit -m "feat: add groupLateFinesByMonth helper for the admin fine list"
```

---

### Task 3: `setCheckinPostPaid` server action

**Files:**
- Create: `app/(app)/admin/fine-actions.ts`
- Test: `app/(app)/admin/fine-actions.test.ts`

This mirrors the permission-check shape of `setUserStatus` in `app/(app)/admin/actions.ts:8-42`.

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/admin/fine-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ADMIN_ID = 'admin-1'
const MEMBER_ID = 'member-1'
const POST_ID = 'post-1'

const selectEqMock = vi.fn()
const selectMock = vi.fn()
const updateEqMock = vi.fn()
const updateMock = vi.fn()
const fromMock = vi.fn()
const getUserMock = vi.fn()
const revalidatePathMock = vi.fn()

let roleById: Record<string, string | null>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { setCheckinPostPaid } from './fine-actions'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-02T00:00:00.000Z'))

  getUserMock.mockResolvedValue({ data: { user: { id: ADMIN_ID } }, error: null })

  roleById = { [ADMIN_ID]: 'admin', [MEMBER_ID]: 'member' }
  selectEqMock.mockImplementation((_col: string, id: string) => ({
    single: vi.fn().mockResolvedValue({ data: { role: roleById[id] ?? null }, error: null }),
  }))
  selectMock.mockReturnValue({ eq: selectEqMock })

  updateEqMock.mockResolvedValue({ error: null })
  updateMock.mockReturnValue({ eq: updateEqMock })

  fromMock.mockReturnValue({ select: selectMock, update: updateMock })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('setCheckinPostPaid', () => {
  it('marks a post paid with a timestamp and the caller id, then revalidates', async () => {
    await setCheckinPostPaid(POST_ID, true)

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(fromMock).toHaveBeenCalledWith('checkin_posts')
    expect(updateMock).toHaveBeenCalledWith({
      paid: true,
      paid_at: '2026-09-02T00:00:00.000Z',
      paid_by: ADMIN_ID,
    })
    expect(updateEqMock).toHaveBeenCalledWith('id', POST_ID)
    expect(revalidatePathMock).toHaveBeenCalledWith('/admin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
  })

  it('marks a post unpaid and clears paid_at/paid_by', async () => {
    await setCheckinPostPaid(POST_ID, false)

    expect(updateMock).toHaveBeenCalledWith({ paid: false, paid_at: null, paid_by: null })
  })

  it('throws when the caller is not an admin, without updating', async () => {
    roleById[ADMIN_ID] = 'member'

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it('throws when there is no authenticated caller, without updating', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null })

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('권한이 없습니다')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('throws when the update fails', async () => {
    updateEqMock.mockResolvedValue({ error: { message: 'db error' } })

    await expect(setCheckinPostPaid(POST_ID, true)).rejects.toThrow('db error')
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- app/\(app\)/admin/fine-actions.test.ts`
Expected: FAIL — cannot find module `./fine-actions`.

- [ ] **Step 3: Implement the server action**

Create `app/(app)/admin/fine-actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setCheckinPostPaid(postId: string, paid: boolean) {
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
    .from('checkin_posts')
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
      paid_by: paid ? user.id : null,
    })
    .eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  revalidatePath('/')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- app/\(app\)/admin/fine-actions.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/fine-actions.ts" "app/(app)/admin/fine-actions.test.ts"
git commit -m "feat: add setCheckinPostPaid admin server action"
```

---

### Task 4: Admin page — 지각 벌금 관리 section

**Files:**
- Modify: `app/(app)/admin/page.tsx`
- Test: `app/(app)/admin/page.test.tsx`

Current `app/(app)/admin/page.tsx` fetches `pendingUsers` and `approvedMembers` in a `Promise.all` and renders two sections (`app/(app)/admin/page.tsx:8-84`). This task adds a third data fetch and a third section, and turns the page into one that reads `searchParams` (same shape as `app/(app)/checkin/page.tsx:29-34`).

- [ ] **Step 1: Update the failing/changed tests first**

Replace the full contents of `app/(app)/admin/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const pendingUsers = [{ id: 'u1', name: '김민수', created_at: '2026-07-01T00:00:00Z' }]
const approvedMembers = [
  { id: 'u2', name: '관리자', role: 'admin' },
  { id: 'u3', name: '이지은', role: 'member' },
]
const lateFines = [
  { id: 'post-1', author_id: 'u3', created_at: '2026-09-05T01:00:00.000Z', fine_amount: 11000, paid: false },
  { id: 'post-2', author_id: 'u3', created_at: '2026-08-20T01:00:00.000Z', fine_amount: 10000, paid: true },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({
              order: () => ({
                data: value === 'pending' ? pendingUsers : approvedMembers,
              }),
            }),
          }),
        }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              gt: () => ({
                order: async () => ({ data: lateFines }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  approveUser: vi.fn(),
  rejectUser: vi.fn(),
}))

vi.mock('./fine-actions', () => ({
  setCheckinPostPaid: vi.fn(),
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

  describe('지각 벌금 관리', () => {
    it('shows only unpaid fines by default, grouped by month', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({}) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.queryByText('2026년 8월')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '납부완료로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '납부 내역 보기' })).toHaveAttribute('href', '/admin?showPaid=1')
    })

    it('reveals paid fines with a reverse toggle when showPaid=1', async () => {
      const ui = await AdminPage({ searchParams: Promise.resolve({ showPaid: '1' }) })
      render(ui)

      expect(screen.getByText('2026년 9월')).toBeInTheDocument()
      expect(screen.getByText('2026년 8월')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '납부완료로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '미납으로 표시' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '미납 건만 보기' })).toHaveAttribute('href', '/admin')
    })

    it('shows an empty state when there are no unpaid fines', async () => {
      vi.doMock('@/lib/supabase/server', () => ({
        createClient: vi.fn(async () => ({
          from: (table: string) => {
            if (table === 'profiles') {
              return {
                select: () => ({
                  eq: (_col: string, value: string) => ({
                    order: () => ({ data: value === 'pending' ? pendingUsers : approvedMembers }),
                  }),
                }),
              }
            }
            return {
              select: () => ({
                eq: () => ({ gt: () => ({ order: async () => ({ data: [] }) }) }),
              }),
            }
          },
        })),
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- "app/(app)/admin/page.test.tsx"`
Expected: FAIL — `AdminPage` currently takes no arguments and renders no 지각 벌금 관리 section, so the new assertions (month labels, buttons, link) fail; the first test also breaks because `AdminPage` ignores the passed prop today (harmless) but the new sections don't exist yet.

- [ ] **Step 3: Implement the page changes**

In `app/(app)/admin/page.tsx`, replace the full file contents:

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import { setCheckinPostPaid } from './fine-actions'
import { groupLateFinesByMonth, type LateFineRow } from '@/lib/checkin/fines'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

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
    { data: lateFines, error: lateFinesError },
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
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, fine_amount, paid')
      .eq('is_late', true)
      .gt('fine_amount', 0)
      .order('created_at', { ascending: false }),
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  if (lateFinesError) {
    console.error('admin page: failed to fetch late fines', lateFinesError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []
  const nameById = new Map(approvedList.map((m) => [m.id, m.name as string]))

  const lateFineRows: LateFineRow[] = (lateFines ?? [])
    .filter((post) => showPaid || !post.paid)
    .map((post) => ({
      postId: post.id,
      memberName: nameById.get(post.author_id) ?? '알 수 없음',
      createdAt: post.created_at,
      fineAmount: post.fine_amount,
      paid: post.paid,
    }))

  const fineGroups = groupLateFinesByMonth(lateFineRows)

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
          <h2 className="text-lg font-semibold">지각 벌금 관리</h2>
          <Link
            href={showPaid ? '/admin' : '/admin?showPaid=1'}
            className="text-sm text-gray-500 underline dark:text-gray-400"
          >
            {showPaid ? '미납 건만 보기' : '납부 내역 보기'}
          </Link>
        </div>
        {fineGroups.length === 0 ? (
          <EmptyState message={showPaid ? '지각 벌금 내역이 없습니다.' : '미납된 벌금이 없습니다.'} />
        ) : (
          <div className="flex flex-col gap-6">
            {fineGroups.map((group) => (
              <div key={group.monthLabel}>
                <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">{group.monthLabel}</h3>
                <ul className="flex flex-col gap-3">
                  {group.rows.map((row) => (
                    <Card key={row.postId} as="li" padding="sm" className="flex items-center justify-between">
                      <span>
                        {formatFineDate(row.createdAt)} · {row.memberName} · {row.fineAmount.toLocaleString('ko-KR')}원
                      </span>
                      <form action={setCheckinPostPaid.bind(null, row.postId, !row.paid)}>
                        <Button type="submit" variant="secondary">
                          {row.paid ? '미납으로 표시' : '납부완료로 표시'}
                        </Button>
                      </form>
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- "app/(app)/admin/page.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/admin/page.tsx" "app/(app)/admin/page.test.tsx"
git commit -m "feat: add unpaid/paid late-fine list to the admin page"
```

---

### Task 5: Dashboard — show unpaid total instead of total incurred

**Files:**
- Modify: `app/(app)/page.tsx`
- Test: `app/(app)/page.test.tsx`

Current dashboard fetches `checkin_posts` for the month (`app/(app)/page.tsx:32-36`) and sums every post's `fine_amount` per member. This task adds `paid` to the select and filters to unpaid posts before summing, and relabels the column.

- [ ] **Step 1: Update the failing/changed test first**

In `app/(app)/page.test.tsx`, replace the `checkin_posts` mock branch (lines 15-23) and the fine-total test (lines 56-62):

```tsx
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: async () => ({
                data: [
                  { author_id: 'user-2', fine_amount: 11000, paid: false },
                  { author_id: 'user-2', fine_amount: 5000, paid: true },
                ],
              }),
            }),
          }),
        }
      }
```

```tsx
  it('shows this months unpaid fine total per member', async () => {
    const ui = await DashboardPage()
    render(ui)
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expect(screen.getByText('미납액')).toBeInTheDocument()
    expect(screen.getByText('11,000원')).toBeInTheDocument()
    expect(screen.getByText('0원')).toBeInTheDocument()
    expect(screen.queryByText('16,000원')).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- "app/(app)/page.test.tsx"`
Expected: FAIL — the "미납액" header text doesn't exist yet, and today's query doesn't filter out the paid `5000` post (current code would still pass the amount assertions coincidentally, but the header assertion fails).

- [ ] **Step 3: Implement the dashboard changes**

In `app/(app)/page.tsx`, update the `monthPosts` select (line 34) and the mapping (lines 41-44):

```ts
    supabase
      .from('checkin_posts')
      .select('author_id, fine_amount, paid')
      .gte('created_at', monthStart)
      .lt('created_at', monthEnd),
```

```ts
  const unpaidMonthPosts = (monthPosts ?? []).filter((p) => !p.paid)
  const monthFinePosts = unpaidMonthPosts.map((p) => ({
    authorId: p.author_id as string,
    fineAmount: p.fine_amount as number,
  }))
```

And update the table header (line 86) from:

```tsx
            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금</th>
```

to:

```tsx
            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- "app/(app)/page.test.tsx"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/page.tsx" "app/(app)/page.test.tsx"
git commit -m "feat: show unpaid fine total on the dashboard"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including the three touched/added in this plan
(`lib/checkin/fines.test.ts`, `app/(app)/admin/fine-actions.test.ts`,
`app/(app)/admin/page.test.tsx`, `app/(app)/page.test.tsx`).

If any test in an unrelated file fails, check `git worktree list` first —
per prior project experience, stray merged worktrees can cause false failures
under load. Re-run the specific failing file in isolation before treating it
as a real regression.

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: no new errors introduced by this plan's files (a pre-existing unrelated
lint issue elsewhere in the repo, if any, is not this plan's concern).

- [ ] **Step 3: Manual review of the diff**

Run: `git log --oneline -6` and `git diff main --stat` (or equivalent) to confirm
only the intended files changed across the plan's commits:
- `supabase/migrations/0010_checkin_fine_payment.sql`
- `lib/checkin/fines.ts`, `lib/checkin/fines.test.ts`
- `app/(app)/admin/fine-actions.ts`, `app/(app)/admin/fine-actions.test.ts`
- `app/(app)/admin/page.tsx`, `app/(app)/admin/page.test.tsx`
- `app/(app)/page.tsx`, `app/(app)/page.test.tsx`

- [ ] **Step 4: Note any manual/live-environment follow-up**

This plan's automated tests all run against a mocked Supabase client — nothing here
exercises the real database. Before this ships to production, someone needs to run
migration `0010_checkin_fine_payment.sql` against the actual Supabase project (e.g.
via `supabase db push` or the SQL editor) — this plan does not do that automatically
and it should not be run without the user's explicit confirmation, since it's a
schema change and RLS policy addition on shared infrastructure.
