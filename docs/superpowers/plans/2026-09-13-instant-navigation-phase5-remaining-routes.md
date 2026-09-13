# Instant Navigation Phase 5: Remaining Routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the instant-navigation migration — unblock the four auth pages that still fail `next build`, convert the three routes (`/coding`, `/admin`, `/`) that only *appear* to pass because a `loading.tsx` is masking them, make every mutation that writes into a Phase-5 cache scope fire that scope's tag (the last `revalidatePath('/')` clusters among them), adopt validated runtime instant prefetching on `/jobposts` and `/interviews`, and — for the first time in this five-phase effort — merge to `main`.

**Architecture:**

**Finding A — four auth pages, not two.** Phases 1–4 recorded `/forgot-password` as "the first error, out of scope" and Phase 4's handoff named `/login` as the other known failure. Both are true, but the set is larger. `next build` aborts the entire export on the *first* prerender error, so every route after `/forgot-password` in worker order was never evaluated. Re-running the build in this session with `/login` and `/forgot-password` neutralized produced:

```
Error: Route "/reset-password": Uncached data was accessed outside of <Suspense>. This delays the entire page from rendering, resulting in a slow user experience.
Export encountered an error on /reset-password/page: /reset-password, exiting the build.
```

`/signup` was never reached even then, but it is the same construct character-for-character — `export default async function SignupPage({ searchParams })` whose first statement is `const { error } = await searchParams`, no `<Suspense>`, and no `loading.tsx` anywhere above `app/signup/`. The positive proof is the other direction and it is conclusive: a build with the `TopNotice` fix applied to **all four** pages exited `0` and prerendered 20/20 pages with no error lines. All four are fixed in Task 1, and Task 1 is the point at which `npm run build` goes green.

**Finding B — `/coding`, `/admin` and `/` do not pass; their `loading.tsx` passes for them.** A `loading.tsx` creates an implicit `<Suspense>` boundary around the whole segment, which satisfies the build-time blocking-route check even though the page still blocks on every byte of its data at runtime — the reader waits on a full-page skeleton rather than seeing a shell. This is the same masking that was discovered on `/checkin` before Phase 4 converted it. It was proven here rather than assumed, by removing `loading.tsx` files and rebuilding one route at a time:

| Route | `loading.tsx` that covers it | Build result with that file removed |
| --- | --- | --- |
| `/` | `app/(app)/loading.tsx` | `Error: Route "/": Uncached data was accessed outside of <Suspense>` |
| `/admin` | `app/(app)/admin/loading.tsx`, and `app/(app)/loading.tsx` above it | `Error: Route "/admin": …` |
| `/coding` | `app/(app)/coding/loading.tsx`, and `app/(app)/loading.tsx` above it | `Error: Route "/coding": …` |
| `/feedback/[id]` | `app/(app)/feedback/[id]/loading.tsx` | `Error: Route "/feedback/[id]": …` |
| `/interviews/[sessionId]` | `app/(app)/interviews/[sessionId]/loading.tsx` | `Error: Route "/interviews/[sessionId]": …` |

Two mechanics in that table are load-bearing for this plan's scope:

1. The **group-level** `app/(app)/loading.tsx` covers every route in the group. Deleting only `app/(app)/coding/loading.tsx` left `/coding` building clean, because the group file still shielded it. So each of Tasks 2–4 must delete its own route's `loading.tsx` *and* the group file must go in Task 4 — otherwise the static shells these tasks build are never actually shown on navigation, and the work is invisible.
2. Deleting the group file is nonetheless **safe for the two detail routes**, verified directly: a build with only `app/(app)/loading.tsx` removed failed on `/` alone and reported nothing about `/feedback/[id]` or `/interviews/[sessionId]`, because each of those keeps its own `loading.tsx`.

**Scope call — `/feedback/[id]` and `/interviews/[sessionId]` are deferred to Phase 6.** This is a deliberate decision, recorded here so it is not mistaken for an oversight. Both routes are masked exactly like the three this plan converts, and both should eventually be converted. They are not converted here because they are a genuinely different design problem, not a mechanical repeat:

- Both derive the page **title** from the database. `app/(app)/interviews/[sessionId]/page.tsx` renders `<PageShell title={session.title}>` and `app/(app)/feedback/[id]/page.tsx` builds `heading` from a job post's `company_name` or an interview session's `title`. Every conversion in Phases 1–5 has relied on the title being a literal that can sit in the static shell. For these two, "what is the static shell" has no obvious answer — a shell with no heading, a shell with a skeleton heading, or `<PageShell>` itself inside the boundary are three different products, and picking one is a design conversation.
- Both `redirect()` out of the middle of the data path on not-found (`redirect('/jobposts?error=…')`, `redirect('/interviews?error=…')`). A redirect thrown from inside a `<Suspense>` boundary after a shell has already been flushed behaves differently from one thrown before the response starts, and that needs its own investigation.
- Neither blocks the build and neither blocks the merge: they keep their `loading.tsx` and continue to prerender clean. Phase 5 reaches a fully green build without them.

**The `/coding` design.** `/coding` reads five things: the caller's own `profiles.github_username`, the approved-member list, all `coding_weeks`, the selected week's `coding_problems`, and every member's `coding_checks` for those problems. Only the first is per-caller; the other four are identical for every member. RLS was verified in `supabase/migrations/`, not assumed — `coding_weeks` (`0013_coding_weeks.sql:18`), `coding_problems` and `coding_checks` (`0003_coding.sql:42,54`) and `profiles` (`0003_coding.sql:18`) all have SELECT policies of exactly `using (public.is_approved())`, with no per-row ownership clause, so the cookie-free `createCacheClient()` is safe for all of them, by the same criterion Phases 1–4 applied.

The cached accessors go in a new `lib/coding/queries.ts` rather than in the page, because **`/` needs the same data**: the dashboard's "이번 주 코딩 문제" widget reads `coding_weeks` and `coding_problems` too. Two copies would mean two cache scopes holding the same rows with two invalidation stories. One module, one `coding-board` tag, both routes. That tag is exported from `lib/coding/queries.ts` as the constant `CODING_BOARD_TAG` rather than repeated as the bare string `'coding-board'` — it recurs in `lib/coding/queries.ts`, `app/(app)/coding/actions.ts` (six times) and `app/api/github-webhook/route.ts`, and a typo in any one of those would silently disable invalidation with no build error and no test failure. Every call site imports the constant instead of retyping the string.

Cache-key space is bounded by construction. `?week=` is attacker-controlled, so it must never become a cache key — the `/checkin` plan hit the identical hazard with `?date=`. The guard here needs no new code: `resolveCurrentWeek(weeks, requestedWeekId)` (`lib/coding/week.ts`) does `weeks.findIndex((week) => week.id === requestedId)` and falls back to index `0` when that returns `-1`. So the id passed to `getCodingWeekBoard(weekId)` is always an id that came out of the database, and the key space is exactly the number of real weeks.

**The `/coding` invalidation hazard — `app/api/github-webhook/route.ts`.** This is the single most dangerous finding for Task 2 and it is easy to miss. The webhook upserts into `coding_checks` at `route.ts:85` and calls **no revalidation of any kind** — `grep -rn "revalidate" app/api/` returns nothing. That is correct today only because `/coding` is fully dynamic, so every request re-queries. The moment `getCodingWeekBoard` becomes a `'use cache'` scope, a GitHub push would set `source: 'auto'` rows that nobody sees until the `minutes` profile's `revalidate` window passes — up to about a minute server-side, plus up to five more minutes for a client sitting on a warm router cache (the profile's `stale` value) — not the full hour of its `expire` value, which only bounds how long a *completely idle* entry can sit before the next request forces a synchronous rebuild. Task 2 adds `revalidateTag(CODING_BOARD_TAG)` to the webhook in the same commit that adds the cache. Shipping the cache without it is a silent regression in the feature the webhook exists for. It also has no test coverage today of the kind this risk deserves — see Task 2's Step 11 below, added after this exact gap was flagged in review: the webhook's existing test file mocks only `@supabase/supabase-js`, has no `next/cache` mock, and the plan's own verification step for Task 2 did not run it.

The six `revalidatePath('/coding')` calls in `app/(app)/coding/actions.ts` become `updateTag(CODING_BOARD_TAG)`, following the rule Phase 4 established from the Next.js 16.2.12 source: `revalidatePath(path)` does not address a page, it expires the implicit soft tag `` `_N_T_${path}` `` (`NEXT_CACHE_IMPLICIT_TAG_ID`, `node_modules/next/dist/lib/constants.js:283`), and `shouldDiscardCacheEntry` (`node_modules/next/dist/server/use-cache/use-cache-wrapper.js:1529`) throws away *every* entry older than that tag's expiry while rendering the route, whatever its own `cacheTag` says. Keeping a path call beside a tag would make the tag decorative. `updateTag` rather than `revalidateTag` because a member who marks a problem complete must see it on the very next read — `updateTag` routes through the same `revalidate()` helper with an undefined profile and so still sets `pathWasRevalidated`, which is what clears the client router cache that `revalidatePath` used to clear.

`updateGithubUsername` keeps a revalidation call too (`updateTag(CODING_BOARD_TAG)`), even though the username it writes is read *outside* any cache scope. The call is not about the server cache there — it is the thing that clears the acting member's client router cache so the form redisplays with the value they just saved.

**The `/admin` design — Suspense only, deliberately no `'use cache'`.** `/admin` is converted so its shell paints, but its queries stay uncached. The reasoning, stated so a later reader does not "fix" it:

- The route has exactly one user. A cache's entire value is amortising a query across readers; with one reader and a `minutes` profile the hit rate is whatever that admin's own click cadence happens to be.
- Everything on the page is moderation state that the admin is actively mutating — approve, reject, kick, add fine, mark paid, cancel, delete. Ten mutating actions across `actions.ts` and `fine-actions.ts`, each of which would need an invalidation call, in exchange for the above.
- The cost of *not* caching is one Supabase round trip on an admin-only page, behind a `<Suspense>` boundary that lets the shell paint immediately. That is the correct trade.

So `/admin` gets a static `PageShell` and a single streamed `AdminContent`. One boundary rather than three, because the three section headings all carry live counts (`가입 대기 ({pendingList.length})`, `멤버 ({approvedList.length})`) — there is no meaningful static content to hoist above them, and three boundaries would mean three separate query round trips for a page one person opens.

**The `/` design.** `/` turned out to be *less* complex than `/checkin`, so it stays in this phase rather than being split into its own. It has no date navigation, no per-day key space and no immutable-history half; it reads exactly three groups of data for exactly one day and one month:

- **Today's check-in status** — approved members plus today's `checkin_posts.author_id` list, feeding `buildTodayStatus` and `hasPostedToday`. This is the same data `/checkin` shows, for the same KST day, so it is cached under **the same tag `/checkin` already uses**: `` cacheTag(checkinFeedTag(todayKst), 'member-names') ``. `checkinFeedTag(date)` is a small helper in `lib/checkin/time.ts` — the plan originally had both this scope and `revalidateCheckinDay()` in `app/(app)/checkin/actions.ts` building the string `` `checkin-feed-${date}` `` independently, which is exactly the kind of duplication a single typo could silently break; both sides now call the same function. That is the whole point of the choice — `revalidateCheckinDay()` already fires that tag on every post, comment, reaction and goal edit, so the dashboard's status table becomes correctly invalidated with **zero new plumbing**, and `revalidatePath('/')` in `createCheckinPost` can be deleted rather than replaced. It takes `cacheLife('seconds')` for the same reason `/checkin` does: today's board is a live accountability signal. It is split across two boundaries, `TodayAlert` and `StatusTable`, rather than one — see Minor-issue note in Task 4 on why, and why that costs nothing extra.
- **This month's fines** — `checkin_posts` and `manual_fines` for the month range, feeding `buildMonthlyFineTotals`. Tagged with the `FINES_TAG` constant (exported from `lib/checkin/fines.ts`, value `'fines'`), `cacheLife('minutes')`. Keyed by **month**, not by day (`kstMonthKey`, also in `lib/checkin/time.ts`): the query already reads the whole month, so keying by the exact day would mint — and miss — a fresh cache entry at every KST midnight for data that is otherwise identical all month.
- **The per-member coding widget** — shared week/problem data from `lib/coding/queries.ts`, plus a `coding_checks` read filtered by `session.userId`. That last read is per-caller and stays uncached, exactly as `getSessionProfile()` does on every converted feed.

`todayKst` is computed from `new Date()` **outside** every cache scope and passed in, the rule Phase 4 established: a `'use cache'` function that computed "today" itself would freeze that value at cache-fill time and serve it forever. Passing it also folds it into the key, so KST midnight rolls over correctly on its own. Each of the dashboard's four streamed boundaries computes it independently (through a shared one-line `todayKst()` helper local to the page, to avoid retyping it, not to unify it into one value) — unlike `/checkin`'s `resolveDayContext`, which two boundaries showing the *same* date-navigated feed must agree on exactly or the visible date heading and the shown posts would mismatch, nothing on the dashboard compares two boundaries' notion of "today" against each other, so a few milliseconds of possible disagreement at the exact instant of KST midnight is not user-visible. Task 4 states this reasoning inline rather than leaving the inconsistency with `/checkin`'s pattern unexamined.

**Tag hygiene.** Three tag families recur across files in this plan, and each is a named export rather than a repeated string literal, for the same reason `CODING_BOARD_TAG` is (see the `/coding` design above): `FINES_TAG` (`lib/checkin/fines.ts`), `checkinFeedTag(date)` (`lib/checkin/time.ts`), and `CODING_BOARD_TAG` (`lib/coding/queries.ts`). Every task below that touches one of these tags imports the constant or helper instead of typing the string.

**The Phase-5 tag migration (Task 5) — broader than just `revalidatePath('/')`.** Phase 4 deliberately kept `revalidatePath('/')` in `createCheckinPost` and recorded why: it is correct *precisely because* `/` is still fully dynamic. Once Task 4 moves the dashboard's queries into `'use cache'` scopes, that is no longer true, and the same `_N_T_` mechanism documented above applies to `_N_T_/`: a path call would expire the root route's implicit tag and discard every dashboard entry created before that instant — including the `` checkin-feed-${todayKst} `` entry that `/checkin` is also reading. It stops being a targeted refresh and becomes a second, blunter invalidation channel fighting the tags. Replacing the `revalidatePath('/')` sites is *one instance* of Task 5's actual job, which is broader: **every mutation that writes to a table a Phase-5 cache scope reads must fire that scope's tag.** Framing the task around "find the `revalidatePath('/')` calls" is how two such mutations were nearly missed in review, because neither of them calls `revalidatePath('/')` today:

- `setUserStatus` in `app/(app)/admin/actions.ts` (backing `approveUser`/`rejectUser`) writes `profiles.status`. That was safe to leave alone under Phase 4, because `/checkin`'s reader selects all profiles with no status filter. It stops being safe once Task 2's `getCodingMembers()` and Task 4's `getTodayCheckinStatus()`/`getMonthlyFines()` all filter on `status = 'approved'` — status becomes a cache-relevant input with nothing invalidating on it. `setUserStatus` gets an added `updateTag('member-names')` beside its existing `revalidatePath('/admin')`.
- `deleteCheckinPost` in `app/(app)/checkin/actions.ts` deletes a `checkin_posts` row that may carry a nonzero `fine_amount`. It has no `revalidatePath('/')` call today to migrate — it only fires the per-day checkin tag and the calendar tag — but once Task 4's `getMonthlyFines` exists, a deleted fine keeps counting toward the dashboard's totals until that scope's `minutes` window turns over. `deleteCheckinPost` gets an added `updateTag(FINES_TAG)`.

Eight call sites move or gain a tag in total:

| File | Function | Today | After |
| --- | --- | --- | --- |
| `app/(app)/checkin/actions.ts` | `createCheckinPost` (line 106) | `revalidatePath('/')` | *deleted* — the existing `revalidateCheckinDay(...)` below it already fires the tag the dashboard scope now shares — plus a new `updateTag(FINES_TAG)`, because this action writes `fine_amount` |
| `app/(app)/checkin/actions.ts` | `deleteCheckinPost` | *nothing* — no `revalidatePath('/')` exists here today, which is why this was nearly missed | add `updateTag(FINES_TAG)`, because this action deletes a row that may carry `fine_amount` |
| `app/(app)/admin/fine-actions.ts` | `setCheckinPostPaid`, `cancelCheckinFine`, `addManualFine`, `deleteManualFine`, `setManualFinePaid` (lines 35, 59, 107, 131, 162) | `revalidatePath('/')` | `updateTag(FINES_TAG)` |
| `app/(app)/admin/actions.ts` | `setUserStatus` (backing `approveUser`/`rejectUser`) | *nothing* — only `revalidatePath('/admin')`, which is why this was nearly missed | add `updateTag('member-names')` alongside the existing `revalidatePath('/admin')` |

The `revalidatePath('/admin')` calls stay untouched everywhere they appear: `/admin` has no `'use cache'` scope for a path call to over-invalidate, and it is still what clears the admin's client router cache after each mutation.

**Task 4 and Task 5 must land in the same work session, back to back.** Task 4's commit puts the dashboard's queries behind `'use cache'` while `revalidatePath('/')` is still live in the sites above (removed only in Task 5). Per the `_N_T_` mechanism this section documents, that interim state actively *over*-invalidates: every fine mutation and every check-in post committed between Task 4's commit and Task 5's commit discards every dashboard cache entry older than that instant — including the shared `` checkin-feed-${todayKst} `` entry `/checkin` itself reads, degrading `/checkin`'s already-shipped caching too, not just the new dashboard's. Task 4 and Task 5 are kept as two separate commits rather than merged into one — Task 4 is already the largest task in this plan (a full rewrite of `app/(app)/page.tsx`, three new cache scopes, a full test rewrite, and a `loading.tsx` deletion), and folding five more call-site edits across three more files into it would make one commit harder to review, not easier. The safety property that matters is enforced procedurally instead: **Task 4's commit must never be pushed, merged, or left standing alone.** Both tasks carry a prominent restatement of this at their start; see there for the exact requirement.

**The `unstable_instant` revisit (Task 6) — researched, and adopted for two of the three routes.** Phase 4 set `unstable_instant = false` on `/jobposts`, `/interviews` and `/checkin` with a note to revisit using `prefetch: 'runtime'` plus declared `samples`. That revisit was done in this session against real builds, and the answer differs per route.

The API shape is in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`. The prose documents only `prefetch: 'static'`; the `runtime` variant appears solely in the TypeScript block:

```ts
type RuntimeSample = {
  cookies?: Array<{ name: string; value: string }>
  headers?: Array<[string, string]>
  params?: Record<string, string | string[]>
  searchParams?: Record<string, string | string[]>
}
```

Two mechanics the docs do not mention, both learned from build failures here:

1. **The config must be a plain object literal.** A first attempt written as `prefetch: 'runtime' as const` with `headers: [...] as Array<[string, string]>` — casts added to satisfy `tsc` against the type above — made the build die during *page data collection*, before any prerender, with a message that names no file and no reason: `⨯ Invalid segment configuration export detected. This can cause unexpected behavior from the configs not being applied.` Removing both casts fixed it. Segment config exports are statically analysed, and a `TSAsExpression` defeats that analysis.
2. **Every search param the route reads must be declared, including the ones that are usually absent.** With `searchParams: {}` the build failed with a message that is its own documentation:

```
Error: Route "/jobposts" accessed searchParam "error" which is not defined in the `samples` of `unstable_instant`.
Add it to the sample's `searchParams` object, or `{ "error": null }` if it should be absent.
    at C (app\(app)\jobposts\page.tsx:114:18)
  digest: 'INSTANT_VALIDATION_ERROR'
```

The config below then built green on both `/jobposts` and `/interviews`, and — the part that makes it worth doing — both routes acquired a prefetch lifetime in the build output where they previously had none:

```
├ ◐ /interviews                      1m      1h
├ ◐ /jobposts                        1m      1h
```

`/checkin` is a different answer, and it is a *no*. Under `prefetch: 'runtime'` it fails three times over:

```
Error: Route "/checkin" used `new Date()` before accessing either uncached data (e.g. `fetch()`) or awaiting `connection()`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first.
    at I (app\(app)\checkin\page.tsx:62:37)
```

— `resolveDayContext` samples the clock to compute `todayKst`, which is inherent to the route. Inserting `await connection()` before that line does make the build pass, but the resulting table entry is the tell:

```
├ ◐ /checkin
```

No `Revalidate`, no `Expire`. `connection()` opts the render out of prefetch-time execution entirely, so the runtime prefetch has nothing to cache and the whole configuration buys exactly nothing — in exchange for a `connection()` call and a sample block to maintain. `/checkin` therefore **keeps `unstable_instant = false`**, and Task 6 replaces its comment with this evidence so the question is not reopened a third time.

`/coding`, `/admin` and `/` get **no** `unstable_instant` export at all. Validation only runs on routes that opt in, so adding `= false` to a route that never opted in is noise that reads like a suppressed failure. The two calendar pages that already carry `= false` (from Phase 1) keep it.

**Tech Stack:** Next.js 16.2.12 (App Router, Turbopack, Cache Components enabled), React 19, Supabase, Vitest + Testing Library.

---

## Before you start

- This plan continues on the same branch/worktree as Phases 1–4: `C:\kb27\edgeofemployment\EOESite\.claude\worktrees\instant-navigation-foundation`, branch `worktree-instant-navigation-foundation`. Confirm with `git rev-parse --abbrev-ref HEAD`. **Do not create a new worktree** and do not touch the main checkout at `C:\kb27\edgeofemployment\EOESite`.
- Confirm `git status --short` is clean before you start. If it is not, stop and find out why rather than committing someone else's work-in-progress.
- Confirm `.env.local` in this worktree contains a `SUPABASE_SERVICE_ROLE_KEY` line — **do not print its value**:

```bash
grep -c "^SUPABASE_SERVICE_ROLE_KEY=" .env.local
```

  Expected: `1`. Without it `npm run build` dies at `lib/supabase/cache-client.ts` with `Error: supabaseKey is required` while collecting page data, which looks nothing like the errors this plan is about.
- `npm run build` aborts the whole export on the first prerender error, so a green build is the only build that proves anything. A build that fails on route X tells you nothing about any route after X.

---

## File Structure

**Created:**

- `lib/coding/queries.ts` — the three cached Supabase accessors for coding-board data (`getCodingMembers`, `getCodingWeeks`, `getCodingWeekBoard`), shared by `/coding` and `/`. Created in Task 2, consumed by Task 4.
- `lib/coding/queries.test.ts` — tests for those accessors and their cache tags.

**Modified:**

- `app/login/page.tsx`, `app/signup/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/page.tsx` + their `page.test.tsx` — Task 1.
- `app/(app)/coding/page.tsx`, `app/(app)/coding/page.test.tsx`, `app/(app)/coding/actions.ts`, `app/api/github-webhook/route.ts`, `app/api/github-webhook/route.test.ts` — Task 2.
- `app/(app)/admin/page.tsx`, `app/(app)/admin/page.test.tsx` — Task 3.
- `app/(app)/page.tsx`, `app/(app)/page.test.tsx`, `lib/checkin/time.ts`, `lib/checkin/time.test.ts`, `lib/checkin/fines.ts`, `lib/checkin/fines.test.ts` — Task 4.
- `app/(app)/checkin/actions.ts`, `app/(app)/admin/fine-actions.ts`, `app/(app)/admin/actions.ts` — Task 5.
- `app/(app)/jobposts/page.tsx`, `app/(app)/interviews/page.tsx`, `app/(app)/checkin/page.tsx` — Task 6 (the `unstable_instant` export and its comment only).

**Deleted:**

- `app/(app)/coding/loading.tsx` — Task 2.
- `app/(app)/admin/loading.tsx` — Task 3.
- `app/(app)/loading.tsx` — Task 4.

---

## Task 1: Unblock the four auth pages

Four pages, one shape. Each is an `async` page whose first statement awaits `searchParams`, which makes the whole page uncached data outside `<Suspense>` and fails the build. Each becomes a plain (non-`async`) page component whose form renders in the static shell, with the search-param read moved into a small exported `async TopNotice` inside `<Suspense fallback={null}>` — the pattern `/jobposts`, `/interviews` and `/checkin` already use.

**Files:**
- Modify: `app/forgot-password/page.tsx`, `app/forgot-password/page.test.tsx`
- Modify: `app/login/page.tsx`, `app/login/page.test.tsx`
- Modify: `app/signup/page.tsx`, `app/signup/page.test.tsx`
- Modify: `app/reset-password/page.tsx`, `app/reset-password/page.test.tsx`

- [ ] **Step 1: Rewrite `app/forgot-password/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type ForgotPasswordSearchParams = { error?: string; sent?: string }

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ForgotPasswordSearchParams>
}) {
  return (
    <PageShell title="비밀번호 찾기" width="sm" top="auth">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Card as="form" action={requestPasswordReset} className="flex flex-col gap-4">
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Button type="submit" size="lg">
          재설정 링크 보내기
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        <Link href="/login" className="underline">
          로그인으로 돌아가기
        </Link>
      </p>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ForgotPasswordSearchParams>
}) {
  const { error, sent } = await searchParamsPromise

  return (
    <>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {sent && (
        <Alert variant="success" className="mb-4">
          입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.
        </Alert>
      )}
    </>
  )
}
```

- [ ] **Step 2: Rewrite `app/forgot-password/page.test.tsx`**

The existing tests `await` the page component, which no longer returns a promise, and assert on alerts that now live in `TopNotice`. Replace the entire file with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ForgotPasswordPage, { TopNotice } from './page'

describe('ForgotPasswordPage', () => {
  it('renders the email form in the static shell', () => {
    const ui = ForgotPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '재설정 링크 보내기' })).toBeInTheDocument()
  })

  it('links back to the login page from the static shell', () => {
    const ui = ForgotPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute('href', '/login')
  })
})

describe('ForgotPasswordPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '이메일을 입력해주세요' }) })
    render(ui)

    expect(screen.getByText('이메일을 입력해주세요')).toBeInTheDocument()
  })

  it('shows a confirmation message after the link is sent', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ sent: '1' }) })
    render(ui)

    expect(screen.getByText('입력하신 이메일로 비밀번호 재설정 링크를 보냈습니다.')).toBeInTheDocument()
  })

  it('renders nothing when there is neither an error nor a sent flag', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 3: Run the forgot-password tests**

```bash
npx vitest run app/forgot-password/page.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 4: Rewrite `app/login/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { logIn } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type LoginSearchParams = { error?: string }

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<LoginSearchParams>
}) {
  return (
    <PageShell title="로그인" width="sm" top="auth">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Card as="form" action={logIn} className="flex flex-col gap-4">
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required />
        <Link href="/forgot-password" className="self-end text-sm text-gray-500 underline dark:text-gray-400">
          비밀번호를 잊으셨나요?
        </Link>
        <Button type="submit" size="lg">
          로그인
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="underline">
          회원가입
        </Link>
      </p>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<LoginSearchParams>
}) {
  const { error } = await searchParamsPromise

  if (!error) return null

  return (
    <Alert variant="danger" className="mb-4">
      {error}
    </Alert>
  )
}
```

- [ ] **Step 5: Rewrite `app/login/page.test.tsx`**

Replace the entire file with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoginPage, { TopNotice } from './page'

describe('LoginPage', () => {
  it('renders the login form fields in the static shell', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  it('links to the signup page', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup')
  })

  it('links to the forgot-password page', () => {
    const ui = LoginPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '비밀번호를 잊으셨나요?' })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })
})

describe('LoginPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({
      searchParamsPromise: Promise.resolve({ error: '이메일 또는 비밀번호가 올바르지 않습니다' }),
    })
    render(ui)

    expect(screen.getByText('이메일 또는 비밀번호가 올바르지 않습니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 6: Run the login tests**

```bash
npx vitest run app/login/page.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 7: Rewrite `app/signup/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { signUp } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type SignupSearchParams = { error?: string }

export default function SignupPage({
  searchParams,
}: {
  searchParams: Promise<SignupSearchParams>
}) {
  return (
    <PageShell title="회원가입" width="sm" top="auth">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Card as="form" action={signUp} className="flex flex-col gap-4">
        <Label htmlFor="name" className="sr-only">
          이름
        </Label>
        <Input id="name" name="name" placeholder="이름" required />
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required minLength={6} />
        <Button type="submit" size="lg">
          가입하기
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<SignupSearchParams>
}) {
  const { error } = await searchParamsPromise

  if (!error) return null

  return (
    <Alert variant="danger" className="mb-4">
      {error}
    </Alert>
  )
}
```

- [ ] **Step 8: Rewrite `app/signup/page.test.tsx`**

Replace the entire file with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SignupPage, { TopNotice } from './page'

describe('SignupPage', () => {
  it('renders the signup form fields in the static shell', () => {
    const ui = SignupPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('이름')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '가입하기' })).toBeInTheDocument()
  })

  it('links to the login page', () => {
    const ui = SignupPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
  })
})

describe('SignupPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '이미 가입된 이메일입니다' }) })
    render(ui)

    expect(screen.getByText('이미 가입된 이메일입니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 9: Rewrite `app/reset-password/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import { updatePassword } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type ResetPasswordSearchParams = { error?: string }

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<ResetPasswordSearchParams>
}) {
  return (
    <PageShell title="새 비밀번호 설정" width="sm" top="auth">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Card as="form" action={updatePassword} className="flex flex-col gap-4">
        <Label htmlFor="password" className="sr-only">
          새 비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="새 비밀번호" required minLength={6} />
        <Button type="submit" size="lg">
          비밀번호 변경
        </Button>
      </Card>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<ResetPasswordSearchParams>
}) {
  const { error } = await searchParamsPromise

  if (!error) return null

  return (
    <Alert variant="danger" className="mb-4">
      {error}
    </Alert>
  )
}
```

- [ ] **Step 10: Rewrite `app/reset-password/page.test.tsx`**

Replace the entire file with:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResetPasswordPage, { TopNotice } from './page'

describe('ResetPasswordPage', () => {
  it('renders the new-password form in the static shell', () => {
    const ui = ResetPasswordPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByPlaceholderText('새 비밀번호')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeInTheDocument()
  })
})

describe('ResetPasswordPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '비밀번호가 너무 짧습니다' }) })
    render(ui)

    expect(screen.getByText('비밀번호가 너무 짧습니다')).toBeInTheDocument()
  })

  it('renders nothing when there is no error', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 11: Run all four auth page test files**

```bash
npx vitest run app/login/page.test.tsx app/signup/page.test.tsx app/forgot-password/page.test.tsx app/reset-password/page.test.tsx
```

Expected: PASS, 17 tests across 4 files (5 + 5 + 4 + 3).

- [ ] **Step 12: Run the build — this is the step where it goes green**

```bash
npm run build
```

Expected: exit `0`, `✓ Generating static pages using 7 workers (20/20)`, and a route table listing all 20 routes. No `Error: Route "…"` line anywhere. If a route you have not touched fails here, stop — that is a regression from an earlier phase, not something this task introduced.

- [ ] **Step 13: Commit**

```bash
git add app/login app/signup app/forgot-password app/reset-password
git commit -m "fix: stream auth page notices so every route prerenders"
```

---

## Task 2: Convert `/coding`

**Files:**
- Create: `lib/coding/queries.ts`
- Create: `lib/coding/queries.test.ts`
- Modify: `app/(app)/coding/page.tsx`
- Modify: `app/(app)/coding/page.test.tsx`
- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/api/github-webhook/route.ts`
- Modify: `app/api/github-webhook/route.test.ts`
- Delete: `app/(app)/coding/loading.tsx`

- [ ] **Step 1: Write the failing test for the shared cached accessors**

Create `lib/coding/queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', start_date: '2026-09-08', end_date: '2026-09-14' },
  { id: 'week-1', label: '1주차', start_date: '2026-09-01', end_date: '2026-09-07' },
]

const problems = [
  {
    id: 'problem-1',
    title: '투 포인터',
    link: 'https://example.com/1',
    created_by: 'admin-1',
    created_at: '2026-09-09T00:00:00.000Z',
    assignee_ids: ['user-1'],
  },
]

const checks = [
  { problem_id: 'problem-1', user_id: 'user-1', commit_sha: 'abc123', file_path: 'src/two.py', source: 'auto' },
]

const eqSpy = vi.fn()

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: profiles }) }) }
      }
      if (table === 'coding_weeks') {
        return { select: () => ({ order: () => ({ order: async () => ({ data: weeks }) }) }) }
      }
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: async (column: string, value: string) => {
              eqSpy(column, value)
              return { data: problems }
            },
          }),
        }
      }
      if (table === 'coding_checks') {
        return { select: () => ({ in: async () => ({ data: checks }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import { getCodingMembers, getCodingWeeks, getCodingWeekBoard, CODING_BOARD_TAG } from './queries'

beforeEach(() => {
  eqSpy.mockClear()
})

describe('getCodingMembers', () => {
  it('returns approved members and tags the shared coding-board cache', async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const result = await getCodingMembers()

    expect(result).toEqual([
      { id: 'admin-1', name: '관리자' },
      { id: 'user-1', name: '김민수' },
    ])
    expect(cacheTag).toHaveBeenCalledWith(CODING_BOARD_TAG, 'member-names')
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })
})

describe('getCodingWeeks', () => {
  it('returns weeks newest-first and tags the shared coding-board cache', async () => {
    const { cacheTag } = await import('next/cache')
    const result = await getCodingWeeks()

    expect(result).toEqual([
      { id: 'week-2', label: '2주차', startDate: '2026-09-08', endDate: '2026-09-14' },
      { id: 'week-1', label: '1주차', startDate: '2026-09-01', endDate: '2026-09-07' },
    ])
    expect(cacheTag).toHaveBeenCalledWith(CODING_BOARD_TAG)
  })
})

describe('getCodingWeekBoard', () => {
  it('queries problems for the given week and attaches their checks', async () => {
    const result = await getCodingWeekBoard('week-2')

    expect(eqSpy).toHaveBeenCalledWith('week_id', 'week-2')
    expect(result).toEqual([
      {
        id: 'problem-1',
        title: '투 포인터',
        link: 'https://example.com/1',
        createdBy: 'admin-1',
        createdAt: '2026-09-09T00:00:00.000Z',
        assigneeIds: ['user-1'],
        checks: [{ userId: 'user-1', commitSha: 'abc123', filePath: 'src/two.py', source: 'auto' }],
      },
    ])
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

```bash
npx vitest run lib/coding/queries.test.ts
```

Expected: FAIL — `Failed to resolve import "./queries"`.

- [ ] **Step 3: Create `lib/coding/queries.ts`**

```ts
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import type { CodingProblem, CodingWeek, Member } from './types'

/**
 * The single source of truth for the coding-board cache tag. Exported rather than left as a
 * bare string because it recurs in this file, in app/(app)/coding/actions.ts (six times) and in
 * app/api/github-webhook/route.ts — a typo in any one of those would silently disable
 * invalidation with no build error and no test failure. Every call site imports this constant.
 */
export const CODING_BOARD_TAG = 'coding-board'

/**
 * Cached coding-board reads, shared by /coding and the dashboard widget on /.
 * They live here rather than in app/(app)/coding/page.tsx precisely so both routes
 * read the same rows through the same cache scopes under one `CODING_BOARD_TAG` tag —
 * two copies would mean two caches with two invalidation stories for one dataset.
 *
 * RLS check (supabase/migrations/0003_coding.sql:18,42,54 and 0013_coding_weeks.sql:18):
 * profiles, coding_problems, coding_checks and coding_weeks all grant SELECT to any
 * approved member with no per-row ownership clause, so the cookie-free cache client
 * is safe here. Every route reaching these functions is already gated by proxy.ts.
 *
 * Invalidation is `updateTag(CODING_BOARD_TAG)` from app/(app)/coding/actions.ts and
 * `revalidateTag(CODING_BOARD_TAG)` from app/api/github-webhook/route.ts. The webhook one is
 * not optional: it upserts coding_checks, and without it an auto-detected completion would sit
 * invisible until the `minutes` profile's `revalidate` window turns over — up to about a minute
 * server-side plus up to five more minutes for a client on a warm router cache (`stale`), not
 * the full hour of `expire`, which only bounds a completely idle entry.
 */
export async function getCodingMembers(): Promise<Member[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG, 'member-names')
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { data } = await supabase.from('profiles').select('id, name').eq('status', 'approved')

  return (data ?? []).map((p) => ({ id: p.id, name: p.name as string }))
}

export async function getCodingWeeks(): Promise<CodingWeek[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { data } = await supabase
    .from('coding_weeks')
    .select('id, label, start_date, end_date')
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false })

  return (data ?? []).map((w) => ({
    id: w.id,
    label: w.label,
    startDate: w.start_date,
    endDate: w.end_date,
  }))
}

/**
 * `weekId` joins the cache key, so it must never be a raw `?week=` value. Callers
 * resolve it through `resolveCurrentWeek(weeks, requestedWeekId)` (lib/coding/week.ts),
 * which falls back to `weeks[0]` for an unknown id — so only ids that came out of the
 * database reach this function and the key space is bounded by the number of weeks.
 */
export async function getCodingWeekBoard(weekId: string): Promise<CodingProblem[]> {
  'use cache'
  cacheTag(CODING_BOARD_TAG)
  cacheLife('minutes')

  const supabase = createCacheClient()

  const { data: problemsData } = await supabase
    .from('coding_problems')
    .select('id, title, link, created_by, created_at, assignee_ids')
    .eq('week_id', weekId)

  const problemIds = (problemsData ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path, source')
      .in('problem_id', problemIds)
  )

  return (problemsData ?? []).map((problem) => ({
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
        source: c.source as 'auto' | 'manual',
      })),
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run lib/coding/queries.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Rewrite `app/(app)/coding/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { getCodingMembers, getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
import { resolveCurrentWeek, formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/skeleton'

type CodingSearchParams = { error?: string; success?: string; week?: string }

export default function CodingPage({
  searchParams,
}: {
  searchParams: Promise<CodingSearchParams>
}) {
  return (
    <PageShell title="코테 스터디">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<GithubSettingsSkeleton />}>
        <GithubSettings />
      </Suspense>
      <Suspense fallback={<BoardSkeleton />}>
        <BoardContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CodingSearchParams>
}) {
  const { error: queryError, success } = await searchParamsPromise

  return (
    <>
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
    </>
  )
}

function GithubSettingsSkeleton() {
  return <Skeleton className="mb-6 h-12 w-full" />
}

function BoardSkeleton() {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-6 w-48 self-center" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * The caller's own GitHub username is per-caller data, so it can never live inside a
 * `'use cache'` scope. It gets its own boundary rather than riding along with the board
 * so a slow profile read cannot hold up the week's problems, or the reverse.
 */
export async function GithubSettings() {
  const session = await getSessionProfile()
  const supabase = await createClient()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('github_username')
    .eq('id', session!.userId)
    .single()

  return <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
}

export async function BoardContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CodingSearchParams>
}) {
  const { week: requestedWeekId } = await searchParamsPromise

  const [session, weeks, members] = await Promise.all([
    getSessionProfile(),
    getCodingWeeks(),
    getCodingMembers(),
  ])

  const isAdmin = session?.role === 'admin'
  const { current: currentWeek, prevId, nextId } = resolveCurrentWeek(weeks, requestedWeekId)
  const codingProblems = currentWeek ? await getCodingWeekBoard(currentWeek.id) : []

  return (
    <>
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
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={session!.userId}
                />
              ))}
              {codingProblems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
            </div>
          </>
        ) : (
          <EmptyState message="아직 등록된 문제가 없습니다." />
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 6: Delete `app/(app)/coding/loading.tsx`**

```bash
git rm "app/(app)/coding/loading.tsx"
```

The route keeps building clean after this — the group-level `app/(app)/loading.tsx` still covers it until Task 4, and by then `/coding` has real `<Suspense>` boundaries of its own. The file must go, or its implicit boundary keeps covering the static shell with a full-page skeleton on every navigation and the boundaries added in Step 5 are never seen.

- [ ] **Step 7: Rewrite `app/(app)/coding/page.test.tsx`**

The existing file mocks `@/lib/supabase/server` and awaits `CodingPage(...)`. Both assumptions are gone: the board reads go through the mocked-at-module-level `@/lib/coding/queries`, and the page is synchronous. Replace the entire file with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/coding',
  useRouter: () => ({ replace: vi.fn() }),
}))

const members = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const weeks = [
  { id: 'week-2', label: '2주차', startDate: '2026-09-08', endDate: '2026-09-14' },
  { id: 'week-1', label: '1주차', startDate: '2026-09-01', endDate: '2026-09-07' },
]

const week2Problems = [
  {
    id: 'problem-2',
    title: '이분 탐색',
    link: 'https://example.com/2',
    createdBy: 'admin-1',
    createdAt: '2026-09-09T00:00:00.000Z',
    assigneeIds: [],
    checks: [],
  },
]

const week1Problems = [
  {
    id: 'problem-1',
    title: '투 포인터',
    link: 'https://example.com/1',
    createdBy: 'admin-1',
    createdAt: '2026-09-02T00:00:00.000Z',
    assigneeIds: [],
    checks: [],
  },
]

const getCodingWeekBoard = vi.fn(async (weekId: string) =>
  weekId === 'week-2' ? week2Problems : week1Problems
)

vi.mock('@/lib/coding/queries', () => ({
  getCodingMembers: vi.fn(async () => members),
  getCodingWeeks: vi.fn(async () => weeks),
  getCodingWeekBoard: (weekId: string) => getCodingWeekBoard(weekId),
}))

const sessionProfile = { userId: 'user-1', role: 'member', status: 'approved' }

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => sessionProfile),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { github_username: 'mkim' } }) }),
      }),
    }),
  })),
}))

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  updateGithubUsername: vi.fn(),
  deleteProblem: vi.fn(),
  adminRemoveCheck: vi.fn(),
  markSelfComplete: vi.fn(),
  unmarkSelfComplete: vi.fn(),
}))

import CodingPage, { TopNotice, GithubSettings, BoardContent } from './page'

beforeEach(() => {
  getCodingWeekBoard.mockClear()
  sessionProfile.role = 'member'
})

describe('CodingPage', () => {
  it('renders the static shell title without awaiting any data', () => {
    const ui = CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '코테 스터디' })).toBeInTheDocument()
  })
})

describe('CodingPage TopNotice', () => {
  it('shows an error message when present in search params', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({ error: '문제를 등록하지 못했어요' }) })
    render(ui)

    expect(screen.getByText('문제를 등록하지 못했어요')).toBeInTheDocument()
  })
})

describe('CodingPage GithubSettings', () => {
  it("pre-fills the form with the caller's registered username", async () => {
    const ui = await GithubSettings()
    render(ui)

    expect(screen.getByPlaceholderText('GitHub 아이디')).toHaveValue('mkim')
  })
})

describe('CodingPage BoardContent', () => {
  it('renders the newest week by default and queries its problems', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-2')
    expect(screen.getByText('이분 탐색')).toBeInTheDocument()
  })

  it('renders the requested week when ?week= matches an existing week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-1')
    expect(screen.getByText('투 포인터')).toBeInTheDocument()
  })

  it('falls back to the newest week when ?week= does not match any week, so no unknown id reaches the cache key', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'unknown-id' }) })
    render(ui)

    expect(getCodingWeekBoard).toHaveBeenCalledWith('week-2')
    expect(getCodingWeekBoard).not.toHaveBeenCalledWith('unknown-id')
  })

  it('shows only a previous-week link on the newest week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/coding?week=week-1')
    expect(screen.queryByRole('link', { name: '다음 주차 →' })).not.toBeInTheDocument()
  })

  it('shows only a next-week link on the oldest week', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({ week: 'week-1' }) })
    render(ui)

    expect(screen.getByRole('link', { name: '다음 주차 →' })).toHaveAttribute('href', '/coding?week=week-2')
    expect(screen.queryByRole('link', { name: '← 이전 주차' })).not.toBeInTheDocument()
  })

  it('does not show the problem registration form for non-admins', async () => {
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.queryByRole('button', { name: '등록' })).not.toBeInTheDocument()
  })

  it('shows the problem registration form for admins', async () => {
    sessionProfile.role = 'admin'
    const ui = await BoardContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run the coding page tests**

```bash
npx vitest run "app/(app)/coding/page.test.tsx"
```

Expected: PASS, 10 tests. If the admin assertion in the last test fails on the button label, open `app/(app)/coding/problem-form.tsx` and use the submit button's actual accessible name.

- [ ] **Step 9: Retag `app/(app)/coding/actions.ts`**

Change the import on line 4 from:

```ts
import { revalidatePath } from 'next/cache'
```

to:

```ts
import { updateTag } from 'next/cache'
```

and add an import for the shared tag constant:

```ts
import { CODING_BOARD_TAG } from '@/lib/coding/queries'
```

Then replace **all six** occurrences of `revalidatePath('/coding')` (at lines 100, 130, 154, 181, 210, 229) with `updateTag(CODING_BOARD_TAG)`, and add this comment directly above the first one, inside `createProblems`:

```ts
  // `updateTag`, not `revalidateTag`, and not `revalidatePath('/coding')`. The board's rows
  // now live in `'use cache'` scopes in lib/coding/queries.ts tagged `CODING_BOARD_TAG`, and an
  // admin or member who just mutated the board must see their own write on the very next
  // read. A path call would expire the route's implicit soft tag `_N_T_/coding`, which makes
  // the `use cache` reader discard every entry older than that instant while rendering this
  // route (shouldDiscardCacheEntry, next/dist/server/use-cache/use-cache-wrapper.js) — so
  // keeping it beside the tag would make the tag decorative. `updateTag` still clears the
  // client router cache on its own: it routes through the same `revalidate()` helper with an
  // undefined profile, which sets `pathWasRevalidated`.
  updateTag(CODING_BOARD_TAG)
```

Verify no call site was missed:

```bash
grep -n "revalidatePath\|updateTag" "app/(app)/coding/actions.ts"
```

Expected: one `import { updateTag }` line, one `import { CODING_BOARD_TAG }` line, and six `updateTag(CODING_BOARD_TAG)` lines. No `revalidatePath`.

- [ ] **Step 10: Add cache invalidation to the GitHub webhook**

In `app/api/github-webhook/route.ts`, add to the imports at the top of the file:

```ts
import { revalidateTag } from 'next/cache'
import { CODING_BOARD_TAG } from '@/lib/coding/queries'
```

Then change the final return of the handler from:

```ts
  return NextResponse.json({ ok: true, memberId: member.id, checkedProblemIds })
```

to:

```ts
  // Required, not cosmetic: this handler upserts coding_checks, and /coding plus the
  // dashboard widget now read those rows from `'use cache'` scopes tagged `CODING_BOARD_TAG`.
  // Without this, an auto-detected completion would stay invisible until that scope's
  // `minutes` profile's `revalidate` window turns over — up to about a minute server-side plus
  // up to five more minutes for a client sitting on a warm router cache (`stale`), not the full
  // hour of `expire`, which only bounds a completely idle entry. `revalidateTag`, not
  // `updateTag`: there is no acting user session to give read-your-own-writes to — GitHub is
  // the caller — so stale-while-revalidate is right.
  if (checkedProblemIds.length > 0) {
    revalidateTag(CODING_BOARD_TAG)
  }

  return NextResponse.json({ ok: true, memberId: member.id, checkedProblemIds })
```

- [ ] **Step 11: Add `next/cache` coverage to the webhook's existing test file**

`app/api/github-webhook/route.test.ts` already exists and mocks only `@supabase/supabase-js` — there is no `next/cache` mock. Under vitest, calling the real `revalidateTag` outside a Next.js request/work-store context throws, so Step 10's change breaks this file's passing tests the moment `checkedProblemIds.length > 0`, and nothing catches it until a much later full-suite run. This is "the single most dangerous finding for Task 2" per the Architecture section; it gets test coverage to match.

Add this mock near the top of `app/api/github-webhook/route.test.ts`, alongside the existing `@supabase/supabase-js` mock (same convention `lib/coding/queries.test.ts` and `app/(app)/page.test.tsx` use):

```ts
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}))
```

Add the import next to the existing `POST` import:

```ts
import { revalidateTag } from 'next/cache'
import { CODING_BOARD_TAG } from '@/lib/coding/queries'
```

Then add two assertions to the existing `'auto-checks a problem and stores the commit sha and file path that matched'` test — append after its existing `expect(json.checkedProblemIds).toEqual(['problem-1'])`:

```ts
    expect(revalidateTag).toHaveBeenCalledWith(CODING_BOARD_TAG)
```

And add a new test in the same `describe` block, next to the existing `'skips when no member is registered with the pusher login'` test, so the "nothing matched" path is covered as a negative assertion and cannot silently regress into calling `revalidateTag` on every request regardless of outcome:

```ts
  it('does not revalidate when no problem in the push matches a tracked problem', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: { id: 'user-1' } }) }) }),
        }
      }
      if (table === 'coding_problems') {
        return {
          select: () =>
            Promise.resolve({
              data: [{ id: 'problem-1', title: '두 수의 합', match_keyword: null }],
            }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [{ id: 'sha-1', added: ['kimminsu/unrelated-file.txt'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(json.checkedProblemIds).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
```

Also add a negative assertion to the existing `'rejects a request with an invalid signature'` and `'skips non-push events'` tests, so the no-op paths stay pinned too — append to each:

```ts
    expect(revalidateTag).not.toHaveBeenCalled()
```

- [ ] **Step 12: Run the coding action and webhook tests**

```bash
npx vitest run "app/(app)/coding/actions.test.ts" lib/coding "app/api/github-webhook/route.test.ts"
```

Expected: PASS. If `actions.test.ts` asserts on `revalidatePath` calls, update those assertions to expect `updateTag` with `CODING_BOARD_TAG` — the behaviour under test is "the board is invalidated after the mutation", and the mechanism changed.

- [ ] **Step 13: Run the full suite and the build**

```bash
npm test
npm run build
```

Expected: suite PASS; build exit `0` with no `Error: Route` lines.

- [ ] **Step 13a: Prove `/coding`'s Suspense split is real, not just build-tolerated**

The build in Step 13 only proves `/coding` builds — it says nothing about whether Step 5's `<Suspense>` boundaries actually do anything, because `/coding`'s own `loading.tsx` is gone (Step 6) but the **group-level** `app/(app)/loading.tsx` still exists (it is not deleted until Task 4) and, per Finding B, a group `loading.tsx` alone is sufficient to make `/coding` build clean regardless of whether its own boundaries are correct. `/admin` at this point is still fully dynamic and has no boundary of its own yet, and `/` (the dashboard) is still fully dynamic with no boundary of its own — either would fail first and mask whatever `/coding` does, if the group file were simply deleted here. So this check temporarily neutralizes `/` the same way Finding A neutralized `/login` and `/forgot-password` to isolate a single route, then removes the group file, proving `/coding` alone:

```bash
cp "app/(app)/page.tsx" "app/(app)/page.tsx.bak"
cat > "app/(app)/page.tsx" <<'EOF'
export default function DashboardPage() {
  return <div>stub</div>
}
EOF
mv "app/(app)/loading.tsx" "app/(app)/loading.tsx.bak"
npm run build
```

Expected: exit `0`, no `Error: Route` line anywhere. `/admin` stays safe without any stubbing because `app/(app)/admin/loading.tsx` is still in place (Task 3 deletes it, not this task) — only `/` needed neutralizing. If you see `Error: Route "/coding"`, the boundaries added in Step 5 do not actually cover the route's data access and must be fixed before moving on; do not proceed to Step 14 with this failing.

Then restore both files exactly and confirm nothing is left behind:

```bash
mv "app/(app)/loading.tsx.bak" "app/(app)/loading.tsx"
mv "app/(app)/page.tsx.bak" "app/(app)/page.tsx"
git status --short | grep -E "app/\(app\)/page\.tsx$|app/\(app\)/loading\.tsx$|\.bak$"
```

Expected: no output. Steps 1–13's own changes (`lib/coding/`, `app/(app)/coding/`, the webhook files) are still uncommitted at this point and will still show in a plain `git status --short` — that is expected, Step 14 commits them. This check only confirms the two files this step touched came back exactly as they were and no `.bak` file survived.

- [ ] **Step 14: Commit**

```bash
git add lib/coding "app/(app)/coding" app/api/github-webhook/route.ts app/api/github-webhook/route.test.ts
git commit -m "feat: stream and cache the coding board behind a shared query module"
```

---

## Task 3: Convert `/admin`

Suspense split only — no `'use cache'`, for the reasons in the Architecture section. The page body is moved verbatim into one exported `AdminContent`; `PageShell` and its title stay behind as the static shell.

**Files:**
- Modify: `app/(app)/admin/page.tsx`
- Modify: `app/(app)/admin/page.test.tsx`
- Delete: `app/(app)/admin/loading.tsx`

- [ ] **Step 1: Rewrite the top and bottom of `app/(app)/admin/page.tsx`**

Keep every import and the `formatFineDate` helper exactly as they are, and add `Suspense` and `Skeleton`. The first three lines of the file become:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
```

and add to the existing import block:

```tsx
import { Skeleton } from '@/components/skeleton'
```

Then change the page component's signature line from:

```tsx
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ showPaid?: string }>
}) {
  const { showPaid: showPaidParam } = await searchParams
```

to the following — a synchronous page plus the skeleton, with `AdminContent` picking up the original body:

```tsx
type AdminSearchParams = { showPaid?: string }

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>
}) {
  return (
    <PageShell title="관리자 페이지">
      <Suspense fallback={<AdminSkeleton />}>
        <AdminContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

function AdminSkeleton() {
  return (
    <>
      <section className="mb-10">
        <Skeleton className="mb-4 h-6 w-28" />
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="mb-4 h-6 w-20" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    </>
  )
}

/**
 * Deliberately uncached. /admin has exactly one reader, and every row on it is moderation
 * state that same reader is actively mutating through ten server actions — a `'use cache'`
 * scope here would add ten invalidation sites in exchange for a cache whose hit rate is one
 * admin's click cadence. One boundary rather than three because all three section headings
 * carry live counts, so there is nothing static to hoist above them.
 */
export async function AdminContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<AdminSearchParams>
}) {
  const { showPaid: showPaidParam } = await searchParamsPromise
```

Everything from `const showPaid = showPaidParam === '1'` down to the line before `return (` stays **byte-for-byte unchanged**.

- [ ] **Step 2: Unwrap the `PageShell` in the returned JSX**

The original `AdminContent` body ends with `return (<PageShell title="관리자 페이지"> … </PageShell>)`. `PageShell` now lives in the static shell, so change the opening of that return from:

```tsx
  return (
    <PageShell title="관리자 페이지">
      <section className="mb-10">
```

to:

```tsx
  return (
    <>
      <section className="mb-10">
```

and the close, at the very end of the component, from:

```tsx
      </section>
    </PageShell>
  )
}
```

to:

```tsx
      </section>
    </>
  )
}
```

The three `<section>` blocks between them — pending signups, members, and the fine-management section — are unchanged.

- [ ] **Step 3: Delete `app/(app)/admin/loading.tsx`**

```bash
git rm "app/(app)/admin/loading.tsx"
```

- [ ] **Step 4: Update `app/(app)/admin/page.test.tsx`**

Change the import line (currently line 95) from:

```tsx
import AdminPage from './page'
```

to:

```tsx
import AdminPage, { AdminContent } from './page'
```

Replace every occurrence of `await AdminPage({ searchParams: Promise.resolve(X) })` with `await AdminContent({ searchParamsPromise: Promise.resolve(X) })` — there are six, at lines 99, 114, 127, 138, 146 and 154, with `X` being `{}` for the first five and `{ showPaid: '1' }` for the last. Then add this test at the top of the outer `describe('AdminPage', …)` block:

```tsx
  it('renders the static shell title without awaiting any data', () => {
    const ui = AdminPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '관리자 페이지' })).toBeInTheDocument()
  })
```

- [ ] **Step 5: Run the admin tests**

```bash
npx vitest run "app/(app)/admin/page.test.tsx"
```

Expected: PASS, one more test than before.

- [ ] **Step 6: Run the full suite and the build**

```bash
npm test
npm run build
```

Expected: suite PASS; build exit `0` with no `Error: Route` lines. `/admin` is still shielded by the group-level `app/(app)/loading.tsx` at this point, so this build alone proves nothing about whether Steps 1–2's Suspense split actually works — Step 6a proves that directly, before Task 4 removes the group file for good.

- [ ] **Step 6a: Prove `/admin`'s Suspense split is real, not just build-tolerated**

Same reasoning as Task 2's Step 13a, now for `/admin`. `app/(app)/admin/loading.tsx` is already gone (Step 3), but the group-level `app/(app)/loading.tsx` still covers `/admin` on its own, so today's green build says nothing about whether `AdminContent`'s boundary in Steps 1–2 is correct. `/coding` is safe to leave alone here — Task 2 already gave it real boundaries and deleted its own `loading.tsx`. `/` (the dashboard) is still fully dynamic with no boundary of its own until Task 4, so it still needs the same temporary stub Task 2 used to isolate the route under test:

```bash
cp "app/(app)/page.tsx" "app/(app)/page.tsx.bak"
cat > "app/(app)/page.tsx" <<'EOF'
export default function DashboardPage() {
  return <div>stub</div>
}
EOF
mv "app/(app)/loading.tsx" "app/(app)/loading.tsx.bak"
npm run build
```

Expected: exit `0`, no `Error: Route` line anywhere — in particular no `Error: Route "/admin"`. If that error appears, `AdminContent`'s boundary does not actually cover the page's data access and must be fixed before moving on; do not proceed to Step 7 with this failing.

Then restore both files exactly and confirm nothing is left behind:

```bash
mv "app/(app)/loading.tsx.bak" "app/(app)/loading.tsx"
mv "app/(app)/page.tsx.bak" "app/(app)/page.tsx"
git status --short | grep -E "app/\(app\)/page\.tsx$|app/\(app\)/loading\.tsx$|\.bak$"
```

Expected: no output. Steps 1–5's own changes under `app/(app)/admin/` are still uncommitted at this point and will still show in a plain `git status --short` — that is expected, Step 7 commits them. This check only confirms the two files this step touched came back exactly as they were and no `.bak` file survived.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/admin"
git commit -m "feat: stream the admin page behind a static shell"
```

---

## Task 4: Convert `/` (the dashboard)

**This task's commit must not be pushed, merged, or left standing alone — Task 5 must land in the same work session immediately after it, before anything else.** This task's commit moves the dashboard's queries into `'use cache'` scopes while `revalidatePath('/')` is still live at several call sites (removed only in Task 5). Per the Architecture section's analysis of how `revalidatePath` soft-tags work, that interim state actively *over*-invalidates: every fine mutation and every check-in post committed between this task's commit and Task 5's commit discards every dashboard cache entry older than that instant — including the shared `` checkin-feed-${todayKst} `` entry that `/checkin` itself reads, degrading `/checkin`'s already-shipped, already-reviewed caching, not just this task's new dashboard. Task 4 and Task 5 are kept as separate commits rather than merged into one anyway, because Task 4 is already the largest task in this plan; see the Architecture section's "Task 4 and Task 5 must land in the same work session" note for the full reasoning. If a session is going to end between these two tasks for any reason, stop before committing Task 4 rather than after.

**Files:**
- Modify: `app/(app)/page.tsx`
- Modify: `app/(app)/page.test.tsx`
- Modify: `lib/checkin/time.ts` (adds `checkinFeedTag` and `kstMonthKey`)
- Modify: `lib/checkin/fines.ts` (adds `FINES_TAG`)
- Delete: `app/(app)/loading.tsx`

- [ ] **Step 1: Add the shared tag/key helpers this task needs**

`lib/checkin/time.ts` gets two additions. Add `checkinFeedTag`, exported alongside the existing date helpers — it is the single place the string `` `checkin-feed-${date}` `` is built, replacing the copy that currently lives inline in `app/(app)/checkin/actions.ts`'s `revalidateCheckinDay` and the copy this task would otherwise add inline in the dashboard reader:

```ts
export function checkinFeedTag(kstDate: string): string {
  return `checkin-feed-${kstDate}`
}
```

And `kstMonthKey`, used to key the dashboard's monthly-fines cache scope by month rather than by day (see Step 2's `getMonthlyFines`):

```ts
export function kstMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}
```

`kstMonthRangeUtc` already only reads the first two `-`-separated segments of whatever string it is given, so passing it a `"YYYY-MM"` key instead of a full `"YYYY-MM-DD"` date changes nothing about its behavior.

`lib/checkin/fines.ts` gets one addition, alongside its existing `buildMonthlyFineTotals` and `groupFinesByMonth`:

```ts
export const FINES_TAG = 'fines'
```

This is the single source of truth for the fines cache tag. It recurs in this task's `getMonthlyFines`, in `createCheckinPost` and `deleteCheckinPost` (`app/(app)/checkin/actions.ts`, Task 5) and in all five of `app/(app)/admin/fine-actions.ts`'s mutations (Task 5) — a typo in any one of those would silently disable invalidation with no build error and no test failure, so every call site imports this constant instead of retyping the string.

Add tests for both new `time.ts` exports to `lib/checkin/time.test.ts`, matching the file's existing plain `describe`/`it` style:

```ts
describe('checkinFeedTag', () => {
  it('builds the per-day checkin-feed tag from a KST date string', () => {
    expect(checkinFeedTag('2026-09-13')).toBe('checkin-feed-2026-09-13')
  })
})

describe('kstMonthKey', () => {
  it('collapses a full date to its year-month', () => {
    expect(kstMonthKey('2026-09-13')).toBe('2026-09')
  })

  it('is idempotent on a value that is already a month key', () => {
    expect(kstMonthKey('2026-09')).toBe('2026-09')
  })
})
```

adding `checkinFeedTag` and `kstMonthKey` to that file's existing import line. And to `lib/checkin/fines.test.ts`:

```ts
describe('FINES_TAG', () => {
  it('is the string every fines-scope mutation must tag and invalidate with', () => {
    expect(FINES_TAG).toBe('fines')
  })
})
```

adding `FINES_TAG` to that file's existing import line. Run both:

```bash
npx vitest run lib/checkin/time.test.ts lib/checkin/fines.test.ts
```

Expected: PASS.

- [ ] **Step 2: Rewrite `app/(app)/page.tsx`**

Replace the entire file with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, hasPostedToday, type MemberSummary } from '@/lib/checkin/status'
import { buildMonthlyFineTotals, FINES_TAG } from '@/lib/checkin/fines'
import { getKstDateString, kstDayRangeUtc, kstMonthRangeUtc, kstMonthKey, checkinFeedTag } from '@/lib/checkin/time'
import { buildCodingDashboardWidget, findWeekForDate } from '@/lib/coding/dashboard-widget'
import { getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/skeleton'

const CODING_WIDGET_LIMIT = 2

/**
 * The dashboard's four streamed boundaries (`TodayAlert`, `CodingWidget`, `StatusTable`,
 * `FineTables`) each need "today" in KST, but — unlike /checkin's `resolveDayContext`, which
 * `DayHeader` and `FeedContent` must agree on exactly or the visible date heading and the shown
 * posts would mismatch — nothing here compares two boundaries' notion of "today" against each
 * other: one boundary uses it for a per-day tag, one for a week lookup, one for a month key. A
 * few milliseconds of possible disagreement at the exact instant of KST midnight is not
 * user-visible in any of those. This helper exists only so the four call sites don't each retype
 * `getKstDateString(new Date().toISOString())`; each still calls it independently, at its own
 * render time, exactly as before.
 */
function todayKst(): string {
  return getKstDateString(new Date().toISOString())
}

interface MonthFine {
  authorId: string
  fineAmount: number
  paid: boolean
}

/**
 * Today's check-in status, cached under the SAME tag /checkin already uses for the same
 * KST day: `checkinFeedTag(date)`. That is the whole point of the choice: `revalidateCheckinDay()`
 * in app/(app)/checkin/actions.ts already fires that same helper's tag on every post, comment,
 * reaction and goal edit, so this scope is correctly invalidated with no new plumbing — and
 * `revalidatePath('/')` can be deleted in Task 5 rather than replaced.
 *
 * `todayKstDate` is computed from `new Date()` OUTSIDE this scope and passed in. A `'use cache'`
 * function that computed "today" itself would freeze that value at cache-fill time and serve
 * it forever; passing it also folds it into the key, so KST midnight rolls over on its own.
 *
 * `cacheLife('seconds')` matches /checkin's treatment of today: stale 30s / revalidate 1s /
 * expire 60s. The honest guarantee is the one Phase 4 documented — instant for the member
 * who acts (updateTag clears their client cache), about a second plus one request for
 * another member who navigates.
 *
 * RLS: checkin_posts grants SELECT to any approved member with no ownership clause
 * (supabase/migrations/0009_checkin_desk_goal.sql), as does profiles, so the cookie-free
 * cache client is safe here.
 */
async function getTodayCheckinStatus(
  todayKstDate: string
): Promise<{ members: MemberSummary[]; todaysAuthorIds: string[] }> {
  'use cache'
  cacheTag(checkinFeedTag(todayKstDate), 'member-names')
  cacheLife('seconds')

  const supabase = createCacheClient()
  const { start, end } = kstDayRangeUtc(todayKstDate)

  const [{ data: members }, { data: todaysPosts }] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id').gte('created_at', start).lt('created_at', end),
  ])

  return {
    members: (members ?? []).map((m) => ({ id: m.id, name: m.name as string })),
    todaysAuthorIds: (todaysPosts ?? []).map((p) => p.author_id as string),
  }
}

/**
 * This month's fines, late and manual together. Tagged `FINES_TAG`, which Task 5 wires to the
 * five admin fine actions, to `createCheckinPost` (which writes `fine_amount`), and to
 * `deleteCheckinPost` (which can delete a row that was carrying a nonzero `fine_amount`).
 *
 * Keyed by MONTH, not by day: this query already reads the whole month, so keying the cache by
 * the exact day would mint a fresh entry — and guarantee a miss — at every KST midnight, for
 * data that is otherwise identical all month. `kstMonthKey` collapses any date in a month to the
 * same `"YYYY-MM"` key, and `kstMonthRangeUtc` accepts that key exactly as it accepts a full date.
 *
 * RLS: manual_fines grants SELECT to any approved member (0011_manual_fines.sql:15).
 */
async function getMonthlyFines(
  monthKey: string
): Promise<{ members: MemberSummary[]; fines: MonthFine[] }> {
  'use cache'
  cacheTag(FINES_TAG, 'member-names')
  cacheLife('minutes')

  const supabase = createCacheClient()
  const { start, end } = kstMonthRangeUtc(monthKey)

  const [{ data: members }, { data: monthPosts }, { data: monthManualFines }] = await Promise.all([
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('checkin_posts')
      .select('author_id, fine_amount, paid')
      .gte('created_at', start)
      .lt('created_at', end),
    supabase
      .from('manual_fines')
      .select('user_id, amount, paid')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  return {
    members: (members ?? []).map((m) => ({ id: m.id, name: m.name as string })),
    fines: [
      ...(monthPosts ?? []).map((p) => ({
        authorId: p.author_id as string,
        fineAmount: p.fine_amount as number,
        paid: p.paid as boolean,
      })),
      ...(monthManualFines ?? []).map((f) => ({
        authorId: f.user_id as string,
        fineAmount: f.amount as number,
        paid: f.paid as boolean,
      })),
    ],
  }
}

export default function DashboardPage() {
  return (
    <PageShell title="대시보드" width="3xl">
      <Suspense fallback={<TodayAlertSkeleton />}>
        <TodayAlert />
      </Suspense>

      <Link href="/checkin" className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400">
        인증 보러가기
      </Link>

      <Suspense fallback={null}>
        <CodingWidget />
      </Suspense>

      <Suspense fallback={<StatusTableSkeleton />}>
        <StatusTable />
      </Suspense>

      <Suspense fallback={<FineTablesSkeleton />}>
        <FineTables />
      </Suspense>
    </PageShell>
  )
}

function TodayAlertSkeleton() {
  return <Skeleton className="h-12 w-full" />
}

function StatusTableSkeleton() {
  return <Skeleton className="mt-6 h-48 w-full" />
}

function FineTablesSkeleton() {
  return (
    <>
      <Skeleton className="mt-8 h-6 w-40" />
      <Skeleton className="mt-2 h-48 w-full" />
    </>
  )
}

/**
 * Split from `StatusTable` below rather than bundled into one component. The CURRENT (pre-Phase-5)
 * page renders the alert first, then the checkin link, then the coding widget, and only THEN the
 * status table — bundling "today's checkin status" into one Suspense boundary would have moved
 * the table up above the link and widget, silently reordering the page as a side effect of adding
 * caching. Both this and `StatusTable` call `getTodayCheckinStatus`, which is intentional: it is a
 * `'use cache'` scope, so the second call within the same render is a cache hit, not a second
 * Supabase round trip — the split costs nothing and preserves the existing visual order exactly.
 */
export async function TodayAlert() {
  const [session, { todaysAuthorIds }] = await Promise.all([
    getSessionProfile(),
    getTodayCheckinStatus(todayKst()),
  ])

  const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false

  return posted ? (
    <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
  ) : (
    <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
  )
}

export async function StatusTable() {
  const { members, todaysAuthorIds } = await getTodayCheckinStatus(todayKst())
  const statusRows = buildTodayStatus(members, todaysAuthorIds)

  return (
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
  )
}

/**
 * The week and problem rows come from the shared cached accessors in lib/coding/queries.ts,
 * so this widget and /coding read the same scopes under the same `CODING_BOARD_TAG` tag. Only
 * the caller's own completions are per-member, so only that read stays uncached.
 */
export async function CodingWidget() {
  const session = await getSessionProfile()

  if (session?.status !== 'approved') return null

  const today = todayKst()
  const weeks = await getCodingWeeks()
  const targetWeek = findWeekForDate(weeks, today)
  const problems = targetWeek ? await getCodingWeekBoard(targetWeek.id) : []
  const problemIds = problems.map((p) => p.id)

  const supabase = await createClient()
  const { data: checksData } = await queryIfAny(problemIds, () =>
    supabase.from('coding_checks').select('problem_id').eq('user_id', session.userId).in('problem_id', problemIds)
  )

  const completedProblemIds = (checksData ?? []).map((c) => c.problem_id as string)

  const codingWidget = buildCodingDashboardWidget(
    weeks,
    problems,
    completedProblemIds,
    session.userId,
    today,
    CODING_WIDGET_LIMIT
  )

  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">이번 주 코딩 문제</h2>

      {codingWidget.status === 'no-week' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          이번 주 주차가 아직 생성되지 않았습니다.
        </p>
      )}
      {codingWidget.status === 'no-problems' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 문제가 아직 등록되지 않았습니다.</p>
      )}
      {codingWidget.status === 'no-assignment' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 나에게 할당된 문제가 없습니다.</p>
      )}
      {codingWidget.status === 'assigned' && (
        <ul className="mt-2 flex flex-col gap-1">
          {codingWidget.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  item.completed
                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {item.completed ? '완료' : '미완료'}
              </span>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={codingWidget.week ? `/coding?week=${codingWidget.week.id}` : '/coding'}
        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        코딩 보드 바로가기
      </Link>
    </Card>
  )
}

export async function FineTables() {
  const { members, fines } = await getMonthlyFines(kstMonthKey(todayKst()))

  const allMonthFinePosts = fines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
  const unpaidMonthFinePosts = fines
    .filter((f) => !f.paid)
    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))

  const unpaidFineRows = buildMonthlyFineTotals(members, unpaidMonthFinePosts)
  const totalFineRows = buildMonthlyFineTotals(members, allMonthFinePosts)

  const unpaidMonthTotal = unpaidMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
  const allMonthTotal = allMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">이번 달 벌금 정산</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        미납액 합계 {unpaidMonthTotal.toLocaleString('ko-KR')}원 · 벌금 총액 합계 {allMonthTotal.toLocaleString('ko-KR')}원
      </p>
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
    </>
  )
}
```

- [ ] **Step 3: Delete `app/(app)/loading.tsx`**

```bash
git rm "app/(app)/loading.tsx"
```

Verified safe: a build with only this file removed failed on `/` alone and said nothing about `/feedback/[id]` or `/interviews/[sessionId]`, because both keep their own `loading.tsx`. Step 6 re-proves it.

- [ ] **Step 4: Rewrite `app/(app)/page.test.tsx`**

Replace the entire file with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const members = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const todaysAuthorIds = ['user-1']

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: async () => ({ data: members.map((m) => ({ id: m.id, name: m.name })) }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: (columns: string) => ({
            gte: () => ({
              lt: async () =>
                columns === 'author_id'
                  ? { data: todaysAuthorIds.map((id) => ({ author_id: id })) }
                  : {
                      data: [
                        { author_id: 'user-1', fine_amount: 3000, paid: false },
                        { author_id: 'user-1', fine_amount: 2000, paid: true },
                      ],
                    },
            }),
          }),
        }
      }
      if (table === 'manual_fines') {
        return {
          select: () => ({
            gte: () => ({ lt: async () => ({ data: [{ user_id: 'user-2', amount: 1000, paid: false }] }) }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

const sessionProfile = { userId: 'user-1', role: 'member', status: 'approved' }

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => sessionProfile),
}))

vi.mock('@/lib/coding/queries', () => ({
  getCodingWeeks: vi.fn(async () => [
    { id: 'week-1', label: '1주차', startDate: '2000-01-01', endDate: '2099-12-31' },
  ]),
  getCodingWeekBoard: vi.fn(async () => [
    {
      id: 'problem-1',
      title: '투 포인터',
      link: 'https://example.com/1',
      createdBy: 'admin-1',
      createdAt: '2026-09-02T00:00:00.000Z',
      assigneeIds: ['user-1'],
      checks: [],
    },
  ]),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }),
    }),
  })),
}))

import DashboardPage, { TodayAlert, StatusTable, CodingWidget, FineTables } from './page'

beforeEach(() => {
  sessionProfile.status = 'approved'
})

describe('DashboardPage', () => {
  it('renders the static shell title and the checkin link without awaiting any data', () => {
    const ui = DashboardPage()
    render(ui)

    expect(screen.getByRole('heading', { name: '대시보드' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '인증 보러가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('DashboardPage TodayAlert', () => {
  it('shows the completed alert for a caller who posted today', async () => {
    const ui = await TodayAlert()
    render(ui)

    expect(screen.getByText('오늘의 10시 인증을 완료했어요!')).toBeInTheDocument()
  })
})

describe('DashboardPage StatusTable', () => {
  it("tags today's status with the per-day checkin-feed tag that /checkin already uses, and ticks the members who posted today", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const ui = await StatusTable()
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith(expect.stringMatching(/^checkin-feed-\d{4}-\d{2}-\d{2}$/), 'member-names')
    expect(cacheLife).toHaveBeenCalledWith('seconds')
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
    expect(screen.getAllByText('✅')).toHaveLength(1)
  })
})

describe('DashboardPage CodingWidget', () => {
  it('renders the assigned problem for an approved member', async () => {
    const ui = await CodingWidget()
    render(ui)

    expect(screen.getByRole('link', { name: '투 포인터' })).toHaveAttribute('href', 'https://example.com/1')
    expect(screen.getByRole('link', { name: '코딩 보드 바로가기' })).toHaveAttribute('href', '/coding?week=week-1')
  })

  it('renders nothing for a member who is not approved', async () => {
    sessionProfile.status = 'pending'
    const ui = await CodingWidget()

    expect(ui).toBeNull()
  })
})

describe('DashboardPage FineTables', () => {
  it('tags the fine tables with the fines tag and totals unpaid and all fines per member', async () => {
    const { cacheTag } = await import('next/cache')
    const ui = await FineTables()
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('fines', 'member-names')
    expect(
      screen.getByText(
        `미납액 합계 ${(4000).toLocaleString('ko-KR')}원 · 벌금 총액 합계 ${(6000).toLocaleString('ko-KR')}원`
      )
    ).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the dashboard tests**

```bash
npx vitest run "app/(app)/page.test.tsx"
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Run the full suite and the build — this is where the group boundary comes off**

```bash
npm test
npm run build
```

Expected: suite PASS; build exit `0`, 20/20 pages, no `Error: Route` lines. This is the run that proves `/`, `/admin` and `/coding` now stand on their own `<Suspense>` boundaries rather than on a `loading.tsx`, and that removing the group file did not expose `/feedback/[id]` or `/interviews/[sessionId]`. If either detail route appears in an error here, its own `loading.tsx` was deleted by mistake — restore it.

- [ ] **Step 7: Commit — and go straight on to Task 5, do not stop here**

```bash
git add "app/(app)/page.tsx" "app/(app)/page.test.tsx" "lib/checkin/time.ts" "lib/checkin/time.test.ts" "lib/checkin/fines.ts" "lib/checkin/fines.test.ts"
git commit -m "feat: stream and cache the dashboard behind a static shell"
```

**Stop and re-read the warning at the top of this task before doing anything else.** This commit's `'use cache'` scopes are only correctly invalidated once Task 5's changes also land. Continue directly into Task 5 now.

---

## Task 5: Fire every Phase-5 cache tag from its mutating actions

**Do this task immediately after Task 4, in the same work session — do not merge or push after Task 4's commit alone.** See the warning at the top of Task 4 and the Architecture section's "Task 4 and Task 5 must land in the same work session" note for why: Task 4's `'use cache'` scopes are only correctly invalidated once this task's changes also land.

This task's job is broader than replacing `revalidatePath('/')` calls — that framing is why two of the four mutations below were nearly missed in review, because neither one calls `revalidatePath('/')` today. The actual job: **every mutation that writes to a table a Phase-5 cache scope reads must fire that scope's tag.** Two are exactly that, one is a variant on it (a path call to migrate), and one is a mutation that never had a `/` invalidation to begin with:

- `createCheckinPost` (`app/(app)/checkin/actions.ts`) — the known case. Phase 4 kept `revalidatePath('/')` here and recorded exactly why: it was correct *because* `/` was still fully dynamic. Task 4 ended that. A path call now would expire `_N_T_/` and make the `'use cache'` reader discard every dashboard entry created before that instant — including the `` checkin-feed-${todayKst} `` entry `/checkin` is also reading — turning a targeted refresh into a blunter second invalidation channel fighting the tags. It is deleted and replaced with `updateTag(FINES_TAG)`, because this action also writes `fine_amount`.
- `deleteCheckinPost` (same file) — deletes a `checkin_posts` row that may itself carry a nonzero `fine_amount`. It has no `revalidatePath('/')` call today, so it was not on the "replace the path calls" list, but it needs `updateTag(FINES_TAG)` for exactly the same reason `createCheckinPost` does: a deleted fine must not keep counting toward the dashboard's monthly total for up to `getMonthlyFines`'s `minutes` window.
- `setCheckinPostPaid`, `cancelCheckinFine`, `addManualFine`, `deleteManualFine`, `setManualFinePaid` (`app/(app)/admin/fine-actions.ts`) — the other five known `revalidatePath('/')` sites, all replaced with `updateTag(FINES_TAG)`.
- `setUserStatus` (`app/(app)/admin/actions.ts`, backing `approveUser`/`rejectUser`) — writes `profiles.status`. Safe to leave alone under Phase 4, because `/checkin`'s reader selects all profiles with no status filter. Unsafe now: Task 2's `getCodingMembers()` and Task 4's `getTodayCheckinStatus()`/`getMonthlyFines()` all filter on `status = 'approved'`, so status became a cache-relevant input with nothing invalidating on it. It has no `revalidatePath('/')` call today either — only `revalidatePath('/admin')` — so it was equally easy to miss. It gets an added `updateTag('member-names')`.

**Files:**
- Modify: `app/(app)/checkin/actions.ts` (`createCheckinPost` line 106, and `deleteCheckinPost`)
- Modify: `app/(app)/admin/fine-actions.ts` (lines 35, 59, 107, 131, 162)
- Modify: `app/(app)/admin/actions.ts` (`setUserStatus`)

- [ ] **Step 1: Update `app/(app)/checkin/actions.ts`**

Replace this block (currently at lines 103–107, inside `createCheckinPost`):

```ts
  // `revalidatePath('/')` stays — the dashboard is still fully dynamic and reads today's
  // checkin_posts. It emits only the `_N_T_/` and `_N_T_/index` soft tags, which belong to
  // the `/` route alone, so it does not touch any checkin, jobposts or interviews cache.
  revalidatePath('/')
  revalidateTag('checkin-calendar', 'max')
```

with:

```ts
  // Phase 4 kept `revalidatePath('/')` here because the dashboard was still fully dynamic.
  // Phase 5 moved its queries into `'use cache'` scopes, so the path call would now expire
  // the root route's implicit soft tag `_N_T_/` and make the reader discard every dashboard
  // entry older than this instant — including the checkin-feed entry that /checkin itself
  // reads. It is deleted rather than replaced: the dashboard's today-status scope is tagged
  // with the very same per-day tag, so `revalidateCheckinDay(...)` below already invalidates
  // it. The only thing needing a new tag is the fine table, because this action writes
  // `fine_amount`.
  updateTag(FINES_TAG)
  revalidateTag('checkin-calendar', 'max')
```

Then, inside `deleteCheckinPost` — which deletes a row that may itself carry a nonzero `fine_amount`, and has no `revalidatePath('/')` call today to guide the search for it — replace:

```ts
  revalidateTag('checkin-calendar', 'max')
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

with:

```ts
  // The deleted row may have carried a nonzero `fine_amount`. It has no `revalidatePath('/')`
  // call to migrate — this action never had one — which is exactly why it was nearly missed:
  // it needs `updateTag(FINES_TAG)` for the same reason createCheckinPost does, not because
  // anything here resembles a path-call replacement.
  updateTag(FINES_TAG)
  revalidateTag('checkin-calendar', 'max')
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

Then update the import on line 4 — drop `revalidatePath`, keep `revalidateTag` and `updateTag`, and add `FINES_TAG`:

```ts
import { revalidateTag, updateTag } from 'next/cache'
import { FINES_TAG } from '@/lib/checkin/fines'
```

Verify nothing else in the file used the removed import:

```bash
grep -n "revalidatePath" "app/(app)/checkin/actions.ts"
```

Expected: no output.

`app/(app)/checkin/actions.test.ts` already mocks `updateTag` (`updateTagMock`, added in Phase 4), so no new mock plumbing is needed — only assertion updates. In the `createCheckinPost` success test, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
```

with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/')
    expect(updateTagMock).toHaveBeenCalledWith('fines')
```

In the `deleteCheckinPost` `'deletes the post when the caller is an admin'` test, add a new assertion alongside the existing `expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')`:

```ts
    expect(updateTagMock).toHaveBeenCalledWith('fines')
```

`updateTagMock` records every call it receives, so this is additive — the existing per-day assertion stays valid unchanged.

- [ ] **Step 2: Update `app/(app)/admin/fine-actions.ts`**

Change the import on line 4 from:

```ts
import { revalidatePath } from 'next/cache'
```

to:

```ts
import { revalidatePath, updateTag } from 'next/cache'
import { FINES_TAG } from '@/lib/checkin/fines'
```

Then in each of the five actions — `setCheckinPostPaid`, `cancelCheckinFine`, `addManualFine`, `deleteManualFine`, `setManualFinePaid` — replace the `revalidatePath('/')` line (lines 35, 59, 107, 131 and 162) with:

```ts
  updateTag(FINES_TAG)
```

Leave every `revalidatePath('/admin')` exactly as it is: `/admin` has no `'use cache'` scope for a path call to over-invalidate, and it is still what clears the admin's client router cache after the mutation. Add this comment above the first replacement, inside `setCheckinPostPaid`:

```ts
  // `revalidatePath('/admin')` above stays: /admin is deliberately uncached, so there is no
  // scope for a path call to over-invalidate, and it is what clears the admin's client router
  // cache. `revalidatePath('/')` is what had to go — the dashboard's fine tables now live in a
  // `'use cache'` scope tagged `FINES_TAG`, and a path call on `/` would discard every
  // dashboard entry rather than just this one. `updateTag` so the admin sees their own change
  // at once.
```

Verify all five moved:

```bash
grep -n "revalidatePath\|updateTag" "app/(app)/admin/fine-actions.ts"
```

Expected: one `revalidatePath, updateTag` import line, one `FINES_TAG` import line, five `revalidatePath('/admin')` lines and five `updateTag(FINES_TAG)` lines. No `revalidatePath('/')`.

`app/(app)/admin/fine-actions.test.ts`'s existing `next/cache` mock only exposes `revalidatePath`, the same gap as `admin/actions.test.ts`. Add an `updateTagMock`:

```ts
const revalidatePathMock = vi.fn()
const updateTagMock = vi.fn()
```

```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))
```

Then, in each of the five success tests, replace the line `expect(revalidatePathMock).toHaveBeenCalledWith('/')` (it follows `expect(revalidatePathMock).toHaveBeenCalledWith('/admin')` in `'marks a post paid...'`, `'zeroes the fine amount...'`, `'inserts a manual fine...'`, `'deletes the manual fine...'` and `'marks a manual fine paid...'`) with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/')
    expect(updateTagMock).toHaveBeenCalledWith('fines')
```

leaving the `toHaveBeenCalledWith('/admin')` line directly above each untouched.

- [ ] **Step 3: Update `app/(app)/admin/actions.ts`**

`setUserStatus` (the shared implementation behind `approveUser`/`rejectUser`) currently ends with:

```ts
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
}
```

Change it to:

```ts
  const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/admin')
  // Task 2's getCodingMembers() and Task 4's getTodayCheckinStatus()/getMonthlyFines() all
  // filter on `status = 'approved'`, so a status change must invalidate every cache scope
  // tagged `member-names` or an approved/rejected member sits (in)correctly filtered until
  // those scopes' cache windows turn over. `revalidatePath('/admin')` above is unaffected by
  // this and stays for the same reason it always has: /admin itself has no `'use cache'` scope.
  updateTag('member-names')
}
```

and update the import on line 1 (currently `import { revalidatePath } from 'next/cache'`) to:

```ts
import { revalidatePath, updateTag } from 'next/cache'
```

Verify:

```bash
grep -n "revalidatePath\|updateTag" "app/(app)/admin/actions.ts"
```

Expected: one import line, one `revalidatePath('/admin')` line, one `updateTag('member-names')` line.

`app/(app)/admin/actions.test.ts`'s existing `next/cache` mock only exposes `revalidatePath`:

```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))
```

Calling the new `updateTag` import against this mock would resolve to `undefined` and throw. Add an `updateTagMock` alongside the existing `revalidatePathMock`:

```ts
const revalidatePathMock = vi.fn()
const updateTagMock = vi.fn()
```

```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))
```

Then add a positive assertion to both success tests (`'sets the profile status to approved and revalidates /admin'` and the `rejectUser` equivalent):

```ts
    expect(updateTagMock).toHaveBeenCalledWith('member-names')
```

and a negative assertion (`expect(updateTagMock).not.toHaveBeenCalled()`) next to every existing `expect(revalidatePathMock).not.toHaveBeenCalled()` in the failure and `authorization` tests, so the "nothing fires on a rejected mutation" behavior stays pinned for both tags, not just the old one.

- [ ] **Step 4: Confirm no `revalidatePath('/')` survives anywhere**

```bash
grep -rn "revalidatePath('/')" --include=*.ts --include=*.tsx app lib
```

Expected: no output.

- [ ] **Step 5: Run the affected action tests**

```bash
npx vitest run "app/(app)/checkin/actions.test.ts" "app/(app)/admin/fine-actions.test.ts" "app/(app)/admin/actions.test.ts"
```

Expected: PASS — the mock and assertion changes for all three files are spelled out in Steps 1–3 above.

- [ ] **Step 6: Run the full suite and the build**

```bash
npm test
npm run build
```

Expected: suite PASS; build exit `0`.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/admin/fine-actions.ts" "app/(app)/admin/actions.ts"
git commit -m "refactor: invalidate the dashboard and member-names by tag instead of by path"
```

---

## Task 6: Adopt runtime instant prefetching on `/jobposts` and `/interviews`

Phase 4 opted all three feeds out of instant validation with `= false` and a note to revisit. The revisit is done; the answer is yes for two routes and a documented no for the third. **The samples object must be a plain literal** — adding `as const` or `as Array<[string, string]>` makes `next build` die during page-data collection with `⨯ Invalid segment configuration export detected`, which names no file and no reason.

**Files:**
- Modify: `app/(app)/jobposts/page.tsx:14-22`
- Modify: `app/(app)/interviews/page.tsx:14-19`
- Modify: `app/(app)/checkin/page.tsx:16-21`

- [ ] **Step 1: Replace the `unstable_instant` block in `app/(app)/jobposts/page.tsx`**

Replace the comment block and `export const unstable_instant = false` (lines 14–22) with:

```tsx
// Runtime prefetching with declared samples, validated at build time. Phase 4 set this to
// `false` because `prefetch: 'static'` demands `samples` for the `x-user-id` header (read by
// getSessionProfile() in FeedContent) and the `error` search param (read by TopNotice), and
// `samples` only exists on the `prefetch: 'runtime'` variant of InstantConfig. It does work:
// with this config the build reports `/jobposts  1m  1h`, i.e. a real cached prefetch, where
// before it reported no lifetime at all.
//
// Two rules the docs do not state, both learned from build failures:
//  1. No type assertions anywhere in this object. `as const` or `as Array<[string, string]>`
//     makes `next build` fail with "Invalid segment configuration export detected" during page
//     data collection — segment configs are statically analysed and a cast defeats that.
//  2. Every search param the route reads must appear, including the usually-absent ones, as
//     `null`. Omitting `error` fails with INSTANT_VALIDATION_ERROR naming the exact line.
export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      headers: [
        ['x-user-id', '00000000-0000-0000-0000-000000000000'],
        ['x-user-role', 'member'],
        ['x-user-status', 'approved'],
      ],
      searchParams: { error: null, success: null },
    },
  ],
}
```

- [ ] **Step 2: Replace the `unstable_instant` block in `app/(app)/interviews/page.tsx`**

Replace the comment block and `export const unstable_instant = false` (lines 14–19) with:

```tsx
// Runtime prefetching with declared samples — same reasoning and same two gotchas as
// /jobposts (no type assertions in this object; every search param declared, absent ones as
// `null`). With this config the build reports `/interviews  1m  1h`.
export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      headers: [
        ['x-user-id', '00000000-0000-0000-0000-000000000000'],
        ['x-user-role', 'member'],
        ['x-user-status', 'approved'],
      ],
      searchParams: { error: null, success: null },
    },
  ],
}
```

- [ ] **Step 3: Record the `/checkin` non-adoption in `app/(app)/checkin/page.tsx`**

`/checkin` keeps `= false`. Replace its comment block (lines 16–20), leaving `export const unstable_instant = false` on line 21 unchanged:

```tsx
// Stays `false` — `prefetch: 'runtime'` was tried on this route and rejected on evidence, so
// do not reopen it a third time. Under runtime prefetching the build fails three times over
// with "Route "/checkin" used `new Date()` before accessing either uncached data (e.g.
// `fetch()`) or awaiting `connection()`", pointing at resolveDayContext — which samples the
// clock to compute `todayKst`, something inherent to a date-navigated route. Inserting
// `await connection()` there does make the build pass, but the route then reports NO
// Revalidate/Expire in the build table, where /jobposts and /interviews report `1m 1h`:
// `connection()` opts the render out of prefetch-time execution, so the runtime prefetch has
// nothing to cache. The configuration would buy literally nothing and cost a `connection()`
// call plus a sample block to maintain.
export const unstable_instant = false
```

- [ ] **Step 4: Run the build and check the route table**

```bash
npm run build
```

Expected: exit `0`, and the route table shows lifetimes on exactly these two rows:

```
├ ◐ /interviews                      1m      1h
├ ◐ /jobposts                        1m      1h
```

`/checkin` must show no lifetime. If you instead get `⨯ Invalid segment configuration export detected`, a type assertion crept into one of the sample objects — remove it. If you get `INSTANT_VALIDATION_ERROR` naming a search param, add that param to the sample as `null`.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: PASS. The feed page tests import these modules, so a malformed export surfaces here too.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/jobposts/page.tsx" "app/(app)/interviews/page.tsx" "app/(app)/checkin/page.tsx"
git commit -m "feat: validate runtime instant prefetching on the jobposts and interviews feeds"
```

---

## Task 7: Final verification and merge

This is the first task in the whole five-phase effort that is allowed to merge. Phases 1–4 each ended with an explicit "do not merge, the branch stays red until every route builds clean." That condition is now met.

**Files:** none (verification and integration only)

- [ ] **Step 1: Confirm the tree is clean and no temporary stubs survive**

```bash
git status --short
grep -rn "revalidatePath('/')" --include=*.ts --include=*.tsx app lib
grep -rn "TODO\|FIXME\|temporarily" --include=*.tsx app/login app/signup app/forgot-password app/reset-password
```

Expected: all three produce no output. Earlier phases neutralized `/forgot-password` as a research stub; nothing of that kind may remain. `git status --short` also catches a leftover `app/(app)/page.tsx.bak` or `app/(app)/loading.tsx.bak` if Task 2's or Task 3's isolated build-verification step was interrupted before its restore commands ran.

Also confirm the three Phase-5 tag constants are used everywhere rather than duplicated as bare literals — the exact hazard Important Issue 4 in this task's originating review was about:

```bash
grep -rn "'coding-board'" --include=*.ts --include=*.tsx app lib
grep -rn "'fines'" --include=*.ts --include=*.tsx app lib
```

Expected: each matches only the constant's own definition (`export const CODING_BOARD_TAG = 'coding-board'` in `lib/coding/queries.ts`, `export const FINES_TAG = 'fines'` in `lib/checkin/fines.ts`) and any test files that assert against the literal value — never a second call site that could drift from the constant by a typo. Every production call site should show up under `CODING_BOARD_TAG` / `FINES_TAG` instead:

```bash
grep -rln "CODING_BOARD_TAG" --include=*.ts --include=*.tsx app lib
grep -rln "FINES_TAG" --include=*.ts --include=*.tsx app lib
```

Expected: `lib/coding/queries.ts`, `app/(app)/coding/actions.ts`, `app/api/github-webhook/route.ts` (and `route.test.ts`) for the first; `lib/checkin/fines.ts`, `app/(app)/page.tsx`, `app/(app)/checkin/actions.ts` (and its test file) and `app/(app)/admin/fine-actions.ts` (and its test file) for the second.

- [ ] **Step 2: Confirm the deleted `loading.tsx` files are gone and the two intentionally-kept ones remain**

```bash
find app -name "loading.tsx"
```

Expected exactly two lines:

```
app/(app)/feedback/[id]/loading.tsx
app/(app)/interviews/[sessionId]/loading.tsx
```

These two are deliberate — see the Phase 6 deferral in the Architecture section. If `app/(app)/loading.tsx`, `app/(app)/admin/loading.tsx` or `app/(app)/coding/loading.tsx` is still listed, the corresponding task's delete step was skipped and that route's static shell is still masked.

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: PASS, all files. If a handful of files fail with 5s timeouts, re-run just those files in isolation before treating it as a regression — the suite is known to be flaky under concurrent load.

- [ ] **Step 4: Run the final build**

```bash
npm run build
```

Expected: exit `0`, `✓ Generating static pages using 7 workers (20/20)`, a route table covering all 20 routes with `/jobposts` and `/interviews` showing `1m 1h`, and **no** `Error: Route "…"` line anywhere. This is the green build the whole effort has been working toward.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: clean, or only the one pre-existing unrelated issue this repo already carries. Do not fix unrelated findings here.

- [ ] **Step 6: Finish the branch**

**REQUIRED SUB-SKILL:** Use `superpowers:finishing-a-development-branch`.

Report to that skill: the branch is `worktree-instant-navigation-foundation`, it carries Phases 1–5 of the instant-navigation migration, `npm test` and `npm run build` are both green, and `/feedback/[id]` and `/interviews/[sessionId]` remain deliberately unconverted behind their own `loading.tsx` for a future Phase 6 — they build clean and do not block the merge.

---

## Deferred to Phase 6

Recorded here so the next phase starts from evidence rather than rediscovery:

- **`/feedback/[id]` and `/interviews/[sessionId]`.** Both block on all their data at runtime and pass the build only because of their own `loading.tsx` — verified by removing those files and rebuilding, which produced `Error: Route "/feedback/[id]": Uncached data was accessed outside of <Suspense>` and the same for `/interviews/[sessionId]`. Converting them needs two design answers this plan did not have: what the static shell is when the page title comes from the database (`session.title`; a heading built from a job post's `company_name`), and how a `redirect()` thrown from inside a `<Suspense>` boundary behaves once a shell has already been flushed. Phase 6 should answer both before writing code, and should delete each route's `loading.tsx` in the same task that adds its boundaries.
