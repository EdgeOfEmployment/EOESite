# Fine Payment Tracking — Design Spec

Date: 2026-09-02

## Problem

Late check-ins (`checkin_posts` with `is_late = true`) accumulate a `fine_amount`, and
the dashboard already totals those fines per member for the current month. There is
no way to record that a member has actually paid a fine. The admin needs to mark
individual late check-ins as paid or unpaid, and the dashboard should reflect
outstanding (unpaid) amounts so members can see what they still owe.

## Decisions from brainstorming

- Payment is tracked **per late check-in record**, not as a monthly aggregate. Each
  `checkin_posts` row that carries a fine gets its own paid/unpaid state.
- The admin page is the only place payment status can be changed. The dashboard is
  read-only.
- The admin page's fine list defaults to **unpaid records only**, sorted newest first
  and grouped under month headings, with no time limit (old unpaid fines stay visible
  until settled). A "납부 내역 보기" link reveals paid records too, each with a toggle
  to flip its status back.
- The dashboard's existing "이번 달 벌금 정산" table changes from showing the total
  fine incurred this month to showing the **unpaid** total this month per member. The
  column header changes from "벌금" to "미납액". No per-day breakdown on the
  dashboard — summary only.

## Data model

Add payment columns directly to `checkin_posts` (new migration
`0010_checkin_fine_payment.sql`), rather than a separate payments table, since payment
status belongs to the specific late check-in it was charged for:

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

`checkin_posts` currently has no admin-scoped update policy — only "Authors can update
their own checkin posts" (self-service, e.g. toggling goal completion) and "Admins can
delete checkin posts". This adds the missing admin update path. As with the existing
author-update policy (see the comment in `0009_checkin_desk_goal.sql`), Postgres RLS
cannot restrict this to just the `paid`/`paid_at`/`paid_by` columns — an admin's
`with check` here permits updating any column on any post. This is an accepted
extension of the same trust model already documented for authors (admins are already
trusted to delete any post outright).

`paid_at`/`paid_by` are set when `paid` is flipped to `true` (now() / caller id) and
cleared back to `null` when flipped to `false`.

## Server action

New file `app/(app)/admin/fine-actions.ts`:

```ts
export async function setCheckinPostPaid(postId: string, paid: boolean): Promise<void>
```

Mirrors the permission-check shape of `setUserStatus` in `app/(app)/admin/actions.ts`:
loads the caller's session user, looks up their `profiles.role`, throws a Korean error
message if not `admin`. On success, updates the target `checkin_posts` row and calls
`revalidatePath('/admin')` and `revalidatePath('/')` (the dashboard reads unpaid totals
and must reflect the change immediately).

## Admin page (`app/(app)/admin/page.tsx`)

New section, "지각 벌금 관리", added below the existing 가입 대기/멤버 sections.

- Reads `showPaid` from `searchParams` (`?showPaid=1`); default is unpaid-only.
- Query: `checkin_posts` where `is_late = true` and `fine_amount > 0`, selecting
  `id, author_id, created_at, fine_amount, paid`, ordered by `created_at` descending.
  When `showPaid` is not set, filter to `paid = false` before rendering.
- Join with a name map built from *all* profiles (not just approved members), so a
  member who is later rejected/kicked while still owing a fine is still identifiable
  by name — not just the approved-members query already on this page. Falls back to
  `'알 수 없음'` if a name still isn't found, matching the `checkin/page.tsx` pattern
  of `nameById.get(...) ?? '알 수 없음'`.
- Grouping: a new pure function in `lib/checkin/fines.ts`,
  `groupLateFinesByMonth(rows: LateFineRow[]): { monthLabel: string; rows: LateFineRow[] }[]`,
  where `LateFineRow = { postId, memberName, createdAt, fineAmount, paid }`. Grouping
  key is the UTC calendar month of `createdAt` (same month convention the dashboard's
  `monthRangeUtc` already uses — see below), formatted as `"YYYY년 M월"`.
- Each row renders date, member name, amount, and a form button bound to
  `setCheckinPostPaid(postId, !paid)` labeled "납부완료로 표시" (when unpaid) or
  "미납으로 표시" (when showing paid records with the reveal link on).
- A toggle link at the top switches `showPaid` between unset and `1`
  (`/admin?showPaid=1` / `/admin`), following the existing `Link href="/admin?..."`
  style already used elsewhere in this codebase (e.g. `/checkin?date=...`).

## Dashboard (`app/(app)/page.tsx`)

- The existing inline `monthRangeUtc()` helper in `page.tsx` stays where it is — the
  admin page doesn't need a bounded month range (it lists all unpaid records
  regardless of month), so there's no second consumer to justify moving it into
  `lib/checkin/fines.ts`. The admin page's month *grouping* labels use the same
  UTC-month convention independently, via `groupLateFinesByMonth`.
- The `monthPosts` query adds `paid` to its selected columns and the dashboard filters
  to `paid === false` before calling `buildMonthlyFineTotals`, so the totals reflect
  outstanding balance only. `buildMonthlyFineTotals` itself is unchanged — it just
  receives a pre-filtered post list.
- Table header "벌금" → "미납액". Row values unchanged in formatting
  (`toLocaleString('ko-KR')원`).

## Testing

- `lib/checkin/fines.test.ts`: unit tests for `groupLateFinesByMonth` (grouping order,
  month label formatting, empty input) and for `monthRangeUtc` (moved from inline
  dashboard code, same behavior).
- `app/(app)/admin/fine-actions.test.ts` (new): non-admin caller is rejected; admin
  caller successfully updates `paid`/`paid_at`/`paid_by`; unpaid toggle clears
  `paid_at`/`paid_by`.
- `app/(app)/admin/page.test.tsx`: extends existing tests to cover the new section —
  default view shows only unpaid rows grouped by month; `showPaid=1` reveals paid rows
  with the reverse-toggle button.
- `app/(app)/page.test.tsx`: updates the existing dashboard test's fixture/expectations
  for the "미납액" column and unpaid-only filtering.

## Out of scope

- No UI for editing/correcting a fine amount itself.
- No notifications/reminders about unpaid fines.
- No historical payment audit trail beyond the single `paid_at`/`paid_by` snapshot per
  post (sufficient since the last action always wins for a given post).
