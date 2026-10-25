# Public Tour (`/tour`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public, read-only `/tour` that shows recruiters the real app screens filled with fictional data, where every write shows a "체험 모드" toast instead of saving.

**Architecture:** Each page's markup moves into a pure view component next to it (`views.tsx`); the real `page.tsx` keeps every query and cache call and renders the view, and new routes under `app/tour/` render the same views from `buildTourFixtures(todayKst)`. A client `DemoGuard` around the tour layout cancels every form `submit` in the capture phase, so no server action is ever called. `/tour` joins `ALWAYS_ALLOWED_PATHS` in `lib/auth/access.ts`.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React 19, TypeScript, Tailwind v4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-tour-mockup-design.md`

---

## Before you start

- Work in this worktree on branch `claude/eoe-mockup-tour-page-110e69`. It has no `node_modules` of its own; `npx vitest`, `npx tsc`, `npx eslint` and `npx playwright` resolve the main checkout's through the parent directories (checked). Do not run `npm install` here.
- Read `AGENTS.md`. Each task names a suggested model. Tasks 1 (auth) and 6–8 (files with `'use cache'` scopes) need an `opus` reviewer per `AGENTS.md`; the rest need a reviewer one tier at or above the implementer.
- **Every code block and diff in this plan was applied, compiled, linted and tested** in a scratch copy of this branch: `tsc --noEmit` clean; eslint shows only the two problems that already exist on `main` (`feedback-lines.tsx` react-hooks/immutability, `session-cache.test.ts` unused var); 67 existing test files (467 tests) under `app/ components/ lib/checkin lib/auth` still pass; all new unit tests pass; `e2e/tour.spec.ts` passes (14/14) against `next dev`; `next build` lists every `/tour` route (`/tour` static, the rest partial prerender). Copy the code exactly.
- Diffs are unified diffs against this branch's `HEAD`. Apply them with the Edit tool (or `git apply`), not by retyping.
- Shell is Git Bash on Windows. Route-group paths need quotes: `"app/(app)/page.tsx"`.
- Commit messages follow the repo style (`feat:`, `refactor:`, `test:`, `chore:`) and end with the session's `Co-Authored-By` trailer.
- **The view extraction rule (Tasks 6–8):** move JSX only. Do not touch any `'use cache'` function, `cacheTag`/`cacheLife` call, Supabase query, `unstable_instant` export or Suspense boundary. The existing page tests are the regression net; run them before and after.

## File Structure

| File | Responsibility |
|---|---|
| `lib/auth/access.ts` | `/tour` added to `ALWAYS_ALLOWED_PATHS` |
| `components/tour/demo-guard.tsx` | `DemoGuard` (capture-phase submit blocker + toast), `useDemoMode()`, `DEMO_BLOCKED_MESSAGE` |
| `components/nav-links.ts` | `NavLink` type and `APP_NAV_LINKS` (server-importable) |
| `components/nav.tsx` | `Nav` gains optional `links` and `trailing` props |
| `app/(app)/dashboard-views.tsx` | `TodayAlertView`, `StatusTableView`, `CodingWidgetView`, `FineTablesView`, `MonthFine` |
| `app/(app)/checkin/views.tsx` | `DayNavView`, `CheckinFeedView` |
| `lib/checkin/date-param.ts` | `resolveSelectedDate` (moved out of `checkin/page.tsx`) |
| `app/(app)/checkin/calendar/views.tsx`, `app/(app)/jobposts/calendar/views.tsx` | `CheckinCalendarView`, `JobPostsCalendarView` |
| `app/(app)/coding/views.tsx` | `CodingBoardView` |
| `app/(app)/jobposts/views.tsx`, `app/(app)/interviews/views.tsx` | `JobPostFeedView`, `InterviewSessionFeedView` |
| `app/(app)/interviews/[sessionId]/views.tsx`, `app/(app)/feedback/[id]/views.tsx`, `app/(app)/problems/[id]/views.tsx` | Whole-page views: `InterviewSessionView`, `FeedbackDocView`, `ProblemDetailView` |
| `app/(app)/problems/views.tsx` | `ProblemListView` (its GET form carries `data-demo-allow`) |
| Four cards + their tests | Optional `basePath` prop on internal links |
| `lib/tour/fixtures.ts` | `buildTourFixtures(today)`: all fictional data, pure and deterministic |
| `lib/tour/selectors.ts` | Fixture counterparts of each page's query |
| `public/tour/desk-{1..6}.svg` | Placeholder desk images (Task 9; replaced by real photos in Task 14) |
| `app/tour/load-fixtures.ts` | `TOUR_BASE_PATH`, `loadTourFixtures()` (`connection()` then today's fixtures) |
| `app/tour/layout.tsx`, `loading.tsx`, `page.tsx` | Guard + banner + tour nav + noindex; one loading boundary; intro page |
| `app/tour/**/page.tsx` | One route per real screen |
| `app/login/page.tsx` | "로그인 없이 둘러보기 →" link |
| `e2e/tour.spec.ts` | Logged-out end-to-end check, including "no POST is sent" |

---

### Task 1: Open `/tour` in the access rules

**Suggested model:** haiku (implementation) · **opus** review (auth)

**Files:**
- Modify: `lib/auth/access.ts`
- Test: `lib/auth/access.test.ts`

- [ ] **Step 1: Write the failing tests**

```diff
--- a/lib/auth/access.test.ts
+++ b/lib/auth/access.test.ts
@@ -113,4 +113,23 @@
   it('lets unauthenticated users reach /reset-password (submitting fails server-side without a recovery session)', () => {
     expect(getRedirectPath(null, '/reset-password')).toBeNull()
   })
+
+  it('lets unauthenticated visitors reach the /tour demo and its nested pages', () => {
+    expect(getRedirectPath(null, '/tour')).toBeNull()
+    expect(getRedirectPath(null, '/tour/checkin')).toBeNull()
+  })
+
+  it('lets pending users reach /tour instead of bouncing them to /pending', () => {
+    const profile: Profile = { status: 'pending', role: 'member' }
+    expect(getRedirectPath(profile, '/tour')).toBeNull()
+  })
+
+  it('lets approved members reach /tour without bouncing to the dashboard', () => {
+    const profile: Profile = { status: 'approved', role: 'member' }
+    expect(getRedirectPath(profile, '/tour/coding')).toBeNull()
+  })
+
+  it('does not treat /tourist as the public /tour path', () => {
+    expect(getRedirectPath(null, '/tourist')).toBe('/login')
+  })
 })
```

- [ ] **Step 2: Run them and watch three fail**

Run: `npx vitest run lib/auth/access.test.ts`
Expected: FAIL. The three `/tour` cases fail (`expected '/login' to be null`, `expected '/pending' to be null`, `expected '/' to be null`); the `/tourist` case already passes.

- [ ] **Step 3: Add `/tour` to the always-allowed paths**

```diff
--- a/lib/auth/access.ts
+++ b/lib/auth/access.ts
@@ -10,8 +10,9 @@
 
 // Always reachable, independent of session/approval state: the recovery-link
 // exchange has no session yet, and the page it lands on must accept whatever
-// approval status the profile is in.
-const ALWAYS_ALLOWED_PATHS = ['/auth', '/reset-password']
+// approval status the profile is in. `/tour` is the public demo: it renders only
+// hard-coded fixtures, so visitors, pending users and members all see the same page.
+const ALWAYS_ALLOWED_PATHS = ['/auth', '/reset-password', '/tour']
 
 function matchesPath(pathname: string, base: string): boolean {
   return pathname === base || pathname.startsWith(base + '/')
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/auth/access.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/access.ts lib/auth/access.test.ts
git commit -m "feat: let anyone reach /tour regardless of session"
```

---

### Task 2: `DemoGuard`, the write blocker

**Suggested model:** sonnet

**Files:**
- Create: `components/tour/demo-guard.tsx`
- Test: `components/tour/demo-guard.test.tsx`

Why capture phase: React dispatches a form's `action` from its bubble-phase `submit` listener at the root. A capture-phase listener on a wrapper inside the root runs first; cancelling there means React never sees the event. The first test is a positive control proving that, in jsdom, the same click *does* run the action when the guard is absent.

- [ ] **Step 1: Write the failing test**

`components/tour/demo-guard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DemoGuard, DEMO_BLOCKED_MESSAGE, useDemoMode } from './demo-guard'

function ModeProbe() {
  const { isDemo } = useDemoMode()
  return <span>{isDemo ? 'demo' : 'live'}</span>
}

describe('DemoGuard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // Positive control: proves the click below really reaches React's form action machinery in
  // jsdom, so the "not called" assertions in the guarded tests mean something.
  it('runs the form action when the form is outside the guard', async () => {
    const action = vi.fn()
    render(
      <form action={action}>
        <button type="submit">등록</button>
      </form>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1))
  })

  it('cancels a form action submit and shows the demo toast instead', () => {
    const action = vi.fn()
    render(
      <DemoGuard>
        <form action={action}>
          <button type="submit">등록</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))

    expect(action).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(DEMO_BLOCKED_MESSAGE)
  })

  it('cancels an onSubmit handler too', () => {
    const onSubmit = vi.fn()
    render(
      <DemoGuard>
        <form onSubmit={onSubmit}>
          <button type="submit">저장</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('lets forms inside [data-demo-allow] submit normally', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())
    render(
      <DemoGuard>
        <form data-demo-allow onSubmit={onSubmit}>
          <button type="submit">검색</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '검색' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('hides the toast after three seconds', () => {
    vi.useFakeTimers()
    render(
      <DemoGuard>
        <form action={() => {}}>
          <button type="submit">등록</button>
        </form>
      </DemoGuard>
    )

    fireEvent.click(screen.getByRole('button', { name: '등록' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('reports demo mode to descendants, and live mode outside the guard', () => {
    render(
      <>
        <DemoGuard>
          <ModeProbe />
        </DemoGuard>
        <ModeProbe />
      </>
    )

    expect(screen.getByText('demo')).toBeInTheDocument()
    expect(screen.getByText('live')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/tour`
Expected: FAIL with `Failed to resolve import "./demo-guard"`.

- [ ] **Step 3: Write the component**

`components/tour/demo-guard.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export const DEMO_BLOCKED_MESSAGE = '체험 모드에서는 저장되지 않아요'

const DISMISS_AFTER_MS = 3000

interface DemoMode {
  isDemo: boolean
  notifyBlocked: () => void
}

const DemoModeContext = createContext<DemoMode>({ isDemo: false, notifyBlocked: () => {} })

/** Read by the few write paths that do not go through a `<form>` submit (see goals-editor.tsx). */
export function useDemoMode(): DemoMode {
  return useContext(DemoModeContext)
}

/**
 * Wraps every /tour page. The real cards wire writes as `<form action={serverAction}>`, and React
 * only runs a form action from its bubble-phase `submit` listener at the root. A capture-phase
 * listener on this wrapper runs before that, so cancelling the event here means no server action
 * is ever called, without touching any card. Forms inside `[data-demo-allow]` (plain GET search
 * forms) pass through. Before hydration nothing is intercepted, but the action itself still
 * rejects the request in `getVerifiedUser()`, since a visitor has no session.
 */
export function DemoGuard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [showCount, setShowCount] = useState(0)

  const notifyBlocked = useCallback(() => {
    setVisible(true)
    setShowCount((count) => count + 1)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    function handleSubmit(event: Event) {
      const form = event.target
      if (form instanceof HTMLElement && form.closest('[data-demo-allow]')) return
      event.preventDefault()
      event.stopPropagation()
      notifyBlocked()
    }

    element.addEventListener('submit', handleSubmit, true)
    return () => element.removeEventListener('submit', handleSubmit, true)
  }, [notifyBlocked])

  useEffect(() => {
    if (showCount === 0) return
    const timer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS)
    return () => clearTimeout(timer)
  }, [showCount])

  return (
    <DemoModeContext.Provider value={{ isDemo: true, notifyBlocked }}>
      <div ref={ref} className="flex flex-1 flex-col">
        {children}
      </div>
      {visible && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-950"
        >
          {DEMO_BLOCKED_MESSAGE}
        </div>
      )}
    </DemoModeContext.Provider>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run components/tour`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/tour
git commit -m "feat: add DemoGuard that blocks form submits in the tour"
```

---

### Task 3: Block the goals editor's `onClick` save in demo mode

**Suggested model:** haiku

`saveGoals` calls `updateCheckinGoals` directly from a button click, not from a form submit, so `DemoGuard` alone cannot stop it.

**Files:**
- Modify: `app/(app)/checkin/goals-editor.tsx`
- Test: `app/(app)/checkin/goals-editor.test.tsx`

- [ ] **Step 1: Write the failing test**

```diff
--- a/app/(app)/checkin/goals-editor.test.tsx
+++ b/app/(app)/checkin/goals-editor.test.tsx
@@ -10,6 +10,7 @@
 }))
 
 import { GoalsEditor } from './goals-editor'
+import { DemoGuard, DEMO_BLOCKED_MESSAGE } from '@/components/tour/demo-guard'
 import type { CheckinGoal } from '@/lib/checkin/types'
 
 const goals: CheckinGoal[] = [
@@ -142,4 +143,20 @@
 
     await waitFor(() => expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument())
   })
+
+  it('inside the /tour DemoGuard, shows the demo toast instead of saving', () => {
+    updateCheckinGoalsMock.mockClear()
+    render(
+      <DemoGuard>
+        <GoalsEditor postId="post-1" goals={goals} isAuthor={true} />
+      </DemoGuard>
+    )
+
+    fireEvent.click(screen.getByRole('button', { name: '수정' }))
+    fireEvent.click(screen.getByRole('button', { name: '저장' }))
+
+    expect(updateCheckinGoalsMock).not.toHaveBeenCalled()
+    expect(screen.getByRole('status')).toHaveTextContent(DEMO_BLOCKED_MESSAGE)
+    expect(screen.queryByRole('button', { name: '저장' })).not.toBeInTheDocument()
+  })
 })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/(app)/checkin/goals-editor.test.tsx"`
Expected: FAIL in the new test (`updateCheckinGoalsMock` was called / no `status` element).

- [ ] **Step 3: Check demo mode before saving**

```diff
--- a/app/(app)/checkin/goals-editor.tsx
+++ b/app/(app)/checkin/goals-editor.tsx
@@ -18,6 +18,7 @@
 import { Button } from '@/components/ui/button'
 import { DragHandleIcon, SortableItem } from '@/components/ui/sortable-item'
 import { reorderById } from '@/lib/ui/reorder'
+import { useDemoMode } from '@/components/tour/demo-guard'
 
 type DraftGoal = CheckinGoal & { _id: string }
 
@@ -95,6 +96,7 @@
   const [editing, setEditing] = useState(false)
   const [draft, setDraft] = useState<DraftGoal[]>([])
   const [saving, setSaving] = useState(false)
+  const demo = useDemoMode()
   const sensors = useSensors(
     useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
     useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
@@ -128,6 +130,13 @@
   }
 
   async function saveGoals() {
+    // The only write in the app that is a plain onClick rather than a <form> submit, so the
+    // /tour DemoGuard cannot intercept it on its own.
+    if (demo.isDemo) {
+      demo.notifyBlocked()
+      setEditing(false)
+      return
+    }
     setSaving(true)
     try {
       await updateCheckinGoals(postId, buildGoalsFormData(draft))
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run "app/(app)/checkin/goals-editor.test.tsx"`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/checkin/goals-editor.tsx" "app/(app)/checkin/goals-editor.test.tsx"
git commit -m "feat: show the demo toast instead of saving goals inside the tour"
```

---

### Task 4: Let `Nav` take its links and trailing slot

**Suggested model:** haiku

The link list moves to a plain module because every export of a `'use client'` module is a client reference on the server: the tour layout could not `.map()` over it.

**Files:**
- Create: `components/nav-links.ts`
- Modify: `components/nav.tsx`
- Test: `components/nav.test.tsx`

- [ ] **Step 1: Write the failing test**

```diff
--- a/components/nav.test.tsx
+++ b/components/nav.test.tsx
@@ -41,4 +41,23 @@
     render(<Nav />)
     expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page')
   })
+
+  it('renders custom links and trailing content in place of the app links and logout', () => {
+    mockPathname = '/tour/checkin'
+    render(
+      <Nav
+        links={[
+          { href: '/tour', label: '소개', exact: true },
+          { href: '/tour/checkin', label: '인증' },
+        ]}
+        trailing={<a href="/login">로그인</a>}
+      />
+    )
+
+    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('href', '/tour/checkin')
+    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('aria-current', 'page')
+    expect(screen.getByRole('link', { name: '소개' })).not.toHaveAttribute('aria-current')
+    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
+    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
+  })
 })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run components/nav.test.tsx`
Expected: FAIL in the new test (the `/tour/checkin` link is not rendered; the logout button is).

- [ ] **Step 3: Create the link list**

`components/nav-links.ts`:

```ts
// Kept out of nav.tsx on purpose: that file is 'use client', and every export of a client module
// reaches a Server Component as a client reference, not a value — so the /tour layout could not
// `.map()` over the links to build its own copy if they lived there.

export interface NavLink {
  href: string
  label: string
  /** Active only on this exact path, not on nested routes (the dashboard's `/`). */
  exact?: boolean
}

export const APP_NAV_LINKS: NavLink[] = [
  { href: '/', label: '홈', exact: true },
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/problems', label: '문제은행' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]
```

- [ ] **Step 4: Replace `components/nav.tsx`**

```tsx
'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logOut } from '@/lib/auth/logout'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/ui/cn'
import { APP_NAV_LINKS, type NavLink } from '@/components/nav-links'

function LogoutButton() {
  return (
    <form action={logOut}>
      <button type="submit" className="text-sm text-gray-500 dark:text-gray-400">
        로그아웃
      </button>
    </form>
  )
}

export function Nav({
  links = APP_NAV_LINKS,
  trailing = <LogoutButton />,
}: {
  links?: NavLink[]
  trailing?: ReactNode
}) {
  const pathname = usePathname()

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
      <div className="flex gap-4">
        {links.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(isActive && 'font-semibold text-blue-600 dark:text-blue-400')}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {trailing}
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run components/nav.test.tsx`
Expected: PASS (5 tests). The four existing tests prove the real app's nav is unchanged.

- [ ] **Step 6: Commit**

```bash
git add components/nav-links.ts components/nav.tsx components/nav.test.tsx
git commit -m "refactor: let Nav take custom links and a trailing slot"
```

---

### Task 5: `basePath` on the cards that link internally

**Suggested model:** haiku

**Files:**
- Modify: `app/(app)/jobposts/post-card.tsx`, `app/(app)/interviews/session-card.tsx`, `app/(app)/interviews/[sessionId]/qa-card.tsx`, `app/(app)/problems/[id]/download-panel.tsx`
- Test: the four matching `*.test.tsx`

- [ ] **Step 1: Write the failing tests**

```diff
--- a/app/(app)/jobposts/post-card.test.tsx
+++ b/app/(app)/jobposts/post-card.test.tsx
@@ -63,4 +63,9 @@
     render(<PostCard post={post} currentUserId="user-1" isAdmin={true} />)
     expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument()
   })
+
+  it('prefixes the feedback link with basePath', () => {
+    render(<PostCard post={post} currentUserId="user-1" isAdmin={false} basePath="/tour" />)
+    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/tour/feedback/doc-1')
+  })
 })
```

```diff
--- a/app/(app)/interviews/session-card.test.tsx
+++ b/app/(app)/interviews/session-card.test.tsx
@@ -57,4 +57,9 @@
     render(<SessionCard session={session} currentUserId="user-2" isAdmin={false} />)
     expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
   })
+
+  it('prefixes the session link with basePath', () => {
+    render(<SessionCard session={session} currentUserId="user-1" isAdmin={false} basePath="/tour" />)
+    expect(screen.getByRole('link', { name: '2조 모의면접' })).toHaveAttribute('href', '/tour/interviews/session-1')
+  })
 })
```

```diff
--- a/app/(app)/interviews/[sessionId]/qa-card.test.tsx
+++ b/app/(app)/interviews/[sessionId]/qa-card.test.tsx
@@ -51,4 +51,9 @@
     render(<QaCard qa={qa} currentUserId="user-9" isAdmin={false} />)
     expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
   })
+
+  it('prefixes the feedback link with basePath', () => {
+    render(<QaCard qa={qa} currentUserId="user-1" isAdmin={false} basePath="/tour" />)
+    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/tour/feedback/doc-1')
+  })
 })
```

```diff
--- a/app/(app)/problems/[id]/download-panel.test.tsx
+++ b/app/(app)/problems/[id]/download-panel.test.tsx
@@ -37,4 +37,10 @@
     click.mockRestore()
     vi.unstubAllGlobals()
   })
+
+  it('prefixes the problem URL in the file header with basePath', () => {
+    render(<DownloadPanel problemId="p-1" problem={problem} basePath="/tour" />)
+    fireEvent.click(screen.getByRole('button', { name: '미리보기' }))
+    expect(screen.getByText(/문제 페이지: http:\/\/localhost(:\d+)?\/tour\/problems\/p-1/)).toBeInTheDocument()
+  })
 })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run "app/(app)/jobposts/post-card.test.tsx" "app/(app)/interviews/session-card.test.tsx" "app/(app)/interviews/[sessionId]/qa-card.test.tsx" "app/(app)/problems/[id]/download-panel.test.tsx"`
Expected: FAIL in the four new tests (hrefs lack `/tour`). `tsc` would also reject the unknown prop; vitest does not type-check.

- [ ] **Step 3: Add the prop**

```diff
--- a/app/(app)/jobposts/post-card.tsx
+++ b/app/(app)/jobposts/post-card.tsx
@@ -8,10 +8,13 @@
   post,
   currentUserId,
   isAdmin,
+  basePath = '',
 }: {
   post: JobPost
   currentUserId: string
   isAdmin: boolean
+  /** Prefix for internal links; `/tour` renders this card inside the demo. */
+  basePath?: string
 }) {
   return (
     <Card as="article">
@@ -67,7 +70,7 @@
 
       {post.feedbackDocId && (
         <Link
-          href={`/feedback/${post.feedbackDocId}`}
+          href={`${basePath}/feedback/${post.feedbackDocId}`}
           className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
         >
           피드백 보기
```

```diff
--- a/app/(app)/interviews/session-card.tsx
+++ b/app/(app)/interviews/session-card.tsx
@@ -7,10 +7,13 @@
   session,
   currentUserId,
   isAdmin,
+  basePath = '',
 }: {
   session: InterviewSession
   currentUserId: string
   isAdmin: boolean
+  /** Prefix for internal links; `/tour` renders this card inside the demo. */
+  basePath?: string
 }) {
   const isParticipating = session.participants.some((p) => p.userId === currentUserId)
   const canDelete = isAdmin || session.createdBy === currentUserId
@@ -19,7 +22,7 @@
     <Card as="article">
       <div className="mb-2 flex items-center justify-between">
         <div>
-          <Link href={`/interviews/${session.id}`} className="font-medium underline">
+          <Link href={`${basePath}/interviews/${session.id}`} className="font-medium underline">
             {session.title}
           </Link>
           <p className="text-xs text-gray-500 dark:text-gray-400">{session.sessionAt}</p>
```

```diff
--- a/app/(app)/interviews/[sessionId]/qa-card.tsx
+++ b/app/(app)/interviews/[sessionId]/qa-card.tsx
@@ -7,10 +7,13 @@
   qa,
   currentUserId,
   isAdmin,
+  basePath = '',
 }: {
   qa: InterviewQa
   currentUserId: string
   isAdmin: boolean
+  /** Prefix for internal links; `/tour` renders this card inside the demo. */
+  basePath?: string
 }) {
   const canDelete = isAdmin || qa.authorId === currentUserId
 
@@ -37,7 +40,7 @@
       </div>
 
       <Link
-        href={`/feedback/${qa.feedbackDocId}`}
+        href={`${basePath}/feedback/${qa.feedbackDocId}`}
         className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
       >
         피드백 보기
```

```diff
--- a/app/(app)/problems/[id]/download-panel.tsx
+++ b/app/(app)/problems/[id]/download-panel.tsx
@@ -11,12 +11,21 @@
  * the header's problem URL needs `window.location.origin`. That is also why the preview is only
  * rendered after a click — rendering it during SSR would mismatch on hydration.
  */
-export function DownloadPanel({ problemId, problem }: { problemId: string; problem: ProblemContent }) {
+export function DownloadPanel({
+  problemId,
+  problem,
+  basePath = '',
+}: {
+  problemId: string
+  problem: ProblemContent
+  /** Prefix for the problem URL written into the file header; `/tour` renders this panel inside the demo. */
+  basePath?: string
+}) {
   const [lang, setLang] = useState<Language>('python')
   const [showPreview, setShowPreview] = useState(false)
 
   function build() {
-    return generate(problem, lang, { problemUrl: `${window.location.origin}/problems/${problemId}` })
+    return generate(problem, lang, { problemUrl: `${window.location.origin}${basePath}/problems/${problemId}` })
   }
 
   function download() {
```

- [ ] **Step 4: Run the tests**

Run: the command from Step 2.
Expected: PASS (24 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/jobposts/post-card.tsx" "app/(app)/jobposts/post-card.test.tsx" "app/(app)/interviews/session-card.tsx" "app/(app)/interviews/session-card.test.tsx" "app/(app)/interviews/[sessionId]/qa-card.tsx" "app/(app)/interviews/[sessionId]/qa-card.test.tsx" "app/(app)/problems/[id]/download-panel.tsx" "app/(app)/problems/[id]/download-panel.test.tsx"
git commit -m "feat: add basePath to cards with internal links"
```

---

### Task 6: Extract the dashboard views

**Suggested model:** sonnet · **opus** review (the file holds `'use cache'` scopes)

**Files:**
- Create: `app/(app)/dashboard-views.tsx`
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: Baseline**

Run: `npx vitest run "app/(app)/page.test.tsx"`
Expected: PASS. Note the count; it must not change.

- [ ] **Step 2: Create the views**

`app/(app)/dashboard-views.tsx`:

```tsx
import Link from 'next/link'
import { buildTodayStatus, type MemberSummary } from '@/lib/checkin/status'
import { buildMonthlyFineTotals } from '@/lib/checkin/fines'
import type { CodingDashboardWidget } from '@/lib/coding/dashboard-widget'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'

// Pure markup for the dashboard's streamed boundaries in page.tsx, which keep all the data
// reads and caching. /tour renders these same views from fixtures.

export interface MonthFine {
  authorId: string
  fineAmount: number
  paid: boolean
}

export function TodayAlertView({ posted }: { posted: boolean }) {
  return posted ? (
    <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
  ) : (
    <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
  )
}

export function StatusTableView({
  members,
  todaysAuthorIds,
}: {
  members: MemberSummary[]
  todaysAuthorIds: string[]
}) {
  const statusRows = buildTodayStatus(members, todaysAuthorIds)

  return (
    <table className="mt-6 w-full border-collapse text-sm">
      <thead>
        <tr>
          <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
          <th className="border border-gray-200 p-2 dark:border-gray-800">10시 인증</th>
        </tr>
      </thead>
      <tbody>
        {statusRows.map((row) => (
          <tr key={row.member.id}>
            <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
            <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
              {row.posted ? '✅' : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CodingWidgetView({
  widget,
  basePath = '',
}: {
  widget: CodingDashboardWidget<{ id: string }>
  basePath?: string
}) {
  return (
    <Card className="mt-4">
      <h2 className="text-sm font-semibold">이번 주 코딩 문제</h2>

      {widget.status === 'no-week' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          이번 주 주차가 아직 생성되지 않았습니다.
        </p>
      )}
      {widget.status === 'no-problems' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 문제가 아직 등록되지 않았습니다.</p>
      )}
      {widget.status === 'no-assignment' && (
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 나에게 할당된 문제가 없습니다.</p>
      )}
      {widget.status === 'assigned' && (
        <ul className="mt-2 flex flex-col gap-1">
          {widget.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${
                  item.completed
                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {item.completed ? '완료' : '미완료'}
              </span>
              <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={widget.week ? `${basePath}/coding?week=${widget.week.id}` : `${basePath}/coding`}
        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        코딩 보드 바로가기
      </Link>
    </Card>
  )
}

export function FineTablesView({ members, fines }: { members: MemberSummary[]; fines: MonthFine[] }) {
  const allMonthFinePosts = fines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
  const unpaidMonthFinePosts = fines
    .filter((f) => !f.paid)
    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))

  const unpaidFineRows = buildMonthlyFineTotals(members, unpaidMonthFinePosts)
  const totalFineRows = buildMonthlyFineTotals(members, allMonthFinePosts)

  const unpaidMonthTotal = unpaidMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
  const allMonthTotal = allMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)

  return (
    <>
      <h2 className="mt-8 text-lg font-semibold">이번 달 벌금 정산</h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        미납액 합계 {unpaidMonthTotal.toLocaleString('ko-KR')}원 · 벌금 총액 합계 {allMonthTotal.toLocaleString('ko-KR')}원
      </p>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금 총액</th>
          </tr>
        </thead>
        <tbody>
          {unpaidFineRows.map((row, index) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {row.totalFine.toLocaleString('ko-KR')}원
              </td>
              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
                {totalFineRows[index].totalFine.toLocaleString('ko-KR')}원
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
```

- [ ] **Step 3: Render them from the page**

```diff
--- a/app/(app)/page.tsx
+++ b/app/(app)/page.tsx
@@ -5,17 +5,22 @@
 import { createClient } from '@/lib/supabase/server'
 import { createCacheClient } from '@/lib/supabase/cache-client'
 import { getSessionProfile } from '@/lib/auth/session'
-import { buildTodayStatus, hasPostedToday, type MemberSummary } from '@/lib/checkin/status'
-import { buildMonthlyFineTotals, FINES_TAG } from '@/lib/checkin/fines'
+import { hasPostedToday, type MemberSummary } from '@/lib/checkin/status'
+import { FINES_TAG } from '@/lib/checkin/fines'
 import { getKstDateString, kstDayRangeUtc, kstMonthRangeUtc, kstMonthKey, checkinFeedTag } from '@/lib/checkin/time'
 import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
 import { buildCodingDashboardWidget, findWeekForDate } from '@/lib/coding/dashboard-widget'
 import { getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
 import { queryIfAny } from '@/lib/supabase/query-if-any'
 import { PageShell } from '@/components/ui/page-shell'
-import { Alert } from '@/components/ui/alert'
-import { Card } from '@/components/ui/card'
 import { Skeleton } from '@/components/skeleton'
+import {
+  CodingWidgetView,
+  FineTablesView,
+  StatusTableView,
+  TodayAlertView,
+  type MonthFine,
+} from './dashboard-views'
 
 const CODING_WIDGET_LIMIT = 2
 
@@ -47,12 +52,6 @@
  */
 async function markDynamic(): Promise<void> {
   await connection()
-}
-
-interface MonthFine {
-  authorId: string
-  fineAmount: number
-  paid: boolean
 }
 
 /**
@@ -214,39 +213,15 @@
 
   const posted = session ? hasPostedToday(session.userId, todaysAuthorIds) : false
 
-  return posted ? (
-    <Alert variant="success">오늘의 10시 인증을 완료했어요!</Alert>
-  ) : (
-    <Alert variant="warning">오늘 아직 10시 인증을 하지 않았어요.</Alert>
-  )
+  return <TodayAlertView posted={posted} />
 }
 
 export async function StatusTable() {
   await markDynamic()
 
   const { members, todaysAuthorIds } = await getTodayCheckinStatus(todayKst())
-  const statusRows = buildTodayStatus(members, todaysAuthorIds)
-
-  return (
-    <table className="mt-6 w-full border-collapse text-sm">
-      <thead>
-        <tr>
-          <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
-          <th className="border border-gray-200 p-2 dark:border-gray-800">10시 인증</th>
-        </tr>
-      </thead>
-      <tbody>
-        {statusRows.map((row) => (
-          <tr key={row.member.id}>
-            <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
-            <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
-              {row.posted ? '✅' : ''}
-            </td>
-          </tr>
-        ))}
-      </tbody>
-    </table>
-  )
+
+  return <StatusTableView members={members} todaysAuthorIds={todaysAuthorIds} />
 }
 
 /**
@@ -283,50 +258,7 @@
     CODING_WIDGET_LIMIT
   )
 
-  return (
-    <Card className="mt-4">
-      <h2 className="text-sm font-semibold">이번 주 코딩 문제</h2>
-
-      {codingWidget.status === 'no-week' && (
-        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
-          이번 주 주차가 아직 생성되지 않았습니다.
-        </p>
-      )}
-      {codingWidget.status === 'no-problems' && (
-        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 문제가 아직 등록되지 않았습니다.</p>
-      )}
-      {codingWidget.status === 'no-assignment' && (
-        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">이번 주 나에게 할당된 문제가 없습니다.</p>
-      )}
-      {codingWidget.status === 'assigned' && (
-        <ul className="mt-2 flex flex-col gap-1">
-          {codingWidget.items.map((item) => (
-            <li key={item.id} className="flex items-center gap-2 text-sm">
-              <span
-                className={`rounded border px-2 py-0.5 text-xs ${
-                  item.completed
-                    ? 'border-gray-300 bg-gray-200 dark:border-gray-700 dark:bg-gray-700'
-                    : 'border-gray-300 dark:border-gray-700'
-                }`}
-              >
-                {item.completed ? '완료' : '미완료'}
-              </span>
-              <a href={item.link} target="_blank" rel="noopener noreferrer" className="underline">
-                {item.title}
-              </a>
-            </li>
-          ))}
-        </ul>
-      )}
-
-      <Link
-        href={codingWidget.week ? `/coding?week=${codingWidget.week.id}` : '/coding'}
-        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
-      >
-        코딩 보드 바로가기
-      </Link>
-    </Card>
-  )
+  return <CodingWidgetView widget={codingWidget} />
 }
 
 export async function FineTables() {
@@ -334,45 +266,5 @@
 
   const { members, fines } = await getMonthlyFines(kstMonthKey(todayKst()))
 
-  const allMonthFinePosts = fines.map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
-  const unpaidMonthFinePosts = fines
-    .filter((f) => !f.paid)
-    .map(({ authorId, fineAmount }) => ({ authorId, fineAmount }))
-
-  const unpaidFineRows = buildMonthlyFineTotals(members, unpaidMonthFinePosts)
-  const totalFineRows = buildMonthlyFineTotals(members, allMonthFinePosts)
-
-  const unpaidMonthTotal = unpaidMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
-  const allMonthTotal = allMonthFinePosts.reduce((sum, p) => sum + p.fineAmount, 0)
-
-  return (
-    <>
-      <h2 className="mt-8 text-lg font-semibold">이번 달 벌금 정산</h2>
-      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
-        미납액 합계 {unpaidMonthTotal.toLocaleString('ko-KR')}원 · 벌금 총액 합계 {allMonthTotal.toLocaleString('ko-KR')}원
-      </p>
-      <table className="mt-2 w-full border-collapse text-sm">
-        <thead>
-          <tr>
-            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
-            <th className="border border-gray-200 p-2 dark:border-gray-800">미납액</th>
-            <th className="border border-gray-200 p-2 dark:border-gray-800">벌금 총액</th>
-          </tr>
-        </thead>
-        <tbody>
-          {unpaidFineRows.map((row, index) => (
-            <tr key={row.member.id}>
-              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
-              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
-                {row.totalFine.toLocaleString('ko-KR')}원
-              </td>
-              <td className="border border-gray-200 p-2 text-center dark:border-gray-800">
-                {totalFineRows[index].totalFine.toLocaleString('ko-KR')}원
-              </td>
-            </tr>
-          ))}
-        </tbody>
-      </table>
-    </>
-  )
-}
+  return <FineTablesView members={members} fines={fines} />
+}
```

- [ ] **Step 4: Verify nothing but markup moved**

Run: `npx vitest run "app/(app)/page.test.tsx"` → PASS, same count as Step 1.
Run: `git diff -U0 "app/(app)/page.tsx" | grep -E "^[-+].*(use cache|cacheTag|cacheLife|createCacheClient|\.from\()"`
Expected: no output (no cache or query line changed).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/dashboard-views.tsx" "app/(app)/page.tsx"
git commit -m "refactor: move dashboard markup into pure view components"
```

---

### Task 7: Extract the check-in feed and both calendar views

**Suggested model:** sonnet · **opus** review (cache files)

**Files:**
- Create: `lib/checkin/date-param.ts`, `lib/checkin/date-param.test.ts`, `app/(app)/checkin/views.tsx`, `app/(app)/checkin/calendar/views.tsx`, `app/(app)/jobposts/calendar/views.tsx`
- Modify: `app/(app)/checkin/page.tsx`, `app/(app)/checkin/calendar/page.tsx`, `app/(app)/jobposts/calendar/page.tsx`

- [ ] **Step 1: Baseline**

Run: `npx vitest run "app/(app)/checkin/page.test.tsx" "app/(app)/checkin/calendar/page.test.tsx" "app/(app)/jobposts/calendar/page.test.tsx"`
Expected: PASS.

- [ ] **Step 2: Write the failing test for the moved date helper**

`lib/checkin/date-param.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveSelectedDate } from './date-param'

describe('resolveSelectedDate', () => {
  it('falls back to today when the param is missing or malformed', () => {
    expect(resolveSelectedDate(undefined, '2026-10-25')).toBe('2026-10-25')
    expect(resolveSelectedDate('2026-1-5', '2026-10-25')).toBe('2026-10-25')
  })

  it('falls back to today for a date that does not exist', () => {
    expect(resolveSelectedDate('2026-02-30', '2026-10-25')).toBe('2026-10-25')
  })

  it('keeps a past date', () => {
    expect(resolveSelectedDate('2026-10-20', '2026-10-25')).toBe('2026-10-20')
  })

  it('clamps a future date to today', () => {
    expect(resolveSelectedDate('2026-11-01', '2026-10-25')).toBe('2026-10-25')
  })
})
```

Run: `npx vitest run lib/checkin/date-param.test.ts`
Expected: FAIL with `Failed to resolve import "./date-param"`.

- [ ] **Step 3: Move `resolveSelectedDate` (body unchanged)**

`lib/checkin/date-param.ts`:

```ts
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** The `?date=` of /checkin (and /tour/checkin): a real calendar date, clamped to today; anything else means today. */
export function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
    return todayKst
  }

  const parsed = new Date(`${dateParam}T00:00:00.000Z`)

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateParam) {
    return todayKst
  }

  return dateParam > todayKst ? todayKst : dateParam
}
```

Run: `npx vitest run lib/checkin/date-param.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Create the check-in views**

`app/(app)/checkin/views.tsx`:

```tsx
import Link from 'next/link'
import type { CheckinPost } from '@/lib/checkin/types'
import { formatKstDateHeading, shiftKstDateString } from '@/lib/checkin/time'
import { PostForm } from './post-form'
import { PostCard } from './post-card'

// Pure markup for /checkin's streamed boundaries in page.tsx, which keep all the data reads and
// caching. /tour renders these same views from fixtures.

export function DayNavView({
  selectedDate,
  isToday,
  basePath = '',
}: {
  selectedDate: string
  isToday: boolean
  basePath?: string
}) {
  const prevDate = shiftKstDateString(selectedDate, -1)
  const nextDate = shiftKstDateString(selectedDate, 1)

  return (
    <>
      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
        <Link href={`${basePath}/checkin?date=${prevDate}`} className="underline">
          ◀
        </Link>
        <span className="font-medium">
          {formatKstDateHeading(selectedDate)}
          {isToday ? ' (오늘)' : ''}
        </span>
        {isToday ? (
          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
            ▶
          </span>
        ) : (
          <Link href={`${basePath}/checkin?date=${nextDate}`} className="underline">
            ▶
          </Link>
        )}
      </div>

      {isToday && <PostForm />}
    </>
  )
}

export function CheckinFeedView({
  posts,
  currentUserId,
  isAdmin,
}: {
  posts: CheckinPost[]
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={currentUserId} isAdmin={isAdmin} />
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 5: Render them from the page**

```diff
--- a/app/(app)/checkin/page.tsx
+++ b/app/(app)/checkin/page.tsx
@@ -4,10 +4,10 @@
 import { getSessionProfile } from '@/lib/auth/session'
 import { createCacheClient } from '@/lib/supabase/cache-client'
 import { queryIfAny } from '@/lib/supabase/query-if-any'
-import { PostForm } from './post-form'
-import { PostCard } from './post-card'
+import { CheckinFeedView, DayNavView } from './views'
 import type { CheckinPost, CheckinGoal } from '@/lib/checkin/types'
-import { getKstDateString, kstDayRangeUtc, shiftKstDateString, formatKstDateHeading, checkinFeedTag } from '@/lib/checkin/time'
+import { getKstDateString, kstDayRangeUtc, checkinFeedTag } from '@/lib/checkin/time'
+import { resolveSelectedDate } from '@/lib/checkin/date-param'
 import { MEMBER_NAMES_TAG } from '@/lib/cache-tags'
 import { PageShell } from '@/components/ui/page-shell'
 import { Alert } from '@/components/ui/alert'
@@ -27,22 +27,6 @@
 export const unstable_instant = false
 
 type CheckinSearchParams = { error?: string; success?: string; date?: string }
-
-const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
-
-function resolveSelectedDate(dateParam: string | undefined, todayKst: string): string {
-  if (!dateParam || !DATE_PARAM_PATTERN.test(dateParam)) {
-    return todayKst
-  }
-
-  const parsed = new Date(`${dateParam}T00:00:00.000Z`)
-
-  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateParam) {
-    return todayKst
-  }
-
-  return dateParam > todayKst ? todayKst : dateParam
-}
 
 /**
  * The single place `{ selectedDate, isToday }` is derived. `DayHeader` and `FeedContent` both
@@ -222,33 +206,8 @@
   searchParamsPromise: Promise<CheckinSearchParams>
 }) {
   const { selectedDate, isToday } = await resolveDayContext(searchParamsPromise)
-  const prevDate = shiftKstDateString(selectedDate, -1)
-  const nextDate = shiftKstDateString(selectedDate, 1)
-
-  return (
-    <>
-      <div className="mb-4 flex items-center justify-center gap-4 text-sm">
-        <Link href={`/checkin?date=${prevDate}`} className="underline">
-          ◀
-        </Link>
-        <span className="font-medium">
-          {formatKstDateHeading(selectedDate)}
-          {isToday ? ' (오늘)' : ''}
-        </span>
-        {isToday ? (
-          <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
-            ▶
-          </span>
-        ) : (
-          <Link href={`/checkin?date=${nextDate}`} className="underline">
-            ▶
-          </Link>
-        )}
-      </div>
-
-      {isToday && <PostForm />}
-    </>
-  )
+
+  return <DayNavView selectedDate={selectedDate} isToday={isToday} />
 }
 
 export async function FeedContent({
@@ -264,13 +223,5 @@
   ])
   const isAdmin = session?.role === 'admin'
 
-  return (
-    <ul className="mt-6 flex flex-col gap-4">
-      {checkinPosts.map((post) => (
-        <li key={post.id}>
-          <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
-        </li>
-      ))}
-    </ul>
-  )
-}
+  return <CheckinFeedView posts={checkinPosts} currentUserId={session!.userId} isAdmin={isAdmin} />
+}
```

- [ ] **Step 6: Create the two calendar views**

`app/(app)/checkin/calendar/views.tsx`:

```tsx
import Link from 'next/link'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'

// Pure markup for /checkin/calendar's streamed boundary in page.tsx, which keeps the data read
// and caching. /tour renders this same view from fixtures.

export function CheckinCalendarView({
  year,
  month,
  view,
  posts,
  basePath = '',
}: {
  year: number
  month: number
  view: 'date' | 'member'
  posts: CalendarPost[]
  basePath?: string
}) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">
        {year}년 {month}월
      </h2>
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`${basePath}/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`${basePath}/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, posts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
                    <div>{Number(day.date.slice(8, 10))}</div>
                    <div className="mt-1 flex flex-col gap-0.5">
                      {day.posts.map((post) => (
                        <span key={post.id} className="text-xs">
                          {post.authorName}
                          {post.isLate ? ' · 지각' : ''}
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
          {groupPostsByMember(posts).map((member) => (
            <li key={member.authorId}>
              <h2 className="font-semibold">{member.authorName}</h2>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
                {member.posts.map((post) => (
                  <li key={post.id}>
                    {post.createdAt.slice(0, 10)}
                    {post.isLate ? ' · 지각' : ''}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

`app/(app)/jobposts/calendar/views.tsx`:

```tsx
import Link from 'next/link'
import { buildMonthCalendar, groupPostsByMember, type CalendarJobPost } from '@/lib/jobposts/calendar'

// Pure markup for /jobposts/calendar's streamed boundary in page.tsx, which keeps the data read
// and caching. /tour renders this same view from fixtures.

export function JobPostsCalendarView({
  year,
  month,
  view,
  posts,
  basePath = '',
}: {
  year: number
  month: number
  view: 'date' | 'member'
  posts: CalendarJobPost[]
  basePath?: string
}) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">
        {year}년 {month}월
      </h2>
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`${basePath}/jobposts/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`${basePath}/jobposts/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, posts).map((week, i) => (
              <tr key={i}>
                {week.map((day) => (
                  <td
                    key={day.date}
                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  >
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
          {groupPostsByMember(posts).map((member) => (
            <li key={member.authorId}>
              <h2 className="font-semibold">{member.authorName}</h2>
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
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
    </>
  )
}
```

- [ ] **Step 7: Render them from the calendar pages**

```diff
--- a/app/(app)/checkin/calendar/page.tsx
+++ b/app/(app)/checkin/calendar/page.tsx
@@ -2,9 +2,10 @@
 import Link from 'next/link'
 import { cacheLife, cacheTag } from 'next/cache'
 import { createCacheClient } from '@/lib/supabase/cache-client'
-import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
+import type { CalendarPost } from '@/lib/checkin/calendar'
 import { PageShell } from '@/components/ui/page-shell'
 import { Skeleton } from '@/components/skeleton'
+import { CheckinCalendarView } from './views'
 
 export const unstable_instant = false
 
@@ -92,70 +93,5 @@
 
   const calendarPosts = await getCalendarPosts(year, month)
 
-  return (
-    <>
-      <h2 className="mb-4 text-lg font-semibold">
-        {year}년 {month}월
-      </h2>
-      <div className="mb-4 flex gap-3 text-sm">
-        <Link
-          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
-          className={view === 'date' ? 'font-bold underline' : ''}
-        >
-          날짜별
-        </Link>
-        <Link
-          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
-          className={view === 'member' ? 'font-bold underline' : ''}
-        >
-          멤버별
-        </Link>
-      </div>
-
-      {view === 'date' ? (
-        <table className="w-full table-fixed border-collapse text-center text-sm">
-          <tbody>
-            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
-              <tr key={i}>
-                {week.map((day) => (
-                  <td
-                    key={day.date}
-                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
-                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
-                    }`}
-                  >
-                    <div>{Number(day.date.slice(8, 10))}</div>
-                    <div className="mt-1 flex flex-col gap-0.5">
-                      {day.posts.map((post) => (
-                        <span key={post.id} className="text-xs">
-                          {post.authorName}
-                          {post.isLate ? ' · 지각' : ''}
-                        </span>
-                      ))}
-                    </div>
-                  </td>
-                ))}
-              </tr>
-            ))}
-          </tbody>
-        </table>
-      ) : (
-        <ul className="flex flex-col gap-4">
-          {groupPostsByMember(calendarPosts).map((member) => (
-            <li key={member.authorId}>
-              <h2 className="font-semibold">{member.authorName}</h2>
-              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
-                {member.posts.map((post) => (
-                  <li key={post.id}>
-                    {post.createdAt.slice(0, 10)}
-                    {post.isLate ? ' · 지각' : ''}
-                  </li>
-                ))}
-              </ul>
-            </li>
-          ))}
-        </ul>
-      )}
-    </>
-  )
+  return <CheckinCalendarView year={year} month={month} view={view} posts={calendarPosts} />
 }
```

```diff
--- a/app/(app)/jobposts/calendar/page.tsx
+++ b/app/(app)/jobposts/calendar/page.tsx
@@ -1,10 +1,10 @@
 import { Suspense } from 'react'
-import Link from 'next/link'
 import { cacheLife, cacheTag } from 'next/cache'
 import { createCacheClient } from '@/lib/supabase/cache-client'
-import { buildMonthCalendar, groupPostsByMember, type CalendarJobPost } from '@/lib/jobposts/calendar'
+import type { CalendarJobPost } from '@/lib/jobposts/calendar'
 import { PageShell } from '@/components/ui/page-shell'
 import { Skeleton } from '@/components/skeleton'
+import { JobPostsCalendarView } from './views'
 
 export const unstable_instant = false
 
@@ -84,68 +84,5 @@
 
   const calendarPosts = await getCalendarPosts(year, month)
 
-  return (
-    <>
-      <h2 className="mb-4 text-lg font-semibold">
-        {year}년 {month}월
-      </h2>
-      <div className="mb-4 flex gap-3 text-sm">
-        <Link
-          href={`/jobposts/calendar?year=${year}&month=${month}&view=date`}
-          className={view === 'date' ? 'font-bold underline' : ''}
-        >
-          날짜별
-        </Link>
-        <Link
-          href={`/jobposts/calendar?year=${year}&month=${month}&view=member`}
-          className={view === 'member' ? 'font-bold underline' : ''}
-        >
-          멤버별
-        </Link>
-      </div>
-
-      {view === 'date' ? (
-        <table className="w-full table-fixed border-collapse text-center text-sm">
-          <tbody>
-            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
-              <tr key={i}>
-                {week.map((day) => (
-                  <td
-                    key={day.date}
-                    className={`border border-gray-200 p-2 align-top dark:border-gray-800 ${
-                      day.inMonth ? '' : 'text-gray-300 dark:text-gray-600'
-                    }`}
-                  >
-                    <div>{Number(day.date.slice(8, 10))}</div>
-                    <div className="mt-1 flex flex-col gap-0.5">
-                      {day.posts.map((post) => (
-                        <span key={post.id} className="text-xs">
-                          {post.authorName} · {post.companyName}
-                        </span>
-                      ))}
-                    </div>
-                  </td>
-                ))}
-              </tr>
-            ))}
-          </tbody>
-        </table>
-      ) : (
-        <ul className="flex flex-col gap-4">
-          {groupPostsByMember(calendarPosts).map((member) => (
-            <li key={member.authorId}>
-              <h2 className="font-semibold">{member.authorName}</h2>
-              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
-                {member.posts.map((post) => (
-                  <li key={post.id}>
-                    {post.postDate} · {post.companyName}
-                  </li>
-                ))}
-              </ul>
-            </li>
-          ))}
-        </ul>
-      )}
-    </>
-  )
+  return <JobPostsCalendarView year={year} month={month} view={view} posts={calendarPosts} />
 }
```

- [ ] **Step 8: Verify**

Run the Step 1 command again → PASS, same counts.
Run: `git diff -U0 "app/(app)/checkin/page.tsx" "app/(app)/checkin/calendar/page.tsx" "app/(app)/jobposts/calendar/page.tsx" | grep -E "^[-+].*(use cache|cacheTag|cacheLife|createCacheClient|\.from\(|unstable_instant)"`
Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add lib/checkin/date-param.ts lib/checkin/date-param.test.ts "app/(app)/checkin/views.tsx" "app/(app)/checkin/page.tsx" "app/(app)/checkin/calendar/views.tsx" "app/(app)/checkin/calendar/page.tsx" "app/(app)/jobposts/calendar/views.tsx" "app/(app)/jobposts/calendar/page.tsx"
git commit -m "refactor: move check-in feed and calendar markup into views"
```

---

### Task 8: Extract the coding, job post, interview, feedback and problem views

**Suggested model:** sonnet · **opus** review (cache files)

**Files:**
- Create: `views.tsx` in `app/(app)/coding/`, `app/(app)/jobposts/`, `app/(app)/interviews/`, `app/(app)/interviews/[sessionId]/`, `app/(app)/feedback/[id]/`, `app/(app)/problems/`, `app/(app)/problems/[id]/`
- Modify: the `page.tsx` in each of those folders

- [ ] **Step 1: Baseline**

Run: `npx vitest run "app/(app)/coding" "app/(app)/jobposts" "app/(app)/interviews" "app/(app)/feedback" "app/(app)/problems"`
Expected: PASS. Note the count.

- [ ] **Step 2: Coding board**

`app/(app)/coding/views.tsx`:

```tsx
import Link from 'next/link'
import type { CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import { formatWeekHeader } from '@/lib/coding/week'
import { ProblemForm } from './problem-form'
import { ProblemCard } from './problem-card'
import { EmptyState } from '@/components/ui/empty-state'

// Pure markup for /coding's board boundary in page.tsx, which keeps all the data reads and
// caching. /tour renders this same view from fixtures.

export function CodingBoardView({
  isAdmin,
  members,
  currentWeek,
  prevId,
  nextId,
  problems,
  currentUserId,
  basePath = '',
}: {
  isAdmin: boolean
  members: Member[]
  currentWeek: CodingWeek | null
  prevId: string | null
  nextId: string | null
  problems: CodingProblem[]
  currentUserId: string
  basePath?: string
}) {
  return (
    <>
      {isAdmin && <ProblemForm members={members} currentWeek={currentWeek} />}
      <div className="mt-6 flex flex-col gap-4">
        {currentWeek ? (
          <>
            <div className="flex items-center justify-between">
              {prevId ? (
                <Link href={`${basePath}/coding?week=${prevId}`} className="text-sm underline">
                  ← 이전 주차
                </Link>
              ) : (
                <span />
              )}
              <h2 className="text-lg font-semibold">{formatWeekHeader(currentWeek)}</h2>
              {nextId ? (
                <Link href={`${basePath}/coding?week=${nextId}`} className="text-sm underline">
                  다음 주차 →
                </Link>
              ) : (
                <span />
              )}
            </div>
            <div className="flex flex-col gap-3">
              {problems.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  members={members}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                />
              ))}
              {problems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
            </div>
          </>
        ) : (
          <EmptyState message="아직 등록된 문제가 없습니다." />
        )}
      </div>
    </>
  )
}
```

```diff
--- a/app/(app)/coding/page.tsx
+++ b/app/(app)/coding/page.tsx
@@ -1,16 +1,13 @@
 import { Suspense } from 'react'
-import Link from 'next/link'
 import { createClient } from '@/lib/supabase/server'
 import { getSessionProfile } from '@/lib/auth/session'
 import { getCodingMembers, getCodingWeeks, getCodingWeekBoard } from '@/lib/coding/queries'
-import { resolveCurrentWeek, formatWeekHeader } from '@/lib/coding/week'
-import { ProblemForm } from './problem-form'
-import { ProblemCard } from './problem-card'
+import { resolveCurrentWeek } from '@/lib/coding/week'
+import { CodingBoardView } from './views'
 import { GithubSettingsForm } from './github-settings-form'
 import { PageShell } from '@/components/ui/page-shell'
 import { Alert } from '@/components/ui/alert'
 import { Toast } from '@/components/ui/toast'
-import { EmptyState } from '@/components/ui/empty-state'
 import { Skeleton } from '@/components/skeleton'
 
 type CodingSearchParams = { error?: string; success?: string; week?: string }
@@ -107,45 +104,14 @@
   const codingProblems = currentWeek ? await getCodingWeekBoard(currentWeek.id) : []
 
   return (
-    <>
-      {isAdmin && <ProblemForm members={members} currentWeek={currentWeek} />}
-      <div className="mt-6 flex flex-col gap-4">
-        {currentWeek ? (
-          <>
-            <div className="flex items-center justify-between">
-              {prevId ? (
-                <Link href={`/coding?week=${prevId}`} className="text-sm underline">
-                  ← 이전 주차
-                </Link>
-              ) : (
-                <span />
-              )}
-              <h2 className="text-lg font-semibold">{formatWeekHeader(currentWeek)}</h2>
-              {nextId ? (
-                <Link href={`/coding?week=${nextId}`} className="text-sm underline">
-                  다음 주차 →
-                </Link>
-              ) : (
-                <span />
-              )}
-            </div>
-            <div className="flex flex-col gap-3">
-              {codingProblems.map((problem) => (
-                <ProblemCard
-                  key={problem.id}
-                  problem={problem}
-                  members={members}
-                  isAdmin={isAdmin}
-                  currentUserId={session!.userId}
-                />
-              ))}
-              {codingProblems.length === 0 && <EmptyState message="이 주차에 등록된 문제가 없습니다." />}
-            </div>
-          </>
-        ) : (
-          <EmptyState message="아직 등록된 문제가 없습니다." />
-        )}
-      </div>
-    </>
+    <CodingBoardView
+      isAdmin={isAdmin}
+      members={members}
+      currentWeek={currentWeek}
+      prevId={prevId}
+      nextId={nextId}
+      problems={codingProblems}
+      currentUserId={session!.userId}
+    />
   )
 }
```

- [ ] **Step 3: Job post feed**

`app/(app)/jobposts/views.tsx`:

```tsx
import type { JobPost } from '@/lib/jobposts/types'
import { PostCard } from './post-card'

// Pure markup for /jobposts' feed boundary in page.tsx, which keeps the data read and caching.
// /tour renders this same view from fixtures.

export function JobPostFeedView({
  posts,
  currentUserId,
  isAdmin,
  basePath = '',
}: {
  posts: JobPost[]
  currentUserId: string
  isAdmin: boolean
  basePath?: string
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
        </li>
      ))}
    </ul>
  )
}
```

```diff
--- a/app/(app)/jobposts/page.tsx
+++ b/app/(app)/jobposts/page.tsx
@@ -5,7 +5,7 @@
 import { createCacheClient } from '@/lib/supabase/cache-client'
 import { queryIfAny } from '@/lib/supabase/query-if-any'
 import { PostForm } from './post-form'
-import { PostCard } from './post-card'
+import { JobPostFeedView } from './views'
 import type { JobPost } from '@/lib/jobposts/types'
 import { PageShell } from '@/components/ui/page-shell'
 import { Alert } from '@/components/ui/alert'
@@ -145,13 +145,5 @@
   const [session, jobPosts] = await Promise.all([getSessionProfile(), getJobPosts()])
   const isAdmin = session?.role === 'admin'
 
-  return (
-    <ul className="mt-6 flex flex-col gap-4">
-      {jobPosts.map((post) => (
-        <li key={post.id}>
-          <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
-        </li>
-      ))}
-    </ul>
-  )
+  return <JobPostFeedView posts={jobPosts} currentUserId={session!.userId} isAdmin={isAdmin} />
 }
```

- [ ] **Step 4: Interview feed**

`app/(app)/interviews/views.tsx`:

```tsx
import type { InterviewSession } from '@/lib/interviews/types'
import { SessionCard } from './session-card'

// Pure markup for /interviews' feed boundary in page.tsx, which keeps the data read and
// caching. /tour renders this same view from fixtures.

export function InterviewSessionFeedView({
  sessions,
  currentUserId,
  isAdmin,
  basePath = '',
}: {
  sessions: InterviewSession[]
  currentUserId: string
  isAdmin: boolean
  basePath?: string
}) {
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {sessions.map((s) => (
        <li key={s.id}>
          <SessionCard session={s} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
        </li>
      ))}
    </ul>
  )
}
```

```diff
--- a/app/(app)/interviews/page.tsx
+++ b/app/(app)/interviews/page.tsx
@@ -4,7 +4,7 @@
 import { createCacheClient } from '@/lib/supabase/cache-client'
 import { queryIfAny } from '@/lib/supabase/query-if-any'
 import { SessionForm } from './session-form'
-import { SessionCard } from './session-card'
+import { InterviewSessionFeedView } from './views'
 import type { InterviewSession } from '@/lib/interviews/types'
 import { PageShell } from '@/components/ui/page-shell'
 import { Alert } from '@/components/ui/alert'
@@ -118,13 +118,5 @@
   const [session, interviewSessions] = await Promise.all([getSessionProfile(), getInterviewSessions()])
   const isAdmin = session?.role === 'admin'
 
-  return (
-    <ul className="mt-6 flex flex-col gap-4">
-      {interviewSessions.map((s) => (
-        <li key={s.id}>
-          <SessionCard session={s} currentUserId={session!.userId} isAdmin={isAdmin} />
-        </li>
-      ))}
-    </ul>
-  )
+  return <InterviewSessionFeedView sessions={interviewSessions} currentUserId={session!.userId} isAdmin={isAdmin} />
 }
```

- [ ] **Step 5: Interview session page**

`app/(app)/interviews/[sessionId]/views.tsx`:

```tsx
import type { InterviewQaGroup } from '@/lib/interviews/grouping'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

// The whole /interviews/[sessionId] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function InterviewSessionView({
  sessionId,
  title,
  sessionAt,
  description,
  qaGroups,
  currentUserId,
  isAdmin,
  error,
  success,
  basePath = '',
}: {
  sessionId: string
  title: string
  sessionAt: string
  description: string | null
  qaGroups: InterviewQaGroup[]
  currentUserId: string
  isAdmin: boolean
  error?: string
  success?: string
  basePath?: string
}) {
  return (
    <PageShell title={title}>
      <Toast message={success} />
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{sessionAt}</p>
      {description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{description}</p>
      )}
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <QaForm sessionId={sessionId} />
      <div className="mt-6 flex flex-col gap-6">
        {qaGroups.map((group) => (
          <section key={group.authorId}>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{group.authorName}</h2>
            <ul className="flex flex-col gap-4">
              {group.qas.map((qa) => (
                <li key={qa.id}>
                  <QaCard qa={qa} currentUserId={currentUserId} isAdmin={isAdmin} basePath={basePath} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
```

```diff
--- a/app/(app)/interviews/[sessionId]/page.tsx
+++ b/app/(app)/interviews/[sessionId]/page.tsx
@@ -2,13 +2,9 @@
 import { redirect } from 'next/navigation'
 import { getSessionProfile } from '@/lib/auth/session'
 import { queryIfAny } from '@/lib/supabase/query-if-any'
-import { QaForm } from './qa-form'
-import { QaCard } from './qa-card'
+import { InterviewSessionView } from './views'
 import { groupQasByAuthor } from '@/lib/interviews/grouping'
 import type { InterviewQa } from '@/lib/interviews/types'
-import { PageShell } from '@/components/ui/page-shell'
-import { Alert } from '@/components/ui/alert'
-import { Toast } from '@/components/ui/toast'
 
 export default async function InterviewSessionPage({
   params,
@@ -66,32 +62,16 @@
   const qaGroups = groupQasByAuthor(interviewQas)
 
   return (
-    <PageShell title={session.title}>
-      <Toast message={success} />
-      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{session.session_at}</p>
-      {session.description && (
-        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{session.description}</p>
-      )}
-      {queryError && (
-        <Alert variant="danger" className="mb-4">
-          {queryError}
-        </Alert>
-      )}
-      <QaForm sessionId={sessionId} />
-      <div className="mt-6 flex flex-col gap-6">
-        {qaGroups.map((group) => (
-          <section key={group.authorId}>
-            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{group.authorName}</h2>
-            <ul className="flex flex-col gap-4">
-              {group.qas.map((qa) => (
-                <li key={qa.id}>
-                  <QaCard qa={qa} currentUserId={caller!.userId} isAdmin={isAdmin} />
-                </li>
-              ))}
-            </ul>
-          </section>
-        ))}
-      </div>
-    </PageShell>
+    <InterviewSessionView
+      sessionId={sessionId}
+      title={session.title}
+      sessionAt={session.session_at}
+      description={session.description}
+      qaGroups={qaGroups}
+      currentUserId={caller!.userId}
+      isAdmin={isAdmin}
+      error={queryError}
+      success={success}
+    />
   )
 }
```

- [ ] **Step 6: Feedback page**

`app/(app)/feedback/[id]/views.tsx`:

```tsx
import { FeedbackLines, type FeedbackLineWithComments } from './feedback-lines'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

// The whole /feedback/[id] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function FeedbackDocView({
  feedbackDocId,
  heading,
  authorName,
  lines,
  error,
}: {
  feedbackDocId: string
  heading: string
  authorName: string
  lines: FeedbackLineWithComments[]
  error?: string
}) {
  return (
    <PageShell title={heading} width="3xl">
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">작성자: {authorName}</p>
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <FeedbackLines feedbackDocId={feedbackDocId} lines={lines} />
    </PageShell>
  )
}
```

```diff
--- a/app/(app)/feedback/[id]/page.tsx
+++ b/app/(app)/feedback/[id]/page.tsx
@@ -1,10 +1,9 @@
 import { createClient } from '@/lib/supabase/server'
 import { redirect } from 'next/navigation'
 import { groupCommentsByLine } from '@/lib/jobposts/comments'
-import { FeedbackLines, type FeedbackLineWithComments } from './feedback-lines'
+import type { FeedbackLineWithComments } from './feedback-lines'
+import { FeedbackDocView } from './views'
 import type { FeedbackLine } from '@/lib/jobposts/types'
-import { PageShell } from '@/components/ui/page-shell'
-import { Alert } from '@/components/ui/alert'
 
 export default async function FeedbackPage({
   params,
@@ -86,14 +85,12 @@
   }))
 
   return (
-    <PageShell title={heading} width="3xl">
-      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">작성자: {authorName}</p>
-      {queryError && (
-        <Alert variant="danger" className="mb-4">
-          {queryError}
-        </Alert>
-      )}
-      <FeedbackLines feedbackDocId={id} lines={feedbackLines} />
-    </PageShell>
+    <FeedbackDocView
+      feedbackDocId={id}
+      heading={heading}
+      authorName={authorName}
+      lines={feedbackLines}
+      error={queryError}
+    />
   )
 }
```

- [ ] **Step 7: Problem list** (the search form gets `data-demo-allow`; harmless outside the tour)

`app/(app)/problems/views.tsx`:

```tsx
import Form from 'next/form'
import Link from 'next/link'
import { companyCounts, filterProblems } from '@/lib/problems/filter'
import { displayTitle, type BankProblemSummary } from '@/lib/problems/types'
import { getKstDateString } from '@/lib/checkin/time'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'

// Pure markup for /problems' list boundary in page.tsx, which keeps the cached read.
// /tour renders this same view from fixtures.

/**
 * Filtering and counting happen here, outside the `'use cache'` read, so `?company`/`?q`
 * never become cache keys — every visitor shares the one cached summary list.
 */
export function ProblemListView({
  problems,
  company,
  q,
  basePath = '',
}: {
  problems: BankProblemSummary[]
  company: string
  q: string
  basePath?: string
}) {
  const counts = companyCounts(problems)
  const visible = filterProblems(problems, { company, q })

  return (
    <>
      {/* data-demo-allow: a GET search form, so the /tour DemoGuard lets it navigate. */}
      <Form
        key={JSON.stringify([company, q])}
        action={`${basePath}/problems`}
        data-demo-allow
        className="mb-4 flex flex-wrap gap-2"
      >
        <Select name="company" aria-label="회사" defaultValue={company}>
          <option value="">전체 ({problems.length})</option>
          {counts.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} ({c.count})
            </option>
          ))}
        </Select>
        <Input name="q" aria-label="검색" placeholder="회사명 또는 제목으로 검색" defaultValue={q} className="min-w-0 flex-1" />
        <Button type="submit" variant="secondary">
          검색
        </Button>
      </Form>

      {problems.length === 0 ? (
        <EmptyState message="아직 등록된 문제가 없어요. 첫 문제를 작성해보세요." />
      ) : visible.length === 0 ? (
        <EmptyState message="조건에 맞는 문제가 없어요." />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((problem) => (
            <li key={problem.id}>
              <Link href={`${basePath}/problems/${problem.id}`} className="block">
                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{displayTitle(problem.company, problem.title)}</span>
                    <span className="shrink-0 rounded border border-gray-300 px-2 py-0.5 font-mono text-xs dark:border-gray-700">
                      {problem.paramCount}개 인자 → {problem.returnType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {problem.authorName} · {getKstDateString(problem.createdAt)}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
```

```diff
--- a/app/(app)/problems/page.tsx
+++ b/app/(app)/problems/page.tsx
@@ -1,18 +1,11 @@
 import { Suspense } from 'react'
-import Form from 'next/form'
 import Link from 'next/link'
 import { getProblemSummaries } from '@/lib/problems/queries'
-import { companyCounts, filterProblems } from '@/lib/problems/filter'
-import { displayTitle } from '@/lib/problems/types'
-import { getKstDateString } from '@/lib/checkin/time'
 import { PageShell } from '@/components/ui/page-shell'
 import { Alert } from '@/components/ui/alert'
 import { Toast } from '@/components/ui/toast'
-import { Card } from '@/components/ui/card'
-import { Button } from '@/components/ui/button'
-import { Input, Select } from '@/components/ui/input'
-import { EmptyState } from '@/components/ui/empty-state'
 import { Skeleton } from '@/components/skeleton'
+import { ProblemListView } from './views'
 
 type ProblemsSearchParams = { company?: string; q?: string; error?: string; success?: string }
 
@@ -64,58 +57,9 @@
   )
 }
 
-/**
- * Filtering and counting happen here, outside the `'use cache'` read, so `?company`/`?q`
- * never become cache keys — every visitor shares the one cached summary list.
- */
 export async function ProblemList({ searchParamsPromise }: { searchParamsPromise: Promise<ProblemsSearchParams> }) {
   const { company = '', q = '' } = await searchParamsPromise
   const problems = await getProblemSummaries()
-  const counts = companyCounts(problems)
-  const visible = filterProblems(problems, { company, q })
 
-  return (
-    <>
-      <Form key={JSON.stringify([company, q])} action="/problems" className="mb-4 flex flex-wrap gap-2">
-        <Select name="company" aria-label="회사" defaultValue={company}>
-          <option value="">전체 ({problems.length})</option>
-          {counts.map((c) => (
-            <option key={c.company} value={c.company}>
-              {c.company} ({c.count})
-            </option>
-          ))}
-        </Select>
-        <Input name="q" aria-label="검색" placeholder="회사명 또는 제목으로 검색" defaultValue={q} className="min-w-0 flex-1" />
-        <Button type="submit" variant="secondary">
-          검색
-        </Button>
-      </Form>
-
-      {problems.length === 0 ? (
-        <EmptyState message="아직 등록된 문제가 없어요. 첫 문제를 작성해보세요." />
-      ) : visible.length === 0 ? (
-        <EmptyState message="조건에 맞는 문제가 없어요." />
-      ) : (
-        <ul className="flex flex-col gap-3">
-          {visible.map((problem) => (
-            <li key={problem.id}>
-              <Link href={`/problems/${problem.id}`} className="block">
-                <Card className="hover:bg-gray-50 dark:hover:bg-gray-900">
-                  <div className="flex items-center justify-between gap-2">
-                    <span className="min-w-0 break-words font-medium">{displayTitle(problem.company, problem.title)}</span>
-                    <span className="shrink-0 rounded border border-gray-300 px-2 py-0.5 font-mono text-xs dark:border-gray-700">
-                      {problem.paramCount}개 인자 → {problem.returnType}
-                    </span>
-                  </div>
-                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
-                    {problem.authorName} · {getKstDateString(problem.createdAt)}
-                  </p>
-                </Card>
-              </Link>
-            </li>
-          ))}
-        </ul>
-      )}
-    </>
-  )
+  return <ProblemListView problems={problems} company={company} q={q} />
 }
```

- [ ] **Step 8: Problem detail**

`app/(app)/problems/[id]/views.tsx`:

```tsx
import Link from 'next/link'
import { getKstDateString } from '@/lib/checkin/time'
import { displayTitle, formatSignature, type BankProblem } from '@/lib/problems/types'
import { Markdown } from '@/components/markdown'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'
import { deleteProblem } from '../actions'
import { DeleteProblemButton } from './delete-problem-button'
import { DownloadPanel } from './download-panel'
import { ExampleTable } from './example-table'

// The whole /problems/[id] page minus its data reads, which stay in page.tsx.
// /tour renders this same view from fixtures.

export function ProblemDetailView({
  problem,
  canManage,
  error,
  success,
  basePath = '',
}: {
  problem: BankProblem
  canManage: boolean
  error?: string
  success?: string
  basePath?: string
}) {
  const id = problem.id
  const examples = problem.testCases.filter((testCase) => testCase.isExample)
  const updated = problem.updatedAt.slice(0, 16) !== problem.createdAt.slice(0, 16)

  return (
    <PageShell
      title={displayTitle(problem.company, problem.title)}
      headerExtra={
        canManage ? (
          <div className="flex gap-2">
            <Link
              href={`${basePath}/problems/${id}/edit`}
              className="inline-flex min-h-11 items-center rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              수정
            </Link>
            <DeleteProblemButton action={deleteProblem.bind(null, id)} />
          </div>
        ) : undefined
      }
    >
      <Toast message={success} />
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <p className="-mt-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
        {problem.authorName} · {getKstDateString(problem.createdAt)}
        {updated && ` (수정 ${getKstDateString(problem.updatedAt)})`} · 시간 제한 {problem.timeLimitMs}ms
      </p>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-2 text-lg font-semibold">문제 설명</h2>
          <Markdown source={problem.descriptionMd} />
        </section>
        {problem.constraintsMd && (
          <section>
            <h2 className="mb-2 text-lg font-semibold">제한사항</h2>
            <Markdown source={problem.constraintsMd} />
          </section>
        )}
        <section>
          <h2 className="mb-2 text-lg font-semibold">함수 시그니처</h2>
          <code className="text-sm">{formatSignature(problem.signature)}</code>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">입출력 예</h2>
          <ExampleTable signature={problem.signature} cases={examples} />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-semibold">풀이 파일 다운로드</h2>
          <DownloadPanel problemId={id} problem={problem} basePath={basePath} />
        </section>
      </div>
    </PageShell>
  )
}
```

```diff
--- a/app/(app)/problems/[id]/page.tsx
+++ b/app/(app)/problems/[id]/page.tsx
@@ -1,18 +1,8 @@
-import Link from 'next/link'
 import { notFound } from 'next/navigation'
 import { getSessionProfile } from '@/lib/auth/session'
-import { getKstDateString } from '@/lib/checkin/time'
 import { getProblem } from '@/lib/problems/queries'
 import { isUuid } from '@/lib/problems/validate'
-import { displayTitle, formatSignature } from '@/lib/problems/types'
-import { Markdown } from '@/components/markdown'
-import { PageShell } from '@/components/ui/page-shell'
-import { Alert } from '@/components/ui/alert'
-import { Toast } from '@/components/ui/toast'
-import { deleteProblem } from '../actions'
-import { DeleteProblemButton } from './delete-problem-button'
-import { DownloadPanel } from './download-panel'
-import { ExampleTable } from './example-table'
+import { ProblemDetailView } from './views'
 
 export default async function ProblemDetailPage({
   params,
@@ -29,61 +19,6 @@
   if (!problem) notFound()
 
   const canManage = session?.userId === problem.createdBy || session?.role === 'admin'
-  const examples = problem.testCases.filter((testCase) => testCase.isExample)
-  const updated = problem.updatedAt.slice(0, 16) !== problem.createdAt.slice(0, 16)
 
-  return (
-    <PageShell
-      title={displayTitle(problem.company, problem.title)}
-      headerExtra={
-        canManage ? (
-          <div className="flex gap-2">
-            <Link
-              href={`/problems/${id}/edit`}
-              className="inline-flex min-h-11 items-center rounded border border-gray-300 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
-            >
-              수정
-            </Link>
-            <DeleteProblemButton action={deleteProblem.bind(null, id)} />
-          </div>
-        ) : undefined
-      }
-    >
-      <Toast message={success} />
-      {error && (
-        <Alert variant="danger" className="mb-4">
-          {error}
-        </Alert>
-      )}
-      <p className="-mt-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
-        {problem.authorName} · {getKstDateString(problem.createdAt)}
-        {updated && ` (수정 ${getKstDateString(problem.updatedAt)})`} · 시간 제한 {problem.timeLimitMs}ms
-      </p>
-
-      <div className="flex flex-col gap-8">
-        <section>
-          <h2 className="mb-2 text-lg font-semibold">문제 설명</h2>
-          <Markdown source={problem.descriptionMd} />
-        </section>
-        {problem.constraintsMd && (
-          <section>
-            <h2 className="mb-2 text-lg font-semibold">제한사항</h2>
-            <Markdown source={problem.constraintsMd} />
-          </section>
-        )}
-        <section>
-          <h2 className="mb-2 text-lg font-semibold">함수 시그니처</h2>
-          <code className="text-sm">{formatSignature(problem.signature)}</code>
-        </section>
-        <section>
-          <h2 className="mb-2 text-lg font-semibold">입출력 예</h2>
-          <ExampleTable signature={problem.signature} cases={examples} />
-        </section>
-        <section>
-          <h2 className="mb-2 text-lg font-semibold">풀이 파일 다운로드</h2>
-          <DownloadPanel problemId={id} problem={problem} />
-        </section>
-      </div>
-    </PageShell>
-  )
+  return <ProblemDetailView problem={problem} canManage={canManage} error={error} success={success} />
 }
```

- [ ] **Step 9: Verify**

Run the Step 1 command again → PASS, same count.
Run: `npx tsc --noEmit` → no output.
Run: `git diff -U0 -- "app/(app)/*/page.tsx" "app/(app)/*/*/page.tsx" | grep -E "^[-+].*(use cache|cacheTag|cacheLife|createCacheClient|\.from\(|unstable_instant)"`
Expected: exactly one line, from `problems/page.tsx`: the removed doc comment that starts `- * Filtering and counting happen here`, which moved with the markup into `problems/views.tsx`. No code line.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/coding" "app/(app)/jobposts/views.tsx" "app/(app)/jobposts/page.tsx" "app/(app)/interviews" "app/(app)/feedback" "app/(app)/problems"
git commit -m "refactor: move board and detail page markup into views"
```

---

### Task 9: Placeholder desk images

**Suggested model:** haiku

Simple desk illustrations that stand in until the owner's photos arrive (Task 14). No clock in the picture, since it would contradict the post time printed above it.

**Files:**
- Create: `public/tour/desk-1.svg` … `public/tour/desk-6.svg`

- [ ] **Step 1: Generate them**

Run from the worktree root:

```bash
mkdir -p public/tour && node -e '
const fs = require("fs")
const palettes = [["#f3efe6","#8b6f47"],["#e8eef3","#4a6378"],["#eef3e8","#5b7347"],["#f3e8ee","#7a4a63"],["#ece8f3","#5d4a7a"],["#f3f0e8","#7a6a4a"]]
palettes.forEach(([bg, fg], i) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400" role="img" aria-label="책상 일러스트">
  <rect width="640" height="400" fill="${bg}"/>
  <rect x="0" y="300" width="640" height="100" fill="${fg}" opacity="0.35"/>
  <rect x="190" y="150" width="260" height="150" rx="10" fill="${fg}"/>
  <rect x="205" y="165" width="230" height="120" rx="4" fill="#ffffff" opacity="0.85"/>
  <rect x="160" y="300" width="320" height="12" rx="6" fill="${fg}"/>
  <rect x="500" y="250" width="40" height="50" rx="6" fill="${fg}" opacity="0.7"/>
</svg>
`
  fs.writeFileSync(`public/tour/desk-${i + 1}.svg`, svg)
})
'
```

Expected: `ls public/tour` lists `desk-1.svg` … `desk-6.svg`.

- [ ] **Step 2: Commit**

```bash
git add public/tour
git commit -m "chore: add placeholder desk images for the tour"
```

---

### Task 10: Tour fixtures and selectors

**Suggested model:** sonnet

Everything is derived from `today` so the demo always looks current. Facts the tests pin down: the demo member ("나 (체험)", id `tour-me`) checked in on time today and two of six members have not; the current coding week contains today and starts on Monday; the dashboard widget shows one solved and one open problem; there is always a fine this month (a manual fine dated today); one interview is upcoming; every feedback link resolves; every `TOUR_DESK_PHOTOS` path exists under `public/` (Task 9 created them); the three bank problems pass the real `validateProblem` and generate in all four languages. Coding links are real Baekjoon problems; auto-detected checks carry no commit SHA, so no "코드 보기" link points at a commit that does not exist.

**Files:**
- Create: `lib/tour/fixtures.ts`, `lib/tour/selectors.ts`
- Test: `lib/tour/fixtures.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/tour/fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { getKstDateString, shiftKstDateString } from '@/lib/checkin/time'
import { validateProblem } from '@/lib/problems/validate'
import { generate, LANGUAGES } from '@/lib/problems/generate'
import { buildTourFixtures, TOUR_DESK_PHOTOS, TOUR_FEED_DAYS, TOUR_ME_ID } from './fixtures'
import {
  checkinCalendarPosts,
  checkinPostsOn,
  codingWidget,
  feedbackPage,
  jobPostCalendarPosts,
  monthFines,
  problemSummaries,
  sessionQaGroups,
  todaysAuthorIds,
} from './selectors'

// Month/year boundaries, a leap day, and a Sunday and a Monday (the coding week starts Monday).
const DATES = ['2026-10-25', '2026-10-26', '2026-03-01', '2024-02-29', '2026-12-31', '2027-01-01']

describe.each(DATES)('buildTourFixtures(%s)', (today) => {
  const fx = buildTourFixtures(today)

  it('is deterministic', () => {
    expect(buildTourFixtures(today)).toEqual(fx)
  })

  it('keeps every check-in inside the feed window, newest first, with unique ids', () => {
    const earliest = shiftKstDateString(today, -(TOUR_FEED_DAYS - 1))
    for (const post of fx.checkinPosts) {
      const date = getKstDateString(post.createdAt)
      expect(date >= earliest && date <= today).toBe(true)
    }
    const times = fx.checkinPosts.map((p) => p.createdAt)
    expect(times).toEqual([...times].sort().reverse())
    expect(new Set(fx.checkinPosts.map((p) => p.id)).size).toBe(fx.checkinPosts.length)
  })

  it('has the demo member checked in on time today, and someone still missing', () => {
    const mine = checkinPostsOn(fx, today).find((p) => p.authorId === TOUR_ME_ID)
    expect(mine?.isLate).toBe(false)
    expect(todaysAuthorIds(fx).length).toBeLessThan(fx.members.length)
  })

  it('puts today inside the newest coding week, with contiguous Monday-start weeks', () => {
    const [current, ...older] = fx.codingWeeks
    expect(current.startDate <= today && today <= current.endDate).toBe(true)
    expect(new Date(`${current.startDate}T00:00:00Z`).getUTCDay()).toBe(1)
    older.forEach((week, i) => {
      const newer = fx.codingWeeks[i]
      expect(week.endDate).toBe(shiftKstDateString(newer.startDate, -1))
    })
  })

  it('shows the demo member one solved and one open problem on the dashboard widget', () => {
    const widget = codingWidget(fx)
    expect(widget.status).toBe('assigned')
    expect(widget.items.map((item) => item.completed).sort()).toEqual([false, true])
  })

  it('always has a fine this month, even on the first day of a month', () => {
    expect(monthFines(fx).reduce((sum, f) => sum + f.fineAmount, 0)).toBeGreaterThan(0)
  })

  it('dates job posts no later than today and has one interview still to come', () => {
    expect(fx.jobPosts.every((p) => p.postDate <= today)).toBe(true)
    expect(fx.interviewSessions.some((s) => getKstDateString(s.sessionAt) > today)).toBe(true)
  })

  it('resolves every feedback link to a page whose comments point at existing lines', () => {
    const ids = [
      ...fx.jobPosts.flatMap((p) => (p.feedbackDocId ? [p.feedbackDocId] : [])),
      ...fx.interviewQas.map((qa) => qa.feedbackDocId),
    ]
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(feedbackPage(fx, id)).not.toBeNull()
    }
    for (const doc of fx.feedbackDocs) {
      for (const comment of doc.comments) {
        expect(comment.lineIndex).toBeLessThan(doc.lines.length)
      }
    }
  })

  it('shows this month in the check-in calendar', () => {
    const [year, month] = today.split('-').map(Number)
    expect(checkinCalendarPosts(fx, year, month).length).toBeGreaterThan(0)
    expect(jobPostCalendarPosts(fx, year, month).length).toBeGreaterThan(0)
  })
})

describe('tour bank problems', () => {
  const fx = buildTourFixtures('2026-10-25')

  it.each(fx.bankProblems.map((p) => [p.title, p] as const))('%s passes the real problem validation', (_title, problem) => {
    expect(validateProblem(problem)).toMatchObject({ ok: true })
  })

  it.each(fx.bankProblems.map((p) => [p.title, p] as const))('%s generates a file in every language', (_title, problem) => {
    for (const language of LANGUAGES) {
      const file = generate(problem, language.id, { problemUrl: 'https://example.test/tour/problems/x' })
      expect(file.content.length).toBeGreaterThan(0)
    }
  })

  it('lists summaries newest first', () => {
    const dates = problemSummaries(fx).map((p) => p.createdAt)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})

describe('tour desk photos', () => {
  it('points every photo path at a file under public/', () => {
    for (const photo of TOUR_DESK_PHOTOS) {
      expect(existsSync(path.join(process.cwd(), 'public', photo))).toBe(true)
    }
  })
})

describe('tour selectors', () => {
  const fx = buildTourFixtures('2026-10-25')

  it('returns null for an unknown feedback id', () => {
    expect(feedbackPage(fx, 'nope')).toBeNull()
  })

  it('groups a session’s Q&As by author', () => {
    const groups = sessionQaGroups(fx, 'tour-interview-1')
    expect(groups.map((g) => g.authorName).sort()).toEqual(['나 (체험)', '이도윤'].sort())
    expect(sessionQaGroups(fx, 'tour-interview-2')).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run lib/tour`
Expected: FAIL with `Failed to resolve import "./fixtures"`.

- [ ] **Step 3: Write the fixtures**

`lib/tour/fixtures.ts`:

```ts
import type { CheckinComment, CheckinGoal, CheckinPost, CheckinReaction } from '@/lib/checkin/types'
import { computeLateFine, shiftKstDateString } from '@/lib/checkin/time'
import type { CodingCheck, CodingProblem, CodingWeek, Member } from '@/lib/coding/types'
import type { FlatFeedbackComment, JobPost, JobPostQuestion } from '@/lib/jobposts/types'
import { buildFeedbackLines } from '@/lib/jobposts/snapshot'
import type { InterviewQa, InterviewSession } from '@/lib/interviews/types'
import type { BankProblem } from '@/lib/problems/types'

/**
 * Everything /tour shows. Pure and deterministic: every date is derived from `today` (a KST
 * `YYYY-MM-DD`), so the demo always looks like a study group that is running right now, and a
 * test can pin `today` to any date. Nothing here is real member data.
 */

export const TOUR_ME_ID = 'tour-me'

/** Swap these for real desk photos by replacing the files and, if the extension changes, these paths. */
export const TOUR_DESK_PHOTOS = [
  '/tour/desk-1.svg',
  '/tour/desk-2.svg',
  '/tour/desk-3.svg',
  '/tour/desk-4.svg',
  '/tour/desk-5.svg',
  '/tour/desk-6.svg',
]

export const TOUR_FEED_DAYS = 14

export interface TourManualFine {
  id: string
  userId: string
  amount: number
  paid: boolean
  createdAt: string
}

export interface TourFeedbackDoc {
  id: string
  heading: string
  authorName: string
  /** Same shape `buildFeedbackLines` produces from the source post's questions. */
  lines: { questionIndex: number; question: string; text: string }[]
  comments: FlatFeedbackComment[]
}

export interface TourFixtures {
  today: string
  me: Member
  members: Member[]
  /** Newest first, covering today and the previous `TOUR_FEED_DAYS - 1` days. */
  checkinPosts: CheckinPost[]
  /** Late-fine posts whose fine has been paid. */
  paidPostIds: string[]
  manualFines: TourManualFine[]
  /** Newest first, like `getCodingWeeks()`; the first one contains `today`. */
  codingWeeks: CodingWeek[]
  codingProblems: Record<string, CodingProblem[]>
  jobPosts: JobPost[]
  interviewSessions: InterviewSession[]
  interviewQas: InterviewQa[]
  feedbackDocs: TourFeedbackDoc[]
  bankProblems: BankProblem[]
}

const MEMBERS: Member[] = [
  { id: TOUR_ME_ID, name: '나 (체험)' },
  { id: 'tour-haneul', name: '김하늘' },
  { id: 'tour-doyun', name: '이도윤' },
  { id: 'tour-seoyeon', name: '박서연' },
  { id: 'tour-jihoon', name: '최지훈' },
  { id: 'tour-yuna', name: '정유나' },
]

const nameOf = (id: string) => MEMBERS.find((m) => m.id === id)?.name ?? '알 수 없음'

/** KST wall-clock time on a KST date, as the UTC ISO string Supabase would return. */
function kstIso(date: string, hours: number, minutes: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hours - 9, minutes)).toISOString()
}

/** `timestamptz` as PostgREST serializes it (`+00:00`, not `Z`), which /interviews prints verbatim. */
function postgresTimestamp(iso: string): string {
  return iso.replace('.000Z', '+00:00')
}

// ---------------------------------------------------------------- check-ins

const GOAL_POOL = [
  '프로그래머스 2문제 풀기',
  'CS 운영체제 챕터 정리',
  '자소서 1번 문항 초안',
  '백준 그래프 문제 1개',
  '포트폴리오 README 다듬기',
  '면접 예상 질문 5개 답변 쓰기',
  'SQL 고득점 Kit 3문제',
  '기업 분석 1곳',
]

const COMMENT_POOL = ['오늘도 화이팅!', '책상 깔끔하네요 👍', '저도 그 문제 풀었어요', '내일도 10시 전에!']

// The post on day `d` (0 = today) by member index `m` is skipped on these slots, so the
// calendar and the dashboard show a realistic, not perfect, attendance record.
function skipsDay(d: number, m: number): boolean {
  if (d === 0) return m >= 4
  return (d + m) % 5 === 3
}

function isLateSlot(d: number, m: number): boolean {
  return d > 0 && m !== 0 && (d + m * 3) % 9 === 4
}

function buildGoals(date: string, d: number, m: number): CheckinGoal[] {
  if (d === 0 && m === 0) {
    return [
      { body: '프로그래머스 2문제 풀기', status: 'done', completedAt: kstIso(date, 11, 20) },
      { body: 'CS 운영체제 챕터 정리', status: 'partial', completedAt: null },
      { body: '토스 자소서 1번 문항 초안', status: 'todo', completedAt: null },
    ]
  }
  return [0, 1, 2].map((k) => {
    const body = GOAL_POOL[(d * 3 + m + k) % GOAL_POOL.length]
    // Past days are mostly finished; today is still in progress.
    const done = d > 0 ? (d + m + k) % 4 !== 0 : k === 0
    return done
      ? { body, status: 'done', completedAt: kstIso(date, 13 + k * 2, (m * 7) % 60) }
      : { body, status: d > 0 && k === 2 ? 'partial' : 'todo', completedAt: null }
  })
}

function buildCheckinPosts(today: string): { posts: CheckinPost[]; paidPostIds: string[] } {
  const posts: CheckinPost[] = []
  const paidPostIds: string[] = []

  for (let d = 0; d < TOUR_FEED_DAYS; d++) {
    const date = shiftKstDateString(today, -d)

    MEMBERS.forEach((member, m) => {
      if (skipsDay(d, m)) return

      const createdAt = isLateSlot(d, m)
        ? kstIso(date, 10, 1 + ((d + m) % 4) * 6)
        : kstIso(date, 9, 30 + ((d * 7 + m * 11) % 28))
      const { isLate, fineAmount } = computeLateFine(createdAt)
      const id = `tour-checkin-${date}-${m}`

      const reactions: CheckinReaction[] = [1, 2].map((offset) => {
        const reactor = MEMBERS[(m + offset) % MEMBERS.length]
        return { id: `${id}-r${offset}`, authorId: reactor.id, emoji: offset === 1 ? '👍' : '💪' }
      })

      const comments: CheckinComment[] =
        (d + m) % 4 === 0
          ? [
              {
                id: `${id}-c1`,
                authorId: MEMBERS[(m + 1) % MEMBERS.length].id,
                authorName: MEMBERS[(m + 1) % MEMBERS.length].name,
                body: COMMENT_POOL[(d + m) % COMMENT_POOL.length],
                createdAt: kstIso(date, 10, 30),
              },
            ]
          : []

      posts.push({
        id,
        authorId: member.id,
        authorName: member.name,
        photoUrl: TOUR_DESK_PHOTOS[(d + m) % TOUR_DESK_PHOTOS.length],
        goals: buildGoals(date, d, m),
        createdAt,
        isLate,
        fineAmount,
        comments,
        reactions,
      })

      if (isLate && d >= 7) paidPostIds.push(id)
    })
  }

  posts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { posts, paidPostIds }
}

// ---------------------------------------------------------------- coding

// Baekjoon problems, so every link in the demo opens a real, matching problem page.
const BOJ = (n: number) => `https://www.acmicpc.net/problem/${n}`

const WEEK_PROBLEMS: { title: string; number: number; assignees: string[] }[][] = [
  [
    { title: '미로 탐색', number: 2178, assignees: [] },
    { title: '평범한 배낭', number: 12865, assignees: [TOUR_ME_ID, 'tour-haneul', 'tour-doyun'] },
    { title: '최소비용 구하기', number: 1916, assignees: ['tour-seoyeon', 'tour-jihoon', 'tour-yuna'] },
  ],
  [
    { title: 'DFS와 BFS', number: 1260, assignees: [] },
    { title: '바이러스', number: 2606, assignees: [] },
  ],
  [
    { title: '회의실 배정', number: 1931, assignees: [] },
    { title: '1, 2, 3 더하기', number: 9095, assignees: [] },
  ],
]

/** Day of week of a `YYYY-MM-DD`, Monday = 0. */
function mondayOffset(date: string): number {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return (day + 6) % 7
}

function buildChecks(weekIndex: number, problemIndex: number, targets: string[]): CodingCheck[] {
  return targets.flatMap((userId, m): CodingCheck[] => {
    // This week: the demo member has solved the shared problem (auto-detected push) but not the
    // assigned one, so the dashboard widget shows one done and one to do.
    if (weekIndex === 0) {
      if (userId === TOUR_ME_ID) {
        return problemIndex === 0 ? [{ userId, commitSha: null, filePath: null, source: 'auto' }] : []
      }
      if ((m + problemIndex) % 3 === 0) return []
    }
    if (weekIndex > 0 && (m + problemIndex + weekIndex) % 6 === 5) return []
    const source = (m + problemIndex) % 4 === 1 ? 'manual' : 'auto'
    return [{ userId, commitSha: null, filePath: null, source }]
  })
}

function buildCoding(today: string): { weeks: CodingWeek[]; problems: Record<string, CodingProblem[]> } {
  const currentMonday = shiftKstDateString(today, -mondayOffset(today))
  const weeks: CodingWeek[] = []
  const problems: Record<string, CodingProblem[]> = {}

  WEEK_PROBLEMS.forEach((weekProblems, weekIndex) => {
    const startDate = shiftKstDateString(currentMonday, -7 * weekIndex)
    const weekNumber = 12 - weekIndex
    const week: CodingWeek = {
      id: `tour-week-${weekNumber}`,
      label: `${weekNumber}주차`,
      startDate,
      endDate: shiftKstDateString(startDate, 6),
    }
    weeks.push(week)
    problems[week.id] = weekProblems.map((p, problemIndex) => {
      const targets = p.assignees.length > 0 ? p.assignees : MEMBERS.map((member) => member.id)
      return {
        id: `${week.id}-p${problemIndex}`,
        title: p.title,
        link: BOJ(p.number),
        createdBy: 'tour-haneul',
        createdAt: kstIso(startDate, 9, problemIndex),
        assigneeIds: p.assignees,
        checks: buildChecks(weekIndex, problemIndex, targets),
      }
    })
  })

  return { weeks, problems }
}

// ---------------------------------------------------------------- job posts & feedback

const TOSS_QUESTIONS: JobPostQuestion[] = [
  {
    question: '지원 동기와 입사 후 이루고 싶은 목표를 작성해주세요.',
    answer:
      '스터디원 10명이 매일 쓰는 출석 사이트를 직접 만들고 운영하며, 사용자가 매일 돌아오게 만드는 작은 디테일의 힘을 배웠습니다. 결제처럼 실수가 허용되지 않는 영역에서 그 디테일을 끝까지 책임지는 개발자가 되고 싶어 지원했습니다.\n입사 후에는 장애 없이 배포하는 문화에 기여하는 것이 첫 목표입니다.',
  },
  {
    question: '가장 어려웠던 기술적 문제와 해결 과정을 작성해주세요.',
    answer:
      '캐시를 도입한 뒤 다른 멤버의 인증 글이 늦게 보이는 문제가 생겼습니다. 프레임워크 내부 코드를 읽어 경로 단위 무효화가 다른 캐시까지 지운다는 사실을 찾았습니다. 태그 단위 무효화로 바꾸고 회귀 테스트를 추가해 해결했습니다.',
  },
]

function buildJobPosts(today: string): { jobPosts: JobPost[]; feedbackDocs: TourFeedbackDoc[] } {
  const specs: { authorId: string; days: number; company: string; info: string; questions: JobPostQuestion[]; feedbackDocId: string | null }[] = [
    { authorId: TOUR_ME_ID, days: 0, company: '토스', info: '서버 개발자 (신입) · 서류 마감 D-5', questions: TOSS_QUESTIONS, feedbackDocId: 'tour-feedback-toss' },
    {
      authorId: 'tour-haneul',
      days: 1,
      company: '카카오',
      info: '2026 하반기 신입 공채 · 백엔드',
      questions: [{ question: '협업 과정에서 갈등을 해결한 경험을 작성해주세요.', answer: '팀 프로젝트에서 API 명세를 두고 의견이 갈렸을 때, 각자 안의 장단점을 표로 정리해 회의 시간을 절반으로 줄였습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-seoyeon',
      days: 2,
      company: '네이버',
      info: 'FE 신입 · 코딩테스트 포함',
      questions: [{ question: '본인의 강점을 작성해주세요.', answer: '모르는 것을 빠르게 인정하고, 공식 문서부터 읽는 습관이 있습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-doyun',
      days: 4,
      company: '당근',
      info: '백엔드 엔지니어 (주니어)',
      questions: [{ question: '최근 몰입했던 경험을 작성해주세요.', answer: '오픈소스 라이브러리의 버그를 재현하고 고치는 PR을 올려 머지되기까지 2주 동안 몰입했습니다.' }],
      feedbackDocId: null,
    },
    {
      authorId: 'tour-yuna',
      days: 6,
      company: '우아한형제들',
      info: '서버 신입 · 상시 채용',
      questions: [{ question: '지원 직무와 관련된 경험을 작성해주세요.', answer: '배달 주문 흐름을 흉내 낸 토이 프로젝트에서 동시 주문 시 재고가 음수가 되는 문제를 락으로 해결했습니다.' }],
      feedbackDocId: null,
    },
  ]

  const jobPosts: JobPost[] = specs.map((spec, index) => {
    const postDate = shiftKstDateString(today, -spec.days)
    return {
      id: `tour-jobpost-${index}`,
      authorId: spec.authorId,
      authorName: nameOf(spec.authorId),
      postDate,
      companyName: spec.company,
      postingInfo: spec.info,
      questions: spec.questions,
      feedbackRequested: spec.feedbackDocId !== null,
      feedbackDocId: spec.feedbackDocId,
      createdAt: kstIso(postDate, 21, 10 + index),
      reactions: [
        { id: `tour-jobpost-${index}-r1`, authorId: MEMBERS[(index + 1) % MEMBERS.length].id, emoji: '🎉' },
        { id: `tour-jobpost-${index}-r2`, authorId: MEMBERS[(index + 2) % MEMBERS.length].id, emoji: '👍' },
      ],
    }
  })

  const feedbackDocs: TourFeedbackDoc[] = [
    {
      id: 'tour-feedback-toss',
      heading: '토스 자소서 피드백',
      authorName: nameOf(TOUR_ME_ID),
      lines: buildFeedbackLines(TOSS_QUESTIONS),
      comments: [
        { id: 'tour-fc-1', lineIndex: 0, parentCommentId: null, authorId: 'tour-haneul', authorName: '김하늘', body: '숫자(10명)가 들어가서 구체적이에요. 좋아요!', createdAt: kstIso(today, 22, 0) },
        { id: 'tour-fc-2', lineIndex: 0, parentCommentId: 'tour-fc-1', authorId: TOUR_ME_ID, authorName: nameOf(TOUR_ME_ID), body: '감사합니다 🙏', createdAt: kstIso(today, 22, 10) },
        { id: 'tour-fc-3', lineIndex: 4, parentCommentId: null, authorId: 'tour-doyun', authorName: '이도윤', body: '"프레임워크 내부 코드를 읽어"를 더 구체적으로 쓰면 강점이 살 것 같아요.', createdAt: kstIso(today, 22, 30) },
      ],
    },
  ]

  return { jobPosts, feedbackDocs }
}

// ---------------------------------------------------------------- interviews

function buildInterviews(today: string): { sessions: InterviewSession[]; qas: InterviewQa[]; feedbackDocs: TourFeedbackDoc[] } {
  const pastDate = shiftKstDateString(today, -4)
  const nextDate = shiftKstDateString(today, 3)
  const pastTitle = '기술면접 스터디 (네트워크·DB)'

  const sessions: InterviewSession[] = [
    {
      id: 'tour-interview-1',
      createdBy: 'tour-haneul',
      title: pastTitle,
      sessionAt: postgresTimestamp(kstIso(pastDate, 20, 0)),
      description: 'Zoom · 1인당 질문 3개, 답변 5분',
      createdAt: kstIso(shiftKstDateString(pastDate, -3), 12, 0),
      participants: [TOUR_ME_ID, 'tour-haneul', 'tour-doyun', 'tour-seoyeon'].map((userId) => ({ userId, userName: nameOf(userId) })),
    },
    {
      id: 'tour-interview-2',
      createdBy: 'tour-jihoon',
      title: '인성면접 + 자소서 꼬리질문',
      sessionAt: postgresTimestamp(kstIso(nextDate, 20, 0)),
      description: '각자 최신 자소서 1개 준비해오기',
      createdAt: kstIso(today, 9, 0),
      participants: ['tour-haneul', 'tour-jihoon'].map((userId) => ({ userId, userName: nameOf(userId) })),
    },
  ]

  const meQuestions = [
    { question: 'TCP와 UDP의 차이를 설명해주세요.', answer: 'TCP는 연결을 맺고 순서와 재전송을 보장합니다. UDP는 연결 없이 보내 빠르지만 손실을 감수합니다.' },
    { question: '인덱스가 항상 빠른가요?', answer: '아닙니다. 선택도가 낮거나 쓰기가 많은 테이블에서는 오히려 느려질 수 있습니다.' },
  ]
  const doyunQuestions = [{ question: 'HTTP 1.1과 2의 차이는?', answer: '2는 하나의 연결에서 여러 요청을 동시에 보내는 멀티플렉싱을 지원합니다.' }]

  const qas: InterviewQa[] = [
    { id: 'tour-qa-me', sessionId: 'tour-interview-1', authorId: TOUR_ME_ID, authorName: nameOf(TOUR_ME_ID), questions: meQuestions, feedbackDocId: 'tour-feedback-qa-me', createdAt: kstIso(pastDate, 21, 30) },
    { id: 'tour-qa-doyun', sessionId: 'tour-interview-1', authorId: 'tour-doyun', authorName: '이도윤', questions: doyunQuestions, feedbackDocId: 'tour-feedback-qa-doyun', createdAt: kstIso(pastDate, 21, 40) },
  ]

  const feedbackDocs: TourFeedbackDoc[] = [
    {
      id: 'tour-feedback-qa-me',
      heading: `${pastTitle} 피드백`,
      authorName: nameOf(TOUR_ME_ID),
      lines: buildFeedbackLines(meQuestions),
      comments: [
        { id: 'tour-fc-qa-1', lineIndex: 0, parentCommentId: null, authorId: 'tour-seoyeon', authorName: '박서연', body: '흐름 제어·혼잡 제어도 한 줄 덧붙이면 좋겠어요.', createdAt: kstIso(pastDate, 22, 0) },
      ],
    },
    {
      id: 'tour-feedback-qa-doyun',
      heading: `${pastTitle} 피드백`,
      authorName: '이도윤',
      lines: buildFeedbackLines(doyunQuestions),
      comments: [],
    },
  ]

  return { sessions, qas, feedbackDocs }
}

// ---------------------------------------------------------------- problem bank

function buildBankProblems(today: string): BankProblem[] {
  const created = (days: number) => kstIso(shiftKstDateString(today, -days), 23, 0)
  return [
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a01',
      createdBy: 'tour-haneul',
      authorName: '김하늘',
      createdAt: created(9),
      updatedAt: created(9),
      company: '카카오',
      title: '두 배열의 교집합 크기',
      descriptionMd: '정수 배열 `a`와 `b`가 주어집니다. 두 배열에 **모두** 등장하는 서로 다른 값의 개수를 반환하세요.',
      constraintsMd: '- 1 ≤ 배열 길이 ≤ 100,000\n- 배열 안의 값은 중복될 수 있습니다.',
      timeLimitMs: 1000,
      signature: { params: [{ name: 'a', type: 'int[]' }, { name: 'b', type: 'int[]' }], returnType: 'int' },
      testCases: [
        { args: [[1, 2, 3], [2, 3, 4]], expected: 2, isExample: true },
        { args: [[1, 1, 1], [1]], expected: 1, isExample: true },
        { args: [[5], [6]], expected: 0, isExample: false },
      ],
    },
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a02',
      createdBy: 'tour-seoyeon',
      authorName: '박서연',
      createdAt: created(5),
      updatedAt: created(3),
      company: '네이버',
      title: '올바른 괄호 문자열',
      descriptionMd: '`(`, `)`, `[`, `]`로만 이루어진 문자열 `s`가 올바른 괄호 문자열이면 `true`를 반환하세요.',
      constraintsMd: '- 1 ≤ s의 길이 ≤ 10,000',
      timeLimitMs: 1000,
      signature: { params: [{ name: 's', type: 'string' }], returnType: 'bool' },
      testCases: [
        { args: ['([])'], expected: true, isExample: true },
        { args: ['(]'], expected: false, isExample: true },
        { args: ['(('], expected: false, isExample: false },
      ],
    },
    {
      id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a03',
      createdBy: 'tour-doyun',
      authorName: '이도윤',
      createdAt: created(2),
      updatedAt: created(2),
      company: '토스',
      title: '길이 k 구간 합의 최댓값',
      descriptionMd: '정수 배열 `nums`에서 연속한 `k`개 원소의 합 중 최댓값을 반환하세요.',
      constraintsMd: '- 1 ≤ k ≤ nums의 길이 ≤ 100,000\n- 합은 32비트 정수 범위를 넘을 수 있습니다.',
      timeLimitMs: 2000,
      signature: { params: [{ name: 'nums', type: 'int[]' }, { name: 'k', type: 'int' }], returnType: 'long' },
      testCases: [
        { args: [[1, 2, 3, 4, 5], 2], expected: 9, isExample: true },
        { args: [[2147483647, 2147483647], 2], expected: 4294967294, isExample: true },
        { args: [[-1, -2, -3], 1], expected: -1, isExample: false },
      ],
    },
  ]
}

// ---------------------------------------------------------------- entry point

export function buildTourFixtures(today: string): TourFixtures {
  const { posts, paidPostIds } = buildCheckinPosts(today)
  const { weeks, problems } = buildCoding(today)
  const jobs = buildJobPosts(today)
  const interviews = buildInterviews(today)

  return {
    today,
    me: MEMBERS[0],
    members: MEMBERS,
    checkinPosts: posts,
    paidPostIds,
    manualFines: [{ id: 'tour-manual-fine-1', userId: 'tour-jihoon', amount: 5000, paid: false, createdAt: kstIso(today, 9, 0) }],
    codingWeeks: weeks,
    codingProblems: problems,
    jobPosts: jobs.jobPosts,
    interviewSessions: interviews.sessions,
    interviewQas: interviews.qas,
    feedbackDocs: [...jobs.feedbackDocs, ...interviews.feedbackDocs],
    bankProblems: buildBankProblems(today),
  }
}
```

- [ ] **Step 4: Write the selectors**

`lib/tour/selectors.ts`:

```ts
import type { CheckinPost } from '@/lib/checkin/types'
import type { CalendarPost } from '@/lib/checkin/calendar'
import { getKstDateString, kstMonthKey } from '@/lib/checkin/time'
import type { CalendarJobPost } from '@/lib/jobposts/calendar'
import type { FeedbackComment } from '@/lib/jobposts/types'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { buildCodingDashboardWidget, findWeekForDate, type CodingDashboardWidget } from '@/lib/coding/dashboard-widget'
import type { CodingWeek } from '@/lib/coding/types'
import { groupQasByAuthor, type InterviewQaGroup } from '@/lib/interviews/grouping'
import type { BankProblemSummary } from '@/lib/problems/types'
import type { TourFixtures } from './fixtures'

/**
 * The /tour counterparts of the real pages' queries: each one shapes fixtures exactly the way
 * the matching Supabase read shapes rows, so the shared views receive identical props.
 */

const CODING_WIDGET_LIMIT = 2

export function checkinPostsOn(fixtures: TourFixtures, kstDate: string): CheckinPost[] {
  return fixtures.checkinPosts.filter((post) => getKstDateString(post.createdAt) === kstDate)
}

export function todaysAuthorIds(fixtures: TourFixtures): string[] {
  return checkinPostsOn(fixtures, fixtures.today).map((post) => post.authorId)
}

/** Like `getMonthlyFines`: this KST month's late fines and manual fines together. */
export function monthFines(fixtures: TourFixtures): { authorId: string; fineAmount: number; paid: boolean }[] {
  const month = kstMonthKey(fixtures.today)
  const inMonth = (iso: string) => kstMonthKey(getKstDateString(iso)) === month

  return [
    ...fixtures.checkinPosts
      .filter((post) => inMonth(post.createdAt))
      .map((post) => ({
        authorId: post.authorId,
        fineAmount: post.fineAmount,
        paid: fixtures.paidPostIds.includes(post.id),
      })),
    ...fixtures.manualFines
      .filter((fine) => inMonth(fine.createdAt))
      .map((fine) => ({ authorId: fine.userId, fineAmount: fine.amount, paid: fine.paid })),
  ]
}

/** Like /checkin/calendar's read, which bounds the month in UTC. */
export function checkinCalendarPosts(fixtures: TourFixtures, year: number, month: number): CalendarPost[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return fixtures.checkinPosts
    .filter((post) => post.createdAt.startsWith(prefix))
    .map((post) => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      createdAt: post.createdAt,
      isLate: post.isLate,
    }))
}

export function jobPostCalendarPosts(fixtures: TourFixtures, year: number, month: number): CalendarJobPost[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  return fixtures.jobPosts
    .filter((post) => post.postDate.startsWith(prefix))
    .map((post) => ({
      id: post.id,
      authorId: post.authorId,
      authorName: post.authorName,
      companyName: post.companyName,
      postDate: post.postDate,
    }))
}

export function codingWidget(fixtures: TourFixtures): CodingDashboardWidget<CodingWeek> {
  const week = findWeekForDate(fixtures.codingWeeks, fixtures.today)
  const problems = week ? fixtures.codingProblems[week.id] ?? [] : []
  const completed = problems
    .filter((problem) => problem.checks.some((check) => check.userId === fixtures.me.id))
    .map((problem) => problem.id)

  return buildCodingDashboardWidget(
    fixtures.codingWeeks,
    problems,
    completed,
    fixtures.me.id,
    fixtures.today,
    CODING_WIDGET_LIMIT
  )
}

export function problemSummaries(fixtures: TourFixtures): BankProblemSummary[] {
  return fixtures.bankProblems
    .map((problem) => ({
      id: problem.id,
      company: problem.company,
      title: problem.title,
      authorName: problem.authorName,
      createdAt: problem.createdAt,
      returnType: problem.signature.returnType,
      paramCount: problem.signature.params.length,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export interface TourFeedbackPage {
  heading: string
  authorName: string
  lines: { index: number; questionIndex: number; question: string; text: string; comments: FeedbackComment[] }[]
}

/** Like /feedback/[id]'s read: lines with their comment trees. `null` for an unknown id. */
export function feedbackPage(fixtures: TourFixtures, id: string): TourFeedbackPage | null {
  const doc = fixtures.feedbackDocs.find((d) => d.id === id)
  if (!doc) return null

  const commentsByLine = groupCommentsByLine(doc.comments)
  return {
    heading: doc.heading,
    authorName: doc.authorName,
    lines: doc.lines.map((line, index) => ({ index, ...line, comments: commentsByLine.get(index) ?? [] })),
  }
}

export function sessionQaGroups(fixtures: TourFixtures, sessionId: string): InterviewQaGroup[] {
  return groupQasByAuthor(fixtures.interviewQas.filter((qa) => qa.sessionId === sessionId))
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run lib/tour`
Expected: PASS (64 tests: 9 invariants × 6 dates, 3 + 3 + 1 bank-problem tests, 1 photo-path test, 2 selector tests).

- [ ] **Step 6: Commit**

```bash
git add lib/tour
git commit -m "feat: add deterministic fixtures for the tour"
```

---

### Task 11: The `/tour` routes

**Suggested model:** sonnet

`/tour` is the intro; the real dashboard (`/`) lives at `/tour/dashboard`. Every page except the intro reads fixtures through `loadTourFixtures()`, which awaits `connection()` before `new Date()` (this Next.js version's prerenderer rejects the reverse; see `markDynamic` in `app/(app)/page.tsx`). List pages wrap that in `<Suspense>`; the three detail pages await at the top level and are covered by the single `app/tour/loading.tsx`, the same way each real detail page has its own `loading.tsx`. The problem list has no "문제 작성" button: authoring is out of scope. The intro's highlight copy was checked against the code (`app/api/github-webhook/route.ts` matches the member by the pusher's GitHub login and the problem by a keyword in the changed file path; `computeLateFine` charges 10,000원 plus 1,000원 per 5 minutes).

**Files:**
- Create: `app/tour/load-fixtures.ts`, `app/tour/layout.tsx`, `app/tour/loading.tsx`, `app/tour/page.tsx`, and `page.tsx` under `app/tour/dashboard/`, `checkin/`, `checkin/calendar/`, `coding/`, `problems/`, `problems/[id]/`, `jobposts/`, `jobposts/calendar/`, `feedback/[id]/`, `interviews/`, `interviews/[sessionId]/`
- Test: `app/tour/tour-pages.test.tsx`

- [ ] **Step 1: Write the failing test**

`app/tour/tour-pages.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/tour/checkin',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import TourLayout from './layout'
import TourIntroPage from './page'
import { TourDashboard } from './dashboard/page'
import { TourCheckinDay } from './checkin/page'
import { TourCheckinCalendar } from './checkin/calendar/page'
import { TourCodingBoard } from './coding/page'
import { TourProblemList } from './problems/page'
import TourProblemDetailPage from './problems/[id]/page'
import { TourJobPostFeed } from './jobposts/page'
import { TourJobPostsCalendar } from './jobposts/calendar/page'
import TourFeedbackPage from './feedback/[id]/page'
import { TourInterviewFeed } from './interviews/page'
import TourInterviewSessionPage from './interviews/[sessionId]/page'

// 2026-10-25 12:00 KST, a Sunday: the last day of coding week 12 (10/19~10/25).
const NOW = new Date('2026-10-25T03:00:00.000Z')

/** Every internal link on a /tour page must stay inside /tour. */
function expectLinksStayInTour(container: HTMLElement) {
  const internal = Array.from(container.querySelectorAll('a[href^="/"]')).map((a) => a.getAttribute('href'))
  expect(internal.length).toBeGreaterThan(0)
  for (const href of internal) {
    expect(href).toMatch(/^\/tour(\/|\?|$)/)
  }
}

describe('/tour pages', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('layout shows the demo banner, the tour tabs and a login link instead of logout', () => {
    render(TourLayout({ children: <p>본문</p> }))

    expect(screen.getByText('체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/tour/dashboard')
    expect(screen.getByRole('link', { name: '인증' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })

  it('intro links every feature card into /tour and points at the public repo', () => {
    const { container } = render(TourIntroPage())

    expect(screen.getByRole('link', { name: /코테 스터디 →/ })).toHaveAttribute('href', '/tour/coding')
    expect(screen.getByRole('link', { name: 'GitHub 저장소' })).toHaveAttribute(
      'href',
      'https://github.com/EdgeOfEmployment/EOESite'
    )
    expectLinksStayInTour(container)
  })

  it('dashboard shows the demo member already checked in, with tour-scoped links', async () => {
    const { container } = render(await TourDashboard())

    expect(screen.getByText('오늘의 10시 인증을 완료했어요!')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '코딩 보드 바로가기' })).toHaveAttribute('href', '/tour/coding?week=tour-week-12')
    expect(screen.getByText('이번 달 벌금 정산')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it("check-in shows today's feed with the post form", async () => {
    const { container } = render(await TourCheckinDay({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월 25일 (오늘)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10시 인증하기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '◀' })).toHaveAttribute('href', '/tour/checkin?date=2026-10-24')
    expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
    expectLinksStayInTour(container)
  })

  it('check-in shows a past day without the post form', async () => {
    render(await TourCheckinDay({ searchParamsPromise: Promise.resolve({ date: '2026-10-20' }) }))

    expect(screen.getByText('2026년 10월 20일')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '10시 인증하기' })).not.toBeInTheDocument()
  })

  it('check-in calendar defaults to the current month', async () => {
    const { container } = render(await TourCheckinCalendar({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('coding board opens on the current week and offers the demo member a manual complete', async () => {
    const { container } = render(await TourCodingBoard({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('12주차 (10/19~10/25)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← 이전 주차' })).toHaveAttribute('href', '/tour/coding?week=tour-week-11')
    expect(screen.getByRole('button', { name: '완료 처리' })).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('problem list filters by the search query and keeps its GET form out of the demo guard', async () => {
    const { container } = render(await TourProblemList({ searchParamsPromise: Promise.resolve({ q: '괄호' }) }))

    const items = within(container.querySelector('ul')!).getAllByRole('link')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('[네이버]-올바른 괄호 문자열')
    const form = container.querySelector('form')!
    expect(form).toHaveAttribute('data-demo-allow')
    expect(form.getAttribute('action')).toBe('/tour/problems')
    expectLinksStayInTour(container)
  })

  it('problem detail renders a fixture problem and 404s on an unknown id', async () => {
    render(await TourProblemDetailPage({ params: Promise.resolve({ id: '7a1d6c2e-0b1f-4c3a-9e57-1f0d2b3c4a02' }) }))
    expect(screen.getByRole('heading', { name: '[네이버]-올바른 괄호 문자열' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '수정' })).not.toBeInTheDocument()

    await expect(TourProblemDetailPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('job post feed links its feedback request into /tour', async () => {
    const { container } = render(await TourJobPostFeed())

    expect(screen.getByRole('link', { name: '피드백 보기' })).toHaveAttribute('href', '/tour/feedback/tour-feedback-toss')
    expectLinksStayInTour(container)
  })

  it('job post calendar defaults to the current month', async () => {
    const { container } = render(await TourJobPostsCalendar({ searchParamsPromise: Promise.resolve({}) }))

    expect(screen.getByText('2026년 10월')).toBeInTheDocument()
    expectLinksStayInTour(container)
  })

  it('feedback page renders the document and 404s on an unknown id', async () => {
    render(await TourFeedbackPage({ params: Promise.resolve({ id: 'tour-feedback-toss' }) }))
    expect(screen.getByRole('heading', { name: '토스 자소서 피드백' })).toBeInTheDocument()

    await expect(TourFeedbackPage({ params: Promise.resolve({ id: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('interview feed links each session into /tour', async () => {
    const { container } = render(await TourInterviewFeed())

    expect(screen.getByRole('link', { name: '기술면접 스터디 (네트워크·DB)' })).toHaveAttribute(
      'href',
      '/tour/interviews/tour-interview-1'
    )
    expectLinksStayInTour(container)
  })

  it('interview session page links each Q&A feedback into /tour', async () => {
    const { container } = render(await TourInterviewSessionPage({ params: Promise.resolve({ sessionId: 'tour-interview-1' }) }))

    expect(screen.getAllByRole('link', { name: '피드백 보기' }).map((a) => a.getAttribute('href')).sort()).toEqual([
      '/tour/feedback/tour-feedback-qa-doyun',
      '/tour/feedback/tour-feedback-qa-me',
    ])
    expectLinksStayInTour(container)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/tour`
Expected: FAIL with `Failed to resolve import "./layout"`.

- [ ] **Step 3: Shared loader, layout and loading boundary**

`app/tour/load-fixtures.ts`:

```ts
import { connection } from 'next/server'
import { getKstDateString } from '@/lib/checkin/time'
import { buildTourFixtures, type TourFixtures } from '@/lib/tour/fixtures'

export const TOUR_BASE_PATH = '/tour'

/**
 * The demo's dates are relative to "today", so every /tour page renders per request.
 * `connection()` comes first because this Next.js version's prerenderer refuses a `new Date()`
 * that is not preceded by a request-time read (see `markDynamic` in app/(app)/page.tsx). With
 * no database behind it, a per-request render costs nothing.
 */
export async function loadTourFixtures(): Promise<TourFixtures> {
  await connection()
  return buildTourFixtures(getKstDateString(new Date().toISOString()))
}
```

`app/tour/layout.tsx`:

```tsx
import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { APP_NAV_LINKS, type NavLink } from '@/components/nav-links'
import { DemoGuard } from '@/components/tour/demo-guard'
import { TOUR_BASE_PATH } from './load-fixtures'

export const metadata: Metadata = {
  title: 'EOE 둘러보기',
  robots: { index: false, follow: false },
}

// Same tabs as the real app, derived from the same list so the two never drift apart.
// The real `/` (dashboard) lives at /tour/dashboard because /tour itself is the intro.
const TOUR_NAV_LINKS: NavLink[] = [
  { href: TOUR_BASE_PATH, label: '소개', exact: true },
  ...APP_NAV_LINKS.map((link) => ({
    ...link,
    href: link.href === '/' ? `${TOUR_BASE_PATH}/dashboard` : `${TOUR_BASE_PATH}${link.href}`,
  })),
]

export default function TourLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoGuard>
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
        체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.
      </div>
      <Suspense fallback={<div className="h-[65px] border-b border-gray-200 dark:border-gray-800" />}>
        <Nav
          links={TOUR_NAV_LINKS}
          trailing={
            <Link href="/login" className="text-sm text-gray-500 dark:text-gray-400">
              로그인
            </Link>
          }
        />
      </Suspense>
      {children}
    </DemoGuard>
  )
}
```

`app/tour/loading.tsx`:

```tsx
import { Skeleton } from '@/components/skeleton'

// One boundary for every /tour page: the detail pages await their params and the fixtures at
// the top level (like the real detail pages, which each have their own loading.tsx), and
// Cache Components requires that kind of request-time read to sit under a Suspense boundary.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Intro page**

`app/tour/page.tsx`:

```tsx
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { TOUR_BASE_PATH } from './load-fixtures'

const REPO_URL = 'https://github.com/EdgeOfEmployment/EOESite'
const AUTHOR_URL = 'https://github.com/Kimd0ng'

const FEATURES = [
  { href: '/dashboard', title: '대시보드', body: '오늘 누가 10시 인증을 했는지, 이번 주 내 코테 문제, 이번 달 벌금 정산을 한 화면에.' },
  { href: '/checkin', title: '10시 인증', body: '책상 사진과 오늘의 목표를 올려요. 10시를 넘기면 지각 벌금이 자동으로 계산돼요.' },
  { href: '/coding', title: '코테 스터디', body: '주차별 문제와 담당자. GitHub에 풀이를 푸시하면 완료 체크가 저절로 찍혀요.' },
  { href: '/problems', title: '문제은행', body: '기출을 복원해 올리면 C·JavaScript·Python·Java 채점 파일을 바로 내려받을 수 있어요.' },
  { href: '/jobposts', title: '자소서 / 공고', body: '1일 1공고 인증과, 문장 단위로 댓글을 다는 자소서 피드백.' },
  { href: '/interviews', title: '모의면접', body: '세션을 열고 참석을 모은 뒤, 받은 질문과 답변에 다시 피드백을 주고받아요.' },
]

const HIGHLIGHTS = [
  {
    title: '승인제 가입 + Postgres RLS',
    body: '가입하면 관리자가 승인할 때까지 대기 화면만 보입니다. 화면 단의 리다이렉트와 별개로, 승인된 멤버만 행을 읽고 쓸 수 있다는 규칙을 DB의 Row Level Security로 한 번 더 강제합니다.',
  },
  {
    title: 'GitHub 푸시 → 코테 자동 체크',
    body: 'GitHub 웹훅의 HMAC 서명을 검증한 뒤, 푸시한 사람의 GitHub 아이디로 멤버를, 바뀐 파일 경로에 든 키워드로 문제를 찾아 완료 처리합니다. 본인이 직접 누른 완료와는 source 컬럼으로 구분해 배지를 다르게 보여줍니다.',
  },
  {
    title: 'Next.js 16 Cache Components로 즉시 이동',
    body: "'use cache'와 태그 단위 무효화로 탭 이동을 즉시 처리합니다. 도입 중 revalidatePath가 같은 경로의 다른 캐시까지 모두 버린다는 사실을 프레임워크 코드에서 찾아내, 쓰기마다 해당 날짜의 태그만 무효화하도록 바꿨습니다.",
  },
  {
    title: '벌금 자동 계산과 정산',
    body: '10시 이후 인증은 기본 10,000원에 5분마다 1,000원씩 붙습니다. 지각 벌금과 관리자가 매긴 벌금을 월별로 합쳐 미납액을 보여줍니다.',
  },
]

const STACK = ['Next.js 16 (App Router, Cache Components)', 'React 19', 'Supabase (Auth · Postgres · Storage)', 'Tailwind CSS 4', 'Vitest · Testing Library · Playwright', 'Vercel']

export default function TourIntroPage() {
  return (
    <PageShell title="EOE 둘러보기">
      <p className="text-gray-700 dark:text-gray-300">
        5~15명 규모 취업 스터디의 매일 10시 인증, 코딩테스트, 자소서 피드백, 모의면접을 한곳에서 운영하는 사이트입니다.
        2026년 7월에 만들기 시작해 실제 스터디에서 쓰고 있어요. 이 둘러보기는 가상의 멤버 6명이 활동 중인 모습을 그대로 보여주며, 무엇을 눌러도 저장되지 않습니다.
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        당신은 가상 멤버 &lsquo;나 (체험)&rsquo;로 로그인한 상태예요.
      </p>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기능 둘러보기</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.href}>
            <Link href={`${TOUR_BASE_PATH}${feature.href}`} className="block h-full">
              <Card className="h-full hover:bg-gray-50 dark:hover:bg-gray-900">
                <p className="font-medium">{feature.title} →</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{feature.body}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
        관리자는 여기에 더해 가입 승인, 벌금 부과와 납부 처리, 코테 주차와 문제 등록을 할 수 있어요.
      </p>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기술적으로 공들인 점</h2>
      <div className="flex flex-col gap-3">
        {HIGHLIGHTS.map((highlight) => (
          <Card key={highlight.title}>
            <p className="font-medium">{highlight.title}</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{highlight.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">기술 스택</h2>
      <ul className="flex flex-wrap gap-2">
        {STACK.map((item) => (
          <li key={item} className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700">
            {item}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-gray-600 dark:text-gray-400">
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">
          GitHub 저장소
        </a>
        {' · 만든 사람 '}
        <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="underline">
          @Kimd0ng
        </a>
      </p>
    </PageShell>
  )
}
```

- [ ] **Step 5: Dashboard and check-in pages**

`app/tour/dashboard/page.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CodingWidgetView, FineTablesView, StatusTableView, TodayAlertView } from '@/app/(app)/dashboard-views'
import { codingWidget, monthFines, todaysAuthorIds } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourDashboardPage() {
  return (
    <PageShell title="대시보드" width="3xl">
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourDashboard />
      </Suspense>
    </PageShell>
  )
}

export async function TourDashboard() {
  const fixtures = await loadTourFixtures()
  const authorIds = todaysAuthorIds(fixtures)

  return (
    <>
      <TodayAlertView posted={authorIds.includes(fixtures.me.id)} />

      <Link
        href={`${TOUR_BASE_PATH}/checkin`}
        className="mt-4 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        인증 보러가기
      </Link>

      <CodingWidgetView widget={codingWidget(fixtures)} basePath={TOUR_BASE_PATH} />
      <StatusTableView members={fixtures.members} todaysAuthorIds={authorIds} />
      <FineTablesView members={fixtures.members} fines={monthFines(fixtures)} />
    </>
  )
}
```

`app/tour/checkin/page.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CheckinFeedView, DayNavView } from '@/app/(app)/checkin/views'
import { resolveSelectedDate } from '@/lib/checkin/date-param'
import { checkinPostsOn } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourCheckinSearchParams = { date?: string }

export default function TourCheckinPage({ searchParams }: { searchParams: Promise<TourCheckinSearchParams> }) {
  return (
    <PageShell
      title="10시 인증"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/checkin/calendar`} className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <TourCheckinDay searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCheckinDay({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCheckinSearchParams>
}) {
  const [{ date }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const selectedDate = resolveSelectedDate(date, fixtures.today)

  return (
    <>
      <DayNavView selectedDate={selectedDate} isToday={selectedDate === fixtures.today} basePath={TOUR_BASE_PATH} />
      <CheckinFeedView posts={checkinPostsOn(fixtures, selectedDate)} currentUserId={fixtures.me.id} isAdmin={false} />
    </>
  )
}
```

`app/tour/checkin/calendar/page.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { CheckinCalendarView } from '@/app/(app)/checkin/calendar/views'
import { checkinCalendarPosts } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

type TourCalendarSearchParams = { year?: string; month?: string; view?: string }

export default function TourCheckinCalendarPage({
  searchParams,
}: {
  searchParams: Promise<TourCalendarSearchParams>
}) {
  return (
    <PageShell
      title="인증 달력"
      width="3xl"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/checkin`} className="text-sm text-gray-500 underline dark:text-gray-400">
          ← 인증으로 돌아가기
        </Link>
      }
    >
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TourCheckinCalendar searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCheckinCalendar({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCalendarSearchParams>
}) {
  const [params, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const [todayYear, todayMonth] = fixtures.today.split('-').map(Number)
  const year = params.year ? Number(params.year) : todayYear
  const month = params.month ? Number(params.month) : todayMonth
  const view = params.view === 'member' ? 'member' : 'date'

  return (
    <CheckinCalendarView
      year={year}
      month={month}
      view={view}
      posts={checkinCalendarPosts(fixtures, year, month)}
      basePath={TOUR_BASE_PATH}
    />
  )
}
```

- [ ] **Step 6: Coding and problem pages**

`app/tour/coding/page.tsx`:

```tsx
import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { GithubSettingsForm } from '@/app/(app)/coding/github-settings-form'
import { CodingBoardView } from '@/app/(app)/coding/views'
import { resolveCurrentWeek } from '@/lib/coding/week'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourCodingSearchParams = { week?: string }

export default function TourCodingPage({ searchParams }: { searchParams: Promise<TourCodingSearchParams> }) {
  return (
    <PageShell title="코테 스터디">
      <GithubSettingsForm currentUsername="eoe-demo" />
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourCodingBoard searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourCodingBoard({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCodingSearchParams>
}) {
  const [{ week }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const { current, prevId, nextId } = resolveCurrentWeek(fixtures.codingWeeks, week)

  return (
    <CodingBoardView
      isAdmin={false}
      members={fixtures.members}
      currentWeek={current}
      prevId={prevId}
      nextId={nextId}
      problems={current ? fixtures.codingProblems[current.id] ?? [] : []}
      currentUserId={fixtures.me.id}
      basePath={TOUR_BASE_PATH}
    />
  )
}
```

`app/tour/problems/page.tsx`:

```tsx
import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { ProblemListView } from '@/app/(app)/problems/views'
import { problemSummaries } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

type TourProblemsSearchParams = { company?: string; q?: string }

// No "문제 작성" button: the authoring form is out of the demo's scope (it is all writes).
export default function TourProblemsPage({ searchParams }: { searchParams: Promise<TourProblemsSearchParams> }) {
  return (
    <PageShell title="문제은행">
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <TourProblemList searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourProblemList({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourProblemsSearchParams>
}) {
  const [{ company = '', q = '' }, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])

  return <ProblemListView problems={problemSummaries(fixtures)} company={company} q={q} basePath={TOUR_BASE_PATH} />
}
```

`app/tour/problems/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { ProblemDetailView } from '@/app/(app)/problems/[id]/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

export default async function TourProblemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const problem = fixtures.bankProblems.find((p) => p.id === id)
  if (!problem) notFound()

  return <ProblemDetailView problem={problem} canManage={false} basePath={TOUR_BASE_PATH} />
}
```

- [ ] **Step 7: Job post and feedback pages**

`app/tour/jobposts/page.tsx`:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { PostForm } from '@/app/(app)/jobposts/post-form'
import { JobPostFeedView } from '@/app/(app)/jobposts/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourJobPostsPage() {
  return (
    <PageShell
      title="자소서 / 공고"
      headerExtra={
        <Link href={`${TOUR_BASE_PATH}/jobposts/calendar`} className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <PostForm />
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
        <TourJobPostFeed />
      </Suspense>
    </PageShell>
  )
}

export async function TourJobPostFeed() {
  const fixtures = await loadTourFixtures()

  return (
    <JobPostFeedView posts={fixtures.jobPosts} currentUserId={fixtures.me.id} isAdmin={false} basePath={TOUR_BASE_PATH} />
  )
}
```

`app/tour/jobposts/calendar/page.tsx`:

```tsx
import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { JobPostsCalendarView } from '@/app/(app)/jobposts/calendar/views'
import { jobPostCalendarPosts } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

type TourCalendarSearchParams = { year?: string; month?: string; view?: string }

export default function TourJobPostsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<TourCalendarSearchParams>
}) {
  return (
    <PageShell title="자소서 달력" width="3xl">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <TourJobPostsCalendar searchParamsPromise={searchParams} />
      </Suspense>
    </PageShell>
  )
}

export async function TourJobPostsCalendar({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<TourCalendarSearchParams>
}) {
  const [params, fixtures] = await Promise.all([searchParamsPromise, loadTourFixtures()])
  const [todayYear, todayMonth] = fixtures.today.split('-').map(Number)
  const year = params.year ? Number(params.year) : todayYear
  const month = params.month ? Number(params.month) : todayMonth
  const view = params.view === 'member' ? 'member' : 'date'

  return (
    <JobPostsCalendarView
      year={year}
      month={month}
      view={view}
      posts={jobPostCalendarPosts(fixtures, year, month)}
      basePath={TOUR_BASE_PATH}
    />
  )
}
```

`app/tour/feedback/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { FeedbackDocView } from '@/app/(app)/feedback/[id]/views'
import { feedbackPage } from '@/lib/tour/selectors'
import { loadTourFixtures } from '../../load-fixtures'

export default async function TourFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const page = feedbackPage(fixtures, id)
  if (!page) notFound()

  return <FeedbackDocView feedbackDocId={id} heading={page.heading} authorName={page.authorName} lines={page.lines} />
}
```

- [ ] **Step 8: Interview pages**

`app/tour/interviews/page.tsx`:

```tsx
import { Suspense } from 'react'
import { PageShell } from '@/components/ui/page-shell'
import { Skeleton } from '@/components/skeleton'
import { SessionForm } from '@/app/(app)/interviews/session-form'
import { InterviewSessionFeedView } from '@/app/(app)/interviews/views'
import { loadTourFixtures, TOUR_BASE_PATH } from '../load-fixtures'

export default function TourInterviewsPage() {
  return (
    <PageShell title="모의면접">
      <SessionForm />
      <Suspense fallback={<Skeleton className="mt-6 h-48 w-full" />}>
        <TourInterviewFeed />
      </Suspense>
    </PageShell>
  )
}

export async function TourInterviewFeed() {
  const fixtures = await loadTourFixtures()

  return (
    <InterviewSessionFeedView
      sessions={fixtures.interviewSessions}
      currentUserId={fixtures.me.id}
      isAdmin={false}
      basePath={TOUR_BASE_PATH}
    />
  )
}
```

`app/tour/interviews/[sessionId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { InterviewSessionView } from '@/app/(app)/interviews/[sessionId]/views'
import { sessionQaGroups } from '@/lib/tour/selectors'
import { loadTourFixtures, TOUR_BASE_PATH } from '../../load-fixtures'

export default async function TourInterviewSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [{ sessionId }, fixtures] = await Promise.all([params, loadTourFixtures()])
  const session = fixtures.interviewSessions.find((s) => s.id === sessionId)
  if (!session) notFound()

  return (
    <InterviewSessionView
      sessionId={session.id}
      title={session.title}
      sessionAt={session.sessionAt}
      description={session.description}
      qaGroups={sessionQaGroups(fixtures, session.id)}
      currentUserId={fixtures.me.id}
      isAdmin={false}
      basePath={TOUR_BASE_PATH}
    />
  )
}
```

- [ ] **Step 9: Run the tests, types and lint**

Run: `npx vitest run app/tour` → PASS (14 tests).
Run: `npx tsc --noEmit` → no output.
Run: `npx eslint app/tour lib/tour components` → no problems.

- [ ] **Step 10: Commit**

```bash
git add app/tour
git commit -m "feat: add the public /tour routes"
```

---

### Task 12: Link to the tour from the login page

**Suggested model:** haiku

**Files:**
- Modify: `app/login/page.tsx`
- Test: `app/login/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```diff
--- a/app/login/page.test.tsx
+++ b/app/login/page.test.tsx
@@ -30,6 +30,15 @@
   })
 })
 
+describe('LoginPage tour link', () => {
+  it('links to the public /tour demo', () => {
+    const ui = LoginPage({ searchParams: Promise.resolve({}) })
+    render(ui)
+
+    expect(screen.getByRole('link', { name: '로그인 없이 둘러보기 →' })).toHaveAttribute('href', '/tour')
+  })
+})
+
 describe('LoginPage TopNotice', () => {
   it('shows an error message when present in search params', async () => {
     const ui = await TopNotice({
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run app/login`
Expected: FAIL (`Unable to find an accessible element with the role "link" and name "로그인 없이 둘러보기 →"`).

- [ ] **Step 3: Add the link**

```diff
--- a/app/login/page.tsx
+++ b/app/login/page.tsx
@@ -41,6 +41,11 @@
           회원가입
         </Link>
       </p>
+      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
+        <Link href="/tour" className="underline">
+          로그인 없이 둘러보기 →
+        </Link>
+      </p>
     </PageShell>
   )
 }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run app/login` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx app/login/page.test.tsx
git commit -m "feat: link the login page to the tour"
```

---

### Task 13: End-to-end check as a logged-out visitor

**Suggested model:** sonnet

The rest of the suite runs as an approved member (`e2e/global-setup.ts`); this file clears that. The key assertion is that clicking writes sends **no POST request at all** (a server action call is always a POST). The toast is located by its text because dnd-kit renders its own empty `role="status"` live region on the check-in page; the test waits for each toast to disappear so a leftover toast cannot satisfy the next step.

**Files:**
- Create: `e2e/tour.spec.ts`

- [ ] **Step 1: Write the spec**

`e2e/tour.spec.ts`:

```ts
import { test, expect, type Page } from '@playwright/test'

// A visitor with no session at all, unlike the rest of the suite (approved member).
test.use({ storageState: { cookies: [], origins: [] } })

/** Every POST the page sends. A server action call is always a POST, so this must stay empty. */
function recordPosts(page: Page): string[] {
  const posts: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(request.url())
  })
  return posts
}

const PAGES: { path: string; heading: string }[] = [
  { path: '/tour', heading: 'EOE 둘러보기' },
  { path: '/tour/dashboard', heading: '대시보드' },
  { path: '/tour/checkin', heading: '10시 인증' },
  { path: '/tour/checkin/calendar', heading: '인증 달력' },
  { path: '/tour/coding', heading: '코테 스터디' },
  { path: '/tour/problems', heading: '문제은행' },
  { path: '/tour/jobposts', heading: '자소서 / 공고' },
  { path: '/tour/jobposts/calendar', heading: '자소서 달력' },
  { path: '/tour/interviews', heading: '모의면접' },
  { path: '/tour/feedback/tour-feedback-toss', heading: '토스 자소서 피드백' },
]

test.describe('public /tour demo', () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders for a logged-out visitor`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`${path.replace(/[/]/g, '\\/')}$`))
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      await expect(page.getByText('체험 모드: 모든 데이터는 가상이며 저장되지 않습니다.')).toBeVisible()
    })
  }

  test('is not indexed by search engines', async ({ page }) => {
    await page.goto('/tour')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('write buttons show the demo toast and never call a server action', async ({ page }) => {
    const posts = recordPosts(page)
    // Filtered by text: dnd-kit renders its own empty role="status" live region on the page.
    const toast = page.getByRole('status').filter({ hasText: '체험 모드에서는 저장되지 않아요' })

    await page.goto('/tour/checkin')

    await page.getByRole('button', { name: /👍/ }).first().click()
    await expect(toast).toBeVisible()
    // Wait for it to go away so the next step cannot pass on a leftover toast.
    await expect(toast).toBeHidden()

    await page.getByPlaceholder('댓글 달기').first().fill('안녕하세요')
    await page.getByRole('button', { name: '등록' }).first().click()
    await expect(toast).toBeVisible()
    await expect(toast).toBeHidden()

    await page.goto('/tour/coding')
    await page.getByRole('button', { name: '완료 처리' }).click()
    await expect(toast).toBeVisible()

    expect(posts).toEqual([])
  })

  test('the problem search form still navigates', async ({ page }) => {
    await page.goto('/tour/problems')
    await page.getByRole('textbox', { name: '검색' }).fill('괄호')
    await page.getByRole('button', { name: '검색' }).click()

    await expect(page).toHaveURL(/\/tour\/problems\?.*q=%EA%B4%84%ED%98%B8/)
    await expect(page.getByText('[네이버]-올바른 괄호 문자열')).toBeVisible()
    await expect(page.getByText('[카카오]-두 배열의 교집합 크기')).not.toBeVisible()
  })

  test('the login page links to the demo', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: '로그인 없이 둘러보기 →' }).click()
    await expect(page).toHaveURL(/\/tour$/)
  })
})
```

- [ ] **Step 2: Run it**

Needs `.env.local` in the worktree root (copy it from the main checkout if missing; it is git-ignored) so the proxy and `e2e/global-setup.ts` start.

Run: `mkdir -p e2e/.auth && npx playwright test e2e/tour.spec.ts --reporter=line`
Expected: 14 passed.

If `next dev` fails to start from the worktree (Turbopack refuses a `node_modules` outside its root), start it yourself with `npx next dev --webpack -H localhost` and rerun; the config reuses a running server.

- [ ] **Step 3: Commit**

```bash
git add e2e/tour.spec.ts
git commit -m "test: e2e check that the tour renders and never writes"
```

---

### Task 14: Swap in the real desk photos

**Suggested model:** haiku · **Blocked until the owner drops 4–6 photos into `public/tour/` as `desk-1.jpg` … (any of jpg/jpeg/png).** If they have not arrived when everything else is done, skip this task and say so; the placeholders are complete on their own.

Phone photos carry EXIF (GPS coordinates, device, time). They must be stripped before the files are committed to a public repository.

**Files:**
- Replace: `public/tour/desk-*.svg` → `public/tour/desk-*.jpg`
- Modify: `lib/tour/fixtures.ts` (`TOUR_DESK_PHOTOS`)

- [ ] **Step 1: Look at each photo first**

Open each one (Read tool) and confirm there is no screen content, name on a parcel or document, or another person's face. If there is, stop and tell the owner which file.

- [ ] **Step 2: Strip metadata and resize**

Run from the worktree root (Pillow is installed; `-I` keeps Python from importing anything from this folder). Re-encoding from pixels drops every EXIF field:

```bash
python -I - <<'EOF'
import glob, os
from PIL import Image, ImageOps

sources = sorted(p for p in glob.glob('public/tour/desk-*') if p.lower().endswith(('.jpg', '.jpeg', '.png')))
for index, path in enumerate(sources, start=1):
    with Image.open(path) as img:
        img = ImageOps.exif_transpose(img).convert('RGB')
        img.thumbnail((1280, 1280))
        clean = Image.new('RGB', img.size)
        clean.putdata(list(img.getdata()))
        target = f'public/tour/desk-{index}.jpg.tmp'
        clean.save(target, 'JPEG', quality=80, optimize=True)
    os.remove(path)
    os.replace(target, f'public/tour/desk-{index}.jpg')
    print(f'desk-{index}.jpg', os.path.getsize(f'public/tour/desk-{index}.jpg'), 'bytes')
EOF
```

Expected: one line per photo, each well under ~300,000 bytes.

- [ ] **Step 3: Prove the metadata is gone**

```bash
python -I -c "import glob; from PIL import Image; print({p: len(Image.open(p).getexif()) for p in sorted(glob.glob('public/tour/desk-*.jpg'))})"
```

Expected: every value is `0`.

- [ ] **Step 4: Point the fixtures at the photos and remove the placeholders**

In `lib/tour/fixtures.ts`, set `TOUR_DESK_PHOTOS` to exactly the `.jpg` files that now exist (`'/tour/desk-1.jpg'`, …), then `git rm public/tour/desk-*.svg`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/tour app/tour` → PASS.

- [ ] **Step 6: Commit**

```bash
git add public/tour lib/tour/fixtures.ts
git commit -m "chore: use real desk photos in the tour (EXIF stripped)"
```

---

### Task 15: Final verification and review

**Suggested model:** **opus**

- [ ] **Step 1: Full unit suite**

Remove merged stray worktrees first if any exist (they make vitest/eslint report false failures), then run: `npx vitest run`
Expected: PASS. Under load, files can hit the 5s timeout; re-run any failed file on its own before calling it a regression.

- [ ] **Step 2: Types and lint**

Run: `npx tsc --noEmit` → no output.
Run: `npx eslint` → only the two problems that already exist on `main` (`feedback-lines.tsx` react-hooks/immutability error, `session-cache.test.ts` unused-var warning).

- [ ] **Step 3: Production build**

Run: `npx next build`
Expected: the route table lists `○ /tour` and `◐` for every other `/tour/*` route. If the build aborts earlier on an unrelated route, a missing `/tour` error proves nothing (the build stops at the first prerender error); fix or report that first. If Turbopack refuses the worktree's parent `node_modules`, run the build from the main checkout after merging instead and say so.

- [ ] **Step 4: E2E**

Run: `npx playwright test e2e/tour.spec.ts --reporter=line` → 14 passed.

- [ ] **Step 5: Whole-feature review (opus)**

Check against the spec, in particular: no `'use cache'`/`cacheTag`/`cacheLife`/query line changed in any real `page.tsx`; `/tour` is the only path added to `ALWAYS_ALLOWED_PATHS`; nothing under `app/tour/` imports `@/lib/supabase/*`; every write path on a tour page is either a form submit (blocked by `DemoGuard`) or the goals-editor save (blocked by `useDemoMode`).

Run: `grep -rn "lib/supabase" app/tour lib/tour` → no output.

- [ ] **Step 6: Before merging, confirm with the owner**

- The intro says "2026년 7월에 만들기 시작해 실제 스터디에서 쓰고 있어요" (first commit 2026-07-29). Confirm or correct it.
- The author line links `@Kimd0ng`. Confirm that is how they want to be credited.
- Whether Task 14 ran (real photos) or the placeholders ship.
