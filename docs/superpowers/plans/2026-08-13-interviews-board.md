# 모의면접 게시판 (Interviews Board) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fourth board, `/interviews` — members create mock-interview sessions with RSVP, then each participant registers their own Q&A under a session and always gets the same PR-review-style sentence feedback the jobposts board already has.

**Architecture:** Two new tables (`interview_sessions`, `interview_participants`) plus `interview_qas` (structurally identical to `job_posts.questions`), and a generalization of `feedback_docs` so it can attach to either a `job_posts` row or an `interview_qas` row. `/feedback/[id]` is reused as-is except for a small branch that resolves the heading/author from whichever parent is set. `FeedbackLines`, `CommentThread`, `groupCommentsByLine` need zero changes — they already key everything off `feedbackDocId`/`lineIndex`. `splitIntoSentences`/`buildFeedbackLines` move out of `lib/jobposts/snapshot.ts` into a shared `lib/feedback/snapshot.ts` so both boards import the same implementation.

**Tech Stack:** Next.js 16 App Router, Server Actions, Supabase Postgres + RLS, Vitest + @testing-library/react.

Spec: `docs/superpowers/specs/2026-08-13-interviews-design.md`

---

### Task 1: Migration — interview tables + generalize feedback_docs

**Files:**
- Create: `supabase/migrations/0007_interviews.sql`

- [ ] **Step 1: Write the migration**

```sql
create table interview_sessions (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  session_at timestamptz not null,
  description text,
  created_at timestamptz not null default now()
);

create table interview_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, user_id)
);

create table interview_qas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

alter table interview_sessions enable row level security;
alter table interview_participants enable row level security;
alter table interview_qas enable row level security;

create policy "Approved members can read interview sessions"
  on interview_sessions for select
  using (public.is_approved());

create policy "Approved members can create interview sessions"
  on interview_sessions for insert
  with check (created_by = auth.uid() and public.is_approved());

create policy "Session creators and admins can delete interview sessions"
  on interview_sessions for delete
  using (created_by = auth.uid() or public.is_admin());

create policy "Approved members can read interview participants"
  on interview_participants for select
  using (public.is_approved());

create policy "Approved members can create interview participants"
  on interview_participants for insert
  with check (user_id = auth.uid() and public.is_approved());

create policy "Members can delete own interview participation"
  on interview_participants for delete
  using (user_id = auth.uid());

create policy "Approved members can read interview qas"
  on interview_qas for select
  using (public.is_approved());

create policy "Approved members can create interview qas"
  on interview_qas for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "QA authors and admins can delete interview qas"
  on interview_qas for delete
  using (author_id = auth.uid() or public.is_admin());

-- Generalize feedback_docs: previously always attached to a job_posts row,
-- now optionally attached to an interview_qas row instead (exactly one of
-- the two parent columns is set).
alter table feedback_docs alter column job_post_id drop not null;
alter table feedback_docs add column interview_qa_id uuid references interview_qas(id) on delete cascade unique;
alter table feedback_docs add constraint feedback_docs_exactly_one_parent check (
  (job_post_id is not null and interview_qa_id is null) or
  (job_post_id is null and interview_qa_id is not null)
);

drop policy "Authors can create their own feedback snapshot" on feedback_docs;

create policy "Authors can create their own feedback snapshot"
  on feedback_docs for insert
  with check (
    public.is_approved()
    and (
      exists (select 1 from job_posts jp where jp.id = job_post_id and jp.author_id = auth.uid())
      or exists (select 1 from interview_qas iq where iq.id = interview_qa_id and iq.author_id = auth.uid())
    )
  );
```

- [ ] **Step 2: Apply the migration**

Run the contents of `supabase/migrations/0007_interviews.sql` in the Supabase dashboard SQL Editor (this project has no local Supabase CLI / db push workflow — every prior migration in this repo was applied this way).

- [ ] **Step 3: Verify**

In the Supabase dashboard, confirm `interview_sessions`, `interview_participants`, `interview_qas` exist, and that `feedback_docs.job_post_id` is now nullable with a new nullable `interview_qa_id` column and a `feedback_docs_exactly_one_parent` check constraint.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_interviews.sql
git commit -m "Add interview sessions/participants/qas tables and generalize feedback_docs"
```

---

### Task 2: Move sentence-splitting into a shared `lib/feedback` module

**Files:**
- Create: `lib/feedback/snapshot.ts`
- Create: `lib/feedback/snapshot.test.ts`
- Modify: `lib/jobposts/snapshot.ts`

`lib/jobposts/snapshot.test.ts` must NOT be modified in this task — it stays as a regression check that the re-export still works.

- [ ] **Step 1: Write the failing test**

Create `lib/feedback/snapshot.test.ts` with the exact same content as the current `lib/jobposts/snapshot.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildFeedbackLines } from './snapshot'

describe('buildFeedbackLines', () => {
  it('splits a single answer into sentences ending at each period', () => {
    const result = buildFeedbackLines([
      { question: '지원동기를 작성해주세요', answer: '첫 번째 문장입니다. 두 번째 문장입니다.' },
    ])

    expect(result).toEqual([
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
    ])
  })

  it('splits on newlines even without a trailing period', () => {
    const result = buildFeedbackLines([{ question: '강점은 무엇인가요', answer: '첫 줄\n둘째 줄' }])

    expect(result.map((l) => l.text)).toEqual(['첫 줄', '둘째 줄'])
  })

  it('does not produce a blank line when a period is immediately followed by a newline', () => {
    const result = buildFeedbackLines([{ question: '강점은 무엇인가요', answer: '문장1.\n문장2.' }])

    expect(result.map((l) => l.text)).toEqual(['문장1.', '문장2.'])
  })

  it('tags every line with the question index and text it came from', () => {
    const result = buildFeedbackLines([
      { question: '지원동기', answer: '첫 문장.' },
      { question: '강점', answer: '둘째 문장.' },
    ])

    expect(result).toEqual([
      { questionIndex: 0, question: '지원동기', text: '첫 문장.' },
      { questionIndex: 1, question: '강점', text: '둘째 문장.' },
    ])
  })

  it('skips a question with an empty answer', () => {
    const result = buildFeedbackLines([
      { question: '지원동기', answer: '' },
      { question: '강점', answer: '둘째 문장.' },
    ])

    expect(result).toEqual([{ questionIndex: 1, question: '강점', text: '둘째 문장.' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/feedback/snapshot.test.ts`
Expected: FAIL — `Failed to resolve import "./snapshot"` (the module doesn't exist yet)

- [ ] **Step 3: Create the shared implementation**

Create `lib/feedback/snapshot.ts` with the logic moved out of `lib/jobposts/snapshot.ts`:

```typescript
import type { FeedbackLine } from '@/lib/jobposts/types'

function splitIntoSentences(text: string): string[] {
  const result: string[] = []
  let current = ''

  for (const char of text) {
    if (char === '.') {
      const sentence = (current + '.').trim()
      if (sentence.length > 0) result.push(sentence)
      current = ''
    } else if (char === '\n') {
      const sentence = current.trim()
      if (sentence.length > 0) result.push(sentence)
      current = ''
    } else {
      current += char
    }
  }

  const remainder = current.trim()
  if (remainder.length > 0) result.push(remainder)

  return result
}

export function buildFeedbackLines(questions: { question: string; answer: string }[]): FeedbackLine[] {
  const lines: FeedbackLine[] = []

  questions.forEach((q, questionIndex) => {
    for (const text of splitIntoSentences(q.answer)) {
      lines.push({ questionIndex, question: q.question, text })
    }
  })

  return lines
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/feedback/snapshot.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Turn `lib/jobposts/snapshot.ts` into a re-export**

Replace the entire contents of `lib/jobposts/snapshot.ts` with:

```typescript
export { buildFeedbackLines } from '@/lib/feedback/snapshot'
```

- [ ] **Step 6: Run the old test file to confirm the re-export still works**

Run: `npx vitest run lib/jobposts/snapshot.test.ts`
Expected: PASS (5 tests, unchanged file, now exercising the re-export)

- [ ] **Step 7: Commit**

```bash
git add lib/feedback/snapshot.ts lib/feedback/snapshot.test.ts lib/jobposts/snapshot.ts
git commit -m "Move sentence-splitting into a shared lib/feedback module"
```

---

### Task 3: Interview types

**Files:**
- Create: `lib/interviews/types.ts`

No test file — this mirrors `lib/jobposts/types.ts`, which also has no dedicated test file (plain type declarations, checked by `tsc` in the final verification task).

- [ ] **Step 1: Create the types**

```typescript
export interface InterviewParticipant {
  userId: string
  userName: string
}

export interface InterviewSession {
  id: string
  createdBy: string
  title: string
  sessionAt: string
  description: string | null
  createdAt: string
  participants: InterviewParticipant[]
}

export interface InterviewQuestion {
  question: string
  answer: string
}

export interface InterviewQa {
  id: string
  sessionId: string
  authorId: string
  authorName: string
  questions: InterviewQuestion[]
  feedbackDocId: string
  createdAt: string
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/interviews/types.ts
git commit -m "Add interview session/participant/QA types"
```

---

### Task 4: Server actions — sessions (create, RSVP, delete)

**Files:**
- Create: `app/(app)/interviews/actions.ts`
- Test: `app/(app)/interviews/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const fromMock = vi.fn()
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`)
})
const revalidatePathMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}))

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePathMock(...args),
}))

import { createSession, toggleParticipation, deleteSession } from './actions'

function buildFormData(fields: Record<string, FormDataEntryValue>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value)
  }
  return formData
}

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
})

describe('createSession', () => {
  function mockInsert({ insertError = null }: { insertError?: { message: string } | null } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: insertError })
    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_sessions') return { insert }
      throw new Error(`unexpected table ${table}`)
    })
    return { insert }
  }

  it('redirects with an error when the title is missing', async () => {
    const formData = buildFormData({ title: '', sessionAt: '2026-08-20T14:00' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
  })

  it('redirects with an error when the date/time is missing', async () => {
    const formData = buildFormData({ title: '2조 모의면접', sessionAt: '' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
  })

  it('creates a session with the given title, time, and description', async () => {
    const { insert } = mockInsert()
    const formData = buildFormData({
      title: '2조 모의면접',
      sessionAt: '2026-08-20T14:00',
      description: 'Zoom 링크',
    })

    await createSession(formData)

    expect(insert).toHaveBeenCalledWith({
      created_by: 'user-1',
      title: '2조 모의면접',
      session_at: '2026-08-20T14:00',
      description: 'Zoom 링크',
    })
  })

  it('redirects with an error when the insert fails', async () => {
    mockInsert({ insertError: { message: 'insert failed' } })
    const formData = buildFormData({ title: '2조 모의면접', sessionAt: '2026-08-20T14:00' })

    await expect(createSession(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews?error=' + encodeURIComponent('insert failed'))
  })
})

describe('toggleParticipation', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'interview_participants') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }),
          }),
        }),
        insert,
        delete: () => ({ eq: deleteEq }),
      }
    })

    return { deleteEq, insert }
  }

  it('inserts participation when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleParticipation('session-1')

    expect(insert).toHaveBeenCalledWith({ session_id: 'session-1', user_id: 'user-1' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/interviews')
  })

  it('deletes existing participation when the user already joined', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'participant-1' })

    await toggleParticipation('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'participant-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('deleteSession', () => {
  function mockOwnerAndRole(createdBy: string, role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_sessions') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { created_by: createdBy }, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the session when the caller is the creator', async () => {
    const { deleteEq } = mockOwnerAndRole('user-1', 'member')

    await deleteSession('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'session-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/interviews')
  })

  it('deletes the session when the caller is an admin but not the creator', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'admin')

    await deleteSession('session-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'session-1')
  })

  it('throws when the caller is neither the creator nor an admin', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'member')

    await expect(deleteSession('session-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/interviews/actions.test.ts"`
Expected: FAIL — `Failed to resolve import "./actions"`

- [ ] **Step 3: Implement the actions**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createSession(formData: FormData) {
  const title = (formData.get('title') as string) || ''
  const sessionAt = (formData.get('sessionAt') as string) || ''
  const description = (formData.get('description') as string) || null

  if (!title || !sessionAt) {
    redirect('/interviews?error=' + encodeURIComponent('제목과 일시를 입력해주세요'))
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

  const { error } = await supabase.from('interview_sessions').insert({
    created_by: user.id,
    title,
    session_at: sessionAt,
    description,
  })

  if (error) {
    redirect('/interviews?error=' + encodeURIComponent(error.message))
    return
  }

  revalidatePath('/interviews')
}

export async function toggleParticipation(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('interview_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('interview_participants').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('interview_participants')
      .insert({ session_id: sessionId, user_id: user.id })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/interviews')
}

export async function deleteSession(sessionId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('권한이 없습니다')

  const { data: session, error: sessionError } = await supabase
    .from('interview_sessions')
    .select('created_by')
    .eq('id', sessionId)
    .single()

  if (sessionError) throw new Error(sessionError.message)

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)

  const isOwner = session?.created_by === user.id
  const isAdmin = callerProfile?.role === 'admin'

  if (!isOwner && !isAdmin) throw new Error('권한이 없습니다')

  const { error } = await supabase.from('interview_sessions').delete().eq('id', sessionId)

  if (error) throw new Error(error.message)

  revalidatePath('/interviews')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/interviews/actions.test.ts"`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/actions.ts" "app/(app)/interviews/actions.test.ts"
git commit -m "Add session create/RSVP/delete server actions"
```

---

### Task 5: Server actions — interview Q&A (create, delete)

**Files:**
- Modify: `app/(app)/interviews/actions.ts`
- Modify: `app/(app)/interviews/actions.test.ts`

Depends on Task 2 (`lib/feedback/snapshot.ts`) and Task 4 (same file, session actions already in place).

- [ ] **Step 1: Write the failing tests**

Update the import line at the top of `app/(app)/interviews/actions.test.ts` to also pull in the two new functions:

```typescript
import { createSession, toggleParticipation, deleteSession, createInterviewQa, deleteInterviewQa } from './actions'
```

Append these two `describe` blocks to the end of the file:

```typescript
describe('createInterviewQa', () => {
  function mockInsert({ qaError = null }: { qaError?: { message: string } | null } = {}) {
    const feedbackDocsInsert = vi.fn().mockResolvedValue({ error: null })
    const qaSingle = vi
      .fn()
      .mockResolvedValue(qaError ? { data: null, error: qaError } : { data: { id: 'qa-1' }, error: null })
    const qaInsert = vi.fn().mockReturnValue({ select: () => ({ single: qaSingle }) })

    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_qas') return { insert: qaInsert }
      if (table === 'feedback_docs') return { insert: feedbackDocsInsert }
      throw new Error(`unexpected table ${table}`)
    })

    return { qaInsert, feedbackDocsInsert }
  }

  it('redirects with an error when no question/answer pair is valid', async () => {
    const formData = buildFormData({ questionCount: '1', 'question-0': '', 'answer-0': '' })

    await expect(createInterviewQa('session-1', formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/interviews/session-1?error=' + encodeURIComponent('최소 한 개의 질문/답변을 입력해주세요')
    )
  })

  it('drops a pair where only the question or only the answer is filled in', async () => {
    const { qaInsert } = mockInsert()
    const formData = buildFormData({
      questionCount: '2',
      'question-0': '자기소개를 해주세요',
      'answer-0': '',
      'question-1': '강점은',
      'answer-1': '책임감입니다.',
    })

    await createInterviewQa('session-1', formData)

    expect(qaInsert).toHaveBeenCalledWith({
      session_id: 'session-1',
      author_id: 'user-1',
      questions: [{ question: '강점은', answer: '책임감입니다.' }],
    })
  })

  it('creates a QA entry and always generates a feedback snapshot', async () => {
    const { qaInsert, feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      questionCount: '1',
      'question-0': '자기소개를 해주세요',
      'answer-0': '첫 문장. 둘째 문장.',
    })

    await createInterviewQa('session-1', formData)

    expect(qaInsert).toHaveBeenCalledWith({
      session_id: 'session-1',
      author_id: 'user-1',
      questions: [{ question: '자기소개를 해주세요', answer: '첫 문장. 둘째 문장.' }],
    })
    expect(feedbackDocsInsert).toHaveBeenCalledWith({
      interview_qa_id: 'qa-1',
      lines: [
        { questionIndex: 0, question: '자기소개를 해주세요', text: '첫 문장.' },
        { questionIndex: 0, question: '자기소개를 해주세요', text: '둘째 문장.' },
      ],
    })
  })

  it('redirects with an error when the QA insert fails', async () => {
    mockInsert({ qaError: { message: 'insert failed' } })
    const formData = buildFormData({ questionCount: '1', 'question-0': '자기소개', 'answer-0': '내용' })

    await expect(createInterviewQa('session-1', formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/interviews/session-1?error=' + encodeURIComponent('insert failed'))
  })
})

describe('deleteInterviewQa', () => {
  function mockOwnerAndRole(authorId: string, role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'interview_qas') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { author_id: authorId }, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        }
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the QA entry when the caller is the author', async () => {
    const { deleteEq } = mockOwnerAndRole('user-1', 'member')

    await deleteInterviewQa('session-1', 'qa-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'qa-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/interviews/session-1')
  })

  it('deletes the QA entry when the caller is an admin but not the author', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'admin')

    await deleteInterviewQa('session-1', 'qa-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'qa-1')
  })

  it('throws when the caller is neither the author nor an admin', async () => {
    const { deleteEq } = mockOwnerAndRole('user-2', 'member')

    await expect(deleteInterviewQa('session-1', 'qa-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run "app/(app)/interviews/actions.test.ts"`
Expected: FAIL — `createInterviewQa`/`deleteInterviewQa` are not exported from `./actions`

- [ ] **Step 3: Implement the actions**

Add this import to the top of `app/(app)/interviews/actions.ts` (alongside the existing imports):

```typescript
import { buildFeedbackLines } from '@/lib/feedback/snapshot'
```

Append these two functions to the end of `app/(app)/interviews/actions.ts`:

```typescript
export async function createInterviewQa(sessionId: string, formData: FormData) {
  const questionCount = Number(formData.get('questionCount') ?? '0')

  const questions: { question: string; answer: string }[] = []
  for (let i = 0; i < questionCount; i++) {
    const question = (formData.get(`question-${i}`) as string) || ''
    const answer = (formData.get(`answer-${i}`) as string) || ''
    if (question && answer) {
      questions.push({ question, answer })
    }
  }

  if (questions.length === 0) {
    redirect(`/interviews/${sessionId}?error=` + encodeURIComponent('최소 한 개의 질문/답변을 입력해주세요'))
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

  const { data: inserted, error } = await supabase
    .from('interview_qas')
    .insert({ session_id: sessionId, author_id: user.id, questions })
    .select('id')
    .single()

  if (error || !inserted) {
    redirect(`/interviews/${sessionId}?error=` + encodeURIComponent(error?.message ?? '등록에 실패했습니다'))
    return
  }

  const { error: docError } = await supabase
    .from('feedback_docs')
    .insert({ interview_qa_id: inserted.id, lines: buildFeedbackLines(questions) })

  if (docError) {
    redirect(`/interviews/${sessionId}?error=` + encodeURIComponent(docError.message))
    return
  }

  revalidatePath(`/interviews/${sessionId}`)
}

export async function deleteInterviewQa(sessionId: string, qaId: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('권한이 없습니다')

  const { data: qa, error: qaError } = await supabase
    .from('interview_qas')
    .select('author_id')
    .eq('id', qaId)
    .single()

  if (qaError) throw new Error(qaError.message)

  const { data: callerProfile, error: callerError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (callerError) throw new Error(callerError.message)

  const isOwner = qa?.author_id === user.id
  const isAdmin = callerProfile?.role === 'admin'

  if (!isOwner && !isAdmin) throw new Error('권한이 없습니다')

  const { error } = await supabase.from('interview_qas').delete().eq('id', qaId)

  if (error) throw new Error(error.message)

  revalidatePath(`/interviews/${sessionId}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/interviews/actions.test.ts"`
Expected: PASS (16 tests total)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/actions.ts" "app/(app)/interviews/actions.test.ts"
git commit -m "Add interview QA create/delete server actions with always-on feedback"
```

---

### Task 6: Session creation form

**Files:**
- Create: `app/(app)/interviews/session-form.tsx`
- Test: `app/(app)/interviews/session-form.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createSession: vi.fn(),
}))

import { SessionForm } from './session-form'

describe('SessionForm', () => {
  it('renders title, date/time, description inputs and a submit button', () => {
    render(<SessionForm />)

    expect(screen.getByPlaceholderText('세션 제목')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('세션 제목')).toBeRequired()
    expect(screen.getByLabelText('일시')).toBeInTheDocument()
    expect(screen.getByLabelText('일시')).toBeRequired()
    expect(screen.getByPlaceholderText('장소/링크 등 (선택)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/interviews/session-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./session-form"`

- [ ] **Step 3: Implement the component**

```typescript
import { createSession } from './actions'

export function SessionForm() {
  return (
    <form action={createSession} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="title" className="sr-only">
        세션 제목
      </label>
      <input id="title" name="title" placeholder="세션 제목" required className="rounded border px-3 py-2" />

      <label htmlFor="sessionAt">일시</label>
      <input
        id="sessionAt"
        name="sessionAt"
        type="datetime-local"
        required
        className="rounded border px-3 py-2"
      />

      <label htmlFor="description" className="sr-only">
        설명
      </label>
      <textarea
        id="description"
        name="description"
        placeholder="장소/링크 등 (선택)"
        className="rounded border px-3 py-2"
      />

      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        세션 만들기
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/interviews/session-form.test.tsx"`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/session-form.tsx" "app/(app)/interviews/session-form.test.tsx"
git commit -m "Add interview session creation form"
```

---

### Task 7: Session card (RSVP + delete)

**Files:**
- Create: `app/(app)/interviews/session-card.tsx`
- Test: `app/(app)/interviews/session-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  toggleParticipation: vi.fn(),
  deleteSession: vi.fn(),
}))

import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'

const session: InterviewSession = {
  id: 'session-1',
  createdBy: 'user-1',
  title: '2조 모의면접',
  sessionAt: '2026-08-20T14:00',
  description: 'Zoom 링크: https://zoom.example/abc',
  createdAt: '2026-08-13T00:00:00.000Z',
  participants: [{ userId: 'user-2', userName: '이지은' }],
}

describe('SessionCard', () => {
  it('renders the title, time, and description', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('2026-08-20T14:00')).toBeInTheDocument()
    expect(screen.getByText('Zoom 링크: https://zoom.example/abc')).toBeInTheDocument()
  })

  it('shows participant count and names', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByText('참석 1명 (이지은)')).toBeInTheDocument()
  })

  it('shows a join button when the current user has not RSVPed', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '참석하기' })).toBeInTheDocument()
  })

  it('shows a cancel button when the current user has already RSVPed', () => {
    render(<SessionCard session={session} currentUserId="user-2" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '참석 취소' })).toBeInTheDocument()
  })

  it('shows a delete button for the session creator', () => {
    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a delete button for admins even if they are not the creator', () => {
    render(<SessionCard session={session} currentUserId="admin-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('hides the delete button for non-creator non-admins', () => {
    render(<SessionCard session={session} currentUserId="user-2" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/interviews/session-card.test.tsx"`
Expected: FAIL — `Failed to resolve import "./session-card"`

- [ ] **Step 3: Implement the component**

```typescript
import type { InterviewSession } from '@/lib/interviews/types'
import { toggleParticipation, deleteSession } from './actions'

export function SessionCard({
  session,
  currentUserId,
  isAdmin,
}: {
  session: InterviewSession
  currentUserId: string
  isAdmin: boolean
}) {
  const isParticipating = session.participants.some((p) => p.userId === currentUserId)
  const canDelete = isAdmin || session.createdBy === currentUserId

  return (
    <article className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <a href={`/interviews/${session.id}`} className="font-medium underline">
            {session.title}
          </a>
          <p className="text-xs text-gray-500">{session.sessionAt}</p>
        </div>
        {canDelete && (
          <form action={deleteSession.bind(null, session.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>

      {session.description && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600">{session.description}</p>
      )}

      <form action={toggleParticipation.bind(null, session.id)} className="flex items-center gap-2">
        <button
          type="submit"
          className={`rounded border px-2 py-1 text-xs ${isParticipating ? 'bg-black text-white' : ''}`}
        >
          {isParticipating ? '참석 취소' : '참석하기'}
        </button>
        <span className="text-xs text-gray-500">
          {`참석 ${session.participants.length}명${
            session.participants.length > 0
              ? ` (${session.participants.map((p) => p.userName).join(', ')})`
              : ''
          }`}
        </span>
      </form>
    </article>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/interviews/session-card.test.tsx"`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/session-card.tsx" "app/(app)/interviews/session-card.test.tsx"
git commit -m "Add interview session card with RSVP toggle and delete"
```

---

### Task 8: Session list feed page (`/interviews`)

**Files:**
- Create: `app/(app)/interviews/page.tsx`
- Test: `app/(app)/interviews/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return { eq: () => ({ single: async () => ({ data: { role: 'member' } }) }) }
            }
            return Promise.resolve({ data: profiles })
          },
        }
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

import InterviewsPage from './page'

describe('InterviewsPage', () => {
  it('renders the session form and the session feed with participant count', async () => {
    const ui = await InterviewsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '세션 만들기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/interviews/session-1')
    expect(screen.getByText('참석 1명 (관리자)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/interviews/page.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`

- [ ] **Step 3: Implement the page**

```typescript
import { createClient } from '@/lib/supabase/server'
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: sessions } = await supabase
    .from('interview_sessions')
    .select('id, created_by, title, session_at, description, created_at')
    .order('session_at', { ascending: true })

  const sessionIds = (sessions ?? []).map((s) => s.id)

  const { data: participants } = sessionIds.length
    ? await supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
    : { data: [] }

  const interviewSessions: InterviewSession[] = (sessions ?? []).map((session) => ({
    id: session.id,
    createdBy: session.created_by,
    title: session.title,
    sessionAt: session.session_at,
    description: session.description,
    createdAt: session.created_at,
    participants: (participants ?? [])
      .filter((p) => p.session_id === session.id)
      .map((p) => ({ userId: p.user_id, userName: nameById.get(p.user_id) ?? '알 수 없음' })),
  }))

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">모의면접</h1>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <SessionForm />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewSessions.map((session) => (
          <li key={session.id}>
            <SessionCard session={session} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/interviews/page.test.tsx"`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/page.tsx" "app/(app)/interviews/page.test.tsx"
git commit -m "Add interview session list feed page"
```

---

### Task 9: QA registration form

**Files:**
- Create: `app/(app)/interviews/[sessionId]/qa-form.tsx`
- Test: `app/(app)/interviews/[sessionId]/qa-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createInterviewQa: vi.fn(),
}))

import { QaForm } from './qa-form'

describe('QaForm', () => {
  it('renders one question/answer pair and a submit button by default', () => {
    render(<QaForm sessionId="session-1" />)

    expect(screen.getAllByPlaceholderText('받은 질문')).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('adds another question/answer pair when clicking the add button', () => {
    render(<QaForm sessionId="session-1" />)

    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))

    expect(screen.getAllByPlaceholderText('받은 질문')).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(2)
  })

  it('removes a question/answer pair when clicking its delete button', () => {
    render(<QaForm sessionId="session-1" />)
    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))
    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.getAllByPlaceholderText('내 답변')).toHaveLength(1)
  })

  it('does not show a delete button when only one question remains', () => {
    render(<QaForm sessionId="session-1" />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/qa-form.test.tsx"`
Expected: FAIL — `Failed to resolve import "./qa-form"`

- [ ] **Step 3: Implement the component**

`app/(app)/interviews/[sessionId]/qa-form.tsx` is a near-copy of `app/(app)/jobposts/post-form.tsx`'s dynamic-question logic, without the company/date/feedback-checkbox fields and bound to a `sessionId`:

```typescript
'use client'

import { useState } from 'react'
import { createInterviewQa } from './actions'

interface QuestionField {
  question: string
  answer: string
}

export function QaForm({ sessionId }: { sessionId: string }) {
  const [questions, setQuestions] = useState<QuestionField[]>([{ question: '', answer: '' }])

  function addQuestion() {
    setQuestions((prev) => [...prev, { question: '', answer: '' }])
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  function updateQuestion(index: number, field: keyof QuestionField, value: string) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)))
  }

  return (
    <form action={createInterviewQa.bind(null, sessionId)} className="flex flex-col gap-3 rounded border p-4">
      <input type="hidden" name="questionCount" value={questions.length} />

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <div key={index} className="rounded border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">문항 {index + 1}</span>
              {questions.length > 1 && (
                <button type="button" onClick={() => removeQuestion(index)} className="text-xs text-red-600">
                  삭제
                </button>
              )}
            </div>
            <label htmlFor={`question-${index}`} className="sr-only">
              질문
            </label>
            <input
              id={`question-${index}`}
              name={`question-${index}`}
              placeholder="받은 질문"
              required
              value={q.question}
              onChange={(e) => updateQuestion(index, 'question', e.target.value)}
              className="mb-2 w-full rounded border px-3 py-2"
            />
            <label htmlFor={`answer-${index}`} className="sr-only">
              답변
            </label>
            <textarea
              id={`answer-${index}`}
              name={`answer-${index}`}
              placeholder="내 답변"
              required
              rows={5}
              value={q.answer}
              onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
              className="w-full rounded border px-3 py-2"
            />
          </div>
        ))}
      </div>

      <button type="button" onClick={addQuestion} className="self-start rounded border px-3 py-1 text-sm">
        + 문항 추가
      </button>

      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        등록
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/qa-form.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/[sessionId]/qa-form.tsx" "app/(app)/interviews/[sessionId]/qa-form.test.tsx"
git commit -m "Add interview QA registration form"
```

---

### Task 10: QA card

**Files:**
- Create: `app/(app)/interviews/[sessionId]/qa-card.tsx`
- Test: `app/(app)/interviews/[sessionId]/qa-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  deleteInterviewQa: vi.fn(),
}))

import { QaCard } from './qa-card'
import type { InterviewQa } from '@/lib/interviews/types'

const qa: InterviewQa = {
  id: 'qa-1',
  sessionId: 'session-1',
  authorId: 'user-1',
  authorName: '김민수',
  questions: [
    { question: '자기소개를 해주세요', answer: '안녕하세요, 백엔드 개발자 지망생입니다.' },
    { question: '가장 어려웠던 프로젝트는', answer: '결제 시스템 리팩터링이었습니다.' },
  ],
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-13T00:00:00.000Z',
}

describe('QaCard', () => {
  it('renders every question with its own answer and the author', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('자기소개를 해주세요')).toBeInTheDocument()
    expect(screen.getByText('안녕하세요, 백엔드 개발자 지망생입니다.')).toBeInTheDocument()
    expect(screen.getByText('가장 어려웠던 프로젝트는')).toBeInTheDocument()
    expect(screen.getByText('결제 시스템 리팩터링이었습니다.')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
  })

  it('shows a feedback link', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('shows a delete button for the author', () => {
    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<QaCard qa={qa} currentUserId="user-9" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })

  it('hides the delete button for non-author non-admins', () => {
    render(<QaCard qa={qa} currentUserId="user-9" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/qa-card.test.tsx"`
Expected: FAIL — `Failed to resolve import "./qa-card"`

- [ ] **Step 3: Implement the component**

```typescript
import type { InterviewQa } from '@/lib/interviews/types'
import { deleteInterviewQa } from './actions'

export function QaCard({
  qa,
  currentUserId,
  isAdmin,
}: {
  qa: InterviewQa
  currentUserId: string
  isAdmin: boolean
}) {
  const canDelete = isAdmin || qa.authorId === currentUserId

  return (
    <article className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">{qa.authorName}</span>
        {canDelete && (
          <form action={deleteInterviewQa.bind(null, qa.sessionId, qa.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {qa.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500">{q.question}</p>
            <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
          </div>
        ))}
      </div>

      <a href={`/feedback/${qa.feedbackDocId}`} className="mt-3 inline-block text-sm text-gray-500 underline">
        피드백 보기
      </a>
    </article>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/qa-card.test.tsx"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/[sessionId]/qa-card.tsx" "app/(app)/interviews/[sessionId]/qa-card.test.tsx"
git commit -m "Add interview QA card"
```

---

### Task 11: Session detail page (`/interviews/[sessionId]`)

**Files:**
- Create: `app/(app)/interviews/[sessionId]/page.tsx`
- Test: `app/(app)/interviews/[sessionId]/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const session = {
  id: 'session-1',
  title: '2조 모의면접',
  session_at: '2026-08-20T14:00',
  description: 'Zoom 링크',
}

const profiles = [{ id: 'user-1', name: '김민수' }]

const qas = [
  {
    id: 'qa-1',
    author_id: 'user-1',
    questions: [{ question: '자기소개를 해주세요', answer: '안녕하세요.' }],
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

const feedbackDocs = [{ id: 'doc-1', interview_qa_id: 'qa-1' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => {
            if (columns === 'role') {
              return { eq: () => ({ single: async () => ({ data: { role: 'member' } }) }) }
            }
            return Promise.resolve({ data: profiles })
          },
        }
      }
      if (table === 'interview_sessions') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session }) }) }) }
      }
      if (table === 'interview_qas') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: qas }) }) }) }
      }
      if (table === 'feedback_docs') {
        return { select: () => ({ in: async () => ({ data: feedbackDocs }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./actions', () => ({
  createInterviewQa: vi.fn(),
  deleteInterviewQa: vi.fn(),
}))

import InterviewSessionPage from './page'

describe('InterviewSessionPage', () => {
  it('renders the session title, description, and registered QA entries', async () => {
    const ui = await InterviewSessionPage({
      params: Promise.resolve({ sessionId: 'session-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '2조 모의면접' })).toBeInTheDocument()
    expect(screen.getByText('Zoom 링크')).toBeInTheDocument()
    expect(screen.getByText('자기소개를 해주세요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/page.test.tsx"`
Expected: FAIL — `Failed to resolve import "./page"`

- [ ] **Step 3: Implement the page**

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  const isAdmin = callerProfile?.role === 'admin'

  const { data: session } = await supabase
    .from('interview_sessions')
    .select('id, title, session_at, description')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session) {
    redirect('/interviews?error=' + encodeURIComponent('존재하지 않는 세션입니다'))
    return
  }

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: qas } = await supabase
    .from('interview_qas')
    .select('id, author_id, questions, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

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

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{session.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{session.session_at}</p>
      {session.description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600">{session.description}</p>
      )}
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <QaForm sessionId={sessionId} />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewQas.map((qa) => (
          <li key={qa.id}>
            <QaCard qa={qa} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(app)/interviews/[sessionId]/page.test.tsx"`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/interviews/[sessionId]/page.tsx" "app/(app)/interviews/[sessionId]/page.test.tsx"
git commit -m "Add interview session detail page with QA registration and feed"
```

---

### Task 12: Generalize `/feedback/[id]` to support interview QA docs

**Files:**
- Modify: `app/(app)/feedback/[id]/page.tsx`
- Modify: `app/(app)/feedback/[id]/page.test.tsx`

`FeedbackLines` and `CommentThread` need no changes — this task only touches how the heading and author are resolved.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `app/(app)/feedback/[id]/page.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const docs: Record<string, { id: string; job_post_id: string | null; interview_qa_id: string | null; lines: unknown }> = {
  'doc-1': {
    id: 'doc-1',
    job_post_id: 'post-1',
    interview_qa_id: null,
    lines: [
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
      { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
      { questionIndex: 1, question: '본인의 강점은 무엇인가요', text: '책임감이 강합니다.' },
    ],
  },
  'doc-2': {
    id: 'doc-2',
    job_post_id: null,
    interview_qa_id: 'qa-1',
    lines: [{ questionIndex: 0, question: '자기소개를 해주세요', text: '안녕하세요.' }],
  },
}

const jobPosts: Record<string, { company_name: string; author_id: string }> = {
  'post-1': { company_name: '토스', author_id: 'user-1' },
}

const interviewQas: Record<string, { author_id: string; session_id: string }> = {
  'qa-1': { author_id: 'user-2', session_id: 'session-1' },
}

const interviewSessions: Record<string, { title: string }> = {
  'session-1': { title: '2조 모의면접' },
}

const profiles = [
  { id: 'user-1', name: '김민수' },
  { id: 'user-2', name: '이지은' },
]

const commentsByDoc: Record<string, unknown[]> = {
  'doc-1': [
    {
      id: 'c1',
      line_index: 0,
      parent_comment_id: null,
      author_id: 'user-1',
      body: '첫 문장 의견',
      created_at: '2026-08-13T00:00:00.000Z',
    },
  ],
  'doc-2': [],
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'feedback_docs') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ maybeSingle: async () => ({ data: docs[id] }) }) }) }
      }
      if (table === 'job_posts') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: jobPosts[id] }) }) }) }
      }
      if (table === 'interview_qas') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: interviewQas[id] }) }) }) }
      }
      if (table === 'interview_sessions') {
        return { select: () => ({ eq: (_col: string, id: string) => ({ single: async () => ({ data: interviewSessions[id] }) }) }) }
      }
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'feedback_comments') {
        return { select: () => ({ eq: (_col: string, docId: string) => ({ order: async () => ({ data: commentsByDoc[docId] ?? [] }) }) }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import FeedbackPage from './page'

describe('FeedbackPage', () => {
  it('renders a heading per question and every line under it for a job-post feedback doc', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지원동기를 작성해주세요' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '본인의 강점은 무엇인가요' })).toBeInTheDocument()
    expect(screen.getByText('첫 번째 문장입니다.')).toBeInTheDocument()
    expect(screen.getByText('두 번째 문장입니다.')).toBeInTheDocument()
    expect(screen.getByText('책임감이 강합니다.')).toBeInTheDocument()
  })

  it('attaches existing comments to the correct line for a job-post feedback doc', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('button', { name: '💬 1' })).toBeInTheDocument()
  })

  it('resolves the heading and author from the interview session for an interview QA feedback doc', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-2' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '2조 모의면접 피드백' })).toBeInTheDocument()
    expect(screen.getByText('작성자: 이지은')).toBeInTheDocument()
    expect(screen.getByText('안녕하세요.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: FAIL — the interview-QA test fails because the current page only ever queries `job_posts`, so the heading renders as `undefined 자소서 피드백` instead of `2조 모의면접 피드백`

- [ ] **Step 3: Implement the branch**

Replace the entire contents of `app/(app)/feedback/[id]/page.tsx`:

```typescript
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

  const { data: doc } = await supabase
    .from('feedback_docs')
    .select('id, job_post_id, interview_qa_id, lines')
    .eq('id', id)
    .maybeSingle()

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

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: rawComments } = await supabase
    .from('feedback_comments')
    .select('id, line_index, parent_comment_id, author_id, body, created_at')
    .eq('feedback_doc_id', id)
    .order('created_at', { ascending: true })

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/page.tsx" "app/(app)/feedback/[id]/page.test.tsx"
git commit -m "Resolve feedback heading/author from either a job post or an interview QA"
```

---

### Task 13: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all files including the ~40 new/changed tests from Tasks 2–12

If anything fails, fix it and commit the fix before continuing.

- [ ] **Step 2: Type-check**

Check whether the user's `npm run dev` is live in another terminal first (a real `next build` while dev is running corrupts the shared `.next/` cache — this has happened before in this project). If dev is live, run:

`npx tsc --noEmit`

Expected: no output, no errors. Only run `npm run build` if you've confirmed no dev server is currently running.

- [ ] **Step 3: Confirm the migration is live**

Confirm with the user that `supabase/migrations/0007_interviews.sql` (Task 1) has been applied in the Supabase dashboard — `interview_sessions`, `interview_participants`, `interview_qas` should exist and `feedback_docs.interview_qa_id` should be present.

- [ ] **Step 4: Manual browser walkthrough**

With the dev server running, in a browser:

1. Go to `/interviews`, create a session with a title, date/time, and description.
2. Click "참석하기" on the session card, confirm it flips to "참석 취소" and the participant count/name updates.
3. Open the session's detail page, register a QA entry with two question/answer pairs, one answer containing multiple sentences (e.g. `첫 문장. 둘째 문장.`).
4. Confirm the QA card shows both questions/answers and a "피드백 보기" link (feedback should always exist — no checkbox was involved).
5. Open the feedback link, confirm the heading reads `<세션 제목> 피드백`, the multi-sentence answer is split into separate lines, and questions are grouped under their own headings.
6. Click a line's `+` trigger, confirm the row expands with a comment box (not the whole background turning solid), submit a comment, confirm the badge updates to `💬 1` and clicking a different line collapses the first.
7. Confirm `/jobposts` and its existing feedback flow are unaffected (this validates the `feedback_docs` generalization didn't break the pre-existing path).

- [ ] **Step 5: Commit any fixes found during the walkthrough**

If the walkthrough surfaces a bug, fix it, re-run the affected test file, and commit with a message describing the fix.
