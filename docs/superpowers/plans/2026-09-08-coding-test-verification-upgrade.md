# Coding Test Verification Page Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `/coding` (코테 스터디) board so admins can register multiple problems at once, target specific members per problem, see a weekly submission deadline, and jump straight from a completed check to the exact GitHub commit/file that satisfied it.

**Architecture:** Everything builds on the existing Supabase-backed `coding_problems` / `coding_checks` tables and the existing push-only GitHub webhook (`app/api/github-webhook/route.ts`). We add an `assignee_ids uuid[]` column to `coding_problems` (empty = "everyone, including future approved members"), and `commit_sha`/`file_path` columns to `coding_checks` so the webhook can persist exactly which commit satisfied a check — the deep link is built from that, not guessed from a folder-naming convention. The deadline is never stored; it's always computed as `week_of + 6 days` and shown as a label only (no enforcement). The registration form becomes a client component that renders a repeatable list of problem rows (title/link/keyword/assignees) sharing one week picker, submitting to a single renamed server action, `createProblems`.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), Supabase (Postgres + RLS), Vitest + Testing Library.

---

## Design decisions locked in during the grill-me session

- Assignees are optional and multi-select per problem. Empty assignee list = every *currently approved* member is expected to solve it, evaluated dynamically (not a snapshot) — a member approved after the problem is created is still included.
- The webhook's auto-check logic is **not** filtered by assignee: any approved member's matching commit still records a check (assignees only control what the card *displays*).
- Deadline = `week_of` + 6 days, always computed, display-only. Late commits still auto-check normally.
- The "jump to GitHub" link is per completed check, not a guessed folder URL. The webhook stores the exact `commit_sha` + `file_path` that matched, and the UI links to `https://github.com/{GITHUB_SOURCE_REPO}/blob/{commit_sha}/{file_path}`. If a later push matches the same problem again, the stored commit info is overwritten with the latest one (check status itself, i.e. `checked_at`, does not change on conflict since it's omitted from the upsert payload).
- A member with no check yet shows "아직 제출 안됨" and no link — never a fallback repo-root link.
- Assignees are stored as `coding_problems.assignee_ids uuid[]`, not a join table (small team size, no need for FK-level integrity here).

---

## File Structure

- Modify `supabase/migrations/` — new migration adding the three columns.
- Modify `lib/coding/week.ts` / `lib/coding/week.test.ts` — add due-date helpers.
- Create `lib/coding/github-link.ts` / `lib/coding/github-link.test.ts` — commit-file URL builder.
- Modify `lib/coding/types.ts` — richer `CodingProblem`/`CodingCheck` shape.
- Modify `app/api/github-webhook/route.ts` / `route.test.ts` — persist commit info, overwrite on re-match.
- Modify `app/(app)/coding/actions.ts` / `actions.test.ts` — `createProblem` → `createProblems` (batch).
- Modify `app/(app)/coding/problem-form.tsx` / `problem-form.test.tsx` — repeatable rows + assignee checkboxes (becomes a client component).
- Modify `app/(app)/coding/problem-card.tsx` / `problem-card.test.tsx` — assignee filtering + commit link.
- Modify `app/(app)/coding/page.tsx` / `page.test.tsx` — fetch new columns, wire props, show the due-date label.

---

### Task 1: Database migration — assignees and commit link columns

**Files:**
- Create: `supabase/migrations/0012_coding_assignee_and_commit_links.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Coding board: let admins target specific members per problem (empty =
-- everyone, evaluated dynamically at read time), and let the GitHub webhook
-- record the exact commit + file path that satisfied a check so the
-- check-in page can link straight to it instead of guessing a folder URL.
alter table coding_problems
  add column assignee_ids uuid[] not null default '{}';

alter table coding_checks
  add column commit_sha text,
  add column file_path text;
```

- [ ] **Step 2: Apply it to the local/dev Supabase project**

Run: `npx supabase db push` (or however this repo's existing migrations have been applied — check `docs/superpowers/plans/2026-08-10-github-auto-check.md` for the project's convention if unsure).

No RLS policy changes are needed: the existing `"Admins can create coding problems"` insert policy and `"Approved members can read coding problems"` / `"...coding checks"` select policies already cover whichever columns are selected/inserted — they aren't column-scoped.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_coding_assignee_and_commit_links.sql
git commit -m "$(cat <<'EOF'
feat: add coding_problems.assignee_ids and coding_checks commit link columns

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 2: Week helper — due date label

**Files:**
- Modify: `lib/coding/week.ts`
- Test: `lib/coding/week.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `lib/coding/week.test.ts`:

```ts
describe('getWeekDueDate', () => {
  it('returns 6 days after the week-of date', () => {
    expect(getWeekDueDate('2026-08-11')).toBe('2026-08-17')
  })

  it('rolls over the month boundary correctly', () => {
    expect(getWeekDueDate('2026-08-28')).toBe('2026-09-03')
  })
})

describe('formatDueDateLabel', () => {
  it('formats a due date as "M/D 마감"', () => {
    expect(formatDueDateLabel('2026-08-17')).toBe('8/17 마감')
  })

  it('does not zero-pad single-digit month or day', () => {
    expect(formatDueDateLabel('2026-09-03')).toBe('9/3 마감')
  })
})
```

Update the import line at the top of the file to:

```ts
import { describe, it, expect } from 'vitest'
import { getMostRecentTuesday, formatWeekLabel, groupByWeek, getWeekDueDate, formatDueDateLabel } from './week'
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: FAIL — `getWeekDueDate` and `formatDueDateLabel` are not exported yet.

- [ ] **Step 3: Implement the helpers**

Append to `lib/coding/week.ts`:

```ts
export function getWeekDueDate(weekOf: string): string {
  const d = new Date(`${weekOf}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().slice(0, 10)
}

export function formatDueDateLabel(dueDate: string): string {
  const [, month, day] = dueDate.split('-')
  return `${Number(month)}/${Number(day)} 마감`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/coding/week.test.ts`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 5: Commit**

```bash
git add lib/coding/week.ts lib/coding/week.test.ts
git commit -m "$(cat <<'EOF'
feat: add week due-date helpers for the coding board

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 3: GitHub commit-file link helper

**Files:**
- Create: `lib/coding/github-link.ts`
- Test: `lib/coding/github-link.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCommitFileUrl } from './github-link'

describe('buildCommitFileUrl', () => {
  beforeEach(() => {
    vi.stubEnv('GITHUB_SOURCE_REPO', 'EdgeOfEmployment/Coding-Test')
  })

  it('builds a blob URL for the given commit sha and file path', () => {
    expect(buildCommitFileUrl('abc123', 'Donghyeon/two-sum/two-sum.js')).toBe(
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/abc123/Donghyeon/two-sum/two-sum.js'
    )
  })

  it('URL-encodes spaces and Korean characters in each path segment', () => {
    const url = buildCommitFileUrl('abc123', '동현/과제 진행하기/과제 진행하기.js')
    expect(url).toBe(
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/abc123/' +
        encodeURIComponent('동현') +
        '/' +
        encodeURIComponent('과제 진행하기') +
        '/' +
        encodeURIComponent('과제 진행하기.js')
    )
  })

  it('returns null when GITHUB_SOURCE_REPO is not configured', () => {
    vi.stubEnv('GITHUB_SOURCE_REPO', '')
    expect(buildCommitFileUrl('abc123', 'a/b.js')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/coding/github-link.test.ts`
Expected: FAIL — `./github-link` does not exist yet.

- [ ] **Step 3: Implement the helper**

```ts
export function buildCommitFileUrl(commitSha: string, filePath: string): string | null {
  const repo = process.env.GITHUB_SOURCE_REPO
  if (!repo) return null

  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `https://github.com/${repo}/blob/${commitSha}/${encodedPath}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/coding/github-link.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/coding/github-link.ts lib/coding/github-link.test.ts
git commit -m "$(cat <<'EOF'
feat: add helper to build a GitHub commit-file URL for coding checks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 4: Extend the coding domain types

**Files:**
- Modify: `lib/coding/types.ts`

- [ ] **Step 1: Replace the file contents**

```ts
export interface Member {
  id: string
  name: string
}

export interface CodingCheck {
  userId: string
  commitSha: string | null
  filePath: string | null
}

export interface CodingProblem {
  id: string
  title: string
  link: string
  weekOf: string
  createdBy: string
  createdAt: string
  assigneeIds: string[]
  checks: CodingCheck[]
}
```

This is a breaking shape change (`checkedUserIds: string[]` → `checks: CodingCheck[]`, plus new `assigneeIds`). Every consumer is updated in Tasks 5–9, so leaving this half-done between tasks will not compile — do not stop mid-plan.

- [ ] **Step 2: Confirm nothing else references the old shape yet**

Run: `npx tsc --noEmit`
Expected: Errors in `app/(app)/coding/page.tsx` and `app/(app)/coding/problem-card.tsx` (and their tests) referencing `checkedUserIds` — this is expected until Tasks 8–9 land. Do not fix them here; just confirm the errors are exactly those two files plus tests, not something unrelated.

- [ ] **Step 3: Commit**

```bash
git add lib/coding/types.ts
git commit -m "$(cat <<'EOF'
feat: extend CodingProblem with assigneeIds and per-check commit info

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 5: GitHub webhook — persist and refresh the matched commit

**Files:**
- Modify: `app/api/github-webhook/route.ts`
- Test: `app/api/github-webhook/route.test.ts`

- [ ] **Step 1: Update the failing tests**

Replace the two existing match tests and add a new one. In `app/api/github-webhook/route.test.ts`, replace the `'auto-checks a problem whose title appears in a changed file path'` test with:

```ts
  it('auto-checks a problem and stores the commit sha and file path that matched', async () => {
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
      commits: [{ id: 'sha-1', added: ['kimminsu/두 수의 합/두 수의 합.js'], modified: [] }],
    })
    const request = buildRequest(body)

    const response = await POST(request)
    const json = await response.json()

    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-1',
        file_path: 'kimminsu/두 수의 합/두 수의 합.js',
      },
      { onConflict: 'problem_id,user_id' }
    )
    expect(json.checkedProblemIds).toEqual(['problem-1'])
  })
```

Replace the `'uses match_keyword instead of the title when the admin set one'` test with:

```ts
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
      commits: [{ id: 'sha-1', added: ['kimminsu/two-sum/two-sum.py'], modified: [] }],
    })
    const request = buildRequest(body)

    await POST(request)

    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-1',
        file_path: 'kimminsu/two-sum/two-sum.py',
      },
      { onConflict: 'problem_id,user_id' }
    )
  })
```

Add a new test right after it, in the same `describe` block:

```ts
  it('overwrites the stored commit with the most recent match when the same file changes twice in one push', async () => {
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
      commits: [
        { id: 'sha-old', added: [], modified: ['kimminsu/두 수의 합/두 수의 합.js'] },
        { id: 'sha-new', added: [], modified: ['kimminsu/두 수의 합/두 수의 합.js'] },
      ],
    })
    const request = buildRequest(body)

    await POST(request)

    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-new',
        file_path: 'kimminsu/두 수의 합/두 수의 합.js',
      },
      { onConflict: 'problem_id,user_id' }
    )
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: Run the tests to verify the updated ones fail**

Run: `npx vitest run app/api/github-webhook/route.test.ts`
Expected: FAIL on the three tests above — current implementation still calls `upsert` with `{ problem_id, user_id }` and `ignoreDuplicates: true`, and never reads `commit.id`.

- [ ] **Step 3: Implement the change**

Replace `app/api/github-webhook/route.ts` from the `changedPaths` block onward:

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

  if (payload.repository?.full_name !== process.env.GITHUB_SOURCE_REPO) {
    return NextResponse.json({ ok: true, skipped: 'unexpected repository' })
  }

  const pusherLogin = payload.sender?.login as string | undefined

  if (!pusherLogin) {
    return NextResponse.json({ ok: true, skipped: 'no pusher login' })
  }

  // Map changed file path -> the sha of the commit that touched it. Commits
  // arrive oldest-first, so a later commit for the same path overwrites the
  // earlier one, leaving the most recent sha per path.
  const changedFiles = new Map<string, string>()
  for (const commit of payload.commits ?? []) {
    const sha = commit.id as string
    for (const path of [...(commit.added ?? []), ...(commit.modified ?? [])]) {
      changedFiles.set(path, sha)
    }
  }

  if (changedFiles.size === 0) {
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
    const matchedPath = Array.from(changedFiles.keys()).find((path) =>
      path.toLowerCase().includes(keyword)
    )

    if (matchedPath) {
      const commitSha = changedFiles.get(matchedPath)!
      const { error } = await supabase.from('coding_checks').upsert(
        { problem_id: problem.id, user_id: member.id, commit_sha: commitSha, file_path: matchedPath },
        { onConflict: 'problem_id,user_id' }
      )
      if (!error) checkedProblemIds.push(problem.id)
    }
  }

  return NextResponse.json({ ok: true, memberId: member.id, checkedProblemIds })
}
```

Note the `upsert` no longer passes `ignoreDuplicates: true` — on conflict it now merges the new `commit_sha`/`file_path` into the existing row. Because `checked_at` isn't in the payload, its original `default now()` value from the first insert is left untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/api/github-webhook/route.test.ts`
Expected: PASS (all tests, including the untouched signature/event/repo/member ones)

- [ ] **Step 5: Commit**

```bash
git add app/api/github-webhook/route.ts app/api/github-webhook/route.test.ts
git commit -m "$(cat <<'EOF'
feat: have the GitHub webhook persist the matched commit sha and file path

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 6: Batch problem registration — `createProblems` server action

**Files:**
- Modify: `app/(app)/coding/actions.ts`
- Test: `app/(app)/coding/actions.test.ts`

- [ ] **Step 1: Replace the `createProblem` describe block and helper with the batch version**

In `app/(app)/coding/actions.test.ts`, replace the `buildFormData` helper (to support repeated keys for checkbox arrays):

```ts
function buildFormData(fields: Record<string, string | string[]>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const v of value) formData.append(key, v)
    } else {
      formData.set(key, value)
    }
  }
  return formData
}
```

Replace the import line:

```ts
import { createProblems, deleteProblem, updateGithubUsername, adminRemoveCheck } from './actions'
```

Replace the entire `describe('createProblem', ...)` block with:

```ts
describe('createProblems', () => {
  it('redirects with an error when the week is missing', async () => {
    const formData = buildFormData({
      weekOf: '',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('대상 주차와 문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when no problem rows are present', async () => {
    const formData = buildFormData({ weekOf: '2026-08-11', rowIds: '' })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('대상 주차와 문제를 최소 1개 이상 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('redirects with an error when a row is missing its title or link', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': '',
    })

    await expect(createProblems(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('throws when the caller is not an admin', async () => {
    mockAdminCheck('member')
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow('권한이 없습니다')
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('creates a single problem with a null keyword and empty assignee list when none are given', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith('/coding?success=' + encodeURIComponent('문제 1개를 등록했어요'))
  })

  it('creates multiple problems in one submission, each with its own keyword and assignees', async () => {
    const formData = buildFormData({
      weekOf: '2026-08-11',
      rowIds: 'row-1,row-2',
      'title-row-1': '두 수의 합',
      'link-row-1': 'https://example.com/problem/1',
      'matchKeyword-row-1': 'two-sum',
      'assigneeIds-row-1': ['user-1', 'user-2'],
      'title-row-2': '세 수의 합',
      'link-row-2': 'https://example.com/problem/2',
    })

    await expect(createProblems(formData)).rejects.toThrow()

    expect(insertMock).toHaveBeenCalledWith([
      {
        title: '두 수의 합',
        link: 'https://example.com/problem/1',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: 'two-sum',
        assignee_ids: ['user-1', 'user-2'],
      },
      {
        title: '세 수의 합',
        link: 'https://example.com/problem/2',
        week_of: '2026-08-11',
        created_by: 'admin-1',
        match_keyword: null,
        assignee_ids: [],
      },
    ])
    expect(redirectMock).toHaveBeenCalledWith('/coding?success=' + encodeURIComponent('문제 2개를 등록했어요'))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: FAIL — `createProblems` is not exported yet.

- [ ] **Step 3: Implement the action**

In `app/(app)/coding/actions.ts`, replace the `createProblem` function with:

```ts
export async function createProblems(formData: FormData) {
  const weekOf = formData.get('weekOf') as string
  const rowIds = ((formData.get('rowIds') as string) || '').split(',').filter(Boolean)

  if (!weekOf || rowIds.length === 0) {
    redirect('/coding?error=' + encodeURIComponent('대상 주차와 문제를 최소 1개 이상 입력해주세요'))
    return
  }

  const rows = rowIds.map((rowId) => ({
    title: (formData.get(`title-${rowId}`) as string) || '',
    link: (formData.get(`link-${rowId}`) as string) || '',
    matchKeyword: (formData.get(`matchKeyword-${rowId}`) as string) || null,
    assigneeIds: formData.getAll(`assigneeIds-${rowId}`) as string[],
  }))

  if (rows.some((row) => !row.title || !row.link)) {
    redirect('/coding?error=' + encodeURIComponent('모든 문제에 문제명과 링크를 입력해주세요'))
    return
  }

  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

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

  const { error } = await supabase.from('coding_problems').insert(
    rows.map((row) => ({
      title: row.title,
      link: row.link,
      week_of: weekOf,
      created_by: user.id,
      match_keyword: row.matchKeyword,
      assignee_ids: row.assigneeIds,
    }))
  )

  if (error) {
    redirect('/coding?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/coding')
  redirect('/coding?success=' + encodeURIComponent(`문제 ${rows.length}개를 등록했어요`))
}
```

Leave `updateGithubUsername`, `deleteProblem`, and `adminRemoveCheck` untouched.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/actions.test.ts"`
Expected: PASS (all tests, including the untouched `deleteProblem`/`updateGithubUsername`/`adminRemoveCheck` blocks)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "$(cat <<'EOF'
feat: replace createProblem with a batch createProblems action

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 7: Problem registration form — repeatable rows + assignees

**Files:**
- Modify: `app/(app)/coding/problem-form.tsx`
- Test: `app/(app)/coding/problem-form.test.tsx`

- [ ] **Step 1: Replace the test file**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createProblems: vi.fn(),
}))

vi.mock('@/lib/coding/week', () => ({
  getMostRecentTuesday: () => '2026-08-11',
}))

import { ProblemForm } from './problem-form'
import type { Member } from '@/lib/coding/types'

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

describe('ProblemForm', () => {
  it('renders a week-of input, one problem row, and a submit button', () => {
    render(<ProblemForm members={members} />)

    expect(screen.getByLabelText('대상 주차')).toBeInTheDocument()
    expect(screen.getByLabelText('문제명')).toBeInTheDocument()
    expect(screen.getByLabelText('문제 링크')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문제 등록' })).toBeInTheDocument()
  })

  it('defaults the week-of field to the most recent Tuesday', () => {
    render(<ProblemForm members={members} />)
    expect(screen.getByLabelText('대상 주차')).toHaveValue('2026-08-11')
  })

  it('renders an optional match keyword input', () => {
    render(<ProblemForm members={members} />)
    const input = screen.getByLabelText('저장소 매칭 키워드 (선택)')
    expect(input).toBeInTheDocument()
    expect(input).not.toBeRequired()
  })

  it('renders an assignee checkbox for every approved member', () => {
    render(<ProblemForm members={members} />)
    expect(screen.getByRole('checkbox', { name: '김민수' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '이지은' })).toBeInTheDocument()
  })

  it('does not show a row-remove button when only one row exists', () => {
    render(<ProblemForm members={members} />)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })

  it('adds another problem row when "문제 추가" is clicked', () => {
    render(<ProblemForm members={members} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))

    expect(screen.getAllByLabelText('문제명')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '제거' })).toHaveLength(2)
  })

  it('removes a row when its "제거" button is clicked', () => {
    render(<ProblemForm members={members} />)

    fireEvent.click(screen.getByRole('button', { name: '문제 추가' }))
    fireEvent.click(screen.getAllByRole('button', { name: '제거' })[0])

    expect(screen.getAllByLabelText('문제명')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: FAIL — `ProblemForm` doesn't accept a `members` prop yet, has no checkboxes, and has no add/remove row behavior.

- [ ] **Step 3: Implement the component**

```tsx
'use client'

import { useRef, useState } from 'react'
import { createProblems } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Member } from '@/lib/coding/types'

interface ProblemRow {
  id: string
}

export function ProblemForm({ members }: { members: Member[] }) {
  const defaultWeek = getMostRecentTuesday(new Date())
  const idCounter = useRef(0)

  function makeRow(): ProblemRow {
    idCounter.current += 1
    return { id: `row-${idCounter.current}` }
  }

  const [rows, setRows] = useState<ProblemRow[]>(() => [makeRow()])

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev))
  }

  return (
    <Card as="form" action={createProblems} className="flex flex-col gap-4">
      <input type="hidden" name="rowIds" value={rows.map((row) => row.id).join(',')} />
      <div>
        <Label htmlFor="weekOf" className="sr-only">
          대상 주차
        </Label>
        <Input id="weekOf" name="weekOf" type="date" defaultValue={defaultWeek} required />
      </div>
      {rows.map((row, index) => (
        <div key={row.id} className="flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">문제 {index + 1}</span>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                className="text-xs text-red-600 dark:text-red-400"
              >
                제거
              </button>
            )}
          </div>
          <Label htmlFor={`title-${row.id}`} className="sr-only">
            문제명
          </Label>
          <Input id={`title-${row.id}`} name={`title-${row.id}`} placeholder="문제명" required />
          <Label htmlFor={`link-${row.id}`} className="sr-only">
            문제 링크
          </Label>
          <Input id={`link-${row.id}`} name={`link-${row.id}`} type="url" placeholder="문제 링크" required />
          <Label htmlFor={`matchKeyword-${row.id}`} className="sr-only">
            저장소 매칭 키워드 (선택)
          </Label>
          <Input
            id={`matchKeyword-${row.id}`}
            name={`matchKeyword-${row.id}`}
            placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)"
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs text-gray-500 dark:text-gray-400">
              담당자 (선택, 비우면 전체 대상)
            </legend>
            {members.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`assigneeIds-${row.id}`} value={member.id} />
                {member.name}
              </label>
            ))}
          </fieldset>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={addRow}>
          문제 추가
        </Button>
        <Button type="submit" size="lg">
          문제 등록
        </Button>
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/problem-form.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/problem-form.tsx" "app/(app)/coding/problem-form.test.tsx"
git commit -m "$(cat <<'EOF'
feat: support registering multiple coding problems with per-problem assignees

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 8: Problem card — assignee filtering + commit link

**Files:**
- Modify: `app/(app)/coding/problem-card.tsx`
- Test: `app/(app)/coding/problem-card.test.tsx`

- [ ] **Step 1: Replace the test file**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
}))

import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

const baseProblem: CodingProblem = {
  id: 'problem-1',
  title: '두 수의 합',
  link: 'https://example.com/problem/1',
  weekOf: '2026-08-11',
  createdBy: 'admin-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  assigneeIds: [],
  checks: [{ userId: 'user-2', commitSha: null, filePath: null }],
}

const members: Member[] = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

beforeEach(() => {
  vi.stubEnv('GITHUB_SOURCE_REPO', 'EdgeOfEmployment/Coding-Test')
})

describe('ProblemCard', () => {
  it('renders the problem title as a link and lists all members when no assignees are set', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} />)

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      'https://example.com/problem/1'
    )
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('lists only the assigned members when assigneeIds is non-empty', () => {
    const problem = { ...baseProblem, assigneeIds: ['user-2'] }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)

    expect(screen.queryByText('김민수')).not.toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('shows completion status as plain text for every member, never a clickable check button', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} />)

    expect(screen.queryByRole('button', { name: '체크' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '완료' })).not.toBeInTheDocument()
    expect(screen.getByText('완료')).toBeInTheDocument()
    expect(screen.getByText('미완료')).toBeInTheDocument()
  })

  it('shows "아직 제출 안됨" and no link for a member with no check', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} />)

    expect(screen.getByText('아직 제출 안됨')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '코드 보기' })).not.toBeInTheDocument()
  })

  it('links to the exact commit file when a check has commit info', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-2', commitSha: 'sha-1', filePath: 'user2/two-sum/two-sum.js' }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} />)

    expect(screen.getByRole('link', { name: '코드 보기' })).toHaveAttribute(
      'href',
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/sha-1/user2/two-sum/two-sum.js'
    )
  })

  it('does not show a cancel button for non-admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('shows a cancel button only next to the completed member when viewed by an admin', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} />)
    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })

  it('does not show a delete button for non-admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: FAIL — `ProblemCard` still reads `problem.checkedUserIds` (a type error and a runtime `undefined.includes` failure), doesn't filter by `assigneeIds`, and never renders "코드 보기" or "아직 제출 안됨".

- [ ] **Step 3: Implement the component**

```tsx
import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem } from './actions'
import { buildCommitFileUrl } from '@/lib/coding/github-link'
import { Card } from '@/components/ui/card'

export function ProblemCard({
  problem,
  members,
  isAdmin,
}: {
  problem: CodingProblem
  members: Member[]
  isAdmin: boolean
}) {
  const targetMembers =
    problem.assigneeIds.length > 0
      ? members.filter((member) => problem.assigneeIds.includes(member.id))
      : members

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <a href={problem.link} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          {problem.title}
        </a>
        {isAdmin && (
          <form action={deleteProblem.bind(null, problem.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>
      <ul className="flex flex-col gap-1">
        {targetMembers.map((member) => {
          const check = problem.checks.find((c) => c.userId === member.id)
          const checked = Boolean(check)
          const commitUrl =
            check?.commitSha && check?.filePath ? buildCommitFileUrl(check.commitSha, check.filePath) : null

          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  checked
                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {checked ? '완료' : '미완료'}
              </span>
              {isAdmin && checked && (
                <form action={adminRemoveCheck.bind(null, problem.id, member.id)}>
                  <button type="submit" className="text-xs text-red-600 dark:text-red-400">
                    취소
                  </button>
                </form>
              )}
              <span>{member.name}</span>
              {commitUrl && (
                <a href={commitUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  코드 보기
                </a>
              )}
              {!checked && <span className="text-xs text-gray-400">아직 제출 안됨</span>}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/problem-card.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/problem-card.tsx" "app/(app)/coding/problem-card.test.tsx"
git commit -m "$(cat <<'EOF'
feat: filter problem card members by assignee and link to the matched commit

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 9: Wire the coding page together + show the due date

**Files:**
- Modify: `app/(app)/coding/page.tsx`
- Test: `app/(app)/coding/page.test.tsx`

- [ ] **Step 1: Update the test file**

In `app/(app)/coding/page.test.tsx`, update the `problems` and `checks` fixtures and add a due-date assertion:

```tsx
const problems = [
  {
    id: 'problem-1',
    title: '두 수의 합',
    link: 'https://example.com/problem/1',
    week_of: '2026-08-11',
    created_by: 'admin-1',
    created_at: '2026-08-11T00:00:00.000Z',
    assignee_ids: [],
  },
]

const checks = [{ problem_id: 'problem-1', user_id: 'user-1', commit_sha: null, file_path: null }]
```

Replace the `'coding_problems'` mock's `createProblem` reference in the `vi.mock('./actions', ...)` block:

```tsx
vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))
```

Add this assertion inside the first `it` block, right after the existing `expect(screen.getByText('8/11 주차')).toBeInTheDocument()` line:

```tsx
    expect(screen.getByText('8/17 마감')).toBeInTheDocument()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: FAIL — no due-date text is rendered yet, and `ProblemForm`/`ProblemCard` still expect the old data shape (though `ProblemForm` won't render in this test since the session role is `member`, so the failure will chiefly be the due-date assertion and any `ProblemCard` prop-shape errors).

- [ ] **Step 3: Implement the page changes**

Replace `app/(app)/coding/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { groupByWeek, formatWeekLabel, getWeekDueDate, formatDueDateLabel } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { GithubSettingsForm } from './github-settings-form'
import type { CodingProblem, Member } from '@/lib/coding/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { EmptyState } from '@/components/ui/empty-state'

export default async function CodingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
  const supabase = await createClient()
  const session = await getSessionProfile()

  const [{ data: callerProfile }, { data: profiles }, { data: problems }] = await Promise.all([
    supabase.from('profiles').select('github_username').eq('id', session!.userId).single(),
    supabase.from('profiles').select('id, name').eq('status', 'approved'),
    supabase
      .from('coding_problems')
      .select('id, title, link, week_of, created_by, created_at, assignee_ids')
      .order('week_of', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path')
      .in('problem_id', problemIds)
  )

  const codingProblems: CodingProblem[] = (problems ?? []).map((problem) => ({
    id: problem.id,
    title: problem.title,
    link: problem.link,
    weekOf: problem.week_of,
    createdBy: problem.created_by,
    createdAt: problem.created_at,
    assigneeIds: (problem.assignee_ids as string[] | null) ?? [],
    checks: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => ({
        userId: c.user_id,
        commitSha: c.commit_sha as string | null,
        filePath: c.file_path as string | null,
      })),
  }))

  const weekGroups = groupByWeek(codingProblems)

  return (
    <PageShell title="코테 스터디">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <GithubSettingsForm currentUsername={callerProfile?.github_username ?? null} />
      {isAdmin && <ProblemForm members={members} />}
      <div className="mt-6 flex flex-col gap-6">
        {weekGroups.map((week) => (
          <section key={week.weekOf}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">{formatWeekLabel(week.weekOf)}</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {formatDueDateLabel(getWeekDueDate(week.weekOf))}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {week.items.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {weekGroups.length === 0 && <EmptyState message="아직 등록된 문제가 없습니다." />}
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "app/(app)/coding/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "$(cat <<'EOF'
feat: show weekly due dates and pass assignees/commit links through the coding page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HDzEkWMfJCq9WYvccHRrtW
EOF
)"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS, 0 failures. If any test times out under load, re-run just that file in isolation before treating it as a real regression (this suite has a known history of flakiness under concurrent load).

- [ ] **Step 2: Run the type checker**

Run: `npx tsc --noEmit`
Expected: 0 errors. This is the point where Task 4's temporarily-broken `checkedUserIds` references should be fully gone.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: 0 new errors (there is one pre-existing, unrelated lint issue already known from the design-system merge — do not attempt to fix it here).

- [ ] **Step 4: Manual smoke test**

Start the dev server (`npm run dev`), sign in as an admin, and on `/coding`:
1. Register two problems in one submission with different assignees for each, confirm both appear under the same week heading with a "N/DD 마감" label 6 days after the week-of date.
2. Confirm a problem with assignees only lists those members' rows; a problem with no assignees lists everyone.
3. Send a test webhook payload (or push a real commit matching a `match_keyword`/title to the configured `GITHUB_SOURCE_REPO`) and confirm the matching member's row flips to "완료" with a "코드 보기" link that opens the exact file at that commit.
4. Push a second matching commit for the same problem/user and confirm the "코드 보기" link updates to the new commit instead of duplicating the row.

- [ ] **Step 5: Final commit (only if smoke testing surfaced fixes)**

If Step 4 required any code changes, commit them separately with a message describing what the smoke test caught.
