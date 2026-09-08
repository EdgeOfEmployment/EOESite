# Coding Board Week Pagination & Manual Weeks — Design

## Goal

Replace the coding board's implicit, date-computed "week" concept with an explicit `coding_weeks` entity that admins create directly (label + start/end date), and change the `/coding` page from stacking every week's problems in one long scroll to showing exactly one week at a time, navigable via prev/next.

## Context

The board currently derives a week's identity purely from `coding_problems.week_of` (a date column). `getMostRecentTuesday()` snaps any admin-picked date to a canonical Tuesday, `formatWeekLabel()` renders it as "M/D 주차", and `getWeekDueDate()`/`formatDueDateLabel()` compute a display-only deadline as `week_of + 6 days`. Every distinct `week_of` value implicitly becomes a "week," and `page.tsx` renders every week's problems in one stacked list via `groupByWeek()`.

This design replaces that with a real `coding_weeks` row per week (admin-authored label, start date, end date — no more Tuesday-snapping or +6-day computation), and changes the page to show one week's problems at a time.

## Data Model

**New table `coding_weeks`:**
```
id           uuid primary key default gen_random_uuid()
label        text not null           -- e.g. "1주차", admin-authored, free text
start_date   date not null           -- admin-authored
end_date     date not null           -- admin-authored
created_by   uuid not null references profiles(id) on delete cascade
created_at   timestamptz not null default now()
```

**`coding_problems` change:** drop `week_of`, add `week_id uuid not null references coding_weeks(id) on delete cascade`.

**RLS:** mirrors `coding_problems`'s existing policies exactly — approved members can `select`, admins can `insert`. No `update`/`delete` policies (no edit/delete-a-week UI in this design — see Out of Scope).

**Backfill (in the same migration):**
1. For each distinct existing `week_of` value in `coding_problems`, insert one `coding_weeks` row: `label = formatWeekLabel(week_of)` (i.e. the exact string previously shown, e.g. "9/8 주차"), `start_date = week_of`, `end_date = week_of + 6 days`, `created_by` = the `created_by` of any problem in that group (doesn't need to be precise — this field only drives future "who made this week" bookkeeping, not access control).
2. Populate `coding_problems.week_id` from the matching backfilled week.
3. Drop `week_of`.

This keeps every existing problem's displayed week label and date range byte-identical across the migration — nothing a current user sees changes until an admin starts creating new weeks the new way.

## Problem Registration Form

The form still supports registering multiple problems in one batch (title/link/keyword/assignees per row — unchanged from the existing implementation), but the "which week" input changes:

- **Default mode: add to the currently-viewed week.** The form is rendered on the currently-paginated week's page (see below), so it already knows that week's id. The label/start/end fields are shown pre-filled and disabled (non-editable) as a reminder of which week you're adding to — no re-typing required, no risk of a typo creating an accidental duplicate week.
- **"새 주차 만들기" toggle:** switches the three fields (label, start date, end date) from read-only/pre-filled to blank, editable inputs. Submitting in this mode creates a new `coding_weeks` row first, then inserts the batch's problems against its new id.

**Server action shape:** `createProblems` gains a `weekMode: 'existing' | 'new'` input.
- `existing`: requires `weekId` (hidden field, the currently-viewed week).
- `new`: requires `weekLabel`, `weekStartDate`, `weekEndDate` — inserts a `coding_weeks` row, then uses its id for the problem batch.

Everything else about the batch-row mechanics (repeatable rows, per-row assignee checkboxes, hidden `rowIds`) is unchanged from the current implementation.

## Page Display

`/coding` shows exactly one week's problems (title, per-assignee check status, commit links — all unchanged from the current `ProblemCard`), with the week identified via a `week` search param holding the week's id (shareable/bookmarkable URL, consistent with the page's existing `error`/`success` search-param pattern).

- **Ordering:** weeks ordered by `start_date` descending (newest first) — same direction as the current `week_of desc` ordering.
- **Default (no `week` param):** the newest week.
- **Header:** `"{label} ({M/D}~{M/D})"`, e.g. `"1주차 (9/8~9/14)"` — replaces the current two-part "M/D 주차" / "M/D 마감" display.
- **Navigation:** "← 이전 주차" / "다음 주차 →" buttons/links around the header, linking to `?week=<prev-id>` / `?week=<next-id>` relative to `start_date` order. The "이전" (older) link is hidden/disabled on the oldest week; "다음" (newer) is hidden/disabled on the newest.
- **Empty state:** if there are no weeks at all yet, show the existing `EmptyState` message; an admin can still use the registration form's "새 주차 만들기" mode to create the first one (since there's no "current week" to default into, the form starts in new-week mode automatically when no weeks exist).

## Out of Scope

- No standalone "manage weeks" UI (rename/re-date/delete an existing week, or delete a week with its problems). Weeks are created only via the registration form's "새 주차 만들기" mode.
- No change to webhook matching, assignee filtering/display, or commit-link building — all untouched by this design.
- No change to the deadline-is-display-only philosophy — `end_date` is still never enforced, exactly like the current `+6 days` deadline.

## Error Handling / Edge Cases

- Submitting `weekMode: 'new'` with a blank label/start/end fails closed with a redirect error, same pattern as existing field validation in `createProblems`.
- A `week` search-param id that doesn't match any `coding_weeks` row (stale bookmark after... there's no delete UI, so this can only happen from a malformed URL) falls back to the newest week rather than erroring.
- Two weeks can have identical labels (not enforced unique) — acceptable, since `id` (not label) is the actual identity used for grouping/linking.

## Testing

- Migration: verify backfill produces one `coding_weeks` row per distinct prior `week_of`, with byte-identical label/date-range to what `formatWeekLabel`/`getWeekDueDate` currently produce, and every problem's `week_id` resolves to the correct backfilled row.
- `createProblems`: both `weekMode` branches (existing week id passthrough; new week creation followed by batch insert against the new id), plus the existing per-row validation tests, updated for the new week fields.
- Page: prev/next navigation renders the correct week for a given `?week=` id, defaults to newest with no param, hides the appropriate boundary button at each end, and falls back to newest for an unknown id.
- Form: "새 주차 만들기" toggle switches the three fields between read-only/pre-filled and blank/editable; submitting in each mode sends the right payload shape.
