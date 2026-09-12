# Instant Navigation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn on Next.js Cache Components (`cacheComponents: true`) across the app, fix the one shared blocker that currently prevents *every* route from having any static shell at all, and prove the whole "instant shell + streamed content + shared server-side caching" pattern end-to-end on the two lowest-risk pages (`/checkin/calendar`, `/jobposts/calendar`) plus e2e coverage that will catch regressions in later phases.

This is **Phase 1 of a larger effort**. It does not yet touch: the three "feed" pages (checkin/interviews/jobposts), the coding board, the dashboard, the admin page, or any `useOptimistic` conversion. Those are separate follow-up plans, written after this one lands, because each is materially different (session-heavy branching, mutation-heavy interactions) and this repo's plan convention (see `docs/superpowers/plans/`) is one plan per coherent slice of work.

**Architecture:**
- Confirmed by actually running `next build` with the flag on against this exact codebase (not guessed from docs): the shared `<Nav />` in `app/(app)/layout.tsx` calls `usePathname()` with no `<Suspense>` boundary around it, which Next.js's build-time validator flags as "Uncached data was accessed outside of `<Suspense>`" — this single component blocks the static shell for **every** route in the app. Wrapping it in `<Suspense>` is step one and unblocks everything downstream.
- Every `page.tsx` that does `const { ... } = await searchParams` (or `await params`) directly at the top of the component, with no `<Suspense>` boundary, hits the same error. The fix is always the same shape: keep the page component synchronous, pass the `searchParams`/`params` promise down into a small `async` inner component, and wrap that inner component in `<Suspense fallback={...}>`.
- `'use cache'` functions cannot call `cookies()` or `headers()`, directly or transitively (confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`). The existing `lib/supabase/server.ts#createClient()` calls `cookies()` internally, so it **cannot** be used inside a `'use cache'` scope. For data that's safe to share across requests, this plan introduces a second, cookie-free Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` (the same credential already used in `app/api/github-webhook/route.ts`), used *only* inside `'use cache'` functions for tables whose RLS policy already grants read access to any approved member (checked directly against `supabase/migrations/*.sql`: `profiles`, `checkin_posts`, `job_posts` all have "Approved members can read ..." policies with no per-row ownership restriction). Since `proxy.ts` already redirects unauthenticated/unapproved/wrong-role requests before they reach any page (`lib/auth/access.ts#getRedirectPath`), using the service-role client for these specific reads exposes nothing beyond what any already-approved member's own session could already read.
- Cache invalidation uses `next/cache`'s `cacheTag` (set inside the cached function) + `revalidateTag` (called from the server actions that mutate the underlying rows). `revalidateTag` gives stale-while-revalidate semantics, which is fine for a calendar view (not read-your-own-writes critical) — `updateTag` is reserved for later phases where a user needs to see their own write instantly (e.g. coding board self-complete).
- `unstable_instant` (a `version: draft` / experimental route-segment-config export) was tried on both calendar pages to get Next's build-time validation that the static shell really is instant at every navigation entry point, and it misbehaved exactly as flagged as a risk: with `{ prefetch: 'static' }`, the build fails because `year`/`month` are derived from `searchParams` with a `new Date()` fallback, and validation refuses to simulate that; switching to `{ prefetch: 'runtime', samples: [...] }` (as the error message itself suggests) cascades into a second error (`new Date()` used before reading `connection()`/uncached data), which would require reworking how the current-month default is computed just to satisfy the validator. Given this is a `draft`-status API and the underlying Suspense/`use cache` architecture works correctly independent of it, both calendar pages set `export const unstable_instant = false` instead — this opts out of the build-time validation safety net but keeps the actual instant-shell behavior. Revisit turning validation back on for these two routes once the `prefetch: 'runtime'` + `samples` path is less fragile (or once the current-month default is restructured to read from a Suspense-covered dynamic source instead of a bare `new Date()`), tracked as a Phase-2-or-later follow-up, not blocking here.

**Tech Stack:** Next.js 16.2.12 (App Router, Turbopack), React 19, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Vitest + Testing Library (existing unit tests), Playwright + `@next/playwright` (new, for `instant()` e2e assertions).

---

## Before you start

Run `git status --short` and confirm it's clean, then confirm which branch you're on with `git branch --show-current`. All work in this plan happens on a dedicated branch/worktree — do not do this on `main` directly (Task 1 creates and switches into it).

---

### Task 1: Isolate the work in a worktree

**Files:** none (git operations only)

- [ ] **Step 1: Create a worktree with a new branch**

```bash
git worktree add ../EOESite-instant-nav -b feature/instant-navigation-foundation
```

- [ ] **Step 2: Install dependencies fresh inside the worktree**

Do **not** junction/symlink `node_modules` in from the original checkout — confirmed directly (by running `next build` against a worktree set up that way) that Turbopack refuses to resolve packages through it: `TurbopackInternalError: Symlink [project]/node_modules is invalid, it points out of the filesystem root`. A real, separate `node_modules` is required:

```bash
cd ../EOESite-instant-nav && npm ci
```

- [ ] **Step 3: Copy local env file into the worktree (it's gitignored, so the worktree won't have it)**

```bash
cp ../EOESite/.env.local ../EOESite-instant-nav/.env.local
```

- [ ] **Step 4: From here on, run every command in this plan from inside `../EOESite-instant-nav`, not the original checkout.**

- [ ] **Step 5: Verify the worktree builds untouched, before making any changes**

```bash
npm run build
```

Expected: succeeds exactly as it does on `main` today (no `cacheComponents` yet, so no new errors).

---

### Task 2: Fix the shared Nav blocker

**Files:**
- Modify: `app/(app)/layout.tsx`

This is the single fix that unblocks static-shell rendering for every route in the app. Do this *before* turning on `cacheComponents`, so the flag flip in Task 3 doesn't immediately break the build.

- [ ] **Step 1: Wrap `<Nav />` in a `<Suspense>` boundary with a same-height fallback (avoids layout shift — the real nav is 65px tall: `py-4` = 32px + content ~33px)**

```tsx
import { Suspense } from 'react'
import { Nav } from '@/components/nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<div className="h-[65px] border-b border-gray-200 dark:border-gray-800" />}>
        <Nav />
      </Suspense>
      {children}
    </>
  )
}
```

- [ ] **Step 2: Run the existing test suite to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass (this change has no test coverage of its own yet — that's fine, it's covered by the e2e test in Task 8, which asserts the nav renders as part of the instant shell).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "fix: wrap Nav in Suspense so it doesn't block the static shell"
```

---

### Task 3: Enable Cache Components

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add the flag**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
```

- [ ] **Step 2: Run a production build**

```bash
npm run build
```

Expected: **fails** with a "blocking-route" error on the first page.tsx that awaits `searchParams`/`params` at the top level without a Suspense boundary (e.g. `/forgot-password`, `/coding`, `/checkin/calendar`). This is expected — Tasks 4–6 fix the two routes this plan covers. Every *other* route will keep failing the build with `cacheComponents` on until its own phase lands; that's fine, because Task 3's flag only needs to be flipped once the whole app is ready. **Do not merge this branch until all routes are fixed** — track that in the handoff note at the end of this plan.

- [ ] **Step 3: Commit anyway (the repo is expected to be build-broken mid-migration on this branch — that's the point of doing it on a branch)**

```bash
git add next.config.ts
git commit -m "feat: enable Cache Components (build intentionally red until full migration lands)"
```

---

### Task 4: Add the service-role cache client

**Files:**
- Create: `lib/supabase/cache-client.ts`
- Test: `lib/supabase/cache-client.test.ts`

This client has no per-request state (no cookies), so — unlike `lib/supabase/server.ts#createClient()` — it's safe to call from inside a `'use cache'` function. Only use it for tables where RLS already grants broad "any approved member can read" access (verify this against `supabase/migrations/*.sql` before adding a new call site in a later phase).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'

const createClientMock = vi.fn(() => ({ marker: 'service-role-client' }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

import { createCacheClient } from './cache-client'

describe('createCacheClient', () => {
  it('builds a client with the service-role key, not the anon key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret'

    createCacheClient()

    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-secret'
    )
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run lib/supabase/cache-client.test.ts
```

Expected: FAIL — `Cannot find module './cache-client'`.

- [ ] **Step 3: Implement it**

```ts
import { createClient } from '@supabase/supabase-js'

/**
 * Cookie-free Supabase client for use inside `'use cache'` scopes, which cannot
 * call cookies()/headers() (directly or transitively). Only call this for tables
 * whose RLS policy already grants read access to any approved member with no
 * per-row ownership restriction — check supabase/migrations/*.sql first. Every
 * route that reaches a `'use cache'` function using this client is already
 * gated by proxy.ts (unauthenticated/unapproved requests never get this far),
 * so this does not expose anything beyond what an approved member's own
 * session could already read.
 */
export function createCacheClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run lib/supabase/cache-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/cache-client.ts lib/supabase/cache-client.test.ts
git commit -m "feat: add cookie-free Supabase client for use-cache scopes"
```

---

### Task 5: Convert `/checkin/calendar` to the Suspense + use-cache pattern

**Files:**
- Modify: `app/(app)/checkin/calendar/page.tsx`
- Modify: `app/(app)/checkin/calendar/page.test.tsx`
- Modify: `app/(app)/checkin/actions.ts`

The month heading text ("인증 달력 (2026년 8월)") currently reads as one static-looking string, but the year/month come from `searchParams`, so they can't be part of the instant shell. This step splits it: the page title becomes the static "인증 달력" (part of the instant shell, along with the "← 인증으로 돌아가기" link), and the specific "2026년 8월" line moves inside the `Suspense`-covered content, next to the calendar itself.

- [ ] **Step 1: Update the test first, to describe the new (split) heading structure**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', created_at: '2026-08-10T00:00:00.000Z', is_late: true }]

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
        return { select: () => ({ gte: () => ({ lt: async () => ({ data: posts }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

import CheckinCalendarPage, { CalendarContent } from './page'

describe('CheckinCalendarPage', () => {
  it('renders the static shell: title, view toggle, and a link back to the checkin feed', () => {
    const ui = CheckinCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '인증 달력' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 인증으로 돌아가기' })).toHaveAttribute('href', '/checkin')
  })
})

describe('CalendarContent', () => {
  it('renders the month label, the view toggle, and the calendar', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
  })

  it('shows the member view grouped by author when view=member', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8', view: 'member' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '김민수' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run "app/(app)/checkin/calendar/page.test.tsx"
```

Expected: FAIL — `CalendarContent` is not exported, and the old combined heading text no longer exists.

- [ ] **Step 3: Rewrite the page**

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'

export const unstable_instant = false

type CheckinCalendarSearchParams = { year?: string; month?: string; view?: string }

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 1)).toISOString()
  return { start, end }
}

async function getCalendarPosts(year: number, month: number): Promise<CalendarPost[]> {
  'use cache'
  cacheTag('checkin-calendar')
  cacheLife('minutes')

  const { start, end } = monthRange(year, month)
  const supabase = createCacheClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, created_at, is_late')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    createdAt: post.created_at,
    isLate: post.is_late,
  }))
}

export default function CheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<CheckinCalendarSearchParams>
}) {
  return (
    <PageShell
      title="인증 달력"
      width="3xl"
      headerExtra={
        <Link href="/checkin" className="text-sm text-gray-500 underline dark:text-gray-400">
          ← 인증으로 돌아가기
        </Link>
      }
    >
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

function CalendarSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export async function CalendarContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<CheckinCalendarSearchParams>
}) {
  const params = await searchParamsPromise
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const calendarPosts = await getCalendarPosts(year, month)

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">
        {year}년 {month}월
      </h2>
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName}
                          {post.isLate ? ' · 지각' : ''}
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.createdAt.slice(0, 10)}
                    {post.isLate ? ' · 지각' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run "app/(app)/checkin/calendar/page.test.tsx"
```

Expected: PASS.

- [ ] **Step 5: Wire cache invalidation — add `revalidateTag('checkin-calendar', 'max')` everywhere `checkin_posts` rows are created or deleted (confirmed by reading `app/(app)/checkin/actions.ts`: only `createCheckinPost` and `deleteCheckinPost` touch fields the calendar reads — `addComment`, `toggleReaction`, `setGoalStatus`, and `updateCheckinGoals` don't and are left untouched)**

In `app/(app)/checkin/actions.ts`, change the import:

```ts
import { revalidatePath, revalidateTag } from 'next/cache'
```

In `createCheckinPost`, right after the existing `revalidatePath('/')` call (currently line 77):

```ts
  revalidatePath('/checkin')
  revalidatePath('/')
  revalidateTag('checkin-calendar', 'max')
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
```

In `deleteCheckinPost`, right after the existing `revalidatePath('/checkin')` call (currently line 230):

```ts
  revalidatePath('/checkin')
  revalidateTag('checkin-calendar', 'max')
}
```

- [ ] **Step 6: Update `app/(app)/checkin/actions.test.ts` to assert the new calls (read the existing file first to match its mocking style before editing — it already mocks `next/cache`'s `revalidatePath`, so add `revalidateTag` to that same mock and assert it's called with `'checkin-calendar'` in the `createCheckinPost` and `deleteCheckinPost` test cases).**

- [ ] **Step 7: Run the full unit suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/checkin/calendar/page.tsx" "app/(app)/checkin/calendar/page.test.tsx" "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts"
git commit -m "feat: stream and cache the checkin calendar instead of blocking the whole page"
```

---

### Task 6: Convert `/jobposts/calendar` the same way

**Files:**
- Modify: `app/(app)/jobposts/calendar/page.tsx`
- Modify: `app/(app)/jobposts/calendar/page.test.tsx`
- Modify: `app/(app)/jobposts/actions.ts`

Identical shape to Task 5. Do not skip re-reading the current file contents first — this task's diff assumes the file looks exactly like what was read earlier in this plan; if it has drifted, adapt accordingly rather than blindly pasting.

- [ ] **Step 1: Update the test first**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', company_name: '토스', post_date: '2026-08-12' }]

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
      if (table === 'job_posts') {
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

import JobPostsCalendarPage, { CalendarContent } from './page'

describe('JobPostsCalendarPage', () => {
  it('renders the static shell: title and view toggle', () => {
    const ui = JobPostsCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '자소서 달력' })).toBeInTheDocument()
  })
})

describe('CalendarContent', () => {
  it('renders the month label and view toggle', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByText('2026년 8월')).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
  })

  it('shows the member view grouped by author when view=member', async () => {
    const ui = await CalendarContent({
      searchParamsPromise: Promise.resolve({ year: '2026', month: '8', view: 'member' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '김민수' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run "app/(app)/jobposts/calendar/page.test.tsx"
```

- [ ] **Step 3: Rewrite the page**

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { buildMonthCalendar, groupPostsByMember, type CalendarJobPost } from '@/lib/jobposts/calendar'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'

export const unstable_instant = false

type JobPostsCalendarSearchParams = { year?: string; month?: string; view?: string }

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  return { start, end }
}

async function getCalendarPosts(year: number, month: number): Promise<CalendarJobPost[]> {
  'use cache'
  cacheTag('jobposts-calendar')
  cacheLife('minutes')

  const { start, end } = monthRange(year, month)
  const supabase = createCacheClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, company_name, post_date')
      .gte('post_date', start)
      .lt('post_date', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    companyName: post.company_name,
    postDate: post.post_date,
  }))
}

export default function JobPostsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<JobPostsCalendarSearchParams>
}) {
  return (
    <PageShell title="자소서 달력" width="3xl">
      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

function CalendarSkeleton() {
  return (
    <div>
      <Skeleton className="mb-4 h-5 w-24" />
      <div className="mb-4 flex gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export async function CalendarContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<JobPostsCalendarSearchParams>
}) {
  const params = await searchParamsPromise
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const calendarPosts = await getCalendarPosts(year, month)

  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">
        {year}년 {month}월
      </h2>
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`/jobposts/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`/jobposts/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName} · {post.companyName}
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.postDate} · {post.companyName}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run "app/(app)/jobposts/calendar/page.test.tsx"
```

- [ ] **Step 5: Wire cache invalidation in `app/(app)/jobposts/actions.ts`**

Change the import:

```ts
import { revalidatePath, revalidateTag } from 'next/cache'
```

In `createJobPost`, right after the existing `revalidatePath('/jobposts')` call (currently line 68):

```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar', 'max')
  redirect('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
```

In `deleteJobPost`, right after the existing `revalidatePath('/jobposts')` call (currently line 122):

```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar', 'max')
}
```

`toggleReaction` doesn't touch calendar-relevant fields — leave it untouched.

- [ ] **Step 6: Update `app/(app)/jobposts/actions.test.ts` to assert the new `revalidateTag` calls, following the same approach as Task 5 Step 6.**

- [ ] **Step 7: Run the full unit suite**

```bash
npm test
```

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/jobposts/calendar/page.tsx" "app/(app)/jobposts/calendar/page.test.tsx" "app/(app)/jobposts/actions.ts" "app/(app)/jobposts/actions.test.ts"
git commit -m "feat: stream and cache the jobposts calendar instead of blocking the whole page"
```

---

### Task 7: First full build-and-verify checkpoint

**Files:** none

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: still fails, but now only on routes this plan doesn't cover yet (e.g. `/coding`, `/checkin`, `/interviews`, `/admin`, `/`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/pending`). Read the error output and confirm the *only* two calendar routes are clean — do not proceed to Task 8 until `/checkin/calendar` and `/jobposts/calendar` no longer appear in the build's error list. If either still appears, stop and re-check Task 5/6 against the actual current file contents (they may have drifted from what this plan assumed).

- [ ] **Step 2: Run `next dev` and manually check both pages in a browser**

```bash
npm run dev
```

Visit `http://localhost:3000/checkin/calendar` and `http://localhost:3000/jobposts/calendar` (log in first with a real approved account). Confirm: the nav and page title/back-link appear immediately, a brief skeleton shows where the calendar grid will be, then the calendar renders. Confirm switching between "날짜별"/"멤버별" and changing month via URL still works.

---

### Task 8: Playwright + `@next/playwright` e2e infrastructure

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/global-setup.ts`
- Create: `e2e/instant-calendar.spec.ts`
- Modify: `package.json`

This app gates every route through `proxy.ts`, which trusts a signed `eoe-session-cache` cookie (see `lib/auth/session-cache.ts`). Rather than driving the real login form (which needs a real Supabase user and is slow), the e2e global setup signs that cookie directly using `SESSION_CACHE_SECRET` from `.env.local` and injects it into the browser context — this authenticates as an approved member without touching Supabase auth at all. Because both calendar pages now read their data through the service-role `createCacheClient()` (Task 4), this is sufficient to see real page content; no Supabase login step is needed.

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-dev @playwright/test @next/playwright
npx playwright install chromium
```

- [ ] **Step 2: Add the `test:e2e` script to `package.json`**

```json
    "test": "vitest run",
    "test:e2e": "playwright test"
```

- [ ] **Step 3: Write the Playwright config**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'e2e/.auth/approved-member.json',
  },
})
```

- [ ] **Step 4: Write the global setup that fabricates an authenticated session**

```ts
import { chromium, type FullConfig } from '@playwright/test'
import { signSessionCache } from '../lib/auth/session-cache'

export default async function globalSetup(config: FullConfig) {
  const secret = process.env.SESSION_CACHE_SECRET
  if (!secret) {
    throw new Error('SESSION_CACHE_SECRET must be set in .env.local for e2e tests to authenticate')
  }

  const token = signSessionCache(
    { userId: '00000000-0000-0000-0000-000000000000', role: 'member', status: 'approved' },
    secret,
    Date.now()
  )

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000'
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies([
    {
      name: 'eoe-session-cache',
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
  await context.storageState({ path: 'e2e/.auth/approved-member.json' })
  await browser.close()
}
```

- [ ] **Step 5: Write the instant-navigation e2e test**

```ts
import { test, expect } from '@playwright/test'
import { instant } from '@next/playwright'

test.describe('calendar pages navigate instantly', () => {
  test('checkin calendar shell appears before data resolves', async ({ page }) => {
    await page.goto('/checkin')

    await instant(page, async () => {
      await page.getByRole('link', { name: '달력' }).click()
      await expect(page.getByRole('heading', { name: '인증 달력' })).toBeVisible()
    })

    await expect(page.getByText(/\d{4}년 \d{1,2}월/)).toBeVisible()
  })

  test('jobposts calendar shell appears before data resolves', async ({ page }) => {
    await page.goto('/jobposts')

    await instant(page, async () => {
      await page.getByRole('link', { name: '달력' }).click()
      await expect(page.getByRole('heading', { name: '자소서 달력' })).toBeVisible()
    })

    await expect(page.getByText(/\d{4}년 \d{1,2}월/)).toBeVisible()
  })
})
```

If `/checkin` or `/jobposts` don't currently have a link literally named "달력" to their calendar view, read those two page files first and adjust the `getByRole('link', ...)` selector to match whatever the real link text/href is (search for `href="/checkin/calendar"` and `href="/jobposts/calendar"`).

- [ ] **Step 6: Add `e2e/.auth/` and `playwright-report/` and `test-results/` to `.gitignore`**

- [ ] **Step 7: Run the e2e suite**

```bash
npm run test:e2e
```

Expected: both tests pass. If `SESSION_CACHE_SECRET` or Supabase env vars aren't set in your local `.env.local`, this will fail with a clear error rather than a mysterious timeout — fix the env file, don't work around it in test code.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json .gitignore
git commit -m "test: add Playwright instant-navigation e2e coverage for calendar pages"
```

---

### Task 9: Final verification and handoff

**Files:** none

- [ ] **Step 1: Run everything one more time from a clean state**

```bash
npm test
npm run build
npm run test:e2e
```

`npm run build` is still expected to fail on routes outside this plan's scope (see Task 7) — confirm the failing route list matches what Task 7 found, i.e. no new routes broke and the two calendar routes stay clean.

- [ ] **Step 2: Do not merge to `main` yet.** `cacheComponents: true` is now committed on this branch, and the production build is red for every route this plan didn't touch. Merging now would break `main`'s build. Use the `superpowers:finishing-a-development-branch` skill to decide how to land this — most likely: keep this branch alive as the base for Phase 2's plan (feed pages: checkin/interviews/jobposts), which will fix the next batch of routes, and only merge to `main` once every route builds clean with the flag on.

- [ ] **Step 3: Write the Phase 2 plan** (checkin/interviews/jobposts feed pages — the "cached shared list + dynamic per-user overlay" split identified during grilling) as a new file in `docs/superpowers/plans/`, using `superpowers:writing-plans` again, continuing from this branch.
