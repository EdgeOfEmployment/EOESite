# Instant Navigation Phase 3: Interviews Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the same Suspense + `'use cache'` instant-shell pattern from Phase 2 (`docs/superpowers/plans/2026-09-11-instant-navigation-phase2-jobposts-feed.md`) to `/interviews` — the mock-interview session feed. Structurally near-identical to Phase 2's `/jobposts` conversion: `SessionForm`/`SessionCard` instead of `PostForm`/`PostCard`, `interview_sessions`/`interview_participants` instead of `job_posts`/`job_post_reactions`, and no reactions system to worry about.

**Architecture:**
- `app/(app)/interviews/page.tsx` currently does `const { error, success } = await searchParams` directly at the top of an `async` page component with no `<Suspense>` boundary — the same "Uncached data was accessed outside of `<Suspense>`" pattern Phase 1 identified and fixed on the calendar pages. This blocks the build under `cacheComponents: true` exactly like `/jobposts` did before Phase 2.
- Confirmed against `supabase/migrations/0007_interviews.sql`: both `interview_sessions` and `interview_participants` have "Approved members can read ..." policies with no per-row ownership restriction (identical shape to `job_posts`/`job_post_reactions`), so the existing cookie-free `createCacheClient()` (`lib/supabase/cache-client.ts`, added in Phase 1) is safe to use for both tables inside a `'use cache'` function.
- Like `/jobposts`, this page needs `getSessionProfile()` (reads `headers()`, forces dynamic) to compute `isAdmin`/`currentUserId` for the delete button and the "did I join" toggle state. Since `'use cache'` functions cannot call `headers()`, the session read and the cached session-list fetch stay as two separate calls awaited together inside one Suspense-covered async component (`FeedContent`) — the same shape as `jobposts/page.tsx`'s `FeedContent`.
- `SessionForm` (`app/(app)/interviews/session-form.tsx`) needs no session data — it's a plain server component whose only dynamic bit is the `createSession` server action reference — so it renders as part of the **static instant shell**, same as `PostForm` in Phase 2.
- The `Toast`/error `Alert` block depends only on `searchParams`, so it gets its own small, independent `TopNotice` Suspense boundary that resolves without blocking `SessionForm` or the feed — same pattern as `jobposts/page.tsx`.
- Only one new cache tag is needed: `interviews-feed`. Unlike `/jobposts`, there is no `/interviews/calendar` route, so there's no second tag to keep in sync — `createSession`, `toggleParticipation`, and `deleteSession` (the three actions that mutate what the feed renders: title/time/description or participant list) each invalidate `interviews-feed` alone. `createInterviewQa`/`deleteInterviewQa` (in the same `actions.ts`) only affect the `/interviews/[sessionId]` detail page's Q&A list, not anything `/interviews` reads — leave them untouched, matching how Phase 2 left `toggleReaction`'s calendar-irrelevance reasoning but in reverse (here it's the *feed* tag that's irrelevant to the untouched actions, not the calendar tag).
- Verified directly in this session (not assumed from Phase 2's docs): after fixing a stale worktree `.env.local` missing `SUPABASE_SERVICE_ROLE_KEY`, a production build with `app/(app)/jobposts/page.tsx`'s `export const unstable_instant = { prefetch: 'static' }` produced **no** `INSTANT_VALIDATION_ERROR` for `/jobposts` — the more ambitious validated setting (not the `false` opt-out) works once real page content has no `searchParams`/`params`-derived value the validator can't sample. `/interviews`'s primary content (title, time, description, participants) comes entirely from the database, not from `searchParams` — the only `searchParams`-derived part (`TopNotice`) is already isolated in its own Suspense boundary — so this plan uses `{ prefetch: 'static' }` directly instead of defaulting to `false` and revisiting later. Task 1 Step 9 below still includes a fallback in case the validator disagrees for a reason not yet seen.
- Cache invalidation uses `updateTag('interviews-feed')` (not `revalidateTag`), matching Phase 2's read-your-own-writes fix (commit `557ac9e`) — a member creating/joining/leaving/deleting a session on this feed should see their own change immediately, not after one stale read.

**Tech Stack:** Same as Phase 1/2 — Next.js 16.2.12 (App Router, Turbopack, Cache Components already enabled on this branch), React 19, Supabase, Vitest + Testing Library.

---

## Before you start

This plan continues on the same branch/worktree as Phases 1–2 (`C:\kb27\edgeofemployment\EOESite\.claude\worktrees\instant-navigation-foundation`, branch `worktree-instant-navigation-foundation`). Confirm you're there and that `git log --oneline -3` shows Phase 2's `docs: add Phase 1 and Phase 2 instant-navigation implementation plans` (or later) at or near the top before starting Task 1. Do not create a new worktree. Confirm `.env.local` in this worktree has `SUPABASE_SERVICE_ROLE_KEY` set (copy it from the main checkout's `.env.local` if missing — Phase 2 got blocked on exactly this once already) before running any build.

---

### Task 1: Convert `/interviews` feed to the Suspense + use-cache pattern

**Files:**
- Modify: `app/(app)/interviews/page.tsx`
- Modify: `app/(app)/interviews/page.test.tsx`
- Modify: `app/(app)/interviews/actions.ts`
- Modify: `app/(app)/interviews/actions.test.ts`
- Delete: `app/(app)/interviews/loading.tsx`

- [ ] **Step 1: Update the test first.** Read the current `app/(app)/interviews/page.test.tsx` in full before editing (it currently mocks `@/lib/supabase/server` and `@/lib/auth/session` — you're changing what needs mocking). Replace it with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/interviews',
  useRouter: () => ({ replace: vi.fn() }),
}))

const profiles = [
  { id: 'admin-1', name: '관리자' },
  { id: 'user-1', name: '김민수' },
]

const sessions = [
  {
    id: 'session-1',
    created_by: 'user-1',
    title: '2조 모의면접',
    session_at: '2026-08-20T14:00',
    description: 'Zoom 링크',
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

const participants = [{ id: 'p1', session_id: 'session-1', user_id: 'admin-1' }]

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
      if (table === 'interview_sessions') {
        return { select: () => ({ order: async () => ({ data: sessions }) }) }
      }
      if (table === 'interview_participants') {
        return { select: () => ({ in: async () => ({ data: participants }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createSession: vi.fn(),
  toggleParticipation: vi.fn(),
  deleteSession: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

import InterviewsPage, { FeedContent } from './page'

describe('InterviewsPage', () => {
  it('renders the static shell: title and the session form', () => {
    const ui = InterviewsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '모의면접' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
  })
})

describe('FeedContent', () => {
  it('renders the session feed with participant count and tags the cache correctly', async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const ui = await FeedContent()
    render(ui)

    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('참석 1명 (관리자)')).toBeInTheDocument()
    expect(cacheTag).toHaveBeenCalledWith('interviews-feed')
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run "app/(app)/interviews/page.test.tsx"
```

Expected: FAIL — `FeedContent` is not exported yet, and `InterviewsPage` isn't callable synchronously in the current code (it's still `async` and awaits `searchParams` at the top).

- [ ] **Step 3: Rewrite the page**

```tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { SessionForm } from './session-form'
import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'

export const unstable_instant = { prefetch: 'static' }

type InterviewsSearchParams = { error?: string; success?: string }

async function getInterviewSessions(): Promise<InterviewSession[]> {
  'use cache'
  cacheTag('interviews-feed')
  cacheLife('minutes')

  const supabase = createCacheClient()

  const [{ data: profiles }, { data: sessions }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('interview_sessions')
      .select('id, created_by, title, session_at, description, created_at')
      .order('session_at', { ascending: true }),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))
  const sessionIds = (sessions ?? []).map((s) => s.id)

  const { data: participants } = await queryIfAny(sessionIds, () =>
    supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
  )

  return (sessions ?? []).map((s) => ({
    id: s.id,
    createdBy: s.created_by,
    title: s.title,
    sessionAt: s.session_at,
    description: s.description,
    createdAt: s.created_at,
    participants: (participants ?? [])
      .filter((p) => p.session_id === s.id)
      .map((p) => ({ userId: p.user_id, userName: nameById.get(p.user_id) ?? '알 수 없음' })),
  }))
}

export default function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<InterviewsSearchParams>
}) {
  return (
    <PageShell title="모의면접">
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <SessionForm />
      <Suspense fallback={<FeedSkeleton />}>
        <FeedContent />
      </Suspense>
    </PageShell>
  )
}

async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<InterviewsSearchParams>
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

function FeedSkeleton() {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Skeleton className="h-20 w-full" />
        </li>
      ))}
    </ul>
  )
}

export async function FeedContent() {
  const [session, interviewSessions] = await Promise.all([getSessionProfile(), getInterviewSessions()])
  const isAdmin = session?.role === 'admin'

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {interviewSessions.map((s) => (
        <li key={s.id}>
          <SessionCard session={s} currentUserId={session!.userId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Delete `app/(app)/interviews/loading.tsx`** — dead code once the page's own inner Suspense boundaries take over (same reasoning as Phase 2's `jobposts/loading.tsx` removal).

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run "app/(app)/interviews/page.test.tsx"
```

- [ ] **Step 6: Wire cache invalidation in `app/(app)/interviews/actions.ts`.** Read the file first — it currently imports only `revalidatePath` from `next/cache` and has five exported actions; you're only touching the three whose data the `/interviews` feed reads (`createSession`, `toggleParticipation`, `deleteSession`). `createInterviewQa` and `deleteInterviewQa` operate on `/interviews/[sessionId]` Q&A data the feed never displays — leave both untouched.

Change the import:
```ts
import { revalidatePath, updateTag } from 'next/cache'
```

In `createSession`, change:
```ts
  revalidatePath('/interviews')
  redirect('/interviews?success=' + encodeURIComponent('세션을 만들었어요'))
```
to:
```ts
  revalidatePath('/interviews')
  updateTag('interviews-feed')
  redirect('/interviews?success=' + encodeURIComponent('세션을 만들었어요'))
```

In `toggleParticipation`, change:
```ts
  revalidatePath('/interviews')
}
```
(the one at the end of that function) to:
```ts
  revalidatePath('/interviews')
  updateTag('interviews-feed')
}
```

In `deleteSession`, change:
```ts
  revalidatePath('/interviews')
}
```
(the one at the end of that function) to:
```ts
  revalidatePath('/interviews')
  updateTag('interviews-feed')
}
```

- [ ] **Step 7: Update `app/(app)/interviews/actions.test.ts`.** Read the file first. Add an `updateTagMock` alongside the existing `revalidatePathMock`, following Phase 2's `jobposts/actions.test.ts` shape exactly:

Change:
```ts
const revalidatePathMock = vi.fn()
```
to:
```ts
const revalidatePathMock = vi.fn()
const updateTagMock = vi.fn()
```

Change:
```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))
```
to:
```ts
vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
  updateTag: (...args: unknown[]) => updateTagMock(...args),
}))
```

In the `createSession` describe block, in the test `'creates a session with the given title, time, and description'`, add after the existing `expect(redirectMock)...` assertion:
```ts
    expect(updateTagMock).toHaveBeenCalledWith('interviews-feed')
```

In the `toggleParticipation` describe block, in the test `'inserts participation when none exists yet'`, add after the existing `expect(revalidatePathMock)...` assertion:
```ts
    expect(updateTagMock).toHaveBeenCalledWith('interviews-feed')
```

In the `deleteSession` describe block, in the test `'deletes the session when the caller is the creator'`, add after the existing `expect(revalidatePathMock)...` assertion:
```ts
    expect(updateTagMock).toHaveBeenCalledWith('interviews-feed')
```

- [ ] **Step 8: Run `npx tsc --noEmit`** and confirm zero errors.

- [ ] **Step 9: Run `npm run build`** and check the output for `/interviews`. Two possible outcomes:
  - **No error mentioning `/interviews` at all** (build still fails elsewhere, e.g. `/forgot-password`, `/checkin`, `/coding`, `/admin`) — this is success; `unstable_instant = { prefetch: 'static' }` validated cleanly, same as `/jobposts`. Proceed to Step 10.
  - **`INSTANT_VALIDATION_ERROR` naming `/interviews`** — the validator found something this plan's architecture note didn't anticipate. Change `app/(app)/interviews/page.tsx`'s export to the safe fallback used throughout Phase 1/2:
    ```ts
    export const unstable_instant = false
    ```
    Re-run `npm run build` and confirm `/interviews` no longer appears in the error output at all (any error class, not just validation) before proceeding.

  Either way, grep the full build log case-insensitively for "interviews" and confirm no error line references it (a passing route produces no log line at all — silence is the success signal, not a specific message).

- [ ] **Step 10: Run the full unit suite**

```bash
npm test
```

Expected: all tests pass (report the exact count — don't force it to match a prediction).

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/interviews/page.tsx" "app/(app)/interviews/page.test.tsx" "app/(app)/interviews/actions.ts" "app/(app)/interviews/actions.test.ts"
git rm "app/(app)/interviews/loading.tsx"
git commit -m "feat: stream and cache the interviews feed instead of blocking the whole page"
```

---

### Task 2: Final verification and handoff

**Files:** none

- [ ] **Step 1: Run `npm run build` and `npm test` one more time from a clean state.** `npm run build` is still expected to fail on routes outside this plan's and Phases 1–2's scope (e.g. `/forgot-password`, `/checkin`, `/coding`, `/admin`, `/`) — confirm `/interviews`, `/jobposts`, `/jobposts/calendar`, and `/checkin/calendar` all stay clear together in the same run (grep the log for each route name; none should produce an error line).
- [ ] **Step 2: Do not merge to `main` yet** — same reasoning as Phase 1 Task 9 and Phase 2 Task 2. This branch stays red for unmigrated routes until every route builds clean.
- [ ] **Step 3: Write the Phase 4 plan** (`/checkin`'s feed) as a new file in `docs/superpowers/plans/`, using `superpowers:writing-plans` again, continuing from this branch. Unlike the calendar and both feeds done so far, `/checkin`'s feed has a "today must stay fresh, past days are cacheable" wrinkle — today's check-ins need to reflect new posts without a manual cache-bust, while older days are safe to cache for longer — that deserves its own design pass rather than reusing this plan's shape verbatim. This was intentionally deferred out of Phase 2 and again out of this plan for the same reason.
