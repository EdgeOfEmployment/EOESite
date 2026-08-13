# Coding Board Push-Only Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the manual "체크" self-check button on `/coding` so a problem's "완료" status can only ever be produced by the GitHub push auto-detect webhook; give admins a way to cancel an incorrectly auto-matched completion; and fix a webhook gap where it never verified which GitHub repository an event came from.

**Architecture:** Drop the two member-scoped RLS policies on `coding_checks` that let a member insert/delete their own row, replacing them with an admin-only delete policy. Remove the `toggleCheck` server action and its button in `ProblemCard`, replacing it with an admin-only `adminRemoveCheck` action and a small "취소" button that only renders for admins next to a completed row. Add a `payload.repository.full_name` check to the webhook route, gated by a new `GITHUB_SOURCE_REPO` env var.

**Tech Stack:** Next.js Server Actions, Supabase (Postgres RLS), Vitest + React Testing Library. Builds on `docs/superpowers/plans/2026-08-10-coding-board.md` and `docs/superpowers/plans/2026-08-10-github-auto-check.md`, both already fully implemented. See `docs/superpowers/specs/2026-08-13-coding-push-only-check-design.md` for the full design rationale.

---

## File Structure

```
supabase/
  migrations/
    0008_lock_coding_checks.sql   # NEW: drop member self-check RLS policies, add admin-delete policy
app/
  (app)/
    coding/
      actions.ts                   # MODIFY: add adminRemoveCheck, remove toggleCheck
      actions.test.ts              # MODIFY
      problem-card.tsx             # MODIFY: read-only badges for everyone, admin-only cancel button
      problem-card.test.tsx        # MODIFY
      page.tsx                     # MODIFY: stop passing currentUserId to ProblemCard
      page.test.tsx                # MODIFY: mock adminRemoveCheck instead of toggleCheck
  api/
    github-webhook/
      route.ts                     # MODIFY: validate payload.repository.full_name
      route.test.ts                # MODIFY
.env.local.example                 # MODIFY: document GITHUB_SOURCE_REPO
```

---

## Task 1: Database migration — lock down `coding_checks` RLS

**Files:**

- Create: `supabase/migrations/0008_lock_coding_checks.sql`

- [x] **Step 1: Write the migration**

Create `supabase/migrations/0008_lock_coding_checks.sql`:

```sql
drop policy "Members can create own coding checks" on coding_checks;
drop policy "Members can delete own coding checks" on coding_checks;

create policy "Admins can delete coding checks"
  on coding_checks for delete
  using (public.is_admin());
```

- [x] **Step 2: Apply the migration manually**

Open the Supabase project dashboard → SQL Editor → paste the contents of `0008_lock_coding_checks.sql` → Run.

- [x] **Step 3: Verify manually**

In the Supabase dashboard SQL Editor, run:

```sql
select policyname, cmd from pg_policies where tablename = 'coding_checks';
```

Expected: exactly two rows — `"Approved members can read coding checks"` (`SELECT`) and `"Admins can delete coding checks"` (`DELETE`). No `INSERT` policy and no member-scoped `DELETE` policy should remain.

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/0008_lock_coding_checks.sql
git commit -m "Lock coding_checks RLS to admin-only delete, remove member self-write"
```

---

## Task 2: Add `adminRemoveCheck` server action

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

- [x] **Step 1: Write the failing tests**

In `app/(app)/coding/actions.test.ts`, update the top-level import to add `adminRemoveCheck`:

```ts
import { createProblem, toggleCheck, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'
```

Append this new `describe` block at the end of the file:

```ts

describe('adminRemoveCheck', () => {
  it('throws when the caller is not an admin', async () => {
    const secondEq = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'member' }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: () => ({ eq: secondEq }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(adminRemoveCheck('problem-1', 'user-2')).rejects.toThrow('권한이 없습니다')
    expect(secondEq).not.toHaveBeenCalled()
  })

  it('deletes the matching check when the caller is an admin', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: null })
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await adminRemoveCheck('problem-1', 'user-2')

    expect(firstEq).toHaveBeenCalledWith('problem_id', 'problem-1')
    expect(secondEq).toHaveBeenCalledWith('user_id', 'user-2')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })
})
```

- [x] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `Cannot find export 'adminRemoveCheck'`. All other tests (createProblem: 4, toggleCheck: 2, deleteProblem: 2, updateGithubUsername: 3 = 11) still pass.

- [x] **Step 3: Implement the action**

Add to the end of `app/(app)/coding/actions.ts`:

```ts

export async function adminRemoveCheck(problemId: string, userId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('권한이 없습니다')

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)
  if (!callerProfile || callerProfile.role !== 'admin') throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_checks')
    .delete()
    .eq('problem_id', problemId)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — all 13 tests green.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Add adminRemoveCheck server action for admin-only check cancellation"
```

---

## Task 3: Switch `ProblemCard` to read-only badges + admin cancel button

**Files:**

- Modify: `app/(app)/coding/problem-card.tsx`
- Modify: `app/(app)/coding/problem-card.test.tsx`
- Modify: `app/(app)/coding/page.tsx`
- Modify: `app/(app)/coding/page.test.tsx`

- [x] **Step 1: Write the failing tests**

Replace the entire contents of `app/(app)/coding/problem-card.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
}))

import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

const problem: CodingProblem = {
  id: 'problem-1',
  title: '두 수의 합',
  link: 'https://example.com/problem/1',
  weekOf: '2026-08-11',
  createdBy: 'admin-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  checkedUserIds: ['user-2'],
}

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

describe('ProblemCard', () => {
  it('renders the problem title as a link and lists all members', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      'https://example.com/problem/1'
    )
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('shows completion status as plain text for every member, never a clickable check button', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)

    expect(screen.queryByRole('button', { name: '체크' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료' })).not.toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByText('미완료')).toBeInTheDocument()
  })

  it('does not show a cancel button for non-admins', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('shows a cancel button only next to the completed member when viewed by an admin', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={true} />)
    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })

  it('does not show a delete button for non-admins', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<ProblemCard problem={problem} members={members} isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: FAIL — the current component still imports `toggleCheck` (not mocked anymore) and renders a clickable "체크"/"완료" button and passes no `isSelf`/`currentUserId` handling matching the new expectations. There is no "취소" button yet.

- [x] **Step 3: Rewrite the component**

Replace the entire contents of `app/(app)/coding/problem-card.tsx` with:

```tsx
import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem } from './actions'

export function ProblemCard({
  problem,
  members,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  isAdmin: boolean
}) {
  return (
    <div className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <a
          href={problem.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          {problem.title}
        </a>
        {isAdmin && (
          <form action={deleteProblem.bind(null, problem.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {members.map((member) => {
          const checked = problem.checkedUserIds.includes(member.id)
          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span className={`rounded border px-2 py-0.5 text-xs ${checked ? 'bg-gray-200' : ''}`}>
                {checked ? '완료' : '미완료'}
              </span>
              {isAdmin && checked && (
                <form action={adminRemoveCheck.bind(null, problem.id, member.id)}>
                  <button type="submit" className="text-xs text-red-600">
                    취소
                  </button>
                </form>
              )}
              <span>{member.name}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: PASS — all 6 tests green.

- [x] **Step 5: Stop passing the now-unused `currentUserId` prop from the page**

In `app/(app)/coding/page.tsx`, find this block:

```tsx
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  currentUserId={user!.id}
                  isAdmin={isAdmin}
                />
```

Replace it with:

```tsx
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                />
```

- [x] **Step 6: Update the page test's action mock**

In `app/(app)/coding/page.test.tsx`, find:

```ts
vi.mock('./actions', () => ({
  createProblem: vi.fn(),
  toggleCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))
```

Replace it with:

```ts
vi.mock('./actions', () => ({
  createProblem: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))
```

- [x] **Step 7: Run the full coding-board test files to verify nothing else broke**

Run: `npx vitest run "app/(app)/coding/"`
Expected: PASS — all test files under `app/(app)/coding/` green (`actions.test.ts`, `problem-card.test.tsx`, `problem-form.test.tsx`, `github-settings-form.test.tsx`, `page.test.tsx`).

- [x] **Step 8: Commit**

```bash
git add "app/(app)/coding/problem-card.tsx" "app/(app)/coding/problem-card.test.tsx" "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "Replace self-check button with read-only status and admin-only cancel"
```

---

## Task 4: Remove the now-dead `toggleCheck` action

**Files:**

- Modify: `app/(app)/coding/actions.ts`
- Modify: `app/(app)/coding/actions.test.ts`

Nothing imports `toggleCheck` anymore after Task 3 — it's dead code sitting behind an RLS policy (Task 1) that no longer permits it to work even if called. Remove it.

- [x] **Step 1: Remove the `toggleCheck` tests**

In `app/(app)/coding/actions.test.ts`, delete the entire `describe('toggleCheck', ...)` block (the block containing `mockFindExisting`, `'inserts a check when none exists yet'`, and `'deletes the existing check when the user already checked it'`).

- [x] **Step 2: Remove `toggleCheck` from the import line**

Change:

```ts
import { createProblem, toggleCheck, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'
```

to:

```ts
import { createProblem, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'
```

- [x] **Step 3: Remove the `toggleCheck` function**

In `app/(app)/coding/actions.ts`, delete the entire `toggleCheck` function (from `export async function toggleCheck(problemId: string) {` through its closing `}`).

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS — 11 tests green (13 from Task 2 minus the 2 removed `toggleCheck` tests).

- [x] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "Remove dead toggleCheck action now that completion is push-only"
```

---

## Task 5: Validate the webhook's source repository

**Files:**

- Modify: `app/api/github-webhook/route.ts`
- Modify: `app/api/github-webhook/route.test.ts`
- Modify: `.env.local.example`

- [x] **Step 1: Document the new env var**

In `.env.local.example`, add a new line after `GITHUB_WEBHOOK_SECRET=your-webhook-secret`:

```
GITHUB_SOURCE_REPO=EdgeOfEmployment/Coding-Test
```

The full file should read:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_SOURCE_REPO=EdgeOfEmployment/Coding-Test
```

- [x] **Step 2: Write the failing test**

Replace the entire contents of `app/api/github-webhook/route.test.ts` with:

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
const REPO = 'EdgeOfEmployment/Coding-Test'

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
  vi.stubEnv('GITHUB_SOURCE_REPO', REPO)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

describe('POST /api/github-webhook', () => {
  it('rejects a request with an invalid signature', async () => {
    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [],
    })
    const request = buildRequest(body, { signature: 'sha256=deadbeef' })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips non-push events', async () => {
    const body = JSON.stringify({
      repository: { full_name: REPO },
      sender: { login: 'kimminsu-dev' },
      commits: [],
    })
    const request = buildRequest(body, { event: 'ping' })

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'not a push event' })
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('skips a push from an unexpected repository', async () => {
    const body = JSON.stringify({
      repository: { full_name: 'someone-else/unrelated-repo' },
      sender: { login: 'kimminsu-dev' },
      commits: [{ added: ['kimminsu/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(json).toEqual({ ok: true, skipped: 'unexpected repository' })
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
      repository: { full_name: REPO },
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
      repository: { full_name: REPO },
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
      repository: { full_name: REPO },
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

- [x] **Step 3: Run the tests to verify the new one fails**

Run: `npx vitest run "app/api/github-webhook/route.test.ts"`
Expected: FAIL — only the new `'skips a push from an unexpected repository'` test fails (the route doesn't check `payload.repository` yet, so it falls through to the member lookup and calls `fromMock`, which throws `unexpected table profiles` since that test didn't set up a `profiles` mock implementation). The other 5 tests still pass.

- [x] **Step 4: Add the repository check**

In `app/api/github-webhook/route.ts`, find:

```ts
  const payload = JSON.parse(body)
  const pusherLogin = payload.sender?.login as string | undefined
```

Replace it with:

```ts
  const payload = JSON.parse(body)

  if (payload.repository?.full_name !== process.env.GITHUB_SOURCE_REPO) {
    return NextResponse.json({ ok: true, skipped: 'unexpected repository' })
  }

  const pusherLogin = payload.sender?.login as string | undefined
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "app/api/github-webhook/route.test.ts"`
Expected: PASS — all 6 tests green.

- [x] **Step 6: Full test suite + build check**

Run: `npx vitest run && npm run build`
Expected: All tests pass across the whole project; build succeeds.

- [x] **Step 7: Commit**

```bash
git add app/api/github-webhook/route.ts app/api/github-webhook/route.test.ts .env.local.example
git commit -m "Validate webhook events come from the expected source repository"
```

---

## Task 6: Configure and verify against the real Supabase/Vercel deployment

This task has no automated test — it is a manual setup + walkthrough. These steps require the Supabase dashboard, the Vercel dashboard, and a real push to `EdgeOfEmployment/Coding-Test`.

**Deployment order matters.** Deploy this branch's code to Vercel *before* applying the `0008_lock_coding_checks.sql` migration, not after. The old code (with the "체크" self-check button and `toggleCheck` action) still calls `.insert()` on `coding_checks` — if the migration lands first and drops the member-insert RLS policy while the old code is still serving traffic, any member clicking "체크" will hit a visible RLS-violation error. Once this branch's code is live, there is no insert call site left in the app that depends on that policy, so the migration is safe to apply immediately after. Setting `GITHUB_SOURCE_REPO` (Step 2) is independent and can happen before, during, or after the migration.

- [ ] **Step 1: Confirm the migration is live**

In the Supabase dashboard, re-check that `0008_lock_coding_checks.sql` ran successfully (Task 1) — and confirm it was applied *after* this branch's code was deployed, per the ordering note above.

- [ ] **Step 2: Add the new environment variable in Vercel**

In the Vercel project for `eoe-site` → Settings → Environment Variables, add:
- `GITHUB_SOURCE_REPO` = `EdgeOfEmployment/Coding-Test`

Redeploy (env var changes require a new deployment) so the running app picks up the new variable.

- [ ] **Step 3: Add the same variable locally (optional, for local reference only)**

Add `GITHUB_SOURCE_REPO=EdgeOfEmployment/Coding-Test` to your local `.env.local` (not committed).

- [ ] **Step 4: Confirm the manual check button is gone**

Log in as a non-admin approved member, visit `/coding`. Confirm every row (including your own) now shows plain "완료"/"미완료" text with no clickable button.

- [ ] **Step 5: Confirm a real push still auto-checks**

Push a file under a path containing a registered problem's title to `EdgeOfEmployment/Coding-Test` (per the existing `{이름}/{문제명}/{문제명}.ext` convention).
In the GitHub repo → Settings → Webhooks → the webhook → "Recent Deliveries", confirm the delivery shows a `200` response and the response body includes the matched problem id.
Refresh `/coding`.
Expected: your row for that problem now shows "완료".

- [ ] **Step 6: Confirm the admin cancel button works**

Log in as the admin account, visit `/coding`. Next to the row you just auto-checked in Step 5, confirm a "취소" button appears. Click it.
Expected: the row reverts to "미완료" for that member. **Refresh the page and confirm the row is still "미완료" after the refresh** — don't stop at "no error appeared," since a Supabase delete that matches zero rows (e.g. because the admin-delete RLS policy from Task 1 isn't actually live yet) also returns no error and would make the button look like it worked when the row never actually changed.

- [ ] **Step 7: Confirm non-admins never see the cancel button**

Log in as a non-admin member again and confirm no "취소" button appears anywhere on the board, even next to your own completed rows.

- [ ] **Step 8: Record completion**

No commit needed for this task — it's verification only. If Step 5's delivery doesn't show `200`, check the delivery's response body and the Vercel function logs for `/api/github-webhook` before treating this as complete.
