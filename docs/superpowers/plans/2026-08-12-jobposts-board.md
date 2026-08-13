# Cover Letter Feedback Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 자소서 피드백 + 회사분석 board — the third of the four study-site boards — where members post one-a-day job postings with their cover letter text (`/jobposts`), react with emoji (no comments on the feed itself), optionally request line-by-line feedback at post time, and view/discuss that feedback as a fixed snapshot with GitHub-PR-style threaded line comments (`/feedback/[id]`).

**Architecture:** Four new Postgres tables (`job_posts`, `job_post_reactions`, `feedback_docs`, `feedback_comments`) gated by RLS to approved members, mirroring the `is_approved()`/`is_admin()` policy pattern from the checkin and coding boards. `feedback_docs.lines` stores a JSONB snapshot of the cover letter split into lines at creation time — the original `job_posts` row is never edited afterward, so the snapshot never drifts from what was actually reviewed. `feedback_comments` supports GitHub-review-style threaded replies via a self-referencing `parent_comment_id`, scoped to one line each. Two small pure-logic modules (`lib/jobposts/snapshot.ts` for line-splitting, `lib/jobposts/comments.ts` for building the reply tree per line) are the only non-trivial logic and the only things worth unit testing directly — everything else follows the plain multi-query Supabase fetch + Server Action pattern already proven in the checkin and coding boards.

**Tech Stack:** Next.js (App Router, TypeScript) Server Actions, Supabase (Postgres + Auth + RLS), Tailwind CSS, Vitest + React Testing Library. Builds on the foundation (`docs/superpowers/plans/2026-07-29-study-site-foundation.md`) and follows the same patterns established in the checkin board (`docs/superpowers/plans/2026-08-10-checkin-board.md`) and coding board (`docs/superpowers/plans/2026-08-10-coding-board.md`).

**Spec:** `docs/superpowers/specs/2026-07-29-study-site-design.md` (자소서 피드백 + 회사분석 section)

**Decisions confirmed with the user before writing this plan:**
- `feedback_comments` supports nested replies (a self-referencing `parent_comment_id`), not just a flat per-line list — GitHub-PR-review style.
- "피드백 받고 싶어요" can only be requested at post-creation time. There is no later "request feedback" action on an existing post, so `job_posts` never needs an update path and the snapshot logic only ever runs once, right after insert.

**Assumptions (not fully specified in the spec — flag if wrong):**
- Only admins can delete job posts (same board-moderation permission as the other two boards); there is no author edit/delete, and `job_posts` rows are never updated after creation — this is what makes the feedback snapshot safe to treat as immutable.
- `게시글 삭제` cascades: deleting a `job_posts` row cascades to `job_post_reactions`, `feedback_docs`, and (transitively) `feedback_comments` via `on delete cascade`, the same FK-cascade pattern already relied on for `checkin_posts` → `checkin_comments`/`checkin_reactions`.
- The feed is a flat reverse-chronological list (like `/checkin`), not grouped by week (unlike `/coding`) — the spec doesn't mention week grouping for this board.
- `post_date` is a plain `date` column (not `timestamptz`) defaulting to today in the form, consistent with wanting date-only semantics for "which day did you apply."
- Reuses `REACTION_EMOJIS` from `lib/checkin/types.ts` rather than redefining the same three emoji, since the spec doesn't call for a different reaction set on this board.

---

## File Structure

```
supabase/
  migrations/
    0005_jobposts.sql        # job_posts, job_post_reactions, feedback_docs, feedback_comments + RLS
lib/
  jobposts/
    types.ts                  # JobPost, JobPostReaction, FlatFeedbackComment, FeedbackComment
    snapshot.ts                 # buildFeedbackLines
    snapshot.test.ts
    comments.ts                  # groupCommentsByLine (flat list -> per-line reply trees)
    comments.test.ts
    calendar.ts                   # buildMonthCalendar, groupPostsByMember (company-per-date)
    calendar.test.ts
app/
  (app)/
    jobposts/
      actions.ts                # createJobPost, toggleReaction, deleteJobPost (admin)
      actions.test.ts
      post-form.tsx               # company/posting info/cover letter/date/feedback checkbox
      post-form.test.tsx
      post-card.tsx                 # feed card: company, author, reactions, feedback link, admin delete
      post-card.test.tsx
      page.tsx                       # /jobposts board
      page.test.tsx
      calendar/
        page.tsx                      # /jobposts/calendar, date/member views
        page.test.tsx
    feedback/
      [id]/
        actions.ts                     # addFeedbackComment (root or reply)
        actions.test.ts
        comment-thread.tsx               # renders one line's reply tree + reply/new-comment forms
        comment-thread.test.tsx
        page.tsx                          # /feedback/[id] snapshot + threaded comments
        page.test.tsx
```

---

## Task 1: Database schema migration — job posts, reactions, feedback snapshots, threaded comments

**Files:**

- Create: `supabase/migrations/0005_jobposts.sql`

- [x] **Step 1: Write the migration**

Create `supabase/migrations/0005_jobposts.sql`:

```sql
create table job_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  post_date date not null,
  company_name text not null,
  posting_info text,
  cover_letter_text text not null,
  feedback_requested boolean not null default false,
  created_at timestamptz not null default now()
);

create table job_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references job_posts(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (post_id, author_id, emoji)
);

-- One snapshot per job post, created only when feedback_requested is checked
-- at post-creation time. job_posts is never updated afterward, so this
-- snapshot never needs to be regenerated or kept in sync.
create table feedback_docs (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references job_posts(id) on delete cascade,
  lines jsonb not null,
  created_at timestamptz not null default now()
);

-- parent_comment_id is self-referencing so replies can nest GitHub-PR-review
-- style; a reply always shares its parent's line_index (enforced in the
-- addFeedbackComment server action, not in the schema).
create table feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_doc_id uuid not null references feedback_docs(id) on delete cascade,
  line_index integer not null,
  parent_comment_id uuid references feedback_comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table job_posts enable row level security;
alter table job_post_reactions enable row level security;
alter table feedback_docs enable row level security;
alter table feedback_comments enable row level security;

create policy "Approved members can read job posts"
  on job_posts for select
  using (public.is_approved());

create policy "Approved members can create job posts"
  on job_posts for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "Admins can delete job posts"
  on job_posts for delete
  using (public.is_admin());

create policy "Approved members can read job post reactions"
  on job_post_reactions for select
  using (public.is_approved());

create policy "Approved members can create job post reactions"
  on job_post_reactions for insert
  with check (author_id = auth.uid() and public.is_approved());

create policy "Members can delete own job post reactions"
  on job_post_reactions for delete
  using (author_id = auth.uid());

create policy "Approved members can read feedback docs"
  on feedback_docs for select
  using (public.is_approved());

create policy "Authors can create their own feedback snapshot"
  on feedback_docs for insert
  with check (
    public.is_approved()
    and exists (select 1 from job_posts jp where jp.id = job_post_id and jp.author_id = auth.uid())
  );

create policy "Approved members can read feedback comments"
  on feedback_comments for select
  using (public.is_approved());

create policy "Approved members can create feedback comments"
  on feedback_comments for insert
  with check (author_id = auth.uid() and public.is_approved());
```

- [x] **Step 2: Apply the migration manually**

Open the Supabase project dashboard → SQL Editor → paste the contents of `0005_jobposts.sql` → Run.

- [x] **Step 3: Verify manually**

In the Supabase dashboard → Table Editor, confirm `job_posts`, `job_post_reactions`, `feedback_docs`, and `feedback_comments` all exist. In the SQL Editor, run `select * from pg_policies where tablename in ('job_posts','job_post_reactions','feedback_docs','feedback_comments');` and confirm 8 policies exist (3 + 3 + 2 + 2).

- [x] **Step 4: Commit**

```bash
git add supabase/migrations/0005_jobposts.sql
git commit -m "Add job posts, reactions, and threaded feedback comment tables"
```

---

## Task 2: Job posts domain types

**Files:**

- Create: `lib/jobposts/types.ts`

- [x] **Step 1: Write the domain types**

Create `lib/jobposts/types.ts`:

```ts
export interface JobPostReaction {
  id: string
  authorId: string
  emoji: string
}

export interface JobPost {
  id: string
  authorId: string
  authorName: string
  postDate: string
  companyName: string
  postingInfo: string | null
  coverLetterText: string
  feedbackRequested: boolean
  feedbackDocId: string | null
  createdAt: string
  reactions: JobPostReaction[]
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

- [x] **Step 2: Commit**

```bash
git add lib/jobposts/types.ts
git commit -m "Add job posts domain types"
```

---

## Task 3: Feedback snapshot line-splitting logic

**Files:**

- Create: `lib/jobposts/snapshot.ts`
- Test: `lib/jobposts/snapshot.test.ts`

- [x] **Step 1: Write the failing tests**

Create `lib/jobposts/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFeedbackLines } from './snapshot'

describe('buildFeedbackLines', () => {
  it('returns a single-element array for text with no line breaks', () => {
    expect(buildFeedbackLines('한 줄짜리 자소서')).toEqual(['한 줄짜리 자소서'])
  })

  it('splits text on newlines into one entry per line', () => {
    const text = '첫 번째 줄\n두 번째 줄\n세 번째 줄'
    expect(buildFeedbackLines(text)).toEqual(['첫 번째 줄', '두 번째 줄', '세 번째 줄'])
  })

  it('preserves blank lines between paragraphs', () => {
    const text = '첫 문단\n\n둘째 문단'
    expect(buildFeedbackLines(text)).toEqual(['첫 문단', '', '둘째 문단'])
  })

  it('normalizes CRLF line endings', () => {
    const text = '줄1\r\n줄2'
    expect(buildFeedbackLines(text)).toEqual(['줄1', '줄2'])
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/jobposts/snapshot.test.ts`
Expected: FAIL with "Cannot find module './snapshot'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `lib/jobposts/snapshot.ts`:

```ts
export function buildFeedbackLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/jobposts/snapshot.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add lib/jobposts/snapshot.ts lib/jobposts/snapshot.test.ts
git commit -m "Add feedback snapshot line-splitting logic"
```

---

## Task 4: Threaded feedback comment grouping logic

**Files:**

- Create: `lib/jobposts/comments.ts`
- Test: `lib/jobposts/comments.test.ts`

- [x] **Step 1: Write the failing tests**

Create `lib/jobposts/comments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupCommentsByLine } from './comments'
import type { FlatFeedbackComment } from './types'

describe('groupCommentsByLine', () => {
  it('groups top-level comments under their line index', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: '첫 줄 의견',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 1,
        parentCommentId: null,
        authorId: 'u2',
        authorName: '이지은',
        body: '둘째 줄 의견',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)

    expect(grouped.get(0)?.map((c) => c.id)).toEqual(['c1'])
    expect(grouped.get(1)?.map((c) => c.id)).toEqual(['c2'])
  })

  it('nests replies under their parent comment on the same line', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: '첫 줄 의견',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'u2',
        authorName: '이지은',
        body: '답글',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)
    const roots = grouped.get(0) ?? []

    expect(roots).toHaveLength(1)
    expect(roots[0].id).toBe('c1')
    expect(roots[0].replies.map((r) => r.id)).toEqual(['c2'])
  })

  it('supports nested replies more than one level deep', () => {
    const comments: FlatFeedbackComment[] = [
      {
        id: 'c1',
        lineIndex: 0,
        parentCommentId: null,
        authorId: 'u1',
        authorName: '김민수',
        body: 'A',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'u2',
        authorName: '이지은',
        body: 'B',
        createdAt: '2026-08-12T00:01:00.000Z',
      },
      {
        id: 'c3',
        lineIndex: 0,
        parentCommentId: 'c2',
        authorId: 'u1',
        authorName: '김민수',
        body: 'C',
        createdAt: '2026-08-12T00:02:00.000Z',
      },
    ]

    const grouped = groupCommentsByLine(comments)
    const roots = grouped.get(0) ?? []

    expect(roots[0].replies[0].replies.map((r) => r.id)).toEqual(['c3'])
  })

  it('returns an empty map for no comments', () => {
    expect(groupCommentsByLine([]).size).toBe(0)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/jobposts/comments.test.ts`
Expected: FAIL with "Cannot find module './comments'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `lib/jobposts/comments.ts`:

```ts
import type { FlatFeedbackComment, FeedbackComment } from './types'

function buildTree(flat: FlatFeedbackComment[]): FeedbackComment[] {
  const byId = new Map<string, FeedbackComment>(flat.map((c) => [c.id, { ...c, replies: [] }]))
  const roots: FeedbackComment[] = []

  for (const comment of byId.values()) {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId)!.replies.push(comment)
    } else {
      roots.push(comment)
    }
  }

  return roots
}

export function groupCommentsByLine(comments: FlatFeedbackComment[]): Map<number, FeedbackComment[]> {
  const byLine = new Map<number, FlatFeedbackComment[]>()

  for (const comment of comments) {
    const list = byLine.get(comment.lineIndex) ?? []
    list.push(comment)
    byLine.set(comment.lineIndex, list)
  }

  const result = new Map<number, FeedbackComment[]>()
  for (const [lineIndex, list] of byLine) {
    result.set(lineIndex, buildTree(list))
  }

  return result
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/jobposts/comments.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add lib/jobposts/comments.ts lib/jobposts/comments.test.ts
git commit -m "Add threaded feedback comment grouping logic"
```

---

## Task 5: Job posts calendar logic

**Files:**

- Create: `lib/jobposts/calendar.ts`
- Test: `lib/jobposts/calendar.test.ts`

- [x] **Step 1: Write the failing tests**

Create `lib/jobposts/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildMonthCalendar, groupPostsByMember } from './calendar'

describe('buildMonthCalendar', () => {
  it('places a post on the correct day cell', () => {
    const posts = [
      { id: 'p1', authorId: 'u1', authorName: '김민수', companyName: '토스', postDate: '2026-08-10' },
    ]

    const weeks = buildMonthCalendar(2026, 8, posts)
    const day10 = weeks.flat().find((day) => day.date === '2026-08-10')

    expect(day10?.posts).toHaveLength(1)
    expect(day10?.posts[0].id).toBe('p1')
  })

  it('marks days outside the target month as not in month', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    const outsideDays = weeks.flat().filter((day) => !day.inMonth)

    for (const day of outsideDays) {
      expect(day.date.startsWith('2026-08')).toBe(false)
    }
  })

  it('returns 6 weeks of 7 days each', () => {
    const weeks = buildMonthCalendar(2026, 8, [])
    expect(weeks).toHaveLength(6)
    for (const week of weeks) {
      expect(week).toHaveLength(7)
    }
  })
})

describe('groupPostsByMember', () => {
  it('groups posts under their author and sorts by author name', () => {
    const posts = [
      { id: 'p1', authorId: 'u2', authorName: '이지은', companyName: '네이버', postDate: '2026-08-10' },
      { id: 'p2', authorId: 'u1', authorName: '김민수', companyName: '카카오', postDate: '2026-08-11' },
      { id: 'p3', authorId: 'u1', authorName: '김민수', companyName: '토스', postDate: '2026-08-12' },
    ]

    const grouped = groupPostsByMember(posts)

    expect(grouped.map((g) => g.authorName)).toEqual(['김민수', '이지은'])
    expect(grouped[0].posts).toHaveLength(2)
    expect(grouped[1].posts).toHaveLength(1)
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/jobposts/calendar.test.ts`
Expected: FAIL with "Cannot find module './calendar'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `lib/jobposts/calendar.ts`:

```ts
export interface CalendarJobPost {
  id: string
  authorId: string
  authorName: string
  companyName: string
  postDate: string
}

export interface CalendarDay {
  date: string
  inMonth: boolean
  posts: CalendarJobPost[]
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function buildMonthCalendar(year: number, month: number, posts: CalendarJobPost[]): CalendarDay[][] {
  const postsByDate = new Map<string, CalendarJobPost[]>()
  for (const post of posts) {
    const key = post.postDate.slice(0, 10)
    const list = postsByDate.get(key) ?? []
    list.push(post)
    postsByDate.set(key, list)
  }

  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const startWeekday = firstOfMonth.getUTCDay()
  const cursor = new Date(firstOfMonth)
  cursor.setUTCDate(cursor.getUTCDate() - startWeekday)

  const weeks: CalendarDay[][] = []

  for (let week = 0; week < 6; week++) {
    const days: CalendarDay[] = []
    for (let day = 0; day < 7; day++) {
      const key = toDateKey(cursor)
      days.push({
        date: key,
        inMonth: cursor.getUTCMonth() === month - 1,
        posts: postsByDate.get(key) ?? [],
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    weeks.push(days)
  }

  return weeks
}

export function groupPostsByMember(
  posts: CalendarJobPost[]
): { authorId: string; authorName: string; posts: CalendarJobPost[] }[] {
  const map = new Map<string, { authorId: string; authorName: string; posts: CalendarJobPost[] }>()

  for (const post of posts) {
    const existing = map.get(post.authorId)
    if (existing) {
      existing.posts.push(post)
    } else {
      map.set(post.authorId, { authorId: post.authorId, authorName: post.authorName, posts: [post] })
    }
  }

  return Array.from(map.values()).sort((a, b) => a.authorName.localeCompare(b.authorName))
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/jobposts/calendar.test.ts`
Expected: PASS (4 tests)

- [x] **Step 5: Commit**

```bash
git add lib/jobposts/calendar.ts lib/jobposts/calendar.test.ts
git commit -m "Add job posts calendar grouping logic"
```

---

## Task 6: Job posts server actions

**Files:**

- Create: `app/(app)/jobposts/actions.ts`
- Test: `app/(app)/jobposts/actions.test.ts`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/jobposts/actions.test.ts`:

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
    const formData = buildFormData({ companyName: '', coverLetterText: '내용' })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 자소서 내용을 입력해주세요')
    )
  })

  it('redirects with an error when the cover letter text is missing', async () => {
    const formData = buildFormData({ companyName: '토스', coverLetterText: '' })

    await expect(createJobPost(formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/jobposts?error=' + encodeURIComponent('회사명과 자소서 내용을 입력해주세요')
    )
  })

  it('creates a job post without a feedback snapshot when feedback is not requested', async () => {
    const { jobPostsInsert, feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      coverLetterText: '자기소개서 내용',
      postDate: '2026-08-12',
    })

    await createJobPost(formData)

    expect(jobPostsInsert).toHaveBeenCalledWith({
      author_id: 'user-1',
      post_date: '2026-08-12',
      company_name: '토스',
      posting_info: null,
      cover_letter_text: '자기소개서 내용',
      feedback_requested: false,
    })
    expect(feedbackDocsInsert).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenCalledWith('/jobposts')
  })

  it('creates a feedback snapshot split into lines when feedback is requested', async () => {
    const { feedbackDocsInsert } = mockInsert()
    const formData = buildFormData({
      companyName: '토스',
      coverLetterText: '첫 줄\n둘째 줄',
      postDate: '2026-08-12',
      feedbackRequested: 'on',
    })

    await createJobPost(formData)

    expect(feedbackDocsInsert).toHaveBeenCalledWith({
      job_post_id: 'post-1',
      lines: ['첫 줄', '둘째 줄'],
    })
  })

  it('redirects with an error when the job post insert fails', async () => {
    mockInsert({ jobPostError: { message: 'insert failed' } })
    const formData = buildFormData({ companyName: '토스', coverLetterText: '내용' })

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

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/actions.test.ts"`
Expected: FAIL with "Cannot find module './actions'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/jobposts/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { buildFeedbackLines } from '@/lib/jobposts/snapshot'

export async function createJobPost(formData: FormData) {
  const companyName = formData.get('companyName') as string
  const postingInfo = (formData.get('postingInfo') as string) || null
  const coverLetterText = formData.get('coverLetterText') as string
  const postDate = (formData.get('postDate') as string) || new Date().toISOString().slice(0, 10)
  const feedbackRequested = formData.get('feedbackRequested') === 'on'

  if (!companyName || !coverLetterText) {
    redirect('/jobposts?error=' + encodeURIComponent('회사명과 자소서 내용을 입력해주세요'))
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
      cover_letter_text: coverLetterText,
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
      .insert({ job_post_id: inserted.id, lines: buildFeedbackLines(coverLetterText) })

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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/actions.test.ts"`
Expected: PASS (9 tests)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/actions.ts" "app/(app)/jobposts/actions.test.ts"
git commit -m "Add job posts server actions"
```

---

## Task 7: Post form component

**Files:**

- Create: `app/(app)/jobposts/post-form.tsx`
- Test: `app/(app)/jobposts/post-form.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/jobposts/post-form.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  createJobPost: vi.fn(),
}))

import { PostForm } from './post-form'

describe('PostForm', () => {
  it('renders the company name, posting info, cover letter, date, and feedback checkbox fields', () => {
    render(<PostForm />)

    expect(screen.getByPlaceholderText('회사명')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('공고 링크/정보 (선택)')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('자소서 원문')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '피드백 받고 싶어요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/post-form.test.tsx"`
Expected: FAIL with "Cannot find module './post-form'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/jobposts/post-form.tsx`:

```tsx
import { createJobPost } from './actions'

export function PostForm() {
  const today = new Date().toISOString().slice(0, 10)

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
      <label htmlFor="coverLetterText" className="sr-only">
        자소서 원문
      </label>
      <textarea
        id="coverLetterText"
        name="coverLetterText"
        placeholder="자소서 원문"
        required
        rows={6}
        className="rounded border px-3 py-2"
      />
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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/post-form.test.tsx"`
Expected: PASS (1 test)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/post-form.tsx" "app/(app)/jobposts/post-form.test.tsx"
git commit -m "Add job post write form"
```

---

## Task 8: Post card component

**Files:**

- Create: `app/(app)/jobposts/post-card.tsx`
- Test: `app/(app)/jobposts/post-card.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/jobposts/post-card.test.tsx`:

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
  postDate: '2026-08-12',
  companyName: '토스',
  postingInfo: '백엔드 신입 공고',
  coverLetterText: '자소서 원문입니다',
  feedbackRequested: true,
  feedbackDocId: 'doc-1',
  createdAt: '2026-08-12T00:00:00.000Z',
  reactions: [{ id: 'r1', authorId: 'user-2', emoji: '👍' }],
}

describe('PostCard', () => {
  it('renders the company, author, date, posting info, and cover letter text', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)

    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByText('2026-08-12')).toBeInTheDocument()
    expect(screen.getByText('백엔드 신입 공고')).toBeInTheDocument()
    expect(screen.getByText('자소서 원문입니다')).toBeInTheDocument()
  })

  it('shows the reaction count for an emoji with existing reactions', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('button', { name: '👍 1' })).toBeInTheDocument()
  })

  it('shows a feedback link when a feedback doc exists', () => {
    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} />)
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })

  it('does not show a feedback link when feedback was not requested', () => {
    render(<PostCard post={{ ...post, feedbackDocId: null }} currentUserId="user-1" isAdmin={false} />)
    expect(screen.queryByRole('link', { name: '피드백 보기' })).not.toBeInTheDocument()
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

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/post-card.test.tsx"`
Expected: FAIL with "Cannot find module './post-card'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/jobposts/post-card.tsx`:

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
      <p className="whitespace-pre-wrap text-sm">{post.coverLetterText}</p>

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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/post-card.test.tsx"`
Expected: PASS (6 tests)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/post-card.tsx" "app/(app)/jobposts/post-card.test.tsx"
git commit -m "Add job post feed card"
```

---

## Task 9: Job posts feed page

**Files:**

- Create: `app/(app)/jobposts/page.tsx`
- Test: `app/(app)/jobposts/page.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/jobposts/page.test.tsx`:

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
    post_date: '2026-08-12',
    company_name: '토스',
    posting_info: '백엔드 신입',
    cover_letter_text: '자소서 원문',
    feedback_requested: true,
    created_at: '2026-08-12T00:00:00.000Z',
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
  it('renders the post form and the feed with author, company, and feedback link', async () => {
    const ui = await JobPostsPage({ searchParams: Promise.resolve({}) })
    render(ui)

    expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument()
    expect(screen.getByText('토스')).toBeInTheDocument()
    expect(screen.getByText('김민수')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/feedback/doc-1')
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/page.test.tsx"`
Expected: FAIL with "Cannot find module './page'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/jobposts/page.tsx`:

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
    .select('id, author_id, post_date, company_name, posting_info, cover_letter_text, feedback_requested, created_at')
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
    coverLetterText: post.cover_letter_text,
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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/page.test.tsx"`
Expected: PASS (1 test)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/page.tsx" "app/(app)/jobposts/page.test.tsx"
git commit -m "Add job posts feed page"
```

---

## Task 10: Job posts calendar page

**Files:**

- Create: `app/(app)/jobposts/calendar/page.tsx`
- Test: `app/(app)/jobposts/calendar/page.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/jobposts/calendar/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const profiles = [{ id: 'user-1', name: '김민수' }]
const posts = [{ id: 'post-1', author_id: 'user-1', company_name: '토스', post_date: '2026-08-12' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
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

import JobPostsCalendarPage from './page'

describe('JobPostsCalendarPage', () => {
  it('renders the month heading and the date/member view toggle', async () => {
    const ui = await JobPostsCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '자소서 달력 (2026년 8월)' })).toBeInTheDocument()
    expect(screen.getByText('날짜별')).toBeInTheDocument()
    expect(screen.getByText('멤버별')).toBeInTheDocument()
  })

  it('shows the member view grouped by author when view=member', async () => {
    const ui = await JobPostsCalendarPage({
      searchParams: Promise.resolve({ year: '2026', month: '8', view: 'member' }),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '김민수' })).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/calendar/page.test.tsx"`
Expected: FAIL with "Cannot find module './page'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/jobposts/calendar/page.tsx`:

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

  const { data: profiles } = await supabase.from('profiles').select('id, name')
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const { data: posts } = await supabase
    .from('job_posts')
    .select('id, author_id, company_name, post_date')
    .gte('post_date', start)
    .lt('post_date', end)

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

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/jobposts/calendar/page.test.tsx"`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/calendar/page.tsx" "app/(app)/jobposts/calendar/page.test.tsx"
git commit -m "Add job posts calendar page"
```

---

## Task 11: Feedback comment server action

**Files:**

- Create: `app/(app)/feedback/[id]/actions.ts`
- Test: `app/(app)/feedback/[id]/actions.test.ts`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/feedback/[id]/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUserMock = vi.fn()
const insertMock = vi.fn()
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

import { addFeedbackComment } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  insertMock.mockResolvedValue({ error: null })
  fromMock.mockReturnValue({ insert: insertMock })
})

describe('addFeedbackComment', () => {
  it('redirects with an error when the comment body is empty', async () => {
    const formData = new FormData()
    formData.set('body', '')

    await expect(addFeedbackComment('doc-1', 0, null, formData)).rejects.toThrow()
    expect(redirectMock).toHaveBeenCalledWith(
      '/feedback/doc-1?error=' + encodeURIComponent('댓글 내용을 입력해주세요')
    )
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('inserts a top-level comment with no parent', async () => {
    const formData = new FormData()
    formData.set('body', '이 문장을 더 구체적으로 써보세요')

    await addFeedbackComment('doc-1', 2, null, formData)

    expect(insertMock).toHaveBeenCalledWith({
      feedback_doc_id: 'doc-1',
      line_index: 2,
      parent_comment_id: null,
      author_id: 'user-1',
      body: '이 문장을 더 구체적으로 써보세요',
    })
    expect(revalidatePathMock).toHaveBeenCalledWith('/feedback/doc-1')
  })

  it('inserts a reply with the given parent comment id', async () => {
    const formData = new FormData()
    formData.set('body', '반영했습니다')

    await addFeedbackComment('doc-1', 2, 'comment-1', formData)

    expect(insertMock).toHaveBeenCalledWith({
      feedback_doc_id: 'doc-1',
      line_index: 2,
      parent_comment_id: 'comment-1',
      author_id: 'user-1',
      body: '반영했습니다',
    })
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/feedback/[id]/actions.test.ts"`
Expected: FAIL with "Cannot find module './actions'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/feedback/[id]/actions.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function addFeedbackComment(
  feedbackDocId: string,
  lineIndex: number,
  parentCommentId: string | null,
  formData: FormData
) {
  const body = formData.get('body') as string

  if (!body) {
    redirect(`/feedback/${feedbackDocId}?error=` + encodeURIComponent('댓글 내용을 입력해주세요'))
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

  const { error } = await supabase.from('feedback_comments').insert({
    feedback_doc_id: feedbackDocId,
    line_index: lineIndex,
    parent_comment_id: parentCommentId,
    author_id: user.id,
    body,
  })

  if (error) {
    redirect(`/feedback/${feedbackDocId}?error=` + encodeURIComponent(error.message))
    return
  }

  revalidatePath(`/feedback/${feedbackDocId}`)
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/actions.test.ts"`
Expected: PASS (3 tests)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/actions.ts" "app/(app)/feedback/[id]/actions.test.ts"
git commit -m "Add feedback comment server action"
```

---

## Task 12: Comment thread component

**Files:**

- Create: `app/(app)/feedback/[id]/comment-thread.tsx`
- Test: `app/(app)/feedback/[id]/comment-thread.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/feedback/[id]/comment-thread.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./actions', () => ({
  addFeedbackComment: vi.fn(),
}))

import { CommentThread } from './comment-thread'
import type { FeedbackComment } from '@/lib/jobposts/types'

const comments: FeedbackComment[] = [
  {
    id: 'c1',
    lineIndex: 0,
    parentCommentId: null,
    authorId: 'user-2',
    authorName: '이지은',
    body: '이 부분 좋아요',
    createdAt: '2026-08-12T00:00:00.000Z',
    replies: [
      {
        id: 'c2',
        lineIndex: 0,
        parentCommentId: 'c1',
        authorId: 'user-1',
        authorName: '김민수',
        body: '감사합니다',
        createdAt: '2026-08-12T00:01:00.000Z',
        replies: [],
      },
    ],
  },
]

describe('CommentThread', () => {
  it('renders top-level comments and their nested replies', () => {
    render(<CommentThread feedbackDocId="doc-1" lineIndex={0} comments={comments} />)

    expect(screen.getByText('이 부분 좋아요')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
  })

  it('renders a reply form for every comment and a new-comment form for the line', () => {
    render(<CommentThread feedbackDocId="doc-1" lineIndex={0} comments={comments} />)

    expect(screen.getAllByPlaceholderText('답글')).toHaveLength(2)
    expect(screen.getByPlaceholderText('댓글 추가')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/feedback/[id]/comment-thread.test.tsx"`
Expected: FAIL with "Cannot find module './comment-thread'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/feedback/[id]/comment-thread.tsx`:

```tsx
import type { FeedbackComment } from '@/lib/jobposts/types'
import { addFeedbackComment } from './actions'

function CommentNode({
  feedbackDocId,
  lineIndex,
  comment,
}: {
  feedbackDocId: string
  lineIndex: number
  comment: FeedbackComment
}) {
  return (
    <li className="mt-2">
      <div className="text-sm">
        <span className="font-medium">{comment.authorName}</span> {comment.body}
      </div>
      {comment.replies.length > 0 && (
        <ul className="ml-4 border-l pl-2">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} feedbackDocId={feedbackDocId} lineIndex={lineIndex} comment={reply} />
          ))}
        </ul>
      )}
      <form
        action={addFeedbackComment.bind(null, feedbackDocId, lineIndex, comment.id)}
        className="ml-4 mt-1 flex gap-2"
      >
        <input name="body" placeholder="답글" required className="flex-1 rounded border px-2 py-1 text-xs" />
        <button type="submit" className="rounded border px-2 py-1 text-xs">
          답글
        </button>
      </form>
    </li>
  )
}

export function CommentThread({
  feedbackDocId,
  lineIndex,
  comments,
}: {
  feedbackDocId: string
  lineIndex: number
  comments: FeedbackComment[]
}) {
  return (
    <div className="mt-1">
      <ul>
        {comments.map((comment) => (
          <CommentNode key={comment.id} feedbackDocId={feedbackDocId} lineIndex={lineIndex} comment={comment} />
        ))}
      </ul>
      <form action={addFeedbackComment.bind(null, feedbackDocId, lineIndex, null)} className="mt-2 flex gap-2">
        <input name="body" placeholder="댓글 추가" required className="flex-1 rounded border px-2 py-1 text-sm" />
        <button type="submit" className="rounded border px-3 py-1 text-sm">
          등록
        </button>
      </form>
    </div>
  )
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/comment-thread.test.tsx"`
Expected: PASS (2 tests)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/comment-thread.tsx" "app/(app)/feedback/[id]/comment-thread.test.tsx"
git commit -m "Add nested feedback comment thread component"
```

---

## Task 13: Feedback snapshot page

**Files:**

- Create: `app/(app)/feedback/[id]/page.tsx`
- Test: `app/(app)/feedback/[id]/page.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `app/(app)/feedback/[id]/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const doc = { id: 'doc-1', job_post_id: 'post-1', lines: ['첫 줄', '둘째 줄'] }
const jobPost = { company_name: '토스', author_id: 'user-1' }
const profiles = [{ id: 'user-1', name: '김민수' }]
const comments = [
  {
    id: 'c1',
    line_index: 0,
    parent_comment_id: null,
    author_id: 'user-1',
    body: '첫 줄 의견',
    created_at: '2026-08-12T00:00:00.000Z',
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
  it('renders each snapshot line with its comments', async () => {
    const ui = await FeedbackPage({
      params: Promise.resolve({ id: 'doc-1' }),
      searchParams: Promise.resolve({}),
    })
    render(ui)

    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()
    expect(screen.getByText('첫 줄')).toBeInTheDocument()
    expect(screen.getByText('둘째 줄')).toBeInTheDocument()
    expect(screen.getByText('첫 줄 의견')).toBeInTheDocument()
  })
})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: FAIL with "Cannot find module './page'" (or similar)

- [x] **Step 3: Write the minimal implementation**

Create `app/(app)/feedback/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { CommentThread } from './comment-thread'

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
  const lines = doc.lines as string[]
  const authorName = nameById.get(jobPost?.author_id ?? '') ?? '알 수 없음'

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">{jobPost?.company_name} 자소서 피드백</h1>
      <p className="mb-6 text-sm text-gray-500">작성자: {authorName}</p>
      {queryError && <p className="mb-4 text-sm text-red-600">{queryError}</p>}
      <ul className="flex flex-col gap-3">
        {lines.map((text, index) => (
          <li key={index} className="rounded border p-3">
            <p className="whitespace-pre-wrap text-sm">{text || ' '}</p>
            <CommentThread feedbackDocId={id} lineIndex={index} comments={commentsByLine.get(index) ?? []} />
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "app/(app)/feedback/[id]/page.test.tsx"`
Expected: PASS (1 test)

- [x] **Step 5: Commit**

```bash
git add "app/(app)/feedback/[id]/page.tsx" "app/(app)/feedback/[id]/page.test.tsx"
git commit -m "Add feedback snapshot page with threaded line comments"
```

---

## Task 14: Verify end-to-end against a real Supabase project

This task has no automated test — it is a manual walkthrough to confirm the job posts board and feedback flow work end-to-end with real Supabase RLS.

- [x] **Step 1: Confirm the migration is live**

In the Supabase dashboard, re-check that `0005_jobposts.sql` ran successfully (Task 1).

- [x] **Step 2: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass, including every new file added in this plan.

- [x] **Step 3: Build the app**

```bash
npm run build
```

Expected: build succeeds, `/jobposts`, `/jobposts/calendar`, and `/feedback/[id]` all appear in the route list.

- [x] **Step 4: Start the dev server**

```bash
npm run dev
```

- [x] **Step 5: Post a job post without requesting feedback**

Log in as an approved member, visit `http://localhost:3000/jobposts`, submit the form with a company name and cover letter text, leave "피드백 받고 싶어요" unchecked.
Expected: redirected back to `/jobposts`, the new post appears at the top of the feed, no "피드백 보기" link appears on the card.

- [x] **Step 6: Post a job post requesting feedback**

Submit another post with multi-line cover letter text and check "피드백 받고 싶어요".
Expected: the card shows a "피드백 보기" link.

- [x] **Step 7: React to a post**

Click one of the emoji buttons on a post.
Expected: the button highlights and the count increments; clicking again removes the reaction.

- [x] **Step 8: Check the calendar**

Visit `/jobposts/calendar`, confirm today's posts appear under today's date in the 날짜별 view, and confirm the 멤버별 view groups them under your name.

- [x] **Step 9: Open the feedback snapshot and add comments**

Click "피드백 보기" on the post from Step 6. Confirm every line of the cover letter appears as a separate row. Add a top-level comment on one line, then reply to that comment.
Expected: both the root comment and the reply appear nested under the correct line after the page reloads.

- [x] **Step 10: Confirm admin-only delete**

Log in as a non-admin member and confirm no "삭제" button appears on any job post card. Log in as an admin and confirm the "삭제" button appears and deleting a post removes it (and its reactions/feedback doc/comments) from the feed.

- [x] **Step 11: Commit any fixes found during manual verification**

If any issues were found and fixed during this walkthrough, commit them with a descriptive message before considering this task done.
