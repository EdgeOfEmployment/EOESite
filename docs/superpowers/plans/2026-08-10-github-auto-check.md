# GitHub Auto-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a member pushes their solved-problem file to the study group's shared GitHub repo, automatically check them off for that problem on `/coding` — on top of (not instead of) the existing manual self-check button. This reverses the original design spec's "no GitHub API" non-goal at the user's explicit request; see the note below.

**Architecture:** A GitHub webhook (push events) hits a new Next.js Route Handler (`app/api/github-webhook/route.ts`), which verifies the request's HMAC signature, identifies the pusher via GitHub's `sender.login` field, looks up which app member registered that GitHub username (a new `profiles.github_username` column, self-service via a security-definer RPC function so a member can only ever change their own username — never their own role/status), then checks whether any changed file path in the push contains a matching problem's title (or an admin-set optional `match_keyword` override on `coding_problems`). A match upserts a `coding_checks` row (insert-only — auto-detection never un-checks something a human already confirmed). The webhook uses the Supabase service-role key (bypasses RLS) since it has no user session — it's authenticated purely by the HMAC signature GitHub sends.

**Tech Stack:** Next.js Route Handler (Web `Request`/`Response`, Node `crypto` for HMAC verification), Supabase (Postgres + a `security definer` RPC function + service-role client), Vitest. Builds directly on `docs/superpowers/plans/2026-08-10-coding-board.md`, which must be fully implemented (all 8 code tasks) before starting this plan.

**Spec deviation (explicit user request, overriding the original non-goal):** `docs/superpowers/specs/2026-07-29-study-site-design.md` lists "GitHub API를 통한 자동 풀이 확인 (수동 자가 체크로 대체)" under Non-goals. The user explicitly asked for GitHub-based auto-check despite this. This plan keeps the manual check button working exactly as before and adds automatic detection alongside it, rather than replacing it — confirmed with the user as the preferred approach.

**Confirmed configuration (from the user):**
- Deployment: `https://eoe-site.vercel.app`
- Shared study repo: `https://github.com/EdgeOfEmployment/Coding-Test` (a different repo from this app's own `EdgeOfEmployment/EOESite`)
- Detection: real-time webhook (not polling)
- Matching: folder/file path convention, e.g. `{이름}/{문제명}/{문제명}.js` (or another extension per member's language) — the problem name appears literally in the path
- Member GitHub usernames: self-registered, not admin-set

**Assumptions (not fully specified by the user — flag if wrong):**
- Matching is done by simple case-insensitive substring containment: if any changed file's path contains the problem's title (or its optional `match_keyword` override) as a substring, it's a match. This directly satisfies the "problem name appears in the path" convention without fragile Korean-to-slug conversion. If two problems have overlapping/substring titles, both could match — acceptable for a small study group; the optional `match_keyword` field exists precisely so an admin can disambiguate if this ever becomes a problem.
- The pusher is identified via the GitHub push webhook's `sender.login` field (the authenticated GitHub account, not the free-text git commit author name) matched case-insensitively against `profiles.github_username`.
- No branch filtering — a push to any branch in the repo is processed, since a small study group is unlikely to use a PR workflow and requiring `main` could silently miss legitimate feature-branch pushes.
- Auto-check is insert-only (never deletes a `coding_checks` row). The existing manual toggle button still works on top of an auto-checked row if a member wants to un-check it themselves.

---

## File Structure

```
supabase/
  migrations/
    0004_github_sync.sql       # profiles.github_username, update_own_github_username() RPC, coding_problems.match_keyword
app/
  (app)/
    coding/
      actions.ts                 # MODIFY: createProblem accepts optional matchKeyword; add updateGithubUsername
      actions.test.ts            # MODIFY
      problem-form.tsx            # MODIFY: add optional match-keyword input
      problem-form.test.tsx       # MODIFY
      github-settings-form.tsx     # NEW: self-service "내 GitHub 아이디" form
      github-settings-form.test.tsx
      page.tsx                     # MODIFY: fetch + render GithubSettingsForm
      page.test.tsx                # MODIFY
  api/
    github-webhook/
      route.ts                     # NEW: POST handler — verify signature, match, auto-check
      route.test.ts
.env.local.example                # MODIFY: document SUPABASE_SERVICE_ROLE_KEY, GITHUB_WEBHOOK_SECRET
```

---

## Task 1: Database migration — GitHub username + match keyword

**Files:**

- Create: `supabase/migrations/0004_github_sync.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_github_sync.sql`:

```sql
alter table profiles add column github_username text;

-- security-definer RPC so a member can update only their own
-- github_username, never role/status/other columns or other rows —
-- same pattern as is_admin()/is_approved() in prior migrations.
create function public.update_own_github_username(new_username text)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set github_username = new_username where id = auth.uid();
$$;

grant execute on function public.update_own_github_username(text) to authenticated;

alter table coding_problems add column match_keyword text;
```

- [ ] **Step 2: Apply the migration manually**

Open the Supabase project dashboard → SQL Editor → paste the contents of `0004_github_sync.sql` → Run.

- [ ] **Step 3: Verify manually**

In the Supabase dashboard → Table Editor, confirm `profiles` has a new `github_username` column and `coding_problems` has a new `match_keyword` column. In the SQL Editor, run `select proname from pg_proc where proname = 'update_own_github_username';` and confirm it returns one row.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0004_github_sync.sql
git commit -m "Add github_username, match_keyword, and self-update RPC for GitHub auto-check"
```

---

## Task 2: `createProblem` accepts an optional match keyword

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

- [ ] **Step 1: Update the existing test and add a new one**

In `app/(app)/coding/actions.test.ts`, replace the `'creates the problem and revalidates /coding'` test inside `describe('createProblem', ...)` with these two tests (keep the other two `createProblem` tests unchanged):

```ts
  it('creates the problem with a null match keyword when none is provided', async () => {
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
    })

    await createProblem(formData)

    expect(insertMock).toHaveBeenCalledWith({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      week_of: '2026-08-11',
      created_by: 'admin-1',
      match_keyword: null,
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('passes the optional match keyword when provided', async () => {
    const formData = buildFormData({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      weekOf: '2026-08-11',
      matchKeyword: 'two-sum',
    })

    await createProblem(formData)

    expect(insertMock).toHaveBeenCalledWith({
      title: '두 수의 합',
      link: 'https://example.com/problem/1',
      week_of: '2026-08-11',
      created_by: 'admin-1',
      match_keyword: 'two-sum',
    })
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL on the two new tests — `insertMock` was called without a `match_keyword` key, so the exact-match assertion fails. The other existing tests still pass.

- [ ] **Step 3: Update the implementation**

In `app/(app)/coding/actions.ts`, replace the `createProblem` function's body from the `weekOf` line through the `insert` call with:

```ts
export async function createProblem(formData: FormData) {
  const title = formData.get('title') as string
  const link = formData.get('link') as string
  const weekOf = formData.get('weekOf') as string
  const matchKeyword = (formData.get('matchKeyword') as string) || null

  if (!title || !link || !weekOf) {
    redirect('/coding?error=' + encodeURIComponent('문제명, 링크, 주차를 모두 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
    return
  }

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_problems')
    .insert({ title, link, week_of: weekOf, created_by: user.id, match_keyword: matchKeyword })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 8 tests green (the two `createProblem` tests replaced the original one, so the file now has 8 total instead of 7).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add optional match keyword to createProblem"
```

---

## Task 3: `updateGithubUsername` server action

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

- [ ] **Step 1: Add `rpc` to the shared Supabase mock and write the failing tests**

In `app/(app)/coding/actions.test.ts`:

1. Add a new mock near the top, alongside the existing `const fromMock = vi.fn()`:

```ts
const rpcMock = vi.fn()
```

2. Update the `vi.mock('@/lib/supabase/server', ...)` block to include it:

```ts
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  })),
}))
```

3. Update the top-level import to include the new action:

```ts
import { createProblem, toggleCheck, deleteProblem, updateGithubUsername } from './actions'
```

4. In `beforeEach`, add:

```ts
  rpcMock.mockResolvedValue({ error: null })
```

5. Append this new describe block at the end of the file:

```ts
describe('updateGithubUsername', () => {
  it('redirects with an error when the username is empty', async () => {
    const formData = buildFormData({ githubUsername: '' })

    await expect(updateGithubUsername(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('GitHub 아이디를 입력해주세요')
    )
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('calls the update_own_github_username RPC and revalidates /coding', async () => {
    const formData = buildFormData({ githubUsername: 'kimminsu-dev' })

    await updateGithubUsername(formData)

    expect(rpcMock).toHaveBeenCalledWith('update_own_github_username', {
      new_username: 'kimminsu-dev',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('redirects with the Supabase error message when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'db error' } })
    const formData = buildFormData({ githubUsername: 'kimminsu-dev' })

    await expect(updateGithubUsername(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/coding?error=' + encodeURIComponent('db error'))
  })
})
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `Cannot find export 'updateGithubUsername'`.

- [ ] **Step 3: Implement the action**

Add to `app/(app)/coding/actions.ts`:

```ts
export async function updateGithubUsername(formData: FormData) {
  const githubUsername = formData.get('githubUsername') as string

  if (!githubUsername) {
    redirect('/coding?error=' + encodeURIComponent('GitHub 아이디를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
    return
  }

  const { error } = await supabase.rpc('update_own_github_username', {
    new_username: githubUsername,
  })

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 11 tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add self-service updateGithubUsername server action"
```

---

## Task 4: Match-keyword field on the problem registration form

**Files:**

- Modify: `app/(app)/coding/problem-form.tsx`
- Modify: `app/(app)/coding/problem-form.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to `app/(app)/coding/problem-form.test.tsx`, inside the existing `describe('ProblemForm', ...)` block:

```ts
  it('renders an optional match keyword input', () => {
    render(<ProblemForm />)
    const input = screen.getByLabelText('저장소 매칭 키워드 (선택)')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeRequired()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: FAIL — no element found for that label.

- [ ] **Step 3: Add the field**

In `app/(app)/coding/problem-form.tsx`, add this block right before the closing `<button` element:

```tsx
      <label htmlFor="matchKeyword" className="sr-only">
        저장소 매칭 키워드 (선택)
      </label>
      <input
        id="matchKeyword"
        name="matchKeyword"
        placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)"
        className="rounded border px-3 py-2"
      />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/problem-form.tsx" "app/(app)/coding/problem-form.test.tsx"
git commit -m "Add optional match keyword input to problem registration form"
```

---

## Task 5: GitHub username settings form

**Files:**

- Create: `app/(app)/coding/github-settings-form.tsx`
- Test: `app/(app)/coding/github-settings-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/coding/github-settings-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  updateGithubUsername: vi.fn(),
}))

import { GithubSettingsForm } from './github-settings-form'

describe('GithubSettingsForm', () => {
  it('renders the input pre-filled with the current username', () => {
    render(<GithubSettingsForm currentUsername="kimminsu-dev" />)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })

  it('renders an empty input when no username is registered yet', () => {
    render(<GithubSettingsForm currentUsername={null} />)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('')
  })

  it('renders a save button', () => {
    render(<GithubSettingsForm currentUsername={null} />)
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/github-settings-form.test.tsx"`
Expected: FAIL — `Cannot find module './github-settings-form'`.

- [ ] **Step 3: Implement the component**

Create `app/(app)/coding/github-settings-form.tsx`:

```tsx
import { updateGithubUsername } from './actions'

export function GithubSettingsForm({ currentUsername }: { currentUsername: string | null }) {
  return (
    <form
      action={updateGithubUsername}
      className="mb-6 flex items-center gap-2 rounded border p-4 text-sm"
    >
      <label htmlFor="githubUsername" className="whitespace-nowrap font-medium">
        내 GitHub 아이디
      </label>
      <input
        id="githubUsername"
        name="githubUsername"
        placeholder="GitHub 아이디"
        defaultValue={currentUsername ?? ''}
        required
        className="flex-1 rounded border px-3 py-1"
      />
      <button type="submit" className="rounded border px-3 py-1">
        저장
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/github-settings-form.test.tsx"`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/github-settings-form.tsx" "app/(app)/coding/github-settings-form.test.tsx"
git commit -m "Add GitHub username self-service settings form"
```

---

## Task 6: Wire the settings form into the coding board page

**Files:**

- Modify: `app/(app)/coding/page.tsx`
- Modify: `app/(app)/coding/page.test.tsx`

- [ ] **Step 1: Update the failing test**

In `app/(app)/coding/page.test.tsx`:

1. In the `vi.mock('@/lib/supabase/server', ...)` block, change the `profiles` branch's `select` implementation so the `role`-only check now matches the new combined column string and returns a `github_username` too:

```ts
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role, github_username') {
              return {
                eq: () => ({
                  single: async () => ({ data: { role: 'member', github_username: 'kimminsu-dev' } }),
                }),
              }
            }
            return { eq: () => Promise.resolve({ data: profiles }) }
          },
        }
      }
```

2. Add `updateGithubUsername: vi.fn(),` to the `vi.mock('./actions', ...)` block.

3. Append this test inside `describe('CodingPage', ...)`:

```ts
  it("renders the GitHub settings form pre-filled with the caller's registered username", async () => {
    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)
    expect(screen.getByLabelText('내 GitHub 아이디')).toHaveValue('kimminsu-dev')
  })
```

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: FAIL — no element with label "내 GitHub 아이디" exists yet. (The other two tests still pass since the mock's `role, github_username` branch change doesn't affect them — they don't assert on `role`.)

- [ ] **Step 3: Update the page**

In `app/(app)/coding/page.tsx`:

1. Add the import:

```ts
import { GithubSettingsForm } from './github-settings-form'
```

2. Change the `callerProfile` query's `.select('role')` to `.select('role, github_username')`.

3. Render the form right after the error message and before `{isAdmin && <ProblemForm />}`:

```tsx
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
```

The full updated component:

```tsx
import { createClient } from '@/lib/supabase/server'
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, github_username')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('status', 'approved')

  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const { data: problems } = await supabase
    .from('coding_problems')
    .select('id, title, link, week_of, created_by, created_at')
    .order('week_of', { ascending: false })

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
                  currentUserId={user!.id}
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "Render GitHub settings form on the coding board page"
```

---

## Task 7: GitHub webhook route handler

**Files:**

- Create: `app/api/github-webhook/route.ts`
- Test: `app/api/github-webhook/route.test.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Document the new env vars**

Read the current contents of `.env.local.example`, then add these two lines to it (keep the existing `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` lines untouched):

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

- [ ] **Step 2: Write the failing tests**

Create `app/api/github-webhook/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'

const fromMock = vi.fn()
const upsertMock = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}))

import { POST } from './route'

const SECRET = 'test-secret'

function sign(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

function buildRequest(body: string, options: { signature?: string; event?: string } = {}) {
  const signature = options.signature ?? sign(body)
  const event = options.event ?? 'push'
  return new NextRequest('http://localhost/api/github-webhook', {
    method: 'POST',
    headers: {
      'x-hub-signature-256': signature,
      'x-github-event': event,
      'content-type': 'application/json',
    },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', SECRET)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

describe('POST /api/github-webhook', () => {
  it('rejects a request with an invalid signature', async () => {
    const body = JSON.stringify({ sender: { login: 'kimminsu-dev' }, commits: [] })
    const request = buildRequest(body, { signature: 'sha256=deadbeef' })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips non-push events', async () => {
    const body = JSON.stringify({ sender: { login: 'kimminsu-dev' }, commits: [] })
    const request = buildRequest(body, { event: 'ping' })

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'not a push event' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips when no member is registered with the pusher login', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    const body = JSON.stringify({
      sender: { login: 'unregistered-user' },
      commits: [{ added: ['someone/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'no matching member' })
  })

  it('auto-checks a problem whose title appears in a changed file path', async () => {
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
      if (table === 'coding_checks') {
        return { upsert: upsertMock }
      }
      throw new Error(`unexpected table ${table}`)
    })
    upsertMock.mockResolvedValue({ error: null })

    const body = JSON.stringify({
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(upsertMock).toHaveBeenCalledWith(
      { problem_id: 'problem-1', user_id: 'user-1' },
      { onConflict: 'problem_id,user_id', ignoreDuplicates: true }
    )
    expect(json.checkedProblemIds).toEqual(['problem-1'])
  })

  it('uses match_keyword instead of the title when the admin set one', async () => {
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
              data: [{ id: 'problem-1', title: '두 수의 합', match_keyword: 'two-sum' }],
            }),
        }
      }
      if (table === 'coding_checks') {
        return { upsert: upsertMock }
      }
      throw new Error(`unexpected table ${table}`)
    })
    upsertMock.mockResolvedValue({ error: null })

    const body = JSON.stringify({
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/two-sum/two-sum.py'], modified: [] }],
    })
    const request = buildRequest(body)

    await POST(request)

    expect(upsertMock).toHaveBeenCalledWith(
      { problem_id: 'problem-1', user_id: 'user-1' },
      { onConflict: 'problem_id,user_id', ignoreDuplicates: true }
    )
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run "app/api/github-webhook/route.test.ts"`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 4: Implement the route handler**

Create `app/api/github-webhook/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET!
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const actualBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== actualBuffer.length) return false
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-hub-signature-256')
  const body = await request.text()

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  if (request.headers.get('x-github-event') !== 'push') {
    return NextResponse.json({ ok: true, skipped: 'not a push event' })
  }

  const payload = JSON.parse(body)
  const pusherLogin = payload.sender?.login as string | undefined

  if (!pusherLogin) {
    return NextResponse.json({ ok: true, skipped: 'no pusher login' })
  }

  const changedPaths = new Set<string>()
  for (const commit of payload.commits ?? []) {
    for (const path of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
      changedPaths.add(path)
    }
  }

  if (changedPaths.size === 0) {
    return NextResponse.json({ ok: true, skipped: 'no file changes' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: member } = await supabase
    .from('profiles')
    .select('id')
    .ilike('github_username', pusherLogin)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ ok: true, skipped: 'no matching member' })
  }

  const { data: problems } = await supabase
    .from('coding_problems')
    .select('id, title, match_keyword')

  const checkedProblemIds: string[] = []

  for (const problem of problems ?? []) {
    const keyword = ((problem.match_keyword as string | null) || (problem.title as string))
      .trim()
      .toLowerCase()
    const matched = Array.from(changedPaths).some((path) => path.toLowerCase().includes(keyword))

    if (matched) {
      const { error } = await supabase
        .from('coding_checks')
        .upsert(
          { problem_id: problem.id, user_id: member.id },
          { onConflict: 'problem_id,user_id', ignoreDuplicates: true }
        )
      if (!error) checkedProblemIds.push(problem.id)
    }
  }

  return NextResponse.json({ ok: true, memberId: member.id, checkedProblemIds })
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/api/github-webhook/route.test.ts"`
Expected: PASS — all 5 tests green.

- [ ] **Step 6: Full test suite + build check**

Run: `npx vitest run && npm run build`
Expected: All tests pass across the whole project; build succeeds, with `/api/github-webhook` listed as a route.

- [ ] **Step 7: Commit**

```bash
git add app/api/github-webhook/route.ts app/api/github-webhook/route.test.ts .env.local.example
git commit -m "Add GitHub push webhook for automatic problem check-off"
```

---

## Task 8: Configure and verify against the real GitHub repo and Vercel deployment

This task has no automated test — it is a manual setup + walkthrough. None of these steps can be done from this environment; they require the Supabase dashboard, the Vercel dashboard, and the GitHub repo's settings UI.

- [ ] **Step 1: Confirm the migration is live**

In the Supabase dashboard, re-check that `0004_github_sync.sql` ran successfully (Task 1).

- [ ] **Step 2: Add environment variables in Vercel**

In the Vercel project for `eoe-site` → Settings → Environment Variables, add:
- `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase dashboard → Project Settings → API → `service_role` secret key. **Never expose this to the client or commit it** — it bypasses all RLS.
- `GITHUB_WEBHOOK_SECRET` — any long random string you generate yourself (e.g. `openssl rand -hex 20`). You'll reuse this exact value in Step 4.

Redeploy (env var changes require a new deployment — trigger one from the Vercel dashboard or by pushing a commit) so the running app picks up the new variables.

- [ ] **Step 3: Add the same secret locally (optional, for local reference only)**

Add the same two lines to your local `.env.local` (not committed) using the values from Step 2 — this isn't required for the deployed webhook to work, but keeps your local `.env.local` consistent with `.env.local.example`.

- [ ] **Step 4: Configure the webhook on the GitHub repo**

In `https://github.com/EdgeOfEmployment/Coding-Test` → Settings → Webhooks → Add webhook:
- Payload URL: `https://eoe-site.vercel.app/api/github-webhook`
- Content type: `application/json`
- Secret: the exact same value used for `GITHUB_WEBHOOK_SECRET` in Step 2
- Which events: "Just the push event"
- Active: checked

Save.

- [ ] **Step 5: Register your GitHub username**

Log into the app, visit `/coding`, enter your GitHub username in the "내 GitHub 아이디" field, and save.
Expected: Redirected back to `/coding`, the field still shows your saved username after a refresh.

- [ ] **Step 6: Register a problem**

As the admin, register a problem whose title you'll use as the folder/file name convention (e.g. title `두 수의 합`), leaving the match-keyword field blank.

- [ ] **Step 7: Push a matching file and confirm auto-check**

In the `EdgeOfEmployment/Coding-Test` repo, push a file under a path containing the problem's title (per your convention, e.g. `{당신의이름}/두 수의 합/두 수의 합.py`).
In the GitHub repo → Settings → Webhooks → click the webhook → "Recent Deliveries", confirm the delivery shows a `200` response.
Refresh `/coding`.
Expected: Your row for that problem now shows "완료" without you having clicked the manual check button.

- [ ] **Step 8: Confirm the manual toggle still works independently**

On a different problem, click "체크" manually.
Expected: Toggles to "완료" as before; clicking again toggles back to "체크". Confirm this doesn't require any GitHub push.

- [ ] **Step 9: Record completion**

No commit needed for this task — it's verification only. If the webhook delivery in Step 7 doesn't show `200`, check the delivery's response body in GitHub's UI (it will include validation errors) and the Vercel function logs for the `/api/github-webhook` route before treating this as complete.

---

## Self-Review Notes

- **Spec coverage:** Explicitly reverses one Non-goal from the design spec at the user's request; both the manual self-check (spec's original requirement) and the new automatic GitHub-based check remain functional side by side. All four confirmed configuration choices (webhook detection, folder-path matching, keep both check paths, self-service GitHub username) are implemented as stated.
- **Type consistency:** `CodingProblem`/`Member` types are unchanged from the coding board plan; the webhook route works directly with raw Supabase rows (`title`, `match_keyword`, `id`) rather than the app's camelCase domain types, since it's a standalone server-to-server endpoint with no shared UI code — this is a deliberate boundary, not an inconsistency.
- **No placeholders:** every step contains complete, runnable code. The only non-automated steps are applying the SQL migration and the Vercel/GitHub dashboard configuration + final walkthrough (Task 8), each with explicit expected outcomes.
- **Security note carried through the plan:** `updateGithubUsername` never touches the raw `profiles` table directly from the server action — it always goes through the `update_own_github_username` RPC, which is the only thing preventing a technically savvy member from self-escalating their own `role`/`status` via a direct Supabase client call. Do not "simplify" this to a plain `.from('profiles').update(...)` call during implementation — that would reopen the privilege-escalation gap Task 1 was written specifically to close.
- **Assumptions to confirm with the user before/while executing:** substring-based title matching, `sender.login` as the identity source, no branch filtering, insert-only auto-check — see the header's Assumptions section. If any of these are wrong, the affected task is 7 (the webhook route itself).
