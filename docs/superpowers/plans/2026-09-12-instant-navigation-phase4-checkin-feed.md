# Instant Navigation Phase 4: Checkin Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `/checkin` — the "10시 인증" daily check-in feed — to the Suspense + `'use cache'` instant-shell pattern, with a caching design that keeps **today's** check-ins effectively live for every member while letting **past** days cache for a long time; and correct a validation regression on `/jobposts` and `/interviews` that Phases 2–3 believed was already clean.

**Architecture:**

**Part 1 — the `unstable_instant` correction (Task 1).** Phases 2 and 3 both shipped `export const unstable_instant = { prefetch: 'static' }` on their feed pages and recorded that it "validated cleanly." That conclusion was wrong, and the reason it went unnoticed is mechanical: `next build` aborts the whole export on the *first* prerender error, and `/forgot-password` (out of scope for this entire effort) fails before any worker reaches `/jobposts` or `/interviews`. The validation never ran. Verified in this session by temporarily neutralizing `/forgot-password` and rebuilding: both routes fail with `digest: 'INSTANT_VALIDATION_ERROR'`, twice each —

```
Error: Route "/jobposts" accessed header "x-user-id" which is not defined in the `samples` of `unstable_instant`.
    at <unknown> (lib\auth\session.ts:15:25)
    at async E (app\(app)\jobposts\page.tsx:122:31)
Error: Route "/jobposts" accessed searchParam "error" which is not defined in the `samples` of `unstable_instant`.
    at C (app\(app)\jobposts\page.tsx:95:18)
```

and the identical pair for `/interviews` (`app\(app)\interviews\page.tsx:103` and `:76`). Putting these inside `<Suspense>` — which both pages already do — is *not* sufficient for `prefetch: 'static'`; the validator still demands declared `samples`, and per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md` the `samples` field only exists on the `prefetch: 'runtime'` variant of `InstantConfig`. The fix this plan takes is the same `false` opt-out Phase 1 already used on both calendar pages — **verified empirically**: a build with both set to `false` prerendered `/jobposts`, `/interviews`, `/jobposts/calendar`, `/checkin/calendar` and `/checkin` without a single error line and ran on to the next out-of-scope failure (`/login`). Moving these routes to `prefetch: 'runtime'` with real `samples` is a legitimate future improvement, but it is a different piece of design work and is explicitly **not** in this plan's scope.

**Part 2 — the `/checkin` feed (Task 2).** `/checkin` is a single-date view: it reads a `date` search param, clamps it, and renders exactly one KST day of check-ins with ◀ / ▶ navigation. Today's check-ins are a live accountability signal — a member must see a teammate's post from ten minutes ago without anyone busting a cache by hand — while every earlier day is immutable historical record. The mechanism chosen is **conditional `cacheLife` inside one date-keyed `'use cache'` function** (the pattern documented under "Conditional cache lifetimes" in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheLife.md`):

```ts
async function getCheckinPosts(date: string, isToday: boolean): Promise<CheckinPost[]> {
  'use cache'
  cacheTag(`checkin-feed-${date}`, 'member-names')

  if (isToday) {
    cacheLife('seconds')
  } else {
    cacheLife('max')
  }
  // query body unchanged from today's page — see Task 2, Step 3 for the complete function
}
```

- `cacheLife('seconds')` is `stale: 30s / revalidate: 1s / expire: 60s`. Server-side that keeps today's feed within about a second of the database, at a ceiling of roughly one Supabase round trip per second under load — negligible for a group this size. The docs note that an `expire` under five minutes excludes a cache from prerendering and turns it into a "dynamic hole"; that is fine and in fact desirable here, because this call only ever runs inside a `<Suspense>` boundary.
- **"Effectively live" is a claim worth bounding precisely**, so that nobody later reports the residual lag as a bug. `revalidate: 1s` is *stale-while-revalidate*: the first request after the one-second window still receives the previous entry while a fresh one is generated in the background — one request of lag, not zero. And `stale: 30s` is a **client** value, not a server one: per `cacheLife.md` ("The `stale` property controls the [Client Cache], not the `Cache-Control` header … the client router uses this value to determine when to revalidate"), a member who navigated to `/checkin` within the last 30 seconds can be served their router-cached copy without the server being consulted at all. What closes both gaps for the member who *acts* is `updateTag`, not `cacheLife` — see the invalidation section below; `cacheLife.md` notes that a revalidation call from a Server Action "immediately clear[s]" the entire client cache, bypassing the stale time. So the honest statement of the guarantee is: **instant for the writer; roughly one second plus one request for another member who navigates; up to ~30s for a bystander sitting on a warm client cache who does not navigate and takes no action.**
- `cacheLife('max')` is `revalidate: 30 days` — the right setting for a day that can no longer receive new check-ins.
- `isToday` is computed **outside** the cache scope from `new Date()` and passed in. This is load-bearing: a `'use cache'` function that computed "today" itself would freeze that value at cache-fill time and keep serving a stale notion of today forever. Passing it also folds it into the cache key, which buys correct KST-midnight rollover for free — after midnight the same date string is read under key `(date, false)` as a fresh long-lived entry, while the orphaned `(date, true)` entry expires within 60 seconds on its own.
- The date is part of the cache key, so key-space growth matters. `resolveSelectedDate()` already guards it: it rejects anything not matching `/^\d{4}-\d{2}-\d{2}$/`, round-trips the value through `Date` to reject calendrically impossible dates like `2026-02-30`, and clamps future dates to today. Keys are therefore bounded to real dates ≤ today, and a hostile `?date=` cannot explode the cache. Keep that function exactly as it is.

**Invalidation** uses a per-day tag, `checkin-feed-${kstDate}`, written with `updateTag` (not `revalidateTag`) so the acting member reads their own write immediately — the read-your-own-writes rule Phase 2 established in commit `557ac9e`. A local helper in `actions.ts` mirrors the shape of `jobposts/actions.ts`'s existing `revalidateJobPosts()`:

```ts
function revalidateCheckinDay(kstDate: string) {
  updateTag(`checkin-feed-${kstDate}`)
}
```

**The existing `revalidatePath('/checkin')` calls must be deleted, not kept alongside the new tag.** This was the single most load-bearing finding of review on this plan, and it is not a matter of taste — a per-day tag next to a retained `revalidatePath('/checkin')` would be pure decoration, because the path call already invalidates every per-day entry. Verified against the Next.js 16.2.12 source in this worktree's `node_modules`, not assumed:

1. `revalidatePath(path)` does not address a page. It computes a **soft tag** `` `_N_T_${removeTrailingSlash(path)}` `` and pushes it onto `store.pendingRevalidatedTags` with `profile: undefined` (`node_modules/next/dist/server/web/spec-extension/revalidate.js`, `revalidatePath`). `_N_T_` is `NEXT_CACHE_IMPLICIT_TAG_ID` (`node_modules/next/dist/lib/constants.js:283`). A `profile` of `undefined` means *immediate* expiry — the same semantics `updateTag` uses, which is why both set `store.pathWasRevalidated = ActionDidRevalidateStaticAndDynamic` at the bottom of the shared `revalidate()` helper.
2. Every render of a route carries a set of **implicit tags** derived from its page path: `getImplicitTags` / `getDerivedTags` (`node_modules/next/dist/server/lib/implicit-tags.js`). For `/checkin` that set is `_N_T_/layout`, `_N_T_/checkin/layout`, `_N_T_/checkin/page` and the pathname tag `_N_T_/checkin`.
3. The `'use cache'` reader checks those implicit tags against **every** entry it is about to serve, regardless of that entry's own `cacheTag`. `shouldDiscardCacheEntry` (`node_modules/next/dist/server/use-cache/use-cache-wrapper.js:1529`) begins:

```js
if (entry.timestamp <= implicitTagsExpiration) {
  debug?.('entry was created at', entry.timestamp, 'before implicit tags were revalidated at', implicitTagsExpiration)
  return true
}
```

  where `implicitTagsExpiration` is `cacheHandler.getExpiration(implicitTags)` — for the default handler, the newest `expired` timestamp recorded in `tagsManifest` for any of those tags (`node_modules/next/dist/server/lib/cache-handlers/default.js`, `getExpiration` / `updateTags`). The same function then discards again if any implicit tag is in `pendingRevalidatedTags` for the current request.

  So one `revalidatePath('/checkin')` stamps `_N_T_/checkin` with `expired = now`, and from then on **every** `'use cache'` entry created before that instant and read while rendering `/checkin` is thrown away — including `checkin-feed-2026-07-14` and every other 30-day `max` entry. The docs say the same thing more briefly: "Cache entries are tagged based on which route file renders them" (`revalidatePath.md`), and "Prefer tag-based revalidation (`revalidateTag`/`updateTag`) over path-based when possible — it's more precise and avoids over-invalidating" (`09-revalidating.md`).

**Therefore:** `revalidatePath('/checkin')` is removed from all six mutating actions. Nothing is lost by removing it. The two jobs it was doing are both still done:

- *Server cache invalidation* — now done precisely by `revalidateCheckinDay(...)`, which is the whole point.
- *Clearing the client router cache after the action* — `updateTag` sets `pathWasRevalidated` through exactly the same code path as `revalidatePath` (`revalidate.js`: `if (!profile || cacheLife?.expire === 0) { store.pathWasRevalidated = ActionDidRevalidateStaticAndDynamic }`; `updateTag` calls `revalidate([tag], …, undefined)`). Since every action that drops a `revalidatePath('/checkin')` gains a `revalidateCheckinDay(...)` in the same place, this behaviour is preserved line-for-line.

The uncached parts of the page (`DayHeader`, `TopNotice`, and `getSessionProfile()` inside `FeedContent`) never depended on `revalidatePath` at all — they re-run on every request by construction.

**`revalidatePath('/')` in `createCheckinPost` stays.** Reviewed on the suspicion that it might be reaching `_N_T_/layout` and so nuking unrelated caches (`jobposts-feed`, `interviews-feed`, `checkin-calendar`) on every check-in. It is not. Read the source: `revalidatePath` only appends a `/layout` suffix when the caller passes `type` explicitly (`normalizedPath += '/' + type`), and this call passes no `type`. The tags it actually emits are exactly `_N_T_/` plus `_N_T_/index` (the special-case branch for the root path). Neither appears in `/checkin`'s implicit tag set, nor in `/jobposts`'s or `/interviews`'s — they are the implicit tags of the `/` route and nothing else. (`revalidatePath('/', 'layout')` *would* be the app-wide sledgehammer the docs describe under "Revalidating all data"; this is not that call.) And it is load-bearing for a reason unrelated to the checkin cache: `app/(app)/page.tsx` is the dashboard, it is still fully dynamic (it uses `createClient()`, no `'use cache'`, and is not migrated until Phase 5), and it reads `checkin_posts` for today to render the "누가 인증했는지" status and the monthly fine tables. Keep it as-is; Phase 5 revisits it when `/` itself is converted.

Two alternatives were considered and rejected:

- *A single broad `checkin-feed` tag busted by every write.* Rejected. Today's feed is written to constantly (check-ins, comments, reactions, goal toggles), so a broad tag would nuke every past day's `'max'` entry on every one of those writes. The "past days are cacheable" half of the design would be decorative. The cost of precision is three extra primary-key lookups on low-frequency actions — a fair trade, detailed in Task 2. Note that *keeping `revalidatePath('/checkin')` is this rejected alternative*, just spelled differently and less visibly, which is exactly why it has to go.
- *Splitting today's posts and past posts into two independently-streamed sections.* Rejected. The page renders exactly one day at a time; there is no view that mixes today and past posts, so the second boundary would have nothing to put in it.

The existing `revalidateTag('checkin-calendar', 'max')` calls stay exactly as they are — the calendar is a view nobody expects to update instantly, so stale-while-revalidate remains correct there. `checkin-calendar` is the only pre-existing checkin cache tag (`app/(app)/checkin/calendar/page.tsx`); `checkin-feed-${date}` does not collide with it.

**Accepted trade-off: `profiles` rides inside the `max` scope.** `getCheckinPosts` resolves author names by reading `profiles.select('id, name')` inside the same cache scope as the posts, so for a past day that name snapshot is frozen for up to 30 days. This is stated here deliberately rather than left to be discovered:

- It is bounded in practice because **nothing in the app can rename a member.** The only write to `profiles` anywhere in the codebase is `app/(app)/admin/actions.ts:36`, `supabase.from('profiles').update({ status }).eq('id', userId)` — `status` only. `name` is set once at signup, so a rename is an out-of-band database edit.
- The Phase 2/3 precedent is *partial*, and overstating it would be wrong: `jobposts/page.tsx:21-27` and `interviews/page.tsx:20-26` do cache `profiles` inside their feed scope with no separate invalidation, so the pattern is established — but they run at `cacheLife('minutes')` (1m revalidate), where the worst case is a minute of staleness rather than 30 days. The difference in blast radius is real and is the reason this needs an escape hatch rather than a shrug.
- The escape hatch is one line: `getCheckinPosts` tags its scope with two tags instead of one — `` cacheTag(`checkin-feed-${date}`, 'member-names') `` (`cacheTag` takes varargs: `export declare function cacheTag(...tags: string[]): void`). A single `revalidateTag('member-names', 'max')` then invalidates every day's entry at once, whether it is called from a future rename action or from a one-off route handler after a manual DB edit. It costs nothing until it is needed.
- Splitting `profiles` into its own shorter-lived `'use cache'` function was considered and rejected as ineffective *and* more complex. Per `cacheLife.md` "Nested caching behavior": with an explicit outer `cacheLife`, "the outer cache uses its own lifetime, regardless of inner cache lifetimes. When the outer cache hits, it returns the complete output including all nested data." A nested `getMemberNames()` on `cacheLife('hours')` would therefore still be frozen inside the outer `max` entry for 30 days — the inner lifetime would buy nothing. Getting a real benefit would require hoisting the lookup out of `getCheckinPosts` entirely and composing names in `FeedContent`, which means `getCheckinPosts` can no longer return `CheckinPost[]` and the name-joining logic moves into the component. Not worth it for a rename path that does not exist. (Worth knowing for the tag, though: inner `'use cache'` tags *do* propagate outward — `propagateCacheLifeAndTagsToRevalidateStore`, `use-cache-wrapper.js:274` — so the flat two-tag `cacheTag(...)` call above and a nested tagged helper would be equivalent for invalidation purposes.)

**Page structure** differs from Phases 2 and 3, because on `/checkin` *everything but the title* depends on `searchParams`:

- `export const unstable_instant = false` — required, for two independent reasons: `selectedDate` is derived from both the `date` search param and `new Date()` (the exact situation Phase 1 hit on both calendar pages), and finding (A) above shows `prefetch: 'static'` does not validate even for the structurally simpler feeds.
- **Static shell:** `PageShell` with `title="10시 인증"` and the `headerExtra` "달력 보기" link — nothing else.
- **Suspense boundary 1** — `TopNotice`, `fallback={null}`: the `Toast`/`Alert` pair derived from `success`/`error`, same shape as `/jobposts` and `/interviews`. Exported so the test file can render it directly.
- **Suspense boundary 2** — `DayHeader`: awaits `searchParams` and touches **no** database, so it paints almost immediately. Renders the ◀ / date heading / ▶ nav row plus `<PostForm />` when the selected date is today.
- **Suspense boundary 3** — `FeedContent`: resolves the same day context, then `Promise.all([getSessionProfile(), getCheckinPosts(selectedDate, isToday)])`, and renders the `PostCard` list. `getSessionProfile()` reads `headers()` and so can never live inside a `'use cache'` scope — it stays a separate call awaited alongside the cached fetch, exactly as in `jobposts/page.tsx`.

Splitting `DayHeader` from `FeedContent` is deliberate: the nav row and post form need only the search param, so they should not wait behind a database round trip.

Because boundaries 2 and 3 both need `{ selectedDate, isToday }`, the derivation lives in **one shared `resolveDayContext(searchParamsPromise)` helper** rather than being written out twice. Be precise about what this does and does not buy: the two components still each call it, so each still samples `new Date()` at whatever moment its own stream resolves, and a request that straddles KST midnight can still in principle render a header for one day above a feed for another. That residual window is inherent to streaming two boundaries and is a second or two wide once a day; closing it entirely would mean hoisting the resolution into `CheckinPage`, which cannot `await searchParams` without destroying the static shell that is the point of this phase. What the helper *does* guarantee is that the two derivations cannot drift **as code** — the clamping rules, the KST conversion and the `isToday` comparison exist in exactly one place, so a later change to any of them cannot land on one boundary and miss the other.

**RLS safety** was verified in `supabase/migrations/0009_checkin_desk_goal.sql`, not assumed: `checkin_posts`, `checkin_comments` and `checkin_reactions` each have an "Approved members can read …" SELECT policy whose `using` clause is only `exists (select 1 from profiles p where p.id = auth.uid() and p.status = 'approved')` — no per-row ownership restriction. That is the same criterion Phases 1–3 applied, so the cookie-free `createCacheClient()` (`lib/supabase/cache-client.ts`) is safe for all three. `profiles` is already read this way by `app/(app)/checkin/calendar/page.tsx`.

**Tech Stack:** Same as Phases 1–3 — Next.js 16.2.12 (App Router, Turbopack, Cache Components already enabled on this branch), React 19, Supabase, Vitest + Testing Library.

---

## Before you start

- This plan continues on the same branch/worktree as Phases 1–3: `C:\kb27\edgeofemployment\EOESite\.claude\worktrees\instant-navigation-foundation`, branch `worktree-instant-navigation-foundation`. Confirm with `git rev-parse --abbrev-ref HEAD` before starting. **Do not create a new worktree** and do not touch the main checkout at `C:\kb27\edgeofemployment\EOESite`.
- Confirm `git log --oneline -1` shows `feat: stream and cache the interviews feed instead of blocking the whole page` (Phase 3 Task 1) or later.
- Confirm `.env.local` in this worktree contains a `SUPABASE_SERVICE_ROLE_KEY` line — **do not print its value**:

```bash
grep -c "^SUPABASE_SERVICE_ROLE_KEY=" .env.local
```

  Expected: `1`. Without it, `npm run build` dies at `lib/supabase/cache-client.ts` with `Error: supabaseKey is required` while collecting page data. Copy the line from the main checkout's `.env.local` if it is missing.
- Phase 3 left `docs/superpowers/plans/2026-09-12-instant-navigation-phase3-interviews-feed.md` untracked; it was committed alongside this plan, so `git status --short` should be clean before you start. If it is not, stop and find out why rather than committing someone else's work-in-progress.
- **Do not merge or rebase onto `main` at any point in this plan.** The branch is expected to stay red for unmigrated routes until Phase 5.

---

### Task 1: Correct the `unstable_instant` setting on `/jobposts` and `/interviews`

**Files:**
- Modify: `app/(app)/jobposts/page.tsx:15`
- Modify: `app/(app)/interviews/page.tsx:14`

There is no unit test for this task — `unstable_instant` is a build-time route segment config with no runtime behavior a Vitest test can observe. The verification is the build itself, in Step 3.

- [ ] **Step 1: Change `app/(app)/jobposts/page.tsx`.** Replace line 15:

```ts
export const unstable_instant = { prefetch: 'static' }
```

with:

```ts
// `prefetch: 'static'` fails build-time instant validation on this route: the validator
// requires declared `samples` for the `x-user-id` header (read by getSessionProfile() in
// FeedContent) and the `error` search param (read by TopNotice), and `samples` is only
// accepted alongside `prefetch: 'runtime'`. Wrapping both reads in <Suspense>, which this
// page already does, does not satisfy the validator. Opting out matches what Phase 1 did
// on /jobposts/calendar and /checkin/calendar. Revisit with `prefetch: 'runtime'` +
// samples if instant prefetching becomes worth the extra configuration.
export const unstable_instant = false
```

- [ ] **Step 2: Change `app/(app)/interviews/page.tsx`.** Replace line 14:

```ts
export const unstable_instant = { prefetch: 'static' }
```

with:

```ts
// `prefetch: 'static'` fails build-time instant validation on this route, for the same
// reason as /jobposts: the validator requires declared `samples` for the `x-user-id`
// header (read by getSessionProfile() in FeedContent) and the `error` search param (read
// by TopNotice), and `samples` is only accepted alongside `prefetch: 'runtime'`. The
// existing <Suspense> boundaries do not satisfy it. Revisit with `prefetch: 'runtime'`.
export const unstable_instant = false
```

- [ ] **Step 3: Verify with a build.** `npm run build` aborts at `/forgot-password` before any worker reaches these routes, so a plain build proves nothing here. To actually exercise the validator you must temporarily neutralize `/forgot-password` and then put it back. Apply this temporary edit to `app/forgot-password/page.tsx`, replacing line 14:

```ts
  const { error, sent } = await searchParams
```

with:

```ts
  void searchParams
  const error = undefined as string | undefined
  const sent = undefined as string | undefined
```

Then run:

```bash
npm run build 2>&1 | tee /tmp/phase4-build.log

# (1) prerender errors name their route in quotes: `Error: Route "/jobposts" accessed …`
grep -nE 'Route "/(jobposts|interviews)(/[a-z-]+)?"' /tmp/phase4-build.log
# (2) the specific failure Phases 2-3 missed
grep -n 'INSTANT_VALIDATION_ERROR' /tmp/phase4-build.log
# (3) positive control: the build must have run far enough to reach /login
grep -nE 'Route "/login"' /tmp/phase4-build.log
```

Expected: (1) and (2) print **nothing**; (3) prints **at least one line**.

Greps (1) and (2) are the pass/fail signal. Match on `Route "/…"` — with the quotes — rather than on the bare route name: Next.js prints prerender errors in that quoted form, while the route table it prints on a *successful* build lists routes unquoted (`├ ƒ /jobposts`). A bare-name grep would pass today only because the build dies before any route table is printed, and would start reporting false failures the moment Phase 5 fixes `/login` and the build gets far enough to print one.

Grep (3) is the reason this is a real test rather than a vacuous one: silence from (1) and (2) proves nothing if the build aborted before reaching these routes at all. Seeing `/login` fail is the evidence that the export actually walked past `/jobposts` and `/interviews` first. The build still exits non-zero at `/login` (out of scope); that is the expected stopping point. If (3) prints nothing, do not treat (1) and (2) as passing — find out where the build actually stopped.

- [ ] **Step 4: Revert the temporary `/forgot-password` edit.** This is not optional — the stub is a verification aid only and must never be committed.

```bash
git checkout -- app/forgot-password/page.tsx
git status --short
```

Expected: `app/forgot-password/page.tsx` does **not** appear in the output.

- [ ] **Step 5: Run the full unit suite** to confirm the config change broke nothing.

```bash
npm test
```

Expected: all tests pass. Report the actual file/test counts — do not force them to match a prediction.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/jobposts/page.tsx" "app/(app)/interviews/page.tsx"
git commit -m "fix: opt jobposts and interviews out of instant validation

prefetch: 'static' never actually ran during Phases 2-3 because the build
aborts at /forgot-password first. Once it does run, both routes fail with
INSTANT_VALIDATION_ERROR on the x-user-id header and the error search param,
and declared samples require prefetch: 'runtime'. Opt out for now, matching
the calendar pages."
```

---

### Task 2: Convert the `/checkin` feed to the Suspense + use-cache pattern

**Files:**
- Modify: `app/(app)/checkin/page.tsx`
- Modify: `app/(app)/checkin/page.test.tsx`
- Modify: `app/(app)/checkin/actions.ts`
- Modify: `app/(app)/checkin/actions.test.ts`
- Delete: `app/(app)/checkin/loading.tsx`

- [ ] **Step 1: Rewrite the page test first.** Read `app/(app)/checkin/page.test.tsx` in full before editing — it currently mocks `@/lib/supabase/server` and awaits `CheckinPage(...)` because the page is `async` today, both of which change. Note also that the existing `./actions` mock omits `updateCheckinGoals`, which `goals-editor.tsx` imports; the replacement adds it. Replace the whole file with:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    goals: [{ body: '알고리즘 3문제 풀기', status: 'todo', completedAt: null }],
    created_at: '2026-08-10T01:05:00.000Z',
    is_late: true,
    fine_amount: 11000,
  },
]

const comments = [
  { id: 'c1', post_id: 'post-1', author_id: 'admin-1', body: '축하해요', created_at: '2026-08-10T01:10:00.000Z' },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]

vi.mock('next/cache', () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

vi.mock('@/lib/supabase/cache-client', () => ({
  createCacheClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            gte: () => ({
              lt: () => ({ order: async () => ({ data: posts }) }),
            }),
          }),
        }
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
  setGoalStatus: vi.fn(),
  updateCheckinGoals: vi.fn(),
  deleteCheckinPost: vi.fn(),
}))

import CheckinPage, { TopNotice, DayHeader, FeedContent } from './page'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-10T02:00:00.000Z')) // KST 11:00, 2026-08-10
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CheckinPage', () => {
  it('renders the static shell: title and the calendar link', () => {
    const ui = CheckinPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '10시 인증' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '달력 보기' })).toHaveAttribute('href', '/checkin/calendar')
  })
})

describe('TopNotice', () => {
  it('renders the success toast and the error alert from the search params', async () => {
    const ui = await TopNotice({
      searchParamsPromise: Promise.resolve({ success: '인증을 등록했어요', error: '사진이 필요해요' }),
    })
    render(ui)

    expect(screen.getByText('인증을 등록했어요')).toBeInTheDocument()
    expect(screen.getByText('사진이 필요해요')).toBeInTheDocument()
  })

  it('renders neither when no notice params are present', async () => {
    const ui = await TopNotice({ searchParamsPromise: Promise.resolve({}) })
    const { container } = render(ui)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('DayHeader', () => {
  it('defaults to todays KST date, shows the post form, and disables the next-day link', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/checkin?date=2026-08-09')
    expect(screen.queryByRole('link', { name: '▶' })).not.toBeInTheDocument()
  })

  it('hides the post form and shows an active next-day link for a past date', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-09' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 9일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10시 인증하기' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '▶' })).toHaveAttribute('href', '/checkin?date=2026-08-10')
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/checkin?date=2026-08-08')
  })

  it('falls back to todays date for an invalid date parameter', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: 'not-a-date' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('falls back to todays date for a calendrically invalid date parameter', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-02-30' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('clamps a future date parameter to today', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-15' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })

  it('does not clamp a date parameter that exactly equals today', async () => {
    const ui = await DayHeader({ searchParamsPromise: Promise.resolve({ date: '2026-08-10' }) })
    render(ui)

    expect(screen.getByText('2026년 8월 10일 (오늘)')).toBeInTheDocument()
  })
})

describe('FeedContent', () => {
  it('renders the days posts with goals and comments', async () => {
    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('알고리즘 3문제 풀기')).toBeInTheDocument()
    expect(screen.getByText('축하해요')).toBeInTheDocument()
  })

  it("caches todays feed under the day's tag with a seconds lifetime", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')

    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({}) })
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('checkin-feed-2026-08-10')
    expect(cacheLife).toHaveBeenCalledWith('seconds')
  })

  it("caches a past day under that day's tag with a max lifetime", async () => {
    const { cacheTag, cacheLife } = await import('next/cache')

    const ui = await FeedContent({ searchParamsPromise: Promise.resolve({ date: '2026-08-09' }) })
    render(ui)

    expect(cacheTag).toHaveBeenCalledWith('checkin-feed-2026-08-09')
    expect(cacheLife).toHaveBeenCalledWith('max')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run "app/(app)/checkin/page.test.tsx"
```

Expected: FAIL — `TopNotice`, `DayHeader` and `FeedContent` are not exported yet, and `CheckinPage` cannot be called synchronously while it is still `async` and awaits `searchParams` at the top.

- [ ] **Step 3: Rewrite `app/(app)/checkin/page.tsx`** with the whole file below. `DATE_PARAM_PATTERN` and `resolveSelectedDate` are carried over byte-for-byte from the current file — they are the guard that keeps the cache key space bounded.

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinGoal } from '@/lib/checkin/types'
import { getKstDateString, kstDayRangeUtc, shiftKstDateString, formatKstDateHeading } from '@/lib/checkin/time'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'

// `selectedDate` is derived from both the `date` search param and the current time, which
// the instant validator cannot sample — the same situation Phase 1 hit on the two calendar
// pages. See also the note on /jobposts and /interviews: `prefetch: 'static'` additionally
// requires declared `samples` for headers and search params, which only `prefetch: 'runtime'`
// accepts.
export const unstable_instant = false

type CheckinSearchParams = { error?: string; success?: string; date?: string }

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
    return todayKst
  }

  const parsed = new Date(`${dateParam}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateParam) {
    return todayKst
  }

  return dateParam > todayKst ? todayKst : dateParam
}

/**
 * The single place `{ selectedDate, isToday }` is derived. `DayHeader` and `FeedContent` both
 * need it and both stream independently, so keeping the derivation in one function is what
 * stops the clamping rules and the `isToday` comparison from drifting apart between them.
 */
async function resolveDayContext(
  searchParamsPromise: Promise<CheckinSearchParams>
): Promise<{ selectedDate: string; isToday: boolean }> {
  const { date } = await searchParamsPromise
  const todayKst = getKstDateString(new Date().toISOString())
  const selectedDate = resolveSelectedDate(date, todayKst)

  return { selectedDate, isToday: selectedDate === todayKst }
}

/**
 * `isToday` must be passed in rather than computed here: a `'use cache'` scope would freeze
 * its notion of "today" at cache-fill time and keep serving it. It also joins `date` in the
 * cache key, so at KST midnight the same date is re-read under (date, false) as a fresh
 * long-lived entry while the orphaned (date, true) entry expires within 60 seconds.
 *
 * Today's check-ins are a live accountability signal, so they get the `seconds` profile.
 * Note what that actually promises: `revalidate: 1s` is stale-while-revalidate, so another
 * member's first request past the window still gets the previous entry while a fresh one is
 * built, and `stale: 30s` is a *client* router value, so a member sitting on a warm client
 * cache may not consult the server at all for up to 30s. The member who acts sees their own
 * write immediately, because `updateTag` clears the client cache. Earlier days are immutable
 * history and get `max` (revalidate 30 days); `checkin-feed-${date}` lets an action that
 * touches one day invalidate only that day.
 *
 * The second tag, `member-names`, is the escape hatch for the one thing cached here that is
 * not day-scoped: the `profiles` name lookup. Nothing in the app can rename a member today
 * (admin/actions.ts only ever writes `status`), so a rename is an out-of-band DB edit — but
 * without this tag such an edit would show a stale name on past days for up to 30 days with
 * no way to fix it short of a deploy. `revalidateTag('member-names', 'max')` clears every day.
 */
async function getCheckinPosts(date: string, isToday: boolean): Promise<CheckinPost[]> {
  'use cache'
  cacheTag(`checkin-feed-${date}`, 'member-names')

  if (isToday) {
    cacheLife('seconds')
  } else {
    cacheLife('max')
  }

  const supabase = createCacheClient()
  const { start, end } = kstDayRangeUtc(date)

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, photo_url, goals, created_at, is_late, fine_amount')
      .gte('created_at', start)
      .lt('created_at', end)
      .order('created_at', { ascending: false }),
  ])

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

  return (posts ?? []).map((post) => ({
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
}

export default function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<CheckinSearchParams>
}) {
  return (
    <PageShell
      title="10시 인증"
      headerExtra={
        <Link href="/checkin/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<DayHeaderSkeleton />}>
        <DayHeader searchParamsPromise={searchParams} />
      </Suspense>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
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

function DayHeaderSkeleton() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-center">
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

function FeedSkeleton() {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  )
}

/**
 * Reads only the search param — no database access — so the date nav and the post form
 * paint without waiting on the feed's round trip.
 */
export async function DayHeader({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
}) {
  const { selectedDate, isToday } = await resolveDayContext(searchParamsPromise)
  const prevDate = shiftKstDateString(selectedDate, -1)
  const nextDate = shiftKstDateString(selectedDate, 1)

  return (
    <>
      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
        <Link href={`/checkin?date=${prevDate}`} className="underline">
          ◀
        </Link>
        <span className="font-medium">
          {formatKstDateHeading(selectedDate)}
          {isToday ? ' (오늘)' : ''}
        </span>
        {isToday ? (
          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
            ▶
          </span>
        ) : (
          <Link href={`/checkin?date=${nextDate}`} className="underline">
            ▶
          </Link>
        )}
      </div>

      {isToday && <PostForm />}
    </>
  )
}

export async function FeedContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinSearchParams>
}) {
  const { selectedDate, isToday } = await resolveDayContext(searchParamsPromise)

  const [session, checkinPosts] = await Promise.all([
    getSessionProfile(),
    getCheckinPosts(selectedDate, isToday),
  ])
  const isAdmin = session?.role === 'admin'

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {checkinPosts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Delete `app/(app)/checkin/loading.tsx`** — dead code once the page's own Suspense boundaries take over, same as Phase 2's `jobposts/loading.tsx` and Phase 3's `interviews/loading.tsx` removals.

```bash
git rm "app/(app)/checkin/loading.tsx"
```

- [ ] **Step 5: Run the page test to confirm it passes**

```bash
npx vitest run "app/(app)/checkin/page.test.tsx"
```

Expected: PASS — 12 tests (1 `CheckinPage`, 2 `TopNotice`, 6 `DayHeader`, 3 `FeedContent`).

- [ ] **Step 6: Update `app/(app)/checkin/actions.test.ts` before touching the actions.** Read the file in full first. Nine edits, `6a`–`6i`.

Three things to know before making them, because they shape every assertion below:

1. **There is no global fake clock in this file.** `beforeEach` does not call `vi.useFakeTimers()`; individual tests do. Of the tests touched here, only `createCheckinPost`'s `'creates a post with no goals…'` and `setGoalStatus`'s `'sets status to done…'` pin the system time. The rest run on the real wall clock, which is precisely why every `created_at` stub below is a **fixed past date**: it makes the assertions deterministic *and* discriminating.
2. **Every mocked `created_at` for an existing post is `'2026-08-05T01:05:00.000Z'`** (10:05 KST on 2026-08-05), and the matching assertion is `'checkin-feed-2026-08-05'`. Stamping these with today's date would make the tests pass against a broken implementation that tagged `getKstDateString(new Date().toISOString())` instead of the post's own `created_at` — the assertion has to be able to tell the two apart, and a past date is the only thing that does.
3. **The `revalidatePath('/checkin')` assertions become negative assertions.** Per the Architecture section, keeping that call would silently invalidate every cached day on every write and make the per-day tag pointless. `expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')` turns that finding into a regression guard, so a future edit cannot quietly put it back.

**6a.** After `const revalidateTagMock = vi.fn()` (line 13), add:

```ts
const updateTagMock = vi.fn()
```

**6b.** Replace the `next/cache` mock factory:

```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}))
```

with:

```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))
```

**6c.** In `beforeEach` (line 57), replace:

```ts
  insertMock.mockResolvedValue({ error: null })
```

with a chainable stub, because `createCheckinPost` now reads the inserted row back so it can tag by the **database's** `created_at` instead of the app server's clock (Step 8e):

```ts
  // `.insert(...).select('created_at').single()` — the row's timestamp comes from the DB's
  // `now()` default (supabase/migrations/0009_checkin_desk_goal.sql:17), not from Node.
  // This value is deliberately on the KST day *before* the fake clock used in the
  // createCheckinPost tests: 2026-08-09T14:59:59Z is 23:59:59 KST on 2026-08-09, while the
  // fake `now` of 2026-08-10T00:00:00Z is 09:00 KST on 2026-08-10. It is the KST-midnight
  // straddle the fix exists for, so an implementation that tagged from `nowIso` would
  // produce `checkin-feed-2026-08-10` and fail 6d.
  insertMock.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { created_at: '2026-08-09T14:59:59.000Z' }, error: null }),
    }),
  })
```

**6d.** In `describe('createCheckinPost')`, in the test `'creates a post with no goals when goalCount is 0'`, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(revalidateTagMock).toHaveBeenCalledWith('checkin-calendar', 'max')
```

with:

```ts
    // revalidatePath('/checkin') would expire the route's `_N_T_/checkin` implicit tag and
    // discard every cached day, not just this one — see the Architecture section.
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    // revalidatePath('/') stays: it emits only `_N_T_/` + `_N_T_/index`, which belong to the
    // still-dynamic dashboard route and to nothing else.
    expect(revalidatePathMock).toHaveBeenCalledWith('/')
    expect(revalidateTagMock).toHaveBeenCalledWith('checkin-calendar', 'max')
    // Tagged from the row the DB returned (2026-08-09 KST), NOT from `nowIso` (2026-08-10 KST).
    // `is_late: false / fine_amount: 0` above still comes from `nowIso`, which is correct:
    // the fine is computed before the insert and must reflect the moment of submission.
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-09')
```

**6e.** In `describe('addComment')`, replace the whole `'inserts the comment and revalidates the checkin feed'` test with a version that stubs the new `checkin_posts` lookup:

```ts
  it('inserts the comment and revalidates that posts day, not today', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { created_at: '2026-08-05T01:05:00.000Z' }, error: null }),
            }),
          }),
        }
      }
      if (table === 'checkin_comments') {
        return { insert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const formData = new FormData()
    formData.set('body', '축하해요')

    await addComment('post-1', formData)

    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', body: '축하해요' })
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    // The post is from 2026-08-05; this test runs on the real clock, so tagging by "today"
    // could never produce this value.
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')
  })
```

**6f.** In `describe('toggleReaction')`, replace the `mockFindExisting` helper — it currently throws for any table other than `checkin_reactions`, which the new post lookup would trip:

```ts
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { created_at: '2026-08-05T01:05:00.000Z' }, error: null }),
            }),
          }),
        }
      }
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
```

and in the `'inserts a reaction when none exists yet'` test, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
```

with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')
```

**6g.** In `describe('setGoalStatus')`, change the `single()` result in `mockPost` from:

```ts
          eq: () => ({ single: async () => ({ data: { author_id: authorId, goals }, error: null }) }),
```

to:

```ts
          eq: () => ({
            single: async () => ({
              data: { author_id: authorId, goals, created_at: '2026-08-05T01:05:00.000Z' },
              error: null,
            }),
          }),
```

and in the `'sets status to done and stamps completedAt'` test, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
```

with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    // This test *does* pin the clock (2026-08-10T02:00:00Z), which is what makes the
    // 2026-08-05 stub discriminating here: an implementation tagging by "today" would
    // produce checkin-feed-2026-08-10.
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')
```

**6h.** In `describe('updateCheckinGoals')`, change the `single()` result in its `mockPost` from:

```ts
          eq: () => ({ single: async () => ({ data: { author_id: authorId }, error: null }) }),
```

to:

```ts
          eq: () => ({
            single: async () => ({
              data: { author_id: authorId, created_at: '2026-08-05T01:05:00.000Z' },
              error: null,
            }),
          }),
```

and in the `'updates the goals for the post author, preserving each status'` test, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
```

with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')
```

**6i.** In `describe('deleteCheckinPost')`, replace the `mockAdminCheck` helper so `checkin_posts` serves both the new `created_at` read and the delete:

```ts
  function mockAdminCheck(role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      if (table === 'checkin_posts') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { created_at: '2026-08-05T01:05:00.000Z' }, error: null }),
            }),
          }),
          delete: () => ({ eq: deleteEq }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }
```

and in the `'deletes the post when the caller is an admin'` test, replace:

```ts
    expect(revalidatePathMock).toHaveBeenCalledWith('/checkin')
    expect(revalidateTagMock).toHaveBeenCalledWith('checkin-calendar', 'max')
```

with:

```ts
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')
    expect(revalidateTagMock).toHaveBeenCalledWith('checkin-calendar', 'max')
    expect(updateTagMock).toHaveBeenCalledWith('checkin-feed-2026-08-05')
```

- [ ] **Step 7: Run the actions test to confirm it fails**

```bash
npx vitest run "app/(app)/checkin/actions.test.ts"
```

Expected: FAIL, on three distinct fronts — a useful signal that the test edits landed as intended:

- every new `expect(updateTagMock)...` assertion fails, because `actions.ts` does not call `updateTag` yet;
- every new `expect(revalidatePathMock).not.toHaveBeenCalledWith('/checkin')` fails, because the calls are still there;
- the `createCheckinPost` tests fail on the insert chain, because `actions.ts` still `await`s a bare `.insert(...)` while the mock now returns `{ select }` — `{ error }` destructures to `undefined`, so those tests get as far as the missing `updateTag` assertion rather than erroring outright.

- [ ] **Step 8: Wire the per-day invalidation into `app/(app)/checkin/actions.ts`.** Ten edits, `8a`–`8j`.

Two conventions to hold to throughout, so the diff reads as one consistent change:

- **Every `revalidatePath('/checkin')` in this file is deleted**, replaced in the same position by `revalidateCheckinDay(...)`. `revalidatePath('/')` in `createCheckinPost` is the one path call that survives. The reasoning and the source citations are in the Architecture section; do not re-derive them, but do not silently keep the calls either.
- **Every new `.single()` lookup checks the error *and* the row**, matching what this file already does at `setGoalStatus` (`if (fetchError) throw …; if (!post || post.author_id !== user.id) throw …`), `updateCheckinGoals`, and `deleteCheckinPost`'s `callerProfile` check. Checking only `postError` before dereferencing `post.created_at` would be a new, weaker style in a file that is already uniformly defensive — and PostgREST's `.single()` can return `data: null` on a row that RLS filters out. Use the surrounding function's own failure idiom: `redirect(…)` where the function redirects, `throw new Error(…)` where it throws.

**8a.** Change the `next/cache` import from:

```ts
import { revalidatePath, revalidateTag } from 'next/cache'
```

to:

```ts
import { revalidatePath, revalidateTag, updateTag } from 'next/cache'
```

**8b.** Change the `lib/checkin/time` import from:

```ts
import { computeLateFine } from '@/lib/checkin/time'
```

to:

```ts
import { computeLateFine, getKstDateString } from '@/lib/checkin/time'
```

**8c.** Add the helper directly below the imports, above `resolveExtension`:

```ts
// `updateTag`, not `revalidateTag`: a member who posts, comments, reacts or edits a goal
// must see their own write on the very next read. The tag is per KST day so a write to
// today never evicts the long-lived `max` entries cached for earlier days.
//
// This replaces `revalidatePath('/checkin')` rather than joining it. A path call expires the
// route's implicit soft tag `_N_T_/checkin`, and the `use cache` reader discards *every*
// entry older than that tag's expiry when rendering this route (shouldDiscardCacheEntry in
// next/dist/server/use-cache/use-cache-wrapper.js) — so keeping it would throw away all the
// past days on every write and make this helper pointless. `updateTag` still clears the
// client router cache on its own: it routes through the same `revalidate()` helper with an
// undefined profile, which sets `pathWasRevalidated`.
function revalidateCheckinDay(kstDate: string) {
  updateTag(`checkin-feed-${kstDate}`)
}
```

**8d.** In `createCheckinPost`, name the submission timestamp so the fine calculation keeps using it. Change:

```ts
  const { isLate, fineAmount } = computeLateFine(new Date().toISOString())
```

to:

```ts
  // The moment of submission, used for the late-fine calculation only. It is deliberately
  // NOT used to pick the cache tag — see 8e.
  const nowIso = new Date().toISOString()
  const { isLate, fineAmount } = computeLateFine(nowIso)
```

**8e.** In `createCheckinPost`, read the inserted row back and tag from **its** `created_at`, not from `nowIso`. The row's timestamp comes from the column's `default now()` on the database (`supabase/migrations/0009_checkin_desk_goal.sql:17`), so `nowIso` and the stored value are two different clocks: they can disagree by ordinary skew, and — the case that actually bites — a submission at 23:59:59.9 KST can be stamped on the following KST day by the DB, leaving the post filed under a day whose tag was never invalidated. Reading the value back makes the write path and the read path agree by construction. Change:

```ts
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
  revalidateTag('checkin-calendar', 'max')
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
```

to:

```ts
  const { data: inserted, error } = await supabase
    .from('checkin_posts')
    .insert({
      author_id: user.id,
      photo_url: photoUrl,
      goals,
      is_late: isLate,
      fine_amount: fineAmount,
    })
    .select('created_at')
    .single()

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  if (!inserted) {
    redirect('/checkin?error=' + encodeURIComponent('인증을 등록하지 못했어요'))
    return
  }

  // `revalidatePath('/')` stays — the dashboard is still fully dynamic and reads today's
  // checkin_posts. It emits only the `_N_T_/` and `_N_T_/index` soft tags, which belong to
  // the `/` route alone, so it does not touch any checkin, jobposts or interviews cache.
  revalidatePath('/')
  revalidateTag('checkin-calendar', 'max')
  // Tag by the row the database actually wrote, not by `nowIso`.
  revalidateCheckinDay(getKstDateString(inserted.created_at))
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
```

**8f.** In `addComment`, insert a `created_at` lookup after the `if (!user) { ... }` block and before the comment insert, and swap the path revalidation for the per-day tag. Change:

```ts
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

to:

```ts
  const { data: post, error: postError } = await supabase
    .from('checkin_posts')
    .select('created_at')
    .eq('id', postId)
    .single()

  if (postError) {
    redirect('/checkin?error=' + encodeURIComponent(postError.message))
    return
  }

  if (!post) {
    redirect('/checkin?error=' + encodeURIComponent('인증을 찾을 수 없습니다'))
    return
  }

  const { error } = await supabase
    .from('checkin_comments')
    .insert({ post_id: postId, author_id: user.id, body })

  if (error) {
    redirect('/checkin?error=' + encodeURIComponent(error.message))
    return
  }

  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

**8g.** In `toggleReaction`, add the same lookup — this action throws rather than redirecting, so match that style. Change:

```ts
  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
```

to:

```ts
  if (!user) throw new Error('로그인이 필요합니다')

  const { data: post, error: postError } = await supabase
    .from('checkin_posts')
    .select('created_at')
    .eq('id', postId)
    .single()

  if (postError) throw new Error(postError.message)
  if (!post) throw new Error('인증을 찾을 수 없습니다')

  const { data: existing, error: fetchError } = await supabase
```

and change the end of the function from:

```ts
  revalidatePath('/checkin')
}
```

to:

```ts
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

**8h.** In `setGoalStatus`, change:

```ts
    .select('author_id, goals')
```

to:

```ts
    .select('author_id, goals, created_at')
```

No new lookup and no new guard are needed here — this function already fetches the post and already runs `if (fetchError) throw …; if (!post || post.author_id !== user.id) throw …`, so `post.created_at` is safe to dereference by the time it is used. Change the end of the function from:

```ts
  revalidatePath('/checkin')
}
```

to:

```ts
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

**8i.** In `updateCheckinGoals` — same situation, the existing fetch and guards already cover it. Change:

```ts
    .select('author_id')
```

to:

```ts
    .select('author_id, created_at')
```

and the end of that function from:

```ts
  revalidatePath('/checkin')
}
```

to:

```ts
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

**8j.** In `deleteCheckinPost`, the `created_at` must be read **before** the row is deleted. Change:

```ts
  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase.from('checkin_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/checkin')
  revalidateTag('checkin-calendar', 'max')
}
```

to:

```ts
  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { data: post, error: postError } = await supabase
    .from('checkin_posts')
    .select('created_at')
    .eq('id', postId)
    .single()

  if (postError) throw new Error(postError.message)
  if (!post) throw new Error('인증을 찾을 수 없습니다')

  const { error } = await supabase.from('checkin_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidateTag('checkin-calendar', 'max')
  revalidateCheckinDay(getKstDateString(post.created_at))
}
```

After these ten edits, exactly **one** `revalidatePath` *call* should remain in `app/(app)/checkin/actions.ts` — the `revalidatePath('/')` in `createCheckinPost`. Confirm it before moving on:

```bash
grep -n "revalidatePath" "app/(app)/checkin/actions.ts"
```

Expected: exactly two lines — the `import { revalidatePath, revalidateTag, updateTag } from 'next/cache'` line, and one `  revalidatePath('/')`. No `revalidatePath('/checkin')` anywhere. The import keeps `revalidatePath` for that single remaining call.

- [ ] **Step 9: Run the actions test to confirm it passes**

```bash
npx vitest run "app/(app)/checkin/actions.test.ts"
```

Expected: PASS.

- [ ] **Step 10: Typecheck**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 11: Run the full unit suite**

```bash
npm test
```

Expected: all tests pass. Report the actual file/test counts.

- [ ] **Step 12: Verify the build.** As in Task 1 Step 3, a plain build aborts at `/forgot-password` before reaching `/checkin`, so temporarily neutralize it again. Apply the same edit to `app/forgot-password/page.tsx`, replacing:

```ts
  const { error, sent } = await searchParams
```

with:

```ts
  void searchParams
  const error = undefined as string | undefined
  const sent = undefined as string | undefined
```

Then:

```bash
npm run build 2>&1 | tee /tmp/phase4-build.log

grep -nE 'Route "/(checkin|jobposts|interviews)(/[a-z-]+)?"' /tmp/phase4-build.log
grep -n 'INSTANT_VALIDATION_ERROR' /tmp/phase4-build.log
grep -nE 'Route "/login"' /tmp/phase4-build.log
```

Expected: the first two print **nothing** — `/checkin`, `/checkin/calendar`, `/jobposts`, `/jobposts/calendar` and `/interviews` all prerender without an error line — and the third prints at least one line, proving the export actually reached them before stopping. See Task 1 Step 3 for why the match is on the quoted `Route "/…"` form rather than the bare route name. The build still exits non-zero at `/login` (out of scope); that is the expected stopping point.

- [ ] **Step 13: Revert the temporary `/forgot-password` edit**

```bash
git checkout -- app/forgot-password/page.tsx
git status --short
```

Expected: `app/forgot-password/page.tsx` does **not** appear.

- [ ] **Step 14: Commit**

```bash
git add "app/(app)/checkin/page.tsx" "app/(app)/checkin/page.test.tsx" \
  "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "feat: stream the checkin feed with per-day caching

Today's check-ins use the 'seconds' cache profile so members see each
other's posts without a manual cache bust; earlier days use 'max' since
they are immutable history. Each day is tagged checkin-feed-<date> so a
write to today never evicts the long-lived past-day entries.

The per-day tags replace revalidatePath('/checkin') rather than joining
it: a path call expires the route's _N_T_/checkin implicit soft tag, and
the use-cache reader discards every entry older than that tag on the next
render of the route, so keeping both would have evicted all the past days
anyway. updateTag still clears the client router cache. revalidatePath('/')
stays for the still-dynamic dashboard.

Posts are tagged from the created_at the database returns, not from the
app server's clock, so the write and read paths agree across KST midnight."
```

---

### Task 3: Final verification and handoff

**Files:** none (Step 3 creates a new plan doc)

- [ ] **Step 1: Re-run the build and the suite from a clean tree.**

```bash
git status --short
npm test
npm run build 2>&1 | tee /tmp/phase4-final.log
grep -nE 'Route "/(checkin|jobposts|interviews)(/[a-z-]+)?"' /tmp/phase4-final.log
grep -nE 'Route "/forgot-password"' /tmp/phase4-final.log
```

Expected: `git status --short` shows nothing uncommitted; `npm test` passes; the first `grep` prints nothing and the second prints at least one line, confirming the build aborted at `/forgot-password` (it is the first error, and it is out of scope). Note the **positive control differs from Task 2 Step 12 on purpose**: with the `/forgot-password` stub reverted, the build now stops *before* reaching the migrated routes, so silence from the first grep is expected and proves nothing on its own. Task 2 Step 12 is the run that actually exercised those routes; this run only confirms nothing new regressed into the log.

- [ ] **Step 2: Do not merge to `main`.** Same reasoning as Phase 1 Task 9, Phase 2 Task 2 and Phase 3 Task 2: the branch stays red until every route builds clean. Do not merge, do not rebase onto `main`, do not open a PR. Note the status in the handoff report instead.

- [ ] **Step 3: Write the Phase 5 plan** as `docs/superpowers/plans/<today>-instant-navigation-phase5-remaining-routes.md`, using `superpowers:writing-plans`, continuing on this branch. Phase 5 covers the routes that are still blocking the build, none of which is a feed:

  - `/forgot-password` and `/login` — both await `searchParams` at the top of an `async` page with no `<Suspense>`, producing "Uncached data was accessed outside of `<Suspense>`". These are the two confirmed failures and are small, mechanical `TopNotice`-style fixes.
  - `/coding`, `/admin` and `/` — not yet reached by any build in this effort, because the export aborts at the first error. Phase 5's first task should be to determine what, if anything, each of them actually fails on rather than assuming they are broken.

  When Phase 5 converts `/` it must also revisit the `revalidatePath('/')` that Task 2 deliberately left in `createCheckinPost`. It is correct today precisely because `/` is still fully dynamic; the moment the dashboard's queries move into a `'use cache'` scope, the same soft-tag mechanism documented in this plan's Architecture section applies to `_N_T_/`, and the path call should be replaced with an explicit tag on whatever that scope is named. Phase 5 should treat it as part of converting `/`, not as a separate cleanup.

  Phase 5 should also decide whether to revisit `unstable_instant` on `/jobposts`, `/interviews` and `/checkin` with `prefetch: 'runtime'` plus declared `samples` for the `x-user-id` header and the `error`/`success`/`date` search params, now that the `false` opt-out from Task 1 has unblocked the build. That is the only way to get validated instant prefetching on these routes, and it is a design decision rather than a mechanical fix — which is exactly why it was kept out of this plan.

  Phase 5 is also where merging to `main` finally becomes possible: its last task should be a full green `npm run build`, with no temporary `/forgot-password` stub in the tree.

- [ ] **Step 4: Commit the Phase 5 plan**

```bash
git add docs/superpowers/plans/
git commit -m "docs: add Phase 5 instant-navigation plan for the remaining routes"
```
