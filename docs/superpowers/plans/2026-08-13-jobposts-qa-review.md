# Cover Letter Q&A Structure + PR-Style Feedback Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure cover letter posts (`/jobposts`) from one freeform text blob into question/answer pairs, split each answer into sentences (period-or-newline, not just literal newlines), and rebuild the feedback screen (`/feedback/[id]`) so clicking a line expands a GitHub-PR-review-style inline comment box instead of always showing every comment box open.

**Architecture:** `job_posts.cover_letter_text` is replaced by a `questions jsonb` column (array of `{question, answer}`). `buildFeedbackLines` changes from `(text: string) => string[]` to `(questions) => FeedbackLine[]`, tagging every sentence with the question it came from; `feedback_docs.lines` now stores that richer structure (still the same `jsonb` column, no schema change there). The write form becomes this codebase's first client component, managing a dynamic array of question/answer pairs. The feedback page gets a new client component, `feedback-lines.tsx`, that owns "which line is expanded" state and renders the existing `CommentThread` only for the expanded line. Everything else (`comments.ts`, `calendar.ts`, `feedback/[id]/actions.ts`, `comment-thread.tsx`, RLS policies) is untouched.

**Tech Stack:** Next.js (App Router, TypeScript) Server Actions + Server/Client Components, Supabase (Postgres + Auth + RLS), Tailwind CSS, Vitest + React Testing Library (`fireEvent`, no new dependency for interaction tests). Builds on `docs/superpowers/plans/2026-08-12-jobposts-board.md`.

**Spec:** `docs/superpowers/specs/2026-08-13-jobposts-qa-review-design.md`

**Assumptions carried over from the spec:**
- Any existing test `job_posts` rows lose their `cover_letter_text` content when this migration runs — no real production data exists yet.
- Sentence splitting drops empty fragments produced by a period immediately followed by a newline (no more blank-line-for-paragraph-spacing behavior).
- Only one feedback line can be expanded at a time (accordion), matching the approved mockup.
- Question count is unlimited, added/removed freely in the write form; question text is freely typed, no preset list.

---

## File Structure

```
supabase/
  migrations/
    0006_jobposts_qa.sql       # job_posts.questions jsonb replaces cover_letter_text
lib/
  jobposts/
    types.ts                    # + JobPostQuestion, FeedbackLine; JobPost.questions replaces coverLetterText
    snapshot.ts                  # buildFeedbackLines(questions) -> FeedbackLine[]
    snapshot.test.ts
app/
  (app)/
    jobposts/
      actions.ts                 # createJobPost reads question-{i}/answer-{i} indexed fields
      actions.test.ts
      post-form.tsx                # 'use client', dynamic Q&A add/remove
      post-form.test.tsx
      post-card.tsx                  # renders post.questions instead of coverLetterText
      post-card.test.tsx
      page.tsx                        # selects `questions` column instead of cover_letter_text
      page.test.tsx
    feedback/
      [id]/
        feedback-lines.tsx              # NEW, 'use client', expand/collapse + question headers
        feedback-lines.test.tsx           # NEW
        page.tsx                           # builds FeedbackLineWithComments[], renders FeedbackLines
        page.test.tsx
```

---

## Task 1: Database schema migration — job_posts.questions

**Files:**

- Create: `supabase/migrations/0006_jobposts_qa.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_jobposts_qa.sql`:

```sql
alter table job_posts add column questions jsonb not null default '[]'::jsonb;
alter table job_posts drop column cover_letter_text;
alter table job_posts alter column questions drop default;
```

- [ ] **Step 2: Apply the migration manually**

Open the Supabase project dashboard → SQL Editor → paste the contents of `0006_jobposts_qa.sql` → Run.

- [ ] **Step 3: Verify manually**

In the Supabase dashboard → Table Editor, confirm `job_posts` now has a `questions` column and no longer has `cover_letter_text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0006_jobposts_qa.sql
git commit -m "Replace job_posts.cover_letter_text with structured questions jsonb"
```

---

## Task 2: Domain types for Q&A structure

**Files:**

- Modify: `lib/jobposts/types.ts`

- [ ] **Step 1: Update the types**

Replace the contents of `lib/jobposts/types.ts` with:

```ts
export interface JobPostReaction {
  id: string
  authorId: string
  emoji: string
}

export interface JobPostQuestion {
  question: string
  answer: string
}

export interface JobPost {
  id: string
  authorId: string
  authorName: string
  postDate: string
  companyName: string
  postingInfo: string | null
  questions: JobPostQuestion[]
  feedbackRequested: boolean
  feedbackDocId: string | null
  createdAt: string
  reactions: JobPostReaction[]
}

export interface FeedbackLine {
  questionIndex: number
  question: string
  text: string
}

export interface FlatFeedbackComment {
  id: string
  lineIndex: number
  parentCommentId: string | null
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface FeedbackComment extends FlatFeedbackComment {
  replies: FeedbackComment[]
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/jobposts/types.ts
git commit -m "Replace coverLetterText with structured Q&A types"
```

---

## Task 3: Sentence-based feedback line splitting

**Files:**

- Modify: `lib/jobposts/snapshot.ts`
- Modify: `lib/jobposts/snapshot.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `lib/jobposts/snapshot.test.ts` with:

```ts
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/jobposts/snapshot.test.ts`
Expected: FAIL — `buildFeedbackLines` still takes a single string, output shape mismatches

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `lib/jobposts/snapshot.ts` with:

```ts
import type { FeedbackLine } from './types'

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/jobposts/snapshot.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/jobposts/snapshot.ts lib/jobposts/snapshot.test.ts
git commit -m "Split feedback lines by sentence instead of raw newlines"
```

---

## Task 4: Job post server actions read indexed Q&A fields

**Files:**

- Modify: `app/(app)/jobposts/actions.ts`
- Modify: `app/(app)/jobposts/actions.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(app)/jobposts/actions.test.ts` with:

```ts
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

import { createJobPost, toggleReaction, deleteJobPost } from './actions'

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

describe('createJobPost', () => {
  function mockInsert({ jobPostError = null }: { jobPostError?: { message: string } | null } = {}) {
    const feedbackDocsInsert = vi.fn().mockResolvedValue({ error: null })
    const jobPostsSingle = vi
      .fn()
      .mockResolvedValue(
        jobPostError ? { data: null, error: jobPostError } : { data: { id: 'post-1' }, error: null }
      )
    const jobPostsInsert = vi.fn().mockReturnValue({ select: () => ({ single: jobPostsSingle }) })

    fromMock.mockImplementation((table: string) => {
      if (table === 'job_posts') return { insert: jobPostsInsert }
      if (table === 'feedback_docs') return { insert: feedbackDocsInsert }
      throw new Error(`unexpected table ${table}`)
    })

    return { jobPostsInsert, feedbackDocsInsert }
  }

  it('redirects with an error when the company name is missing', async () => {
    const formData = buildFormData({
      companyName: '',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '내용',
    })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요')
    )
  })

  it('redirects with an error when no question/answer pair is valid', async () => {
    const formData = buildFormData({
      companyName: '토스',
      questionCount: '1',
      'question-0': '',
      'answer-0': '',
    })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요')
    )
  })

  it('drops a pair where only the question or only the answer is filled in', async () => {
    const { jobPostsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '2',
      'question-0': '지원동기',
      'answer-0': '',
      'question-1': '강점',
      'answer-1': '문제 해결 능력.',
    })

    await createJobPost(formData)

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-13',
      company_name: '토스',
      posting_info: null,
      questions: [{ question: '강점', answer: '문제 해결 능력.' }],
      feedback_requested: false,
    })
  })

  it('creates a job post with multiple question/answer pairs', async () => {
    const { jobPostsInsert, feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '2',
      'question-0': '지원동기',
      'answer-0': '첫 문장.',
      'question-1': '강점',
      'answer-1': '둘째 문장.',
    })

    await createJobPost(formData)

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-13',
      company_name: '토스',
      posting_info: null,
      questions: [
        { question: '지원동기', answer: '첫 문장.' },
        { question: '강점', answer: '둘째 문장.' },
      ],
      feedback_requested: false,
    })
    expect(feedbackDocsInsert).not.toHaveBeenCalled()
  })

  it('creates a feedback snapshot split into per-question lines when feedback is requested', async () => {
    const { feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      postDate: '2026-08-13',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '첫 문장. 둘째 문장.',
      feedbackRequested: 'on',
    })

    await createJobPost(formData)

    expect(feedbackDocsInsert).toHaveBeenCalledWith({
      job_post_id: 'post-1',
      lines: [
        { questionIndex: 0, question: '지원동기', text: '첫 문장.' },
        { questionIndex: 0, question: '지원동기', text: '둘째 문장.' },
      ],
    })
  })

  it('redirects with an error when the job post insert fails', async () => {
    mockInsert({ jobPostError: { message: 'insert failed' } })
    const formData = buildFormData({
      companyName: '토스',
      questionCount: '1',
      'question-0': '지원동기',
      'answer-0': '내용',
    })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith('/jobposts?error=' + encodeURIComponent('insert failed'))
  })
})

describe('toggleReaction', () => {
  function mockFindExisting(existing: { id: string } | null) {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })
    const insert = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table !== 'job_post_reactions') throw new Error(`unexpected table ${table}`)
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

  it('inserts a reaction when none exists yet', async () => {
    const { insert, deleteEq } = mockFindExisting(null)

    await toggleReaction('post-1', '👍')

    expect(insert).toHaveBeenCalledWith({ post_id: 'post-1', author_id: 'user-1', emoji: '👍' })
    expect(deleteEq).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('deletes the existing reaction when the user already reacted', async () => {
    const { insert, deleteEq } = mockFindExisting({ id: 'reaction-1' })

    await toggleReaction('post-1', '👍')

    expect(deleteEq).toHaveBeenCalledWith('id', 'reaction-1')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('deleteJobPost', () => {
  function mockAdminCheck(role: 'admin' | 'member') {
    const deleteEq = vi.fn().mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role }, error: null }) }) }) }
      }
      if (table === 'job_posts') {
        return { delete: () => ({ eq: deleteEq }) }
      }
      throw new Error(`unexpected table ${table}`)
    })

    return { deleteEq }
  }

  it('deletes the post when the caller is an admin', async () => {
    const { deleteEq } = mockAdminCheck('admin')

    await deleteJobPost('post-1')

    expect(deleteEq).toHaveBeenCalledWith('id', 'post-1')
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('throws when the caller is not an admin', async () => {
    const { deleteEq } = mockAdminCheck('member')

    await expect(deleteJobPost('post-1')).rejects.toThrow('권한이 없습니다')
    expect(deleteEq).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/actions.test.ts"`
Expected: FAIL — `createJobPost` still reads `coverLetterText`, insert payload mismatches

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `app/(app)/jobposts/actions.ts` with:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { buildFeedbackLines } from '@/lib/jobposts/snapshot'

export async function createJobPost(formData: FormData) {
  const companyName = formData.get('companyName') as string
  const postingInfo = (formData.get('postingInfo') as string) || null
  const postDate = (formData.get('postDate') as string) || new Date().toISOString().slice(0, 10)
  const feedbackRequested = formData.get('feedbackRequested') === 'on'
  const questionCount = Number(formData.get('questionCount') ?? '0')

  const questions: { question: string; answer: string }[] = []
  for (let i = 0; i < questionCount; i++) {
    const question = (formData.get(`question-${i}`) as string) || ''
    const answer = (formData.get(`answer-${i}`) as string) || ''
    if (question && answer) {
      questions.push({ question, answer })
    }
  }

  if (!companyName || questions.length === 0) {
    redirect('/jobposts?error=' + encodeURIComponent('회사명과 최소 한 개의 문항/답변을 입력해주세요'))
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
    .from('job_posts')
    .insert({
      author_id: user.id,
      post_date: postDate,
      company_name: companyName,
      posting_info: postingInfo,
      questions,
      feedback_requested: feedbackRequested,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    redirect('/jobposts?error=' + encodeURIComponent(error?.message ?? '등록에 실패했습니다'))
    return
  }

  if (feedbackRequested) {
    const { error: docError } = await supabase
      .from('feedback_docs')
      .insert({ job_post_id: inserted.id, lines: buildFeedbackLines(questions) })

    if (docError) {
      redirect('/jobposts?error=' + encodeURIComponent(docError.message))
      return
    }
  }

  revalidatePath('/jobposts')
}

export async function toggleReaction(postId: string, emoji: string) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('로그인이 필요합니다')

  const { data: existing, error: fetchError } = await supabase
    .from('job_post_reactions')
    .select('id')
    .eq('post_id', postId)
    .eq('author_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle()

  if (fetchError) throw new Error(fetchError.message)

  if (existing) {
    const { error } = await supabase.from('job_post_reactions').delete().eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('job_post_reactions')
      .insert({ post_id: postId, author_id: user.id, emoji })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/jobposts')
}

export async function deleteJobPost(postId: string) {
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

  const { error } = await supabase.from('job_posts').delete().eq('id', postId)

  if (error) throw new Error(error.message)

  revalidatePath('/jobposts')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/actions.test.ts"`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/actions.ts" "app/(app)/jobposts/actions.test.ts"
git commit -m "Read indexed question/answer fields in createJobPost"
```

---

## Task 5: Post form becomes a client component with dynamic Q&A pairs

**Files:**

- Modify: `app/(app)/jobposts/post-form.tsx`
- Modify: `app/(app)/jobposts/post-form.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(app)/jobposts/post-form.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the company name, posting info, one question/answer pair, date, and feedback checkbox by default', () => {
    render(<PostForm />)

    expect(screen.getByPlaceholderText('회사명')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('공고 링크/정보 (선택)')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText(/질문/)).toHaveLength(1)
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: '피드백 받고 싶어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })

  it('adds another question/answer pair when clicking the add button', () => {
    render(<PostForm />)

    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))

    expect(screen.getAllByPlaceholderText(/질문/)).toHaveLength(2)
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(2)
  })

  it('removes a question/answer pair when clicking its delete button', () => {
    render(<PostForm />)
    fireEvent.click(screen.getByRole('button', { name: '+ 문항 추가' }))
    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: '삭제' })[0])

    expect(screen.getAllByPlaceholderText('답변')).toHaveLength(1)
  })

  it('does not show a delete button when only one question remains', () => {
    render(<PostForm />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/post-form.test.tsx"`
Expected: FAIL — no "+ 문항 추가" button, no indexed question/answer fields exist yet

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `app/(app)/jobposts/post-form.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { createJobPost } from './actions'

interface QuestionField {
  question: string
  answer: string
}

export function PostForm() {
  const today = new Date().toISOString().slice(0, 10)
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
    <form action={createJobPost} className="flex flex-col gap-3 rounded border p-4">
      <label htmlFor="companyName" className="sr-only">
        회사명
      </label>
      <input
        id="companyName"
        name="companyName"
        placeholder="회사명"
        required
        className="rounded border px-3 py-2"
      />
      <label htmlFor="postingInfo" className="sr-only">
        공고 정보
      </label>
      <textarea
        id="postingInfo"
        name="postingInfo"
        placeholder="공고 링크/정보 (선택)"
        className="rounded border px-3 py-2"
      />

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
              placeholder="질문 (예: 지원동기를 작성해주세요)"
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
              placeholder="답변"
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

      <label htmlFor="postDate" className="sr-only">
        날짜
      </label>
      <input
        id="postDate"
        name="postDate"
        type="date"
        defaultValue={today}
        required
        className="rounded border px-3 py-2"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="feedbackRequested" />
        피드백 받고 싶어요
      </label>
      <button type="submit" className="self-start rounded bg-black px-3 py-2 text-sm text-white">
        등록
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/post-form.test.tsx"`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/post-form.tsx" "app/(app)/jobposts/post-form.test.tsx"
git commit -m "Make the job post form a client component with dynamic Q&A pairs"
```

---

## Task 6: Post card renders each question with its own answer

**Files:**

- Modify: `app/(app)/jobposts/post-card.tsx`
- Modify: `app/(app)/jobposts/post-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(app)/jobposts/post-card.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  toggleReaction: vi.fn(),
  deleteJobPost: vi.fn(),
}))

import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'

const post: JobPost = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: '김민수',
  postDate: '2026-08-13',
  companyName: '토스',
  postingInfo: '백엔드 신입 공고',
  questions: [
    { question: '지원동기를 작성해주세요', answer: '문제 해결에 흥미를 느꼈습니다.' },
    { question: '본인의 강점은 무엇인가요', answer: '책임감이 강합니다.' },
  ],
  feedbackRequested: true,
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-13T00:00:00.000Z',
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders every question with its own answer', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('지원동기를 작성해주세요')).toBeInTheDocument()
    expect(screen.getByText('문제 해결에 흥미를 느꼈습니다.')).toBeInTheDocument()
    expect(screen.getByText('본인의 강점은 무엇인가요')).toBeInTheDocument()
    expect(screen.getByText('책임감이 강합니다.')).toBeInTheDocument()
  })

  it('renders the company, author, and date', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('2026-08-13')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
  })

  it('shows a feedback link when a feedback doc exists', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('does not show a delete button for non-admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
  })

  it('shows a delete button for admins', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={true} />)
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/post-card.test.tsx"`
Expected: FAIL — `post.questions` does not exist on the type/props used by the current implementation

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `app/(app)/jobposts/post-card.tsx` with:

```tsx
import { REACTION_EMOJIS } from '@/lib/checkin/types'
import type { JobPost } from '@/lib/jobposts/types'
import { toggleReaction, deleteJobPost } from './actions'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: JobPost
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <article className="rounded border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{post.companyName}</span>
          <span className="text-xs text-gray-500">{post.authorName}</span>
          <span className="text-xs text-gray-500">{post.postDate}</span>
        </div>
        {isAdmin && (
          <form action={deleteJobPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600">
              삭제
            </button>
          </form>
        )}
      </div>

      {post.postingInfo && <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600">{post.postingInfo}</p>}

      <div className="flex flex-col gap-3">
        {post.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500">{q.question}</p>
            <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        {REACTION_EMOJIS.map((emoji) => {
          const count = post.reactions.filter((r) => r.emoji === emoji).length
          const reacted = post.reactions.some((r) => r.emoji === emoji && r.authorId === currentUserId)
          return (
            <form key={emoji} action={toggleReaction.bind(null, post.id, emoji)}>
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${reacted ? 'bg-black text-white' : ''}`}
              >
                {emoji}
                {count > 0 ? ` ${count}` : ''}
              </button>
            </form>
          )
        })}
      </div>

      {post.feedbackDocId && (
        <a href={`/feedback/${post.feedbackDocId}`} className="mt-3 inline-block text-sm text-gray-500 underline">
          피드백 보기
        </a>
      )}
    </article>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/post-card.test.tsx"`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/post-card.tsx" "app/(app)/jobposts/post-card.test.tsx"
git commit -m "Render each cover letter question with its own answer"
```

---

## Task 7: Feed page selects the questions column

**Files:**

- Modify: `app/(app)/jobposts/page.tsx`
- Modify: `app/(app)/jobposts/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(app)/jobposts/page.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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

import JobPostsPage from './page'

describe('JobPostsPage', () => {
  it('renders the post form and the feed with the question, answer, and feedback link', async () => {
    const ui = await JobPostsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
    expect(screen.getByText('지원동기를 작성해주세요')).toBeInTheDocument()
    expect(screen.getByText('문제 해결에 흥미를 느꼈습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/page.test.tsx"`
Expected: FAIL — page still selects/maps `cover_letter_text`

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `app/(app)/jobposts/page.tsx` with:

```tsx
import { createClient } from '@/lib/supabase/server'
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

  const { data: posts } = await supabase
    .from('job_posts')
    .select('id, author_id, post_date, company_name, posting_info, questions, feedback_requested, created_at')
    .order('created_at', { ascending: false })

  const postIds = (posts ?? []).map((p) => p.id)

  const { data: reactions } = postIds.length
    ? await supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    : { data: [] }

  const { data: feedbackDocs } = postIds.length
    ? await supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds)
    : { data: [] }

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
            <PostCard post={post} currentUserId={user!.id} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/page.test.tsx"`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/page.tsx" "app/(app)/jobposts/page.test.tsx"
git commit -m "Select job_posts.questions on the feed page"
```

---

## Task 8: Click-to-expand feedback line component

**Files:**

- Create: `app/(app)/feedback/[id]/feedback-lines.tsx`
- Test: `app/(app)/feedback/[id]/feedback-lines.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `app/(app)/feedback/[id]/feedback-lines.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import { FeedbackLines } from './feedback-lines'
import type { FeedbackLineWithComments } from './feedback-lines'

const lines: FeedbackLineWithComments[] = [
  {
    index: 0,
    questionIndex: 0,
    question: '지원동기를 작성해주세요',
    text: '첫 번째 문장입니다.',
    comments: [],
  },
  {
    index: 1,
    questionIndex: 0,
    question: '지원동기를 작성해주세요',
    text: '두 번째 문장입니다.',
    comments: [
      {
        id: 'c1',
        lineIndex: 1,
        parentCommentId: null,
        authorId: 'user-2',
        authorName: '이지은',
        body: '이 부분 좋아요',
        createdAt: '2026-08-13T00:00:00.000Z',
        replies: [
          {
            id: 'c2',
            lineIndex: 1,
            parentCommentId: 'c1',
            authorId: 'user-1',
            authorName: '김민수',
            body: '감사합니다',
            createdAt: '2026-08-13T00:01:00.000Z',
            replies: [],
          },
        ],
      },
    ],
  },
  {
    index: 2,
    questionIndex: 1,
    question: '본인의 강점은 무엇인가요',
    text: '책임감이 강합니다.',
    comments: [],
  },
]

describe('FeedbackLines', () => {
  it('shows a question heading whenever the question changes', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.getByRole('heading', { name: '지원동기를 작성해주세요' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '본인의 강점은 무엇인가요' })).toBeInTheDocument()
  })

  it('shows a comment count badge for a line with existing comments, and a plain trigger otherwise', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.getByRole('button', { name: '💬 2' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '+' })).toHaveLength(2)
  })

  it('expands only the clicked line, showing its comment thread', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))

    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
  })

  it('collapses the previously expanded line when a different line is clicked', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0])

    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()
  })

  it('collapses the line when its own trigger is clicked again', () => {
    render(<FeedbackLines feedbackDocId="doc-1" lines={lines} />)

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '💬 2' }))
    expect(screen.queryByText('이 부분 좋아요')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/feedback/[id]/feedback-lines.test.tsx"`
Expected: FAIL with "Cannot find module './feedback-lines'" (or similar)

- [ ] **Step 3: Write the minimal implementation**

Create `app/(app)/feedback/[id]/feedback-lines.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { FeedbackComment } from '@/lib/jobposts/types'
import { CommentThread } from './comment-thread'

export interface FeedbackLineWithComments {
  index: number
  questionIndex: number
  question: string
  text: string
  comments: FeedbackComment[]
}

function countComments(comments: FeedbackComment[]): number {
  return comments.reduce((sum, c) => sum + 1 + countComments(c.replies), 0)
}

export function FeedbackLines({
  feedbackDocId,
  lines,
}: {
  feedbackDocId: string
  lines: FeedbackLineWithComments[]
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  function toggle(index: number) {
    setExpandedIndex((prev) => (prev === index ? null : index))
  }

  let lastQuestionIndex = -1
  let displayNumber = 0

  return (
    <div className="flex flex-col gap-1">
      {lines.map((line) => {
        const isNewQuestion = line.questionIndex !== lastQuestionIndex
        if (isNewQuestion) {
          lastQuestionIndex = line.questionIndex
          displayNumber = 0
        }
        displayNumber += 1
        const commentCount = countComments(line.comments)
        const expanded = expandedIndex === line.index

        return (
          <div key={line.index}>
            {isNewQuestion && <h2 className="mb-1 mt-4 text-sm font-semibold text-gray-700">{line.question}</h2>}
            <div
              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                expanded ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-xs text-gray-400">{displayNumber}</span>
              <p className="flex-1 whitespace-pre-wrap">{line.text}</p>
              <button type="button" onClick={() => toggle(line.index)} className="shrink-0 text-xs text-gray-500">
                {commentCount > 0 ? `💬 ${commentCount}` : '+'}
              </button>
            </div>
            {expanded && (
              <div className="ml-4 mb-2 rounded border border-blue-200 bg-blue-50/50 p-3">
                <CommentThread feedbackDocId={feedbackDocId} lineIndex={line.index} comments={line.comments} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/feedback-lines.test.tsx"`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/feedback-lines.tsx" "app/(app)/feedback/[id]/feedback-lines.test.tsx"
git commit -m "Add click-to-expand feedback line component"
```

---

## Task 9: Feedback page renders grouped, expandable lines

**Files:**

- Modify: `app/(app)/feedback/[id]/page.tsx`
- Modify: `app/(app)/feedback/[id]/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the contents of `app/(app)/feedback/[id]/page.test.tsx` with:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const doc = {
  id: 'doc-1',
  job_post_id: 'post-1',
  lines: [
    { questionIndex: 0, question: '지원동기를 작성해주세요', text: '첫 번째 문장입니다.' },
    { questionIndex: 0, question: '지원동기를 작성해주세요', text: '두 번째 문장입니다.' },
    { questionIndex: 1, question: '본인의 강점은 무엇인가요', text: '책임감이 강합니다.' },
  ],
}
const jobPost = { company_name: '토스', author_id: 'user-1' }
const profiles = [{ id: 'user-1', name: '김민수' }]
const comments = [
  {
    id: 'c1',
    line_index: 0,
    parent_comment_id: null,
    author_id: 'user-1',
    body: '첫 문장 의견',
    created_at: '2026-08-13T00:00:00.000Z',
  },
]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === 'feedback_docs') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: doc }) }) }) }
      }
      if (table === 'job_posts') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: jobPost }) }) }) }
      }
      if (table === 'profiles') {
        return { select: () => Promise.resolve({ data: profiles }) }
      }
      if (table === 'feedback_comments') {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: comments }) }) }) }
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
  it('renders a heading per question and every line under it', async () => {
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

  it('attaches existing comments to the correct line', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('button', { name: '💬 1' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: FAIL — page still renders `doc.lines` as plain strings in a `<ul>`, no question headings or comment badges

- [ ] **Step 3: Write the minimal implementation**

Replace the contents of `app/(app)/feedback/[id]/page.tsx` with:

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

  const { data: doc } = await supabase
    .from('feedback_docs')
    .select('id, job_post_id, lines')
    .eq('id', id)
    .maybeSingle()

  if (!doc) {
    redirect('/jobposts?error=' + encodeURIComponent('존재하지 않는 피드백입니다'))
    return
  }

  const { data: jobPost } = await supabase
    .from('job_posts')
    .select('company_name, author_id')
    .eq('id', doc.job_post_id)
    .single()

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
  const authorName = nameById.get(jobPost?.author_id ?? '') ?? '알 수 없음'

  const feedbackLines: FeedbackLineWithComments[] = lines.map((line, index) => ({
    index,
    questionIndex: line.questionIndex,
    question: line.question,
    text: line.text,
    comments: commentsByLine.get(index) ?? [],
  }))

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{jobPost?.company_name} 자소서 피드백</h1>
      <p className="mb-6 text-sm text-gray-500">작성자: {authorName}</p>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <FeedbackLines feedbackDocId={id} lines={feedbackLines} />
    </main>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/page.tsx" "app/(app)/feedback/[id]/page.test.tsx"
git commit -m "Render feedback lines grouped by question with click-to-expand comments"
```

---

## Task 10: Verify end-to-end against a real Supabase project

This task has no automated test for its manual steps — it confirms the full rewrite works end-to-end with real Supabase RLS after the migration is applied.

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass, including every file touched in this plan.

- [ ] **Step 2: Build the app**

```bash
npm run build
```

Expected: build succeeds with no TypeScript errors (in particular, confirm no other file still references `coverLetterText`/`cover_letter_text` — search for it if the build fails).

- [ ] **Step 3: Confirm the migration is live**

In the Supabase dashboard, re-check that `0006_jobposts_qa.sql` ran successfully (Task 1) — `job_posts.questions` exists and `cover_letter_text` is gone.

- [ ] **Step 4: Start the dev server and post with two Q&A pairs**

```bash
npm run dev
```

Log in as an approved member, visit `http://localhost:3000/jobposts`, click "+ 문항 추가" once, fill in two question/answer pairs (make at least one answer span two sentences with a period), check "피드백 받고 싶어요", and submit.
Expected: redirected back to `/jobposts`; the new card shows both questions with their own answers; a "피드백 보기" link appears.

- [ ] **Step 5: Confirm sentence splitting and question grouping on the feedback page**

Click "피드백 보기".
Expected: each question appears as its own heading; the multi-sentence answer is split into separate line rows at each period, with no stray blank lines.

- [ ] **Step 6: Confirm the click-to-expand interaction**

Click the "+" trigger on a line.
Expected: a comment box opens directly under that line. Add a comment, submit, and confirm the trigger now reads "💬 1" and the line shows the comment when clicked again. Click a different line's trigger and confirm the first line's comment box closes.

- [ ] **Step 7: Commit any fixes found during manual verification**

If any issues were found and fixed during this walkthrough, commit them with a descriptive message before considering this task done.
