# Manual Fine Management — Design Spec

Date: 2026-09-07

## Problem

Fines currently only exist as a side effect of a late check-in
(`checkin_posts.fine_amount`, computed automatically by `computeLateFine` at
check-in time). There is no way for an admin to:

1. Charge a member a fine for something other than a late check-in.
2. Reverse/cancel a fine that was charged — neither an auto late fine nor
   (once added) a manual one.

## Decisions from brainstorming

- Deleting a late fine does **not** delete the check-in post (it's an attendance
  record and must stay). It resets `checkin_posts.fine_amount` back to `0`, which
  removes it from the admin fine list (`fine_amount > 0` filter) and from dashboard
  totals automatically. `is_late` is left untouched — nothing else reads it.
- Manual fines are **independent** of any check-in post: a new `manual_fines` table
  keyed by target member, amount, and a required reason.
- Manual fines are treated exactly like late fines everywhere they're surfaced:
  same paid/unpaid toggle, same inclusion in the dashboard's monthly per-member
  totals.
- No confirmation dialogs on cancel/delete, matching the existing admin page pattern
  (approve/reject/kick already act immediately on submit).

## Data model

New migration `0011_manual_fines.sql`:

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

The select policy mirrors "Approved members can read checkin posts" — any approved
member (not just admins) can read all rows, because the dashboard's per-member
monthly total needs to aggregate every member's fines, not just the current user's.

## Server actions (`app/(app)/admin/fine-actions.ts`)

All four follow the existing `setCheckinPostPaid` permission-check shape: load the
caller's session user, look up `profiles.role`, throw `'권한이 없습니다'` if not
`'admin'`.

```ts
export async function addManualFine(userId: string, amount: number, reason: string): Promise<void>
export async function deleteManualFine(fineId: string): Promise<void>
export async function cancelCheckinFine(postId: string): Promise<void>
export async function setManualFinePaid(fineId: string, paid: boolean): Promise<void>
```

- `addManualFine`: validates `amount > 0` and `reason.trim().length > 0` (mirrors the
  DB check constraint / not-null so the error surfaces before hitting Postgres),
  verifies `userId` belongs to a `profiles` row with `status = 'approved'`, then
  inserts with `created_by = caller.id`.
- `deleteManualFine`: `delete from manual_fines where id = fineId`.
- `cancelCheckinFine`: `update checkin_posts set fine_amount = 0 where id = postId`.
- `setManualFinePaid`: same shape as `setCheckinPostPaid` — sets `paid`, and
  `paid_at`/`paid_by` to `now()`/caller id when `true`, both `null` when `false`.

All four call `revalidatePath('/admin')` and `revalidatePath('/')` on success, same as
`setCheckinPostPaid`.

## Shared fine types (`lib/checkin/fines.ts`)

Generalize the existing late-fine-only helpers into a unified shape covering both
sources:

```ts
export interface FineRow {
  id: string
  kind: 'late' | 'manual'
  memberName: string
  createdAt: string
  amount: number
  paid: boolean
  reason?: string // set for kind: 'manual'
}

export function groupFinesByMonth(rows: FineRow[]): { monthLabel: string; rows: FineRow[] }[]
```

This replaces `LateFineRow` and `groupLateFinesByMonth` (renamed/generalized; the
single existing call site in `app/(app)/admin/page.tsx` is updated). Month-grouping
logic (UTC calendar month, `"YYYY년 M월"` label, newest month first) is unchanged.
`buildMonthlyFineTotals` and its `MonthlyFinePost { authorId, fineAmount }` input are
unchanged — callers just concatenate late-fine and manual-fine posts into one array
before calling it.

## Admin page (`app/(app)/admin/page.tsx`)

The "지각 벌금 관리" section becomes "벌금 관리":

- **Add form** at the top of the section: a `<select>` of approved members (reusing
  the already-fetched `approvedList`), an amount `<input type="number">`, a reason
  `<input type="text">`, submitting to `addManualFine`.
- **List**: queries both `checkin_posts` (`is_late = true and fine_amount > 0`) and
  `manual_fines`, maps each into a `FineRow` (`kind: 'late'` / `'manual'`), merges,
  filters by `showPaid` exactly as today, and groups with `groupFinesByMonth`.
- Each row shows date · member · amount, a small source badge ("지각" / "수동"), and
  the reason text when `kind === 'manual'`.
- Each row gets two form buttons:
  - Paid toggle: bound to `setCheckinPostPaid` (late) or `setManualFinePaid`
    (manual) depending on `kind` — same label logic as today.
  - Cancel/delete: bound to `cancelCheckinFine` (late, labeled "취소") or
    `deleteManualFine` (manual, labeled "삭제").

## Dashboard (`app/(app)/page.tsx`)

`monthPosts` gains a sibling query against `manual_fines` for the same
`[monthStart, monthEnd)` KST range (on `created_at`), mapped to the same
`{ authorId, fineAmount }` shape used today (`user_id` → `authorId`, `amount` →
`fineAmount`) and concatenated into `allMonthFinePosts` / `unpaidMonthFinePosts`
before calling `buildMonthlyFineTotals`. No other dashboard changes — a manual fine
now simply shows up inside the existing per-member 미납액/벌금 총액 totals.

## Testing

- `lib/checkin/fines.test.ts`: update/extend for `groupFinesByMonth` (mixed
  `kind` rows grouped together correctly; existing grouping/label cases preserved).
- `app/(app)/admin/fine-actions.test.ts`: extend with cases for all four new
  actions — non-admin rejected for each; `addManualFine` rejects a non-positive
  amount, an empty reason, and a target who isn't an approved member; happy-path
  insert/delete/update; `cancelCheckinFine` zeroes `fine_amount` and leaves
  `is_late` untouched.
- `app/(app)/admin/page.test.tsx`: extend to cover the add-fine form rendering,
  merged/grouped list including both kinds, and the cancel/delete buttons.
- `app/(app)/page.test.tsx`: extend the dashboard fixture to include a manual fine
  and assert it's folded into the existing totals.

## Out of scope

- Editing an existing fine's amount/reason after creation (delete + re-add covers
  this).
- Notifications about newly-charged manual fines.
- Restricting which admin charged/cancelled a fine (any admin can act on any fine,
  matching the existing all-admins-equal trust model used for check-in deletion and
  payment toggling).
