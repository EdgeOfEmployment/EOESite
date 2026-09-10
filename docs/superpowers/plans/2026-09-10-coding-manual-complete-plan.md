# 코딩보드 수동 완료 처리 재도입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코딩보드(`/coding`)에서 각 멤버가 본인 행에 한해 "완료 처리"를 수동으로 할 수 있게 하되, 자동(push) 감지 완료와 화면에서 명확히 구분되게 표시한다.

**Architecture:** `coding_checks`에 `source` 컬럼('auto'|'manual')을 추가하고, 멤버는 본인 소유의 `'manual'` 행만 INSERT/DELETE할 수 있도록 RLS를 확장한다. 웹훅은 계속 `'auto'`로 upsert하며, 나중에 실제 push가 들어오면 기존 `'manual'` 행을 `'auto'`로 승격(덮어쓰기)한다. UI는 배지 텍스트/색상으로 출처를 구분하고, 본인 행에만 완료/취소 버튼을 노출한다.

**Tech Stack:** Next.js App Router (Server Actions), Supabase (Postgres + RLS), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-10-coding-manual-complete-design.md`

---

## Task 1: DB 마이그레이션 — `source` 컬럼 및 RLS 정책

**Files:**
- Create: `supabase/migrations/0015_coding_checks_manual_source.sql`

이 저장소의 마이그레이션 파일은 순수 SQL이며 자동화된 테스트가 없다 (기존
`supabase/migrations/0008_lock_coding_checks.sql`도 동일한 패턴 — 직접 작성 후 커밋).
이 태스크만 TDD 단계를 따르지 않는다.

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
alter table coding_checks
  add column source text not null default 'auto' check (source in ('auto', 'manual'));

create policy "Members can create own manual coding checks"
  on coding_checks for insert
  with check (user_id = auth.uid() and source = 'manual' and public.is_approved());

create policy "Members can delete own manual coding checks"
  on coding_checks for delete
  using (user_id = auth.uid() and source = 'manual');
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/migrations/0015_coding_checks_manual_source.sql
git commit -m "feat: allow members to create/delete their own manual coding checks"
```

---

## Task 2: 웹훅이 `source: 'auto'`를 명시적으로 기록하도록 변경

**Files:**
- Modify: `app/api/github-webhook/route.ts:85-88`
- Test: `app/api/github-webhook/route.test.ts`

- [ ] **Step 1: 기존 테스트 3곳의 기대값에 `source: 'auto'` 추가 (실패하는 테스트 작성)**

`app/api/github-webhook/route.test.ts`에서 `upsertMock`을 검증하는 3개의 `expect` 블록을 아래처럼
수정한다 (109-151줄 `'auto-checks a problem...'`, 153-193줄 `'uses match_keyword...'`, 195-239줄
`'overwrites the stored commit...'`).

`'auto-checks a problem and stores the commit sha and file path that matched'` 테스트의
`expect(upsertMock)...` 블록을 다음으로 교체:

```ts
    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-1',
        file_path: 'kimminsu/두 수의 합/두 수의 합.js',
        source: 'auto',
      },
      { onConflict: 'problem_id,user_id' }
    )
```

`'uses match_keyword instead of the title when the admin set one'` 테스트의
`expect(upsertMock)...` 블록을 다음으로 교체:

```ts
    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-1',
        file_path: 'kimminsu/two-sum/two-sum.py',
        source: 'auto',
      },
      { onConflict: 'problem_id,user_id' }
    )
```

`'overwrites the stored commit with the most recent match...'` 테스트의
`expect(upsertMock)...` 블록을 다음으로 교체:

```ts
    expect(upsertMock).toHaveBeenCalledWith(
      {
        problem_id: 'problem-1',
        user_id: 'user-1',
        commit_sha: 'sha-new',
        file_path: 'kimminsu/두 수의 합/두 수의 합.js',
        source: 'auto',
      },
      { onConflict: 'problem_id,user_id' }
    )
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run app/api/github-webhook/route.test.ts`
Expected: 위 3개 테스트가 `source` 필드 불일치로 FAIL.

- [ ] **Step 3: 구현 — upsert 페이로드에 `source: 'auto'` 추가**

`app/api/github-webhook/route.ts`의 85-88줄:

```ts
      const { error } = await supabase.from('coding_checks').upsert(
        { problem_id: problem.id, user_id: member.id, commit_sha: commitSha, file_path: matchedPath },
        { onConflict: 'problem_id,user_id' }
      )
```

다음으로 교체:

```ts
      const { error } = await supabase.from('coding_checks').upsert(
        {
          problem_id: problem.id,
          user_id: member.id,
          commit_sha: commitSha,
          file_path: matchedPath,
          source: 'auto',
        },
        { onConflict: 'problem_id,user_id' }
      )
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run app/api/github-webhook/route.test.ts`
Expected: PASS (전체 8개 테스트).

- [ ] **Step 5: 커밋**

```bash
git add app/api/github-webhook/route.ts app/api/github-webhook/route.test.ts
git commit -m "feat: tag webhook-created coding checks as source 'auto'"
```

---

## Task 3: `CodingCheck` 타입에 `source` 필드 추가

**Files:**
- Modify: `lib/coding/types.ts:13-17`

타입 전용 변경이라 별도 테스트가 없다 — 이후 태스크(page.tsx, problem-card.tsx)의 타입 체크가
이 변경에 의존한다.

- [ ] **Step 1: `CodingCheck` 인터페이스 수정**

`lib/coding/types.ts`의 13-17줄:

```ts
export interface CodingCheck {
  userId: string
  commitSha: string | null
  filePath: string | null
}
```

다음으로 교체:

```ts
export interface CodingCheck {
  userId: string
  commitSha: string | null
  filePath: string | null
  source: 'auto' | 'manual'
}
```

- [ ] **Step 2: 커밋**

```bash
git add lib/coding/types.ts
git commit -m "feat: add source field to CodingCheck type"
```

---

## Task 4: 서버 액션 `markSelfComplete` / `unmarkSelfComplete`

**Files:**
- Modify: `app/(app)/coding/actions.ts`
- Test: `app/(app)/coding/actions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`app/(app)/coding/actions.test.ts`의 29번째 줄 import를 아래로 교체:

```ts
import {
  createProblems,
  deleteProblem,
  updateGithubUsername,
  adminRemoveCheck,
  markSelfComplete,
  unmarkSelfComplete,
} from './actions'
```

파일 끝(`describe('adminRemoveCheck', ...)` 블록 뒤)에 아래 두 `describe` 블록을 추가한다:

```ts
describe('markSelfComplete', () => {
  it('throws when the caller is not authenticated', async () => {
    getClaimsMock.mockResolvedValue({ data: null })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('권한이 없습니다')
  })

  it('throws when the problem is assigned to other members and the caller is not one of them', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn()
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: { assignee_ids: ['user-2'] }, error: null }) }),
          }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('본인에게 배정된 문제가 아닙니다')
    expect(checksInsert).not.toHaveBeenCalled()
  })

  it('inserts a manual check for the caller when the problem has no assignees', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await markSelfComplete('problem-1')

    expect(checksInsert).toHaveBeenCalledWith({
      problem_id: 'problem-1',
      user_id: 'user-1',
      source: 'manual',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('inserts a manual check when the caller is one of the assigned members', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: null })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { assignee_ids: ['user-1', 'user-2'] }, error: null }),
            }),
          }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await markSelfComplete('problem-1')

    expect(checksInsert).toHaveBeenCalledWith({
      problem_id: 'problem-1',
      user_id: 'user-1',
      source: 'manual',
    })
  })

  it('ignores a unique-constraint violation (already checked) without throwing', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).resolves.toBeUndefined()
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws the Supabase error message for a non-conflict insert failure', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const checksInsert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'permission denied' } })
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_problems') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { assignee_ids: [] }, error: null }) }) }),
        }
      }
      if (table === 'coding_checks') {
        return { insert: checksInsert }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(markSelfComplete('problem-1')).rejects.toThrow('permission denied')
  })
})

describe('unmarkSelfComplete', () => {
  it('throws when the caller is not authenticated', async () => {
    getClaimsMock.mockResolvedValue({ data: null })

    await expect(unmarkSelfComplete('problem-1')).rejects.toThrow('권한이 없습니다')
  })

  it("deletes the caller's own manual check and revalidates /coding", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const thirdEq = vi.fn().mockResolvedValue({ error: null })
    const secondEq = vi.fn(() => ({ eq: thirdEq }))
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await unmarkSelfComplete('problem-1')

    expect(firstEq).toHaveBeenCalledWith('problem_id', 'problem-1')
    expect(secondEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(thirdEq).toHaveBeenCalledWith('source', 'manual')
    expect(revalidatePathMock).toHaveBeenCalledWith('/coding')
  })

  it('throws the Supabase error message on delete failure', async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: 'user-1' } } })
    const thirdEq = vi.fn().mockResolvedValue({ error: { message: 'db error' } })
    const secondEq = vi.fn(() => ({ eq: thirdEq }))
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    fromMock.mockImplementation((table: string) => {
      if (table === 'coding_checks') {
        return { delete: () => ({ eq: firstEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    await expect(unmarkSelfComplete('problem-1')).rejects.toThrow('db error')
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run app/\(app\)/coding/actions.test.ts`
Expected: 새 테스트들이 `markSelfComplete`/`unmarkSelfComplete`가 정의되지 않아 FAIL.

- [ ] **Step 3: 구현**

`app/(app)/coding/actions.ts` 끝(`adminRemoveCheck` 함수 뒤)에 아래 두 함수를 추가한다:

```ts
export async function markSelfComplete(problemId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { data: problem, error: problemError } = await supabase
    .from('coding_problems')
    .select('assignee_ids')
    .eq('id', problemId)
    .single()

  if (problemError) throw new Error(problemError.message)

  const assigneeIds = (problem?.assignee_ids as string[] | null) ?? []
  if (assigneeIds.length > 0 && !assigneeIds.includes(user.id)) {
    throw new Error('본인에게 배정된 문제가 아닙니다')
  }

  const { error } = await supabase
    .from('coding_checks')
    .insert({ problem_id: problemId, user_id: user.id, source: 'manual' })

  if (error && error.code !== '23505') throw new Error(error.message)

  revalidatePath('/coding')
}

export async function unmarkSelfComplete(problemId: string) {
  const supabase = await createClient()

  const user = await getVerifiedUser(supabase)

  if (!user) throw new Error('권한이 없습니다')

  const { error } = await supabase
    .from('coding_checks')
    .delete()
    .eq('problem_id', problemId)
    .eq('user_id', user.id)
    .eq('source', 'manual')

  if (error) throw new Error(error.message)

  revalidatePath('/coding')
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run app/\(app\)/coding/actions.test.ts`
Expected: PASS (전체 테스트).

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts"
git commit -m "feat: add markSelfComplete/unmarkSelfComplete server actions"
```

---

## Task 5: `problem-card.tsx` — 배지 구분 표시 및 본인 완료/취소 버튼

**Files:**
- Modify: `app/(app)/coding/problem-card.tsx`
- Test: `app/(app)/coding/problem-card.test.tsx`

- [ ] **Step 1: 기존 테스트를 새 prop/텍스트에 맞게 수정 + 실패하는 신규 테스트 작성**

`app/(app)/coding/problem-card.test.tsx` 전체를 아래 내용으로 교체한다:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  markSelfComplete: vi.fn(),
  unmarkSelfComplete: vi.fn(),
}))

import { ProblemCard } from './problem-card'
import type { CodingProblem, Member } from '@/lib/coding/types'

const NON_MEMBER_VIEWER = 'viewer-x'

const baseProblem: CodingProblem = {
  id: 'problem-1',
  title: '두 수의 합',
  link: 'https://example.com/problem/1',
  createdBy: 'admin-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  assigneeIds: [],
  checks: [{ userId: 'user-2', commitSha: null, filePath: null, source: 'auto' }],
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
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      'https://example.com/problem/1'
    )
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('lists only the assigned members when assigneeIds is non-empty', () => {
    const problem = { ...baseProblem, assigneeIds: ['user-2'] }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.queryByText('김민수')).not.toBeInTheDocument()
    expect(screen.getByText('이지은')).toBeInTheDocument()
  })

  it('shows completion status as plain text for every member, never a clickable check button', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.queryByRole('button', { name: '체크' })).not.toBeInTheDocument()
    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.getByText('미완료')).toBeInTheDocument()
  })

  it('shows "아직 제출 안됨" and no link for a member with no check', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByText('아직 제출 안됨')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '코드 보기' })).not.toBeInTheDocument()
  })

  it('shows "완료 (자동 감지)" but no link and no "아직 제출 안됨" for an auto-checked member with no commit info', () => {
    const problem = { ...baseProblem, assigneeIds: ['user-2'] }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '코드 보기' })).not.toBeInTheDocument()
    expect(screen.queryByText('아직 제출 안됨')).not.toBeInTheDocument()
  })

  it('links to the exact commit file when a check has commit info', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-2', commitSha: 'sha-1', filePath: 'user2/two-sum/two-sum.js', source: 'auto' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)

    expect(screen.getByRole('link', { name: '코드 보기' })).toHaveAttribute(
      'href',
      'https://github.com/EdgeOfEmployment/Coding-Test/blob/sha-1/user2/two-sum/two-sum.js'
    )
  })

  it('does not show a cancel button for non-admins viewing someone else', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('shows a cancel button only next to the completed member when viewed by an admin', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.getAllByRole('button', { name: '취소' })).toHaveLength(1)
  })

  it('does not show a delete button for non-admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={true} currentUserId={NON_MEMBER_VIEWER} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a "완료 처리" button on the caller\'s own unchecked row', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByRole('button', { name: '완료 처리' })).toBeInTheDocument()
  })

  it('does not show a "완료 처리" button on another member\'s unchecked row', () => {
    render(<ProblemCard problem={baseProblem} members={members} isAdmin={false} currentUserId="user-2" />)

    expect(screen.queryByRole('button', { name: '완료 처리' })).not.toBeInTheDocument()
  })

  it('shows a manual badge and a self-cancel button on the caller\'s own manually-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'manual' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByText('완료 (본인 체크)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument()
  })

  it('does not show a self-cancel button on the caller\'s own auto-checked row', () => {
    const problem = {
      ...baseProblem,
      checks: [{ userId: 'user-1', commitSha: null, filePath: null, source: 'auto' as const }],
    }
    render(<ProblemCard problem={problem} members={members} isAdmin={false} currentUserId="user-1" />)

    expect(screen.getByText('완료 (자동 감지)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run app/\(app\)/coding/problem-card.test.tsx`
Expected: `currentUserId` prop 누락 타입 에러 및 텍스트/버튼 불일치로 다수 FAIL.

- [ ] **Step 3: 구현**

`app/(app)/coding/problem-card.tsx` 전체를 아래 내용으로 교체:

```tsx
import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem, markSelfComplete, unmarkSelfComplete } from './actions'
import { buildCommitFileUrl } from '@/lib/coding/github-link'
import { Card } from '@/components/ui/card'

export function ProblemCard({
  problem,
  members,
  isAdmin,
  currentUserId,
}: {
  problem: CodingProblem
  members: Member[]
  isAdmin: boolean
  currentUserId: string
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
          const isSelf = member.id === currentUserId
          const isManual = check?.source === 'manual'
          const commitUrl =
            check?.commitSha && check?.filePath ? buildCommitFileUrl(check.commitSha, check.filePath) : null

          const badgeLabel = !checked ? '미완료' : isManual ? '완료 (본인 체크)' : '완료 (자동 감지)'
          const badgeClass = !checked
            ? 'border-gray-300 dark:border-gray-700'
            : isManual
              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950'
              : 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'

          return (
            <li key={member.id} className="flex items-center gap-2 text-sm">
              <span className={`rounded border px-2 py-0.5 text-xs ${badgeClass}`}>{badgeLabel}</span>
              {isAdmin && checked && (
                <form action={adminRemoveCheck.bind(null, problem.id, member.id)}>
                  <button type="submit" className="text-xs text-red-600 dark:text-red-400">
                    취소
                  </button>
                </form>
              )}
              {isSelf && !checked && (
                <form action={markSelfComplete.bind(null, problem.id)}>
                  <button type="submit" className="text-xs underline">
                    완료 처리
                  </button>
                </form>
              )}
              {isSelf && isManual && (
                <form action={unmarkSelfComplete.bind(null, problem.id)}>
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

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run app/\(app\)/coding/problem-card.test.tsx`
Expected: PASS (전체 테스트).

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/coding/problem-card.tsx" "app/(app)/coding/problem-card.test.tsx"
git commit -m "feat: distinguish manual vs auto-detected coding checks and let members self-complete"
```

---

## Task 6: `page.tsx` — `source` 조회 및 `currentUserId` 전달

**Files:**
- Modify: `app/(app)/coding/page.tsx:55-76,110`
- Test: `app/(app)/coding/page.test.tsx`

- [ ] **Step 1: 기존 테스트 픽스처/모킹을 새 필드에 맞게 수정**

`app/(app)/coding/page.test.tsx`의 30번째 줄:

```ts
const checks = [{ problem_id: 'problem-1', user_id: 'user-1', commit_sha: null, file_path: null }]
```

다음으로 교체:

```ts
const checks = [
  { problem_id: 'problem-1', user_id: 'user-1', commit_sha: null, file_path: null, source: 'auto' },
]
```

72-77번째 줄의 `vi.mock('./actions', ...)`:

```ts
vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
}))
```

다음으로 교체:

```ts
vi.mock('./actions', () => ({
  createProblems: vi.fn(),
  adminRemoveCheck: vi.fn(),
  deleteProblem: vi.fn(),
  updateGithubUsername: vi.fn(),
  markSelfComplete: vi.fn(),
  unmarkSelfComplete: vi.fn(),
}))
```

파일 끝(`describe('CodingPage', ...)` 블록의 마지막 `it` 뒤)에 아래 테스트를 추가한다 — 세션
사용자의 id가 `ProblemCard`까지 실제로 전달되는지 검증한다 (`admin-1`은 기본 픽스처에서
`problem-1`에 대한 체크가 없는 미완료 상태다):

```ts
  it('shows a "완료 처리" button for the current session user on their own unchecked row', async () => {
    vi.mocked(getSessionProfile).mockResolvedValueOnce({
      userId: 'admin-1',
      role: 'member',
      status: 'approved',
    })

    const ui = await CodingPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '완료 처리' })).toBeInTheDocument()
  })
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run app/\(app\)/coding/page.test.tsx`
Expected: 새로 추가한 테스트가 `currentUserId`가 전달되지 않아 (`ProblemCard`가 `undefined`를
받아 `isSelf`가 항상 `false`) "완료 처리" 버튼을 찾지 못하고 FAIL. 나머지 기존 테스트는 PASS.

- [ ] **Step 3: 구현 — `source` 컬럼 select 및 `currentUserId` 전달**

`app/(app)/coding/page.tsx`의 55-60줄:

```ts
  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path')
      .in('problem_id', problemIds)
  )
```

다음으로 교체:

```ts
  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase
      .from('coding_checks')
      .select('problem_id, user_id, commit_sha, file_path, source')
      .in('problem_id', problemIds)
  )
```

같은 파일의 69-76줄:

```ts
    checks: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => ({
        userId: c.user_id,
        commitSha: c.commit_sha as string | null,
        filePath: c.file_path as string | null,
      })),
```

다음으로 교체:

```ts
    checks: (checks ?? [])
      .filter((c) => c.problem_id === problem.id)
      .map((c) => ({
        userId: c.user_id,
        commitSha: c.commit_sha as string | null,
        filePath: c.file_path as string | null,
        source: c.source as 'auto' | 'manual',
      })),
```

110번째 줄:

```tsx
              {codingProblems.map((problem) => (
                <ProblemCard key={problem.id} problem={problem} members={members} isAdmin={isAdmin} />
              ))}
```

다음으로 교체:

```tsx
              {codingProblems.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={session!.userId}
                />
              ))}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run app/\(app\)/coding/page.test.tsx`
Expected: PASS (전체 테스트).

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/coding/page.tsx" "app/(app)/coding/page.test.tsx"
git commit -m "feat: pass check source and current user to ProblemCard"
```

---

## Task 7: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: 전체 PASS, 회귀 없음.

- [ ] **Step 2: 린트 실행**

Run: `npm run lint`
Expected: 이번 변경으로 인한 새 에러/경고 없음 (기존에 알려진 무관한 lint 이슈가 있다면 그대로 유지).

- [ ] **Step 3: 배포 전 수동 확인 사항 안내**

Vercel 환경에 마이그레이션 `0015_coding_checks_manual_source.sql`이 적용되어야 이번 기능이
정상 동작한다 — Supabase 마이그레이션 적용은 이 계획의 범위 밖이므로, 배포 담당자에게 별도로
알린다.
