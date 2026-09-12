# Instant Navigation Phase 2: Jobposts Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the same Suspense + `'use cache'` instant-shell pattern from Phase 1 (`docs/superpowers/plans/2026-09-11-instant-navigation-foundation.md`) to `/jobposts` — the main feed page, not the calendar. This is the first "feed" page (shared cached list + per-user session-dependent bits) converted, proving the pattern before it's replicated to `/interviews` and `/checkin` in later phases.

**Architecture:**
- `/jobposts` differs from the calendar pages in one structural way: it needs `getSessionProfile()` (reads `headers()`, forces dynamic) to compute `isAdmin`/`currentUserId`, which control per-post delete buttons and "did I react to this" highlighting. `'use cache'` functions cannot call `headers()` (same constraint already hit and solved in Phase 1), so the session read and the cached list fetch stay in separate function calls, both awaited together inside one Suspense-covered async component (`FeedContent`) — simpler than a two-boundary split, and consistent with how `CalendarContent` already awaits both `searchParams` and a `'use cache'` data function together.
- `PostForm` (`app/(app)/jobposts/post-form.tsx`) needs no session data at all — it's already a self-contained Client Component — so it renders as part of the **static instant shell**, unlike the calendar pages where the entire body was dynamic.
- The `Toast`/error `Alert` block depends only on `searchParams` (not the cached list, not session), so it gets its own small, independent Suspense boundary (`TopNotice`) that resolves quickly and doesn't block `PostForm` or the feed — this mirrors the docs' "sibling Suspense boundaries stream independently" pattern (see `node_modules/next/dist/docs/01-app/02-guides/streaming.md`, "Parallel streaming with sibling boundaries").
- Two independent cache tags exist for jobposts data now: `jobposts-calendar` (Phase 1, unaffected by this plan) and a new `jobposts-feed` tag introduced here. **Unlike the calendar page, `toggleReaction` DOES need to invalidate `jobposts-feed`** — the feed renders reaction counts and highlights the caller's own reaction, while the calendar view never showed reactions at all. `createJobPost` and `deleteJobPost` must invalidate **both** tags, since they affect both views; `toggleReaction` invalidates only `jobposts-feed`.
- `export const unstable_instant = false` is used directly (not `{ prefetch: 'static' }`), per the Phase 1 finding that the `'static'` prefetch validator fails on any route deriving values from request-time data it can't sample — carrying that lesson forward without re-discovering it.

**Tech Stack:** Same as Phase 1 — Next.js 16.2.12 (App Router, Turbopack, Cache Components already enabled on this branch), React 19, Supabase, Vitest + Testing Library.

---

## Before you start

This plan continues on the same branch/worktree as Phase 1 (`C:\kb27\edgeofemployment\EOESite\.claude\worktrees\instant-navigation-foundation`, branch `worktree-instant-navigation-foundation`). Confirm you're there and that `git log --oneline -3` shows Phase 1's Task 8 commits at the top before starting Task 1 below. Do not create a new worktree.

---

### Task 1: Convert `/jobposts` feed to the Suspense + use-cache pattern

**Files:**
- Modify: `app/(app)/jobposts/page.tsx`
- Modify: `app/(app)/jobposts/page.test.tsx`
- Modify: `app/(app)/jobposts/actions.ts`
- Modify: `app/(app)/jobposts/actions.test.ts`
- Delete: `app/(app)/jobposts/loading.tsx`

- [ ] **Step 1: Update the test first.** Read the current `app/(app)/jobposts/page.test.tsx` in full before editing (it currently mocks `@/lib/supabase/server`, `@/lib/auth/session`, and `./actions` — you're changing what needs mocking). Replace it with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/jobposts',
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
    post_date: '2026-08-13',
    company_name: '토스',
    posting_info: '백엔드 신입',
    questions: [{ question: '지원동기를 작성해주세요', answer: '문제 해결에 흥미를 느꼈습니다.' }],
    feedback_requested: true,
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

const reactions = [{ id: 'r1', post_id: 'post-1', author_id: 'admin-1', emoji: '👍' }]
const feedbackDocs = [{ id: 'doc-1', job_post_id: 'post-1' }]

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
        return { select: () => ({ order: async () => ({ data: posts }) }) }
      }
      if (table === 'job_post_reactions') {
        return { select: () => ({ in: async () => ({ data: reactions }) }) }
      }
      if (table === 'feedback_docs') {
        return { select: () => ({ in: async () => ({ data: feedbackDocs }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
  toggleReaction: vi.fn(),
  deleteJobPost: vi.fn(),
}))

vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))

import JobPostsPage, { FeedContent } from './page'

describe('JobPostsPage', () => {
  it('renders the static shell: title, calendar link, and the post form', () => {
    const ui = JobPostsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('heading', { name: '자소서 / 공고' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '달력 보기' })).toHaveAttribute('href', '/jobposts/calendar')
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })
})

describe('FeedContent', () => {
  it('renders the feed with the question, answer, and feedback link, and tags the cache correctly', async () => {
    const { cacheTag, cacheLife } = await import('next/cache')
    const ui = await FeedContent()
    render(ui)

    expect(screen.getByText('지원동기를 작성해주세요')).toBeInTheDocument()
    expect(screen.getByText('문제 해결에 흥미를 느꼈습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
    expect(cacheTag).toHaveBeenCalledWith('jobposts-feed')
    expect(cacheLife).toHaveBeenCalledWith('minutes')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
npx vitest run "app/(app)/jobposts/page.test.tsx"
```

Expected: FAIL — `FeedContent` is not exported yet, and `JobPostsPage` isn't called synchronously in the current code.

- [ ] **Step 3: Rewrite the page**

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { getSessionProfile } from '@/lib/auth/session'
import { createCacheClient } from '@/lib/supabase/cache-client'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { Skeleton } from '@/components/skeleton'

export const unstable_instant = false

type JobPostsSearchParams = { error?: string; success?: string }

async function getJobPosts(): Promise<JobPost[]> {
  'use cache'
  cacheTag('jobposts-feed')
  cacheLife('minutes')

  const supabase = createCacheClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, post_date, company_name, posting_info, questions, feedback_requested, created_at')
      .order('created_at', { ascending: false }),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))
  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: reactions }, { data: feedbackDocs }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
    queryIfAny(postIds, () =>
      supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds)
    ),
  ])

  const feedbackDocIdByPost = new Map((feedbackDocs ?? []).map((d) => [d.job_post_id, d.id as string]))

  return (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    postDate: post.post_date,
    companyName: post.company_name,
    postingInfo: post.posting_info,
    questions: post.questions,
    feedbackRequested: post.feedback_requested,
    feedbackDocId: feedbackDocIdByPost.get(post.id) ?? null,
    createdAt: post.created_at,
    reactions: (reactions ?? [])
      .filter((r) => r.post_id === post.id)
      .map((r) => ({ id: r.id, authorId: r.author_id, emoji: r.emoji })),
  }))
}

export default function JobPostsPage({
  searchParams,
}: {
  searchParams: Promise<JobPostsSearchParams>
}) {
  return (
    <PageShell
      title="자소서 / 공고"
      headerExtra={
        <Link href="/jobposts/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Suspense fallback={null}>
        <TopNotice searchParamsPromise={searchParams} />
      </Suspense>
      <PostForm />
      <Suspense fallback={<FeedSkeleton />}>
        <FeedContent />
      </Suspense>
    </PageShell>
  )
}

async function TopNotice({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<JobPostsSearchParams>
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
          <Skeleton className="h-28 w-full" />
        </li>
      ))}
    </ul>
  )
}

export async function FeedContent() {
  const [session, jobPosts] = await Promise.all([getSessionProfile(), getJobPosts()])
  const isAdmin = session?.role === 'admin'

  return (
    <ul className="mt-6 flex flex-col gap-4">
      {jobPosts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Delete `app/(app)/jobposts/loading.tsx`** — dead code once the page's own inner Suspense boundaries take over (same reasoning as Phase 1's calendar `loading.tsx` removals).

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run "app/(app)/jobposts/page.test.tsx"
```

- [ ] **Step 6: Wire cache invalidation in `app/(app)/jobposts/actions.ts`.** Read the file first (it was already modified in Phase 1 to invalidate `jobposts-calendar` — you're adding `jobposts-feed` alongside it, not replacing anything).

In `createJobPost`, change:
```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar')
```
to:
```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar')
  revalidateTag('jobposts-feed')
```
(still before its `redirect(...)` call).

In `deleteJobPost`, change:
```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar')
```
to:
```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-calendar')
  revalidateTag('jobposts-feed')
```

In `toggleReaction` (which currently only has `revalidatePath('/jobposts')` and no tag calls at all — it was correctly left untouched in Phase 1 since the calendar doesn't show reactions), add:
```ts
  revalidatePath('/jobposts')
  revalidateTag('jobposts-feed', 'max')
```

**Reminder from Phase 1 (do not repeat this mistake): `revalidateTag` requires exactly two arguments in this Next.js version — `revalidateTag('jobposts-feed', 'max')`, never a single-argument call.** Run `npx tsc --noEmit` after this step specifically to catch it if you get it wrong.

- [ ] **Step 7: Update `app/(app)/jobposts/actions.test.ts`.** Read the file first. Add assertions that `revalidateTag` was called with `('jobposts-feed', 'max')` in the `createJobPost`, `deleteJobPost`, and `toggleReaction` test cases (the `createJobPost`/`deleteJobPost` tests should already assert `('jobposts-calendar', 'max')` from Phase 1 — add the new assertion alongside, don't remove the existing one). For `toggleReaction`, this is a new assertion on a mutation that previously had no tag-invalidation test coverage at all.

- [ ] **Step 8: Run `npx tsc --noEmit`** and confirm zero errors.

- [ ] **Step 9: Run `npm run build`** and confirm `/jobposts` (the feed page, not `/jobposts/calendar` which was already fixed in Phase 1) does not appear in the error output. Grep case-insensitively for "jobposts" across the full build log — the only routes that should ever have appeared there before this task are already-fixed ones; confirm none of them regressed and the plain `/jobposts` route is now clear too.

- [ ] **Step 10: Run the full unit suite**

```bash
npm test
```

Expected: all tests pass (report the exact count — don't force it to match a prediction).

- [ ] **Step 11: Commit**

```bash
git add "app/(app)/jobposts/page.tsx" "app/(app)/jobposts/page.test.tsx" "app/(app)/jobposts/actions.ts" "app/(app)/jobposts/actions.test.ts"
git rm "app/(app)/jobposts/loading.tsx"
git commit -m "feat: stream and cache the jobposts feed instead of blocking the whole page"
```

---

### Task 2: Final verification and handoff

**Files:** none

- [ ] **Step 1: Run `npm run build` and `npm test` one more time from a clean state.** `npm run build` is still expected to fail on routes outside both this plan's and Phase 1's scope (e.g. `/forgot-password`, `/interviews`, `/checkin`, `/coding`, `/admin`, `/`) — confirm `/jobposts` and `/jobposts/calendar` both stay clear together in the same run.
- [ ] **Step 2: Do not merge to `main` yet** — same reasoning as Phase 1 Task 9. This branch stays red for unmigrated routes until every route is done.
- [ ] **Step 3: Write the Phase 3 plan** (`/interviews` feed — structurally near-identical to this one: `SessionForm`/`SessionCard` instead of `PostForm`/`PostCard`, `interview_sessions`/`interview_participants` instead of `job_posts`/`job_post_reactions`, no reactions to worry about) as a new file in `docs/superpowers/plans/`, using `superpowers:writing-plans` again, continuing from this branch. `/checkin`'s feed is intentionally deferred past that — it has an added "today must stay fresh, past days are cacheable" wrinkle that the calendar and other feed pages don't have, and deserves its own focused plan rather than being bundled in.
