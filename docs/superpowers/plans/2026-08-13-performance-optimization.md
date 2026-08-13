# Site-Wide Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the redundant, sequential Supabase network round trips that make every page in the app feel laggy in both `next dev` and production.

**Architecture:** `proxy.ts` already calls `supabase.auth.getUser()` and queries `profiles` on almost every request to decide redirects. Every page Server Component then repeats that exact same `getUser()` + `profiles` lookup for its own rendering needs, and several pages await independent Supabase queries one at a time instead of in parallel. The fix has two parts: (1) have `proxy.ts` forward the identity it already verified to the page render via trusted request headers, read through a small cached Data Access Layer (`lib/auth/session.ts`), so pages stop re-verifying identity from scratch; (2) convert sequential `await` chains for independent queries into `Promise.all`. Server Actions are explicitly left untouched — see "Out of scope" below.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` convention), `@supabase/ssr`, React `cache()`, Vitest.

---

## Why this ordering

Each authenticated page load currently pays for 2 sequential Supabase round trips inside `proxy.ts` (`auth.getUser()` then a `profiles` select) and then repeats both inside the page (`app/(app)/page.tsx`, `checkin`, `coding`, `jobposts`, `interviews`, `interviews/[sessionId]`), plus further sequential awaits for the page's own data. A round trip to this project's Supabase endpoint measured ~110–150ms during investigation, so a single page load was paying for 4–6 avoidable round trips (0.5–1.5s+) before it could render.

Phase 1 (header forwarding) removes 2 full round trips from 6 hot pages — the largest single win. Phase 2 (parallelization) removes the remaining serialized round trips on every page, including the ones that don't call `getUser()` at all today.

## Out of scope: Server Actions

`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `.../02-guides/data-security.md` both explicitly warn that Proxy coverage for Server Actions is fragile (a route refactor can silently drop them from the matcher) and that **each Server Action must re-verify authentication/authorization itself**, not rely on a page-level or proxy-level check. `checkin/actions.ts`, `coding/actions.ts`, `jobposts/actions.ts`, `interviews/actions.ts`, `feedback/[id]/actions.ts`, and `admin/actions.ts` therefore keep their own `supabase.auth.getUser()` + `profiles` role checks unchanged. Actions only run on form submit, not on every navigation, so they aren't the source of the site-wide lag — trading that framework-recommended safety net for a submit-time speedup isn't worth it.

---

## Task 1: Forward verified identity from `proxy.ts` as trusted request headers

**Files:**
- Modify: `proxy.ts`
- Test: `proxy.test.ts`

`NextResponse.next({ request: { headers } })` is the documented way to pass data from Proxy to the render (see "Setting Headers" in the proxy file-convention doc). Any header we forward must first be stripped from the *incoming* request, otherwise a client could set `x-user-role: admin` directly and forge it.

- [x] **Step 1: Replace the "unchanged response" test with a cookie-forwarding test**

In `proxy.test.ts`, replace this test:

```ts
  it('returns the refreshed supabase response unchanged when no redirect is needed', async () => {
    const supabaseResponse = buildSupabaseResponse()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: vi.fn() }, user: null })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/login')
    const response = await proxy(request)

    expect(response).toBe(supabaseResponse)
  })
```

with:

```ts
  it('carries the refreshed session cookie onto the response when no redirect is needed', async () => {
    const supabaseResponse = buildSupabaseResponse()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: vi.fn() }, user: null })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/login')
    const response = await proxy(request)

    expect(response.cookies.get('sb-access-token')?.value).toBe('refreshed-token')
  })
```

This is required because after this task `proxy` always builds a fresh `NextResponse` to attach request headers, so it can no longer return the exact `supabaseResponse` instance — but it must still carry its cookies forward.

- [x] **Step 2: Add two new tests for header forwarding, appended at the end of the `describe('proxy', ...)` block**

```ts
  it('strips any client-supplied session headers before forwarding', async () => {
    const supabaseResponse = buildSupabaseResponse()
    updateSessionMock.mockResolvedValue({ supabaseResponse, supabase: { from: vi.fn() }, user: null })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/login', {
      headers: { 'x-user-role': 'admin', 'x-user-id': 'attacker', 'x-user-status': 'approved' },
    })
    const response = await proxy(request)

    const forwarded = (response.headers.get('x-middleware-override-headers') ?? '').split(',')
    expect(forwarded).not.toContain('x-user-role')
    expect(response.headers.get('x-middleware-request-x-user-role')).toBeNull()
  })

  it('forwards the verified identity as request headers for an authenticated, allowed visitor', async () => {
    const supabaseResponse = buildSupabaseResponse()
    const single = vi.fn().mockResolvedValue({ data: { status: 'approved', role: 'admin' } })
    const eq = vi.fn().mockReturnValue({ single })
    const select = vi.fn().mockReturnValue({ eq })
    const fromMock = vi.fn().mockReturnValue({ select })
    updateSessionMock.mockResolvedValue({
      supabaseResponse,
      supabase: { from: fromMock },
      user: { id: 'user-1' },
    })
    getRedirectPathMock.mockReturnValue(null)

    const request = new NextRequest('https://example.com/admin')
    const response = await proxy(request)

    expect(response.headers.get('x-middleware-request-x-user-id')).toBe('user-1')
    expect(response.headers.get('x-middleware-request-x-user-role')).toBe('admin')
    expect(response.headers.get('x-middleware-request-x-user-status')).toBe('approved')
  })
```

- [x] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run proxy.test.ts`
Expected: FAIL — the new/changed assertions don't hold against the current implementation (identity check, missing headers).

- [x] **Step 4: Update `proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getRedirectPath, type Profile } from '@/lib/auth/access'

const SESSION_HEADERS = ['x-user-id', 'x-user-role', 'x-user-status']

export async function proxy(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)

  let profile: Profile | null = null
  if (user) {
    const { data, error } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single()
    if (error) {
      console.error('proxy: failed to fetch profile', error)
    }
    profile = data as Profile | null
  }

  const redirectPath = getRedirectPath(profile, request.nextUrl.pathname)

  if (redirectPath) {
    const url = request.nextUrl.clone()
    url.pathname = redirectPath
    const redirectResponse = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  const requestHeaders = new Headers(request.headers)
  SESSION_HEADERS.forEach((header) => requestHeaders.delete(header))

  if (user && profile) {
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-role', profile.role)
    requestHeaders.set('x-user-status', profile.status)
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))

  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [x] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run proxy.test.ts`
Expected: PASS (all tests, including the untouched pre-existing ones for redirects and profile lookups)

- [x] **Step 6: Commit**

```bash
git add proxy.ts proxy.test.ts
git commit -m "perf: forward verified identity from proxy as trusted request headers"
```

---

## Task 2: Add a cached session Data Access Layer for pages

**Files:**
- Create: `lib/auth/session.ts`
- Test: `lib/auth/session.test.ts`

Pages read the headers `proxy.ts` now sets instead of calling Supabase again. `react`'s `cache()` matches the Data Access Layer pattern in `node_modules/next/dist/docs/01-app/02-guides/data-security.md` ("Data Access Layer" section) — it dedupes the lookup across Server Components in the same request/render.

- [x] **Step 1: Write the failing test**

```ts
// lib/auth/session.test.ts
import { describe, it, expect } from 'vitest'
import { parseSessionHeaders } from './session'

function headersFrom(map: Record<string, string>) {
  return { get: (name: string) => map[name] ?? null }
}

describe('parseSessionHeaders', () => {
  it('returns null when headers are missing', () => {
    expect(parseSessionHeaders(headersFrom({}))).toBeNull()
  })

  it('returns null when role is not a known value', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'superuser', 'x-user-status': 'approved' })
    expect(parseSessionHeaders(source)).toBeNull()
  })

  it('returns null when status is not a known value', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'admin', 'x-user-status': 'banned' })
    expect(parseSessionHeaders(source)).toBeNull()
  })

  it('parses a valid header set', () => {
    const source = headersFrom({ 'x-user-id': 'u1', 'x-user-role': 'admin', 'x-user-status': 'approved' })
    expect(parseSessionHeaders(source)).toEqual({ userId: 'u1', role: 'admin', status: 'approved' })
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: FAIL with "Failed to resolve import './session'" (file doesn't exist yet)

- [x] **Step 3: Write the implementation**

```ts
// lib/auth/session.ts
import { cache } from 'react'
import { headers } from 'next/headers'
import type { ProfileRole, ProfileStatus } from './access'

export interface SessionProfile {
  userId: string
  role: ProfileRole
  status: ProfileStatus
}

const ROLES: ProfileRole[] = ['member', 'admin']
const STATUSES: ProfileStatus[] = ['pending', 'approved', 'rejected']

export function parseSessionHeaders(source: { get(name: string): string | null }): SessionProfile | null {
  const userId = source.get('x-user-id')
  const role = source.get('x-user-role')
  const status = source.get('x-user-status')

  if (!userId || !role || !status) return null
  if (!ROLES.includes(role as ProfileRole)) return null
  if (!STATUSES.includes(status as ProfileStatus)) return null

  return { userId, role: role as ProfileRole, status: status as ProfileStatus }
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const headerList = await headers()
  return parseSessionHeaders(headerList)
})
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/session.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add lib/auth/session.ts lib/auth/session.test.ts
git commit -m "perf: add cached session DAL that reads proxy-forwarded headers"
```

**Note (added during execution):** a code-quality reviewer suggested adding `import 'server-only'` to this file as a defensive guard against accidental Client Component imports. This was tried and reverted: the `server-only` package throws unconditionally in the `jsdom` vitest environment used by this repo's tests (there's no bundler-level aliasing to redirect it to a no-op outside a real Next.js build), which broke `lib/auth/session.test.ts`. Left as a documented future consideration, not applied.

---

## Task 3: `app/(app)/page.tsx` — dashboard

**Files:**
- Modify: `app/(app)/page.tsx`
- Test: `app/(app)/page.test.tsx` (fix required — see note below)

Replace `supabase.auth.getUser()` with `getSessionProfile()` (no network call) and run the two independent queries in parallel.

- [x] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from '@/lib/checkin/status'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'

function todayRangeUtc() {
  const now = new Date()
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
  return { start, end }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { start, end } = todayRangeUtc()

  const [session, { data: members }, { data: todaysPosts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase.from('checkin_posts').select('author_id, type').gte('created_at', start).lt('created_at', end),
  ])

  const memberSummaries = (members ?? []).map((m) => ({ id: m.id, name: m.name as string }))
  const posts = (todaysPosts ?? []).map((p) => ({ authorId: p.author_id, type: p.type as CheckinType }))

  const statusRows = buildTodayStatus(memberSummaries, posts)
  const missingTypes = session ? getMissingTypes(session.userId, posts) : []

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-bold">대시보드</h1>

      {missingTypes.length > 0 ? (
        <p className="mt-2 text-sm text-amber-600">
          오늘 아직 {missingTypes.map((t) => CHECKIN_TYPE_LABELS[t]).join(', ')} 인증을 하지 않았어요.
        </p>
      ) : (
        <p className="mt-2 text-sm text-green-600">오늘의 인증을 모두 완료했어요!</p>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border p-2 text-left">멤버</th>
            {CHECKIN_TYPES.map((type) => (
              <th key={type} className="border p-2">
                {CHECKIN_TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border p-2">{row.member.name}</td>
              {CHECKIN_TYPES.map((type) => (
                <td key={type} className="border p-2 text-center">
                  {row.completed[type] ? '✅' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [x] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [x] **Step 3: Manually verify**

With `npm run dev` running, log in and load `/`. The page must render the same table and message as before.

- [x] **Step 4: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "perf: dashboard reads identity from session DAL and parallelizes queries"
```

**Discovered during execution — required follow-up:** this repo has a `page.test.tsx` next to every page. Any test that mocked the old `supabase.auth.getUser()` breaks once the page switches to `getSessionProfile()`, because `getSessionProfile()` calls `next/headers`, which throws `headers was called outside a request scope` when there's no active Next.js request in the vitest/jsdom environment. **Every remaining task in this plan that touches a page with a corresponding `page.test.tsx` must fix that test in the same commit as the production change.** The validated fix pattern:

```ts
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: vi.fn(async () => ({ userId: 'user-1', role: 'member', status: 'approved' })),
}))
```

placed alongside the existing `vi.mock('@/lib/supabase/server', ...)` block, before the page import. Remove the old `auth: { getUser: ... }` stub from that mock. If a page's tests need more than one session shape (e.g. an admin-role test case alongside a member-role one), use `vi.mocked(getSessionProfile).mockResolvedValueOnce({...})` per test instead of relying solely on the module-level default — check whether this applies before assuming the simple default is enough.

This was applied here as a follow-up commit `f4be95a` ("test: fix dashboard page test to mock session DAL instead of auth.getUser"). For Tasks 4 onward, do it in the same commit as the page change, not as a separate follow-up — the gap is now known upfront.

---

## Task 4: `app/(app)/checkin/page.tsx`

**Files:**
- Modify: `app/(app)/checkin/page.tsx`
- Test: `app/(app)/checkin/page.test.tsx` (fix required, same commit — see Task 3's note)

- [x] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinType } from '@/lib/checkin/types'

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [session, { data: profiles }, { data: posts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, type, body, photo_url, created_at')
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: comments }, { data: reactions }] = postIds.length
    ? await Promise.all([
        supabase
          .from('checkin_comments')
          .select('id, post_id, author_id, body, created_at')
          .in('post_id', postIds)
          .order('created_at', { ascending: true }),
        supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds),
      ])
    : [{ data: [] as { id: string; post_id: string; author_id: string; body: string; created_at: string }[] }, { data: [] as { id: string; post_id: string; author_id: string; emoji: string }[] }]

  const checkinPosts: CheckinPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    type: post.type as CheckinType,
    photoUrl: post.photo_url,
    body: post.body,
    createdAt: post.created_at,
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">인증</h1>
        <a href="/checkin/calendar" className="text-sm text-gray-500 underline">
          달력 보기
        </a>
      </div>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {checkinPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [x] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [x] **Step 3: Manually verify**

With `npm run dev` running, load `/checkin` as both a member and an admin account. Posts, comments, reactions, and the admin-only delete controls must render exactly as before.

- [x] **Step 4: Commit**

```bash
git add "app/(app)/checkin/page.tsx"
git commit -m "perf: checkin page reads identity from session DAL and parallelizes queries"
```

**Reviewer note (code quality, flagged for follow-up before Tasks 6/7 repeat it):** the inline-typed empty-array fallback for `comments`/`reactions` (the `: [{ data: [] as {...}[] }, { data: [] as {...}[] }]` branch) duplicates row-shape field lists already implied by the `.select(...)` calls, producing an unwieldy line. Consider factoring out a small typed helper (e.g. a generic `runIfAny(ids, fn)` that returns `Promise.resolve({ data: [] as T[] })` when `ids` is empty) before this same idiom repeats in Tasks 6 and 7 for `jobposts`/`interviews`.

---

## Task 5: `app/(app)/coding/page.tsx`

**Files:**
- Modify: `app/(app)/coding/page.tsx`
- Test: `app/(app)/coding/page.test.tsx` (fix required, same commit — see Task 3's note)

`github_username` isn't part of the forwarded session headers (it's page-specific, not an authorization fact), so it still needs its own query — but that query now runs in parallel with the other two instead of after them.

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { groupByWeek, formatWeekLabel } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import type { CodingProblem, Member } from '@/lib/coding/types'

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()
  const session = await getSessionProfile()

  const [{ data: callerProfile }, { data: profiles }, { data: problems }] = await Promise.all([
    supabase.from('profiles').select('github_username').eq('id', session!.userId).single(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('coding_problems')
      .select('id, title, link, week_of, created_by, created_at')
      .order('week_of', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = problemIds.length
    ? await supabase.from('coding_checks').select('problem_id, user_id').in('problem_id', problemIds)
    : { data: [] }

  const codingProblems: CodingProblem[] = (problems ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    weekOf: problem.week_of,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    checkedUserIds: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => c.user_id),
  }))

  const weekGroups = groupByWeek(codingProblems)

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">코테 스터디</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
      {isAdmin && <ProblemForm />}
      <div className="mt-6 flex flex-col gap-6">
        {weekGroups.map((week) => (
          <section key={week.weekOf}>
            <h2 className="mb-2 text-lg font-semibold">{formatWeekLabel(week.weekOf)}</h2>
            <div className="flex flex-col gap-3">
              {week.items.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  currentUserId={session!.userId}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {weekGroups.length === 0 && (
          <p className="text-sm text-gray-500">아직 등록된 문제가 없습니다.</p>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/coding` as both a member and an admin account. The GitHub username field, problem list, and admin-only problem form must render exactly as before.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/coding/page.tsx"
git commit -m "perf: coding page reads identity from session DAL and parallelizes queries"
```

---

## Task 6: `app/(app)/jobposts/page.tsx`

**Files:**
- Modify: `app/(app)/jobposts/page.tsx`
- Test: `app/(app)/jobposts/page.test.tsx` (fix required, same commit — see Task 3's note)

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'

export default async function JobPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [session, { data: profiles }, { data: posts }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, post_date, company_name, posting_info, questions, feedback_requested, created_at')
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const postIds = (posts ?? []).map((p) => p.id)

  const [{ data: reactions }, { data: feedbackDocs }] = postIds.length
    ? await Promise.all([
        supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds),
        supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds),
      ])
    : [{ data: [] as { id: string; post_id: string; author_id: string; emoji: string }[] }, { data: [] as { id: string; job_post_id: string }[] }]

  const feedbackDocIdByPost = new Map((feedbackDocs ?? []).map((d) => [d.job_post_id, d.id as string]))

  const jobPosts: JobPost[] = (posts ?? []).map((post) => ({
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">자소서 / 공고</h1>
        <a href="/jobposts/calendar" className="text-sm text-gray-500 underline">
          달력 보기
        </a>
      </div>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {jobPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/jobposts` as both a member and an admin account. Posts, reactions, feedback links, and admin-only delete controls must render exactly as before.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/jobposts/page.tsx"
git commit -m "perf: jobposts page reads identity from session DAL and parallelizes queries"
```

---

## Task 7: `app/(app)/interviews/page.tsx`

**Files:**
- Modify: `app/(app)/interviews/page.tsx`
- Test: `app/(app)/interviews/page.test.tsx` (fix required, same commit — see Task 3's note)

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { SessionForm } from './session-form'
import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [session, { data: profiles }, { data: sessions }] = await Promise.all([
    getSessionProfile(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('interview_sessions')
      .select('id, created_by, title, session_at, description, created_at')
      .order('session_at', { ascending: true }),
  ])

  const isAdmin = session?.role === 'admin'
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const sessionIds = (sessions ?? []).map((s) => s.id)

  const { data: participants } = sessionIds.length
    ? await supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
    : { data: [] }

  const interviewSessions: InterviewSession[] = (sessions ?? []).map((s) => ({
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

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">모의면접</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <SessionForm />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewSessions.map((s) => (
          <li key={s.id}>
            <SessionCard session={s} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

Note: the loop variable is renamed from `session` to `s` because `session` now refers to the auth session object in this scope.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/interviews` as both a member and an admin account. Session list, participant names, and admin-only controls must render exactly as before.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/interviews/page.tsx"
git commit -m "perf: interviews page reads identity from session DAL and parallelizes queries"
```

---

## Task 8: `app/(app)/interviews/[sessionId]/page.tsx`

**Files:**
- Modify: `app/(app)/interviews/[sessionId]/page.tsx`
- Test: `app/(app)/interviews/[sessionId]/page.test.tsx` (fix required, same commit — see Task 3's note)

The session-existence lookup, the profile-name lookup, and the QA list only depend on `sessionId` (not on each other), so all three can be fetched in parallel alongside the identity read; `feedbackDocs` still depends on the resulting `qaIds`.

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
import { groupQasByAuthor } from '@/lib/interviews/grouping'
import type { InterviewQa } from '@/lib/interviews/types'

export default async function InterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { sessionId } = await params
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [sessionProfile, { data: session }, { data: profiles }, { data: qas }] = await Promise.all([
    getSessionProfile(),
    supabase
      .from('interview_sessions')
      .select('id, title, session_at, description')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('interview_qas')
      .select('id, author_id, questions, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false }),
  ])

  const isAdmin = sessionProfile?.role === 'admin'

  if (!session) {
    redirect('/interviews?error=' + encodeURIComponent('존재하지 않는 세션입니다'))
    return
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const qaIds = (qas ?? []).map((q) => q.id)

  const { data: feedbackDocs } = qaIds.length
    ? await supabase.from('feedback_docs').select('id, interview_qa_id').in('interview_qa_id', qaIds)
    : { data: [] }

  const feedbackDocIdByQa = new Map((feedbackDocs ?? []).map((d) => [d.interview_qa_id, d.id as string]))

  const interviewQas: InterviewQa[] = (qas ?? []).map((qa) => ({
    id: qa.id,
    sessionId,
    authorId: qa.author_id,
    authorName: nameById.get(qa.author_id) ?? '알 수 없음',
    questions: qa.questions,
    feedbackDocId: feedbackDocIdByQa.get(qa.id) ?? '',
    createdAt: qa.created_at,
  }))

  const qaGroups = groupQasByAuthor(interviewQas)

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{session.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{session.session_at}</p>
      {session.description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600">{session.description}</p>
      )}
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <QaForm sessionId={sessionId} />
      <div className="mt-6 flex flex-col gap-6">
        {qaGroups.map((group) => (
          <section key={group.authorId}>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">{group.authorName}</h2>
            <ul className="flex flex-col gap-4">
              {group.qas.map((qa) => (
                <li key={qa.id}>
                  <QaCard qa={qa} currentUserId={sessionProfile!.userId} isAdmin={isAdmin} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load an existing `/interviews/[sessionId]` as both a member and an admin account, and load a nonexistent session id to confirm the redirect still works.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/interviews/[sessionId]/page.tsx"
git commit -m "perf: interview session page reads identity from session DAL and parallelizes queries"
```

---

## Task 9: `app/(app)/checkin/calendar/page.tsx` — parallelize only

**Files:**
- Modify: `app/(app)/checkin/calendar/page.tsx`

This page doesn't check identity today (it relies on `proxy.ts` for gating), so there's no header work here — just parallelize the two independent queries. (No `getSessionProfile` change means no test-mock fix needed here — confirm this page's `page.test.tsx`, if any, doesn't mock `auth.getUser()` either before assuming so.)

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
  const end = new Date(Date.UTC(year, month, 1)).toISOString()
  return { start, end }
}

export default async function CheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const { start, end } = monthRange(year, month)
  const supabase = await createClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('checkin_posts')
      .select('id, author_id, type, created_at')
      .gte('created_at', start)
      .lt('created_at', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const calendarPosts: CalendarPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    type: post.type as CheckinType,
    createdAt: post.created_at,
  }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        인증 달력 ({year}년 {month}월)
      </h1>

      <div className="mb-4 flex gap-3 text-sm">
        <a
          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </a>
        <a
          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </a>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td key={day.date} className={`border p-2 align-top ${day.inMonth ? '' : 'text-gray-300'}`}>
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName} · {CHECKIN_TYPE_LABELS[post.type]}
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.createdAt.slice(0, 10)} · {CHECKIN_TYPE_LABELS[post.type]}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/checkin/calendar` in both `date` and `member` views.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/checkin/calendar/page.tsx"
git commit -m "perf: parallelize independent queries on checkin calendar page"
```

---

## Task 10: `app/(app)/jobposts/calendar/page.tsx` — parallelize only

**Files:**
- Modify: `app/(app)/jobposts/calendar/page.tsx`

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarJobPost } from '@/lib/jobposts/calendar'

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  return { start, end }
}

export default async function JobPostsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; view?: string }>
}) {
  const params = await searchParams
  const now = new Date()
  const year = params.year ? Number(params.year) : now.getUTCFullYear()
  const month = params.month ? Number(params.month) : now.getUTCMonth() + 1
  const view = params.view === 'member' ? 'member' : 'date'

  const { start, end } = monthRange(year, month)
  const supabase = await createClient()

  const [{ data: profiles }, { data: posts }] = await Promise.all([
    supabase.from('profiles').select('id, name'),
    supabase
      .from('job_posts')
      .select('id, author_id, company_name, post_date')
      .gte('post_date', start)
      .lt('post_date', end),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const calendarPosts: CalendarJobPost[] = (posts ?? []).map((post) => ({
    id: post.id,
    authorId: post.author_id,
    authorName: nameById.get(post.author_id) ?? '알 수 없음',
    companyName: post.company_name,
    postDate: post.post_date,
  }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        자소서 달력 ({year}년 {month}월)
      </h1>

      <div className="mb-4 flex gap-3 text-sm">
        <a
          href={`/jobposts/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </a>
        <a
          href={`/jobposts/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </a>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td key={day.date} className={`border p-2 align-top ${day.inMonth ? '' : 'text-gray-300'}`}>
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600">
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
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/jobposts/calendar` in both `date` and `member` views.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/jobposts/calendar/page.tsx"
git commit -m "perf: parallelize independent queries on jobposts calendar page"
```

---

## Task 11: `app/(app)/feedback/[id]/page.tsx` — parallelize only

**Files:**
- Modify: `app/(app)/feedback/[id]/page.tsx`

`profiles` and `feedback_comments` only depend on the route's `id` param, not on `doc`, so they can start alongside the `doc` lookup instead of after it. The heading resolution (`job_posts` or `interview_qas` → `interview_sessions`) genuinely depends on `doc` and stays sequential.

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { FeedbackLines, type FeedbackLineWithComments } from './feedback-lines'
import type { FeedbackLine } from '@/lib/jobposts/types'

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { id } = await params
  const { error: queryError } = await searchParams
  const supabase = await createClient()

  const [{ data: doc }, { data: profiles }, { data: rawComments }] = await Promise.all([
    supabase.from('feedback_docs').select('id, job_post_id, interview_qa_id, lines').eq('id', id).maybeSingle(),
    supabase.from('profiles').select('id, name'),
    supabase
      .from('feedback_comments')
      .select('id, line_index, parent_comment_id, author_id, body, created_at')
      .eq('feedback_doc_id', id)
      .order('created_at', { ascending: true }),
  ])

  if (!doc) {
    redirect('/jobposts?error=' + encodeURIComponent('존재하지 않는 피드백입니다'))
    return
  }

  let heading: string
  let authorId: string

  if (doc.job_post_id) {
    const { data: jobPost } = await supabase
      .from('job_posts')
      .select('company_name, author_id')
      .eq('id', doc.job_post_id)
      .single()

    heading = `${jobPost?.company_name} 자소서 피드백`
    authorId = jobPost?.author_id ?? ''
  } else {
    const { data: qa } = await supabase
      .from('interview_qas')
      .select('author_id, session_id')
      .eq('id', doc.interview_qa_id)
      .single()

    const { data: session } = await supabase
      .from('interview_sessions')
      .select('title')
      .eq('id', qa?.session_id)
      .single()

    heading = `${session?.title} 피드백`
    authorId = qa?.author_id ?? ''
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const flatComments = (rawComments ?? []).map((c) => ({
    id: c.id,
    lineIndex: c.line_index,
    parentCommentId: c.parent_comment_id,
    authorId: c.author_id,
    authorName: nameById.get(c.author_id) ?? '알 수 없음',
    body: c.body,
    createdAt: c.created_at,
  }))

  const commentsByLine = groupCommentsByLine(flatComments)
  const lines = doc.lines as FeedbackLine[]
  const authorName = nameById.get(authorId) ?? '알 수 없음'

  const feedbackLines: FeedbackLineWithComments[] = lines.map((line, index) => ({
    index,
    questionIndex: line.questionIndex,
    question: line.question,
    text: line.text,
    comments: commentsByLine.get(index) ?? [],
  }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{heading}</h1>
      <p className="mb-6 text-sm text-gray-500">작성자: {authorName}</p>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <FeedbackLines feedbackDocId={id} lines={feedbackLines} />
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load a feedback page reached from a job post and one reached from an interview QA, plus a nonexistent feedback id to confirm the redirect still works.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/feedback/[id]/page.tsx"
git commit -m "perf: parallelize independent queries on feedback page"
```

---

## Task 12: `app/(app)/admin/page.tsx` — parallelize only

**Files:**
- Modify: `app/(app)/admin/page.tsx`

- [ ] **Step 1: Replace the fetch logic**

```tsx
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'

export default async function AdminPage() {
  const supabase = await createClient()

  const [
    { data: pendingUsers, error: pendingError },
    { data: approvedMembers, error: approvedError },
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
  ])

  if (pendingError) {
    console.error('admin page: failed to fetch pending users', pendingError)
  }

  if (approvedError) {
    console.error('admin page: failed to fetch approved members', approvedError)
  }

  const pendingList = pendingUsers ?? []
  const approvedList = approvedMembers ?? []

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">관리자 페이지</h1>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingList.length})</h2>
        <ul className="flex flex-col gap-3">
          {pendingList.map((user) => (
            <li key={user.id} className="flex items-center justify-between rounded border p-3">
              <span>{user.name}</span>
              <div className="flex gap-2">
                <form action={approveUser.bind(null, user.id)}>
                  <button type="submit" className="rounded bg-black px-3 py-1 text-sm text-white">
                    승인
                  </button>
                </form>
                <form action={rejectUser.bind(null, user.id)}>
                  <button type="submit" className="rounded border px-3 py-1 text-sm">
                    거부
                  </button>
                </form>
              </div>
            </li>
          ))}
          {pendingList.length === 0 && (
            <p className="text-sm text-gray-500">대기 중인 가입 신청이 없습니다.</p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">멤버 ({approvedList.length})</h2>
        <ul className="flex flex-col gap-3">
          {approvedList.map((member) => (
            <li key={member.id} className="flex items-center justify-between rounded border p-3">
              <span>{member.name}</span>
              {member.role !== 'admin' && (
                <form action={rejectUser.bind(null, member.id)}>
                  <button type="submit" className="rounded border px-3 py-1 text-sm text-red-600">
                    강퇴
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

- [ ] **Step 3: Manually verify**

With `npm run dev` running, load `/admin` as an admin account and confirm both lists render and approve/reject still work.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin/page.tsx"
git commit -m "perf: parallelize independent queries on admin page"
```

---

## Task 13: Verify the fix and measure the improvement

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS for every test file, including `proxy.test.ts` and `lib/auth/session.test.ts`

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: build succeeds with no type errors

- [ ] **Step 3: Measure page-load latency before/after**

With `npm run start` (or `npm run dev`) running and logged in, open the browser DevTools Network tab, hard-reload each of `/`, `/checkin`, `/coding`, `/jobposts`, `/interviews`, `/admin`, and note the document request's TTFB. Compare against the pre-fix baseline (each of these pages previously issued 3-6 sequential Supabase round trips, ~110-150ms each, before the page could start rendering). Expect a visible drop, largest on `/`, `/checkin`, `/coding`, `/jobposts`, and `/interviews` since those lost 2 full round trips to header-based identity plus additional parallelization.

- [ ] **Step 4: Spot-check the security-sensitive path**

Confirm that visiting `/admin` while logged in as a non-admin member still redirects away (`getRedirectPath` + the role check inside `proxy.ts` are unchanged), and that submitting an admin-only Server Action (e.g. `rejectUser`) as a non-admin still throws `권한이 없습니다` (Server Actions were intentionally left doing their own re-verification).
