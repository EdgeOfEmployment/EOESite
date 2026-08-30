# Design System & UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's unstyled `create-next-app` scaffold with a designed, consistent UI system (design tokens + 9 shared UI primitives) applied across every page, with a `sm | md | lg` size scale, a clean-productivity-SaaS visual pass (shadows, semantic alert colors, icons), and concrete UX additions: loading feedback on form submission, empty-state messaging, success toasts, and a manual light/dark toggle.

**Architecture:** Add design tokens (accent pair + class-based dark mode) to `app/globals.css`, build 9 presentational/interactive primitives in `components/ui/` and `lib/ui/cn.ts` (Button, Input/Textarea/Select/Label, Card, Alert, PageShell, Spinner, EmptyState, Toast, ThemeToggle — see note below on the count), wire a `?success=` redirect convention into the handful of action files that already redirect on `?error=`, then retrofit all ~20 existing page/component files to use the primitives in place of copy-pasted raw Tailwind classes.

Most retrofits are markup-only, mirroring the original minimal-scope version of this plan — **except** `Button`, `Toast`, and `ThemeToggle`, which are now intentionally interactive client components (see "Behavior-change exception" below). Every other retrofit file remains behavior-identical to today, verified by re-running each file's existing test (all use `getByRole`/`getByText`, not className assertions, so this is safe for everything except the primitive tests and the four `actions.test.ts` files touched by Task 12, which are updated deliberately and are called out explicitly where that happens).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4 (`@theme inline`), Vitest + Testing Library (`@testing-library/react` + `fireEvent`; no `@testing-library/user-event` — it isn't a project dependency, so interaction tests use `fireEvent` like the existing `jobposts/post-form.test.tsx` does).

**Known flake:** before trusting any full `npx vitest run`, confirm `.claude/worktrees/` has no stray worktrees (past false failures traced to this — see project memory). It was empty as of plan-writing time.

**Behavior-change exception:** the original version of this plan required every retrofit to be markup-only with zero behavior change. This version deliberately breaks that rule in three places, because the UX goals it was asked to cover (loading feedback, a persistent theme toggle, success notifications) are impossible to build as pure markup:
- `Button` becomes a `'use client'` component using `useFormStatus` so a submit button shows a spinner and disables itself while its form's action is pending (Task 4).
- `ThemeToggle` is a new interactive client component (Task 11).
- `Toast` is a new interactive client component that reads a `?success=` query param, shows itself, and clears the param after a few seconds (Task 10, wired up by Task 12).

Nothing else changes behavior. Every other primitive and every retrofit page keeps the same server-component, no-new-state shape it had before.

---

## Conventions (read before starting any retrofit task)

These rules resolve every "does this become a primitive?" question so later tasks don't need to re-derive them:

1. **Primary action button** (form submit, confirm actions like 승인/approve): `<Button>` (variant defaults to `primary`).
2. **Secondary action button** (cancel-ish but not destructive-text: "+ 문항 추가", 거부/reject, 강퇴/kick): `<Button variant="secondary">`. Destructive ones add `className="text-red-600 dark:text-red-400"` — safe because `Button`'s secondary variant sets no text color of its own (inherits), so no class-precedence conflict.
3. **Small inline destructive text action** (삭제/취소 appearing as a tiny link inside a card header or list row): stays a plain `<button className="text-xs text-red-600 dark:text-red-400">` — not promoted to `Button`, which is sized for full-width form actions.
4. **Toggle chip** (reaction emoji toggle, 참석하기/참석 취소 attendance toggle): stays raw `<button>`, but its "active" state swaps `bg-black text-white` → `border-accent bg-accent text-accent-foreground`, and its base state gets `border-gray-300 dark:border-gray-700`.
5. **Status pill/badge** (인증 종류 label, 완료/미완료): stays a raw `<span>`, just gets a `dark:bg-*` counterpart added.
6. **Bordered container** → `<Card>`. This covers both content cards (post/problem/session/qa cards) *and* form wrappers (every `rounded border p-4` form uses `<Card as="form" action={...}>`), and list rows that need a border (admin pending/member rows use `<Card as="li" padding="sm">`). Card takes `padding="sm"` (`p-3`, nested question sub-blocks and admin rows), the default `padding="md"` (`p-4`), or `padding="lg"` (`p-6`, roomy standalone cards — not used by any current retrofit snippet, available for future use). Card always carries a subtle `shadow-sm` — that's part of its base look, not a variant.
7. **Form fields**: `<Input>` / `<Textarea>` / `<Select>` / `<Label>`, all exported from `components/ui/input.tsx` — these count as one "Input primitive" family per the agreed primitive scope, since a real form needs all four field types.
8. **Compact single-line inline forms** (comment/reply boxes, the GitHub-username settings row) stay raw `<input>`/`<button>` — NOT swapped to `Input`/`Button` — because those primitives are sized for stacked forms (`py-2`) and would visually bloat a one-line inline row (`py-1`). Only add `dark:border-gray-700` to their existing `border` classes.
9. **Page wrapper** → `<PageShell title="..." width="sm|2xl|3xl" top="default|auth" align="left|center" headerExtra={...}>`. `top="auth"` reproduces the `mt-20` (no `py-8`) used by login/signup/pending. `headerExtra` renders a node next to the `<h1>` (used by checkin/jobposts for the "달력 보기" link).
10. **Status text** (error banners, dashboard 완료/미완료 messages) → `<Alert variant="danger|success|warning">`.
11. **Intentional normalizations** (call these out, don't "fix" them back): all page `<h1>` headings now get a uniform `mb-6` from `PageShell` (a couple of pages previously used `mb-2`/`mb-4`); all form-level action buttons (including admin's approve/reject/kick, previously `py-1`) normalize to `Button`'s sizing. These are deliberate consistency wins of building the system, not bugs.
12. **Size prop** (`sm | md | lg`, default `md`) applies to `Button`, `Input`/`Textarea`/`Select`, and `Card`'s `padding`. Every interactive control keeps a **44px minimum tap target** regardless of size — `Button`/`Input`/`Select` all carry `min-h-11` (44px) unconditionally, with only font-size and horizontal padding shrinking/growing across sizes (`lg` steps up to `min-h-12`/48px, intentionally taller, for standout primary CTAs). `Textarea` is exempt from the height floor — its height is `rows`-driven, so its size variants only change font-size/padding. Use `size="lg"` on a page's single standout primary submit button (로그인, 가입하기, 인증하기, 문제 등록, jobposts/interviews main 등록 buttons, 세션 만들기); leave every other button (secondary actions, toggle-adjacent buttons, admin row actions) at the default `md`.
13. **Alert** variants (`danger`/`success`/`warning`) now render a background + border + small inline decorative SVG icon, not just colored text (e.g. `bg-red-50 border-red-200 text-red-700` in light, `bg-red-950 border-red-900 text-red-400` in dark; green for success, amber for warning). The icon is `aria-hidden="true"` — the message text itself carries the meaning for assistive tech.
14. **Empty list state** → `<EmptyState message="...">` (optionally with an `action` node) instead of a bare `<p className="text-sm text-gray-500">아직 ~ 없습니다</p>`. Only two such paragraphs exist in the current codebase (coding's problem list, admin's pending-signup list) — Tasks 17 and 21 convert exactly those two; no new empty-state coverage is invented elsewhere.
15. **Success toast**: mirrors the existing `?error=<encodeURIComponent(...)>` convention (read server-side via `searchParams`, rendered through `<Alert variant="danger">`) with a parallel `?success=<encodeURIComponent(...)>` param rendered through `<Toast message={success} />`. It is wired **only** onto each page's single primary "create a new top-level item" action — `createCheckinPost`, `createProblem`, `updateGithubUsername`, `createJobPost`, `createSession`, `createInterviewQa` (Task 12) — never onto inline/nested actions (comment replies, reaction toggles, deletes, admin approve/reject). Reasoning: those either have no existing redirect to extend (toggle/delete/admin actions revalidate in place with no navigation today — adding one would be a bigger behavior change than this plan's UX scope calls for) or risk resetting fragile client-only UI state on redirect (e.g. feedback's `FeedbackLines` expanded-thread state) for comparatively low toast value.
16. **Dark mode** is class-based (`.dark` on `<html>`), not `prefers-color-scheme`-only. A blocking inline script in `app/layout.tsx`'s `<head>` sets the initial class before paint (system preference on first visit, `localStorage.theme` afterward). `<ThemeToggle />` in `Nav` flips the class and persists the choice. Every existing and future `dark:` Tailwind utility class throughout the codebase keeps working unchanged — only the *variant strategy* changes (`@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`), not any call site.
17. **Icons** are hand-written inline SVGs, not an icon library — kept deliberately tiny (Alert's three status icons, EmptyState's inbox icon, ThemeToggle's sun/moon, Spinner's ring). No new npm dependency for icons, animation, or toasts.
18. **Animation** is pure CSS (Tailwind's built-in `animate-spin`, `transition-colors`, etc.) — no animation library.
19. **New-behavior test scope**: `Spinner`'s and `Toast`'s *own* rendering (props, ARIA attributes, mount/unmount) gets a normal automated unit test like every other primitive. `Button`'s pending-state behavior (the one genuinely new piece of interactive logic core to a primitive) also gets an automated test. What does **not** get automated tests: a real page's pending-spinner flicker during a live server action, Toast's 3-second auto-dismiss timer, or the dark-toggle's *persistence across a real reload* — those are called out per retrofit task as "manually verify in the browser" instead. `ThemeToggle`'s DOM-class-toggle logic is simple and synchronous enough to unit test directly (Task 11) and is not part of the manual-only list.

---

## File Structure

New files:
- `lib/ui/cn.ts` — tiny className-joining helper (filters falsy values), used by every primitive below.
- `components/ui/spinner.tsx` — `Spinner` (small `animate-spin` SVG, decorative).
- `components/ui/button.tsx` — `Button` (primary/secondary variants, `sm|md|lg` sizes, pending-state spinner via `useFormStatus`). Client component.
- `components/ui/input.tsx` — `Input`, `Textarea`, `Select`, `Label`, all with `sm|md|lg` sizes (Textarea excluded from the tap-target height floor).
- `components/ui/card.tsx` — `Card` (polymorphic `as`, `sm`/`md`/`lg` padding, base `shadow-sm`).
- `components/ui/alert.tsx` — `Alert` (danger/success/warning, now bg+border+icon).
- `components/ui/page-shell.tsx` — `PageShell` (page `<main>` wrapper, optional `<h1>` + header slot).
- `components/ui/empty-state.tsx` — `EmptyState` (message + optional icon + optional action).
- `components/ui/toast.tsx` — `Toast` (client component; reads a `message` prop, shows a fixed bottom-right banner, auto-dismisses, strips the query param). Client component.
- `components/ui/theme-toggle.tsx` — `ThemeToggle` (client component; sun/moon button, toggles `.dark` on `<html>`, persists to `localStorage`). Client component.

Modified files: `app/globals.css`, `app/layout.tsx`, `components/nav.tsx`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/pending/page.tsx`, `app/(app)/page.tsx`, every file under `app/(app)/checkin/`, `app/(app)/coding/`, `app/(app)/jobposts/`, `app/(app)/interviews/`, `app/(app)/feedback/`, `app/(app)/admin/` that currently has raw Tailwind classes (listed per-task below), plus the four action files that gain a `?success=` redirect: `app/(app)/checkin/actions.ts`, `app/(app)/coding/actions.ts`, `app/(app)/jobposts/actions.ts`, `app/(app)/interviews/actions.ts` (and their matching `.test.ts` files — Task 12).

---

### Task 1: Design tokens, class-based dark mode, and site metadata

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Rewrite `app/globals.css` with the accent token pair and class-based dark mode**

Replace the full file with:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
  --accent: #4f46e5;
  --accent-foreground: #ffffff;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
  --accent: #818cf8;
  --accent-foreground: #0a0a0a;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

This is a straight port of the previous `@media (prefers-color-scheme: dark)` block to `.dark` class scoping, plus the `@custom-variant` line that makes every existing/future `dark:` Tailwind utility in the codebase resolve against the `.dark` class instead of the OS media query. No other file needs to change for this to work — `dark:border-gray-700` etc. keep compiling exactly as before, just against a different selector.

- [ ] **Step 2: Update site metadata and add the FOUC-prevention theme script in `app/layout.tsx`**

Replace the full file with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EOE",
  description: "취업 준비 스터디 관리 도구",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

The script must run synchronously in `<head>`, before `<body>` paints, so the page never flashes the wrong theme. It only ever reads `localStorage`/`matchMedia` and toggles a class — nothing here is testable in a meaningful way beyond the manual browser check in Task 22.

- [ ] **Step 3: Sanity-check nothing broke**

Run: `npx vitest run`
Expected: same pass count as before this change (this step is CSS/metadata/script only, no component logic touched).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: add accent design token, class-based dark mode, and real site metadata"
```

---

### Task 2: `cn` utility

**Files:**
- Create: `lib/ui/cn.ts`
- Test: `lib/ui/cn.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/ui/cn.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('joins truthy class names with a space', () => {
    expect(cn('a', 'b')).toBe('a b')
  })

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, '', 'b')).toBe('a b')
  })

  it('returns an empty string when given nothing truthy', () => {
    expect(cn(false, undefined)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ui/cn.test.ts`
Expected: FAIL — Cannot find module './cn' or its type declarations.

- [ ] **Step 3: Implement**

`lib/ui/cn.ts`:

```ts
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/ui/cn.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/ui/cn.ts lib/ui/cn.test.ts
git commit -m "feat: add cn className helper"
```

---

### Task 3: `Spinner` primitive

**Files:**
- Create: `components/ui/spinner.tsx`
- Test: `components/ui/spinner.test.tsx`
- Depends on: Task 2 (`cn`)

- [ ] **Step 1: Write the failing test**

`components/ui/spinner.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Spinner } from './spinner'

describe('Spinner', () => {
  it('is decorative (hidden from assistive tech)', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies the spin animation class', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')).toHaveClass('animate-spin')
  })

  it('merges a caller-provided className', () => {
    const { container } = render(<Spinner className="text-accent-foreground" />)
    expect(container.querySelector('svg')).toHaveClass('text-accent-foreground')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/spinner.test.tsx`
Expected: FAIL — Cannot find module './spinner'.

- [ ] **Step 3: Implement**

`components/ui/spinner.tsx`:

```tsx
import { cn } from '@/lib/ui/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/spinner.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/spinner.tsx components/ui/spinner.test.tsx
git commit -m "feat: add Spinner UI primitive"
```

---

### Task 4: `Button` primitive (sizes + pending state)

**Files:**
- Create: `components/ui/button.tsx`
- Test: `components/ui/button.test.tsx`
- Depends on: Task 1 (accent token), Task 2 (`cn`), Task 3 (`Spinner`)

**Verified assumption:** every `<Button type="submit">` in this codebase (existing and in this plan's retrofit snippets — checked login/signup, checkin/coding/jobposts/interviews forms, admin's approve/reject/kick forms) is always rendered as a descendant of the exact `<form>`/`<Card as="form">` it belongs to, with exactly one submit button per form. That's the precondition `useFormStatus` needs to report the *right* form's pending state — no spot in this codebase renders a submit button outside its own form.

- [ ] **Step 1: Write the failing test**

`components/ui/button.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './button'

describe('Button', () => {
  it('renders children and forwards the type attribute', () => {
    render(<Button type="submit">저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('applies the accent background by default (primary variant)', () => {
    render(<Button>확인</Button>)
    expect(screen.getByRole('button', { name: '확인' })).toHaveClass('bg-accent')
  })

  it('applies an outline style for the secondary variant', () => {
    render(<Button variant="secondary">취소</Button>)
    const button = screen.getByRole('button', { name: '취소' })
    expect(button).toHaveClass('border')
    expect(button).not.toHaveClass('bg-accent')
  })

  it('merges a caller-provided className', () => {
    render(<Button className="self-start">등록</Button>)
    expect(screen.getByRole('button', { name: '등록' })).toHaveClass('self-start')
  })

  it('keeps a 44px minimum tap target at every size', () => {
    const { rerender } = render(<Button size="sm">작게</Button>)
    expect(screen.getByRole('button', { name: '작게' })).toHaveClass('min-h-11')
    rerender(<Button size="lg">크게</Button>)
    expect(screen.getByRole('button', { name: '크게' })).toHaveClass('min-h-12')
  })

  it('shows a spinner and disables itself while its enclosing form is submitting', async () => {
    let resolveAction: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      resolveAction = resolve
    })

    render(
      <form action={() => pending}>
        <Button type="submit">제출</Button>
      </form>
    )

    fireEvent.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('로딩 중')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()

    resolveAction()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: FAIL — Cannot find module './button'.

- [ ] **Step 3: Implement**

`components/ui/button.tsx`:

```tsx
'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { cn } from '@/lib/ui/cn'
import { Spinner } from './spinner'

type ButtonVariant = 'primary' | 'secondary'
type ButtonSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-12 px-4 py-2.5 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  type,
  disabled,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus()
  const showPending = type === 'submit' && pending

  return (
    <button
      type={type}
      disabled={disabled || showPending}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
        SIZE_CLASSES[size],
        variant === 'primary'
          ? 'bg-accent text-accent-foreground hover:bg-accent/90'
          : 'border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900',
        className
      )}
      {...props}
    >
      {showPending && (
        <>
          <Spinner className="h-4 w-4" />
          <span className="sr-only">로딩 중</span>
        </>
      )}
      {children}
    </button>
  )
}
```

`useFormStatus` is safe to call unconditionally even when `Button` isn't inside a `<form>` (e.g. the "+ 문항 추가" `type="button"`) — React returns a default `{ pending: false, ... }` status object in that case, and `showPending` is gated on `type === 'submit'` regardless.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/button.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/button.tsx components/ui/button.test.tsx
git commit -m "feat: add Button UI primitive with sizes and pending state"
```

---

### Task 5: `Input` / `Textarea` / `Select` / `Label` primitives (sizes)

**Files:**
- Create: `components/ui/input.tsx`
- Test: `components/ui/input.test.tsx`
- Depends on: Task 2 (`cn`)

- [ ] **Step 1: Write the failing test**

`components/ui/input.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input, Textarea, Select, Label } from './input'

describe('Input', () => {
  it('renders an input and forwards props', () => {
    render(<Input placeholder="이메일" />)
    expect(screen.getByPlaceholderText('이메일')).toBeInTheDocument()
  })

  it('keeps a 44px minimum tap target at every size', () => {
    const { rerender } = render(<Input placeholder="sm" size="sm" />)
    expect(screen.getByPlaceholderText('sm')).toHaveClass('min-h-11')
    rerender(<Input placeholder="lg" size="lg" />)
    expect(screen.getByPlaceholderText('lg')).toHaveClass('min-h-12')
  })
})

describe('Textarea', () => {
  it('renders a textarea and forwards props', () => {
    render(<Textarea placeholder="내용" />)
    expect(screen.getByPlaceholderText('내용')).toBeInTheDocument()
  })

  it('does not force a height floor (rows-driven instead)', () => {
    render(<Textarea placeholder="내용" size="sm" />)
    expect(screen.getByPlaceholderText('내용')).not.toHaveClass('min-h-11')
  })
})

describe('Select', () => {
  it('renders a select with its options', () => {
    render(
      <Select defaultValue="a">
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})

describe('Label', () => {
  it('associates with a field via htmlFor', () => {
    render(
      <>
        <Label htmlFor="name">이름</Label>
        <Input id="name" />
      </>
    )
    expect(screen.getByLabelText('이름')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/input.test.tsx`
Expected: FAIL — Cannot find module './input'.

- [ ] **Step 3: Implement**

`components/ui/input.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { cn } from '@/lib/ui/cn'

type FieldSize = 'sm' | 'md' | 'lg'

const FIELD_SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'min-h-11 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-12 px-4 py-2.5 text-base',
}

const TEXTAREA_SIZE_CLASSES: Record<FieldSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

const baseFieldClassName =
  'w-full rounded border border-gray-300 bg-transparent placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-accent dark:border-gray-700 dark:placeholder:text-gray-500'

type InputProps = Omit<ComponentProps<'input'>, 'size'> & { size?: FieldSize }
type SelectProps = Omit<ComponentProps<'select'>, 'size'> & { size?: FieldSize }

export function Input({ size = 'md', className, ...props }: InputProps) {
  return <input className={cn(baseFieldClassName, FIELD_SIZE_CLASSES[size], className)} {...props} />
}

export function Textarea({
  size = 'md',
  className,
  ...props
}: ComponentProps<'textarea'> & { size?: FieldSize }) {
  return <textarea className={cn(baseFieldClassName, TEXTAREA_SIZE_CLASSES[size], className)} {...props} />
}

export function Select({ size = 'md', className, ...props }: SelectProps) {
  return <select className={cn(baseFieldClassName, FIELD_SIZE_CLASSES[size], className)} {...props} />
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />
}
```

`size` is omitted from the native `input`/`select` prop types before being redeclared as the `FieldSize` union — the native `size` attribute (a number, for character width) isn't used anywhere in this codebase, so shadowing it is safe. `Textarea` has no native `size` attribute, so no `Omit` is needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/input.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/input.tsx components/ui/input.test.tsx
git commit -m "feat: add Input, Textarea, Select, Label UI primitives with sizes"
```

---

### Task 6: `Card` primitive (padding scale + shadow)

**Files:**
- Create: `components/ui/card.tsx`
- Test: `components/ui/card.test.tsx`
- Depends on: Task 2 (`cn`)

- [ ] **Step 1: Write the failing test**

`components/ui/card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './card'

describe('Card', () => {
  it('renders as a div by default', () => {
    render(<Card data-testid="card">내용</Card>)
    expect(screen.getByTestId('card').tagName).toBe('DIV')
  })

  it('renders as the element passed via "as"', () => {
    render(
      <Card as="article" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card').tagName).toBe('ARTICLE')
  })

  it('uses smaller padding when padding="sm"', () => {
    render(
      <Card padding="sm" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card')).toHaveClass('p-3')
    expect(screen.getByTestId('card')).not.toHaveClass('p-4')
  })

  it('uses roomier padding when padding="lg"', () => {
    render(
      <Card padding="lg" data-testid="card">
        내용
      </Card>
    )
    expect(screen.getByTestId('card')).toHaveClass('p-6')
  })

  it('applies a subtle shadow by default', () => {
    render(<Card data-testid="card">내용</Card>)
    expect(screen.getByTestId('card')).toHaveClass('shadow-sm')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/card.test.tsx`
Expected: FAIL — Cannot find module './card'.

- [ ] **Step 3: Implement**

`components/ui/card.tsx`:

```tsx
import type { ElementType, ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/ui/cn'

type CardTag = 'div' | 'article' | 'form' | 'li'
type CardPadding = 'sm' | 'md' | 'lg'

const PADDING_CLASSES: Record<CardPadding, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

type CardProps<T extends CardTag> = {
  as?: T
  padding?: CardPadding
  className?: string
} & Omit<ComponentPropsWithoutRef<T>, 'className'>

export function Card<T extends CardTag = 'div'>({
  as,
  padding = 'md',
  className,
  ...props
}: CardProps<T>) {
  const Component = (as ?? 'div') as ElementType
  return (
    <Component
      className={cn(
        'rounded-lg border border-gray-200 shadow-sm dark:border-gray-800',
        PADDING_CLASSES[padding],
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/card.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/card.tsx components/ui/card.test.tsx
git commit -m "feat: add Card UI primitive with padding scale and shadow"
```

---

### Task 7: `Alert` primitive (background + border + icon)

**Files:**
- Create: `components/ui/alert.tsx`
- Test: `components/ui/alert.test.tsx`
- Depends on: Task 2 (`cn`)

- [ ] **Step 1: Write the failing test**

`components/ui/alert.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Alert } from './alert'

describe('Alert', () => {
  it('renders its message', () => {
    render(<Alert variant="danger">문제가 발생했습니다</Alert>)
    expect(screen.getByText('문제가 발생했습니다')).toBeInTheDocument()
  })

  it('applies red background/border/text for the danger variant', () => {
    render(<Alert variant="danger">에러</Alert>)
    const container = screen.getByText('에러').closest('div')
    expect(container).toHaveClass('bg-red-50')
    expect(container).toHaveClass('border-red-200')
    expect(container).toHaveClass('text-red-700')
  })

  it('applies green background for the success variant', () => {
    render(<Alert variant="success">완료</Alert>)
    expect(screen.getByText('완료').closest('div')).toHaveClass('bg-green-50')
  })

  it('applies amber background for the warning variant', () => {
    render(<Alert variant="warning">주의</Alert>)
    expect(screen.getByText('주의').closest('div')).toHaveClass('bg-amber-50')
  })

  it('renders a decorative icon alongside the message', () => {
    const { container } = render(<Alert variant="danger">에러</Alert>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

Note: this changes the assertion shape from the original minimal-scope version (`getByText(...)` used to carry the color class directly on the `<p>`; now the color classes live on the wrapping `<div>`, so tests use `.closest('div')`). This is an intentional part of the redesign, not a regression.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/alert.test.tsx`
Expected: FAIL — Cannot find module './alert'.

- [ ] **Step 3: Implement**

`components/ui/alert.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

type AlertVariant = 'danger' | 'success' | 'warning'

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  danger: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400',
  success:
    'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400',
  warning:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400',
}

function AlertIcon({ variant }: { variant: AlertVariant }) {
  const shared = 'h-4 w-4 shrink-0'

  if (variant === 'success') {
    return (
      <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
        />
      </svg>
    )
  }

  if (variant === 'warning') {
    return (
      <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M8.3 3.1c.7-1.2 2.7-1.2 3.4 0l6.3 11a2 2 0 01-1.7 3H3.7a2 2 0 01-1.7-3l6.3-11zM10 7a1 1 0 00-1 1v3a1 1 0 002 0V8a1 1 0 00-1-1zm0 7.5a1 1 0 100 2 1 1 0 000-2z"
        />
      </svg>
    )
  }

  return (
    <svg className={shared} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.7 7.3a1 1 0 00-1.4 1.4L8.6 10l-1.3 1.3a1 1 0 101.4 1.4L10 11.4l1.3 1.3a1 1 0 001.4-1.4L11.4 10l1.3-1.3a1 1 0 00-1.4-1.4L10 8.6 8.7 7.3z"
      />
    </svg>
  )
}

export function Alert({
  variant,
  className,
  children,
}: {
  variant: AlertVariant
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', VARIANT_CLASSES[variant], className)}>
      <AlertIcon variant={variant} />
      <p>{children}</p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/alert.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/alert.tsx components/ui/alert.test.tsx
git commit -m "feat: redesign Alert with background, border, and status icon"
```

---

### Task 8: `PageShell` primitive

**Files:**
- Create: `components/ui/page-shell.tsx`
- Test: `components/ui/page-shell.test.tsx`
- Depends on: Task 2 (`cn`)

Unchanged from the original minimal-scope plan — no size/decoration/UX change applies to this primitive.

- [ ] **Step 1: Write the failing test**

`components/ui/page-shell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageShell } from './page-shell'

describe('PageShell', () => {
  it('renders a heading when title is provided', () => {
    render(<PageShell title="대시보드">내용</PageShell>)
    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument()
  })

  it('renders headerExtra next to the title', () => {
    render(
      <PageShell title="인증" headerExtra={<a href="/checkin/calendar">달력 보기</a>}>
        내용
      </PageShell>
    )
    expect(screen.getByRole('link', { name: '달력 보기' })).toBeInTheDocument()
  })

  it('renders children without a title when none is given', () => {
    render(<PageShell>본문만</PageShell>)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByText('본문만')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/page-shell.test.tsx`
Expected: FAIL — Cannot find module './page-shell'.

- [ ] **Step 3: Implement**

`components/ui/page-shell.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

type PageShellWidth = 'sm' | '2xl' | '3xl'

const WIDTH_CLASSES: Record<PageShellWidth, string> = {
  sm: 'max-w-sm',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
}

export function PageShell({
  title,
  headerExtra,
  width = '2xl',
  top = 'default',
  align = 'left',
  className,
  children,
}: {
  title?: string
  headerExtra?: ReactNode
  width?: PageShellWidth
  top?: 'default' | 'auth'
  align?: 'left' | 'center'
  className?: string
  children: ReactNode
}) {
  return (
    <main
      className={cn(
        'mx-auto px-6',
        WIDTH_CLASSES[width],
        top === 'auth' ? 'mt-20' : 'py-8',
        align === 'center' && 'text-center',
        className
      )}
    >
      {title && (
        <div className={cn('mb-6 flex items-center', headerExtra && 'justify-between')}>
          <h1 className="text-2xl font-bold">{title}</h1>
          {headerExtra}
        </div>
      )}
      {children}
    </main>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/page-shell.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/page-shell.tsx components/ui/page-shell.test.tsx
git commit -m "feat: add PageShell UI primitive"
```

---

### Task 9: `EmptyState` primitive

**Files:**
- Create: `components/ui/empty-state.tsx`
- Test: `components/ui/empty-state.test.tsx`
- Depends on: Task 2 (`cn`)

- [ ] **Step 1: Write the failing test**

`components/ui/empty-state.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="아직 등록된 문제가 없습니다." />)
    expect(screen.getByText('아직 등록된 문제가 없습니다.')).toBeInTheDocument()
  })

  it('renders an optional action', () => {
    render(<EmptyState message="없습니다" action={<button>추가하기</button>} />)
    expect(screen.getByRole('button', { name: '추가하기' })).toBeInTheDocument()
  })

  it('omits the action slot when none is given', () => {
    render(<EmptyState message="없습니다" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/empty-state.test.tsx`
Expected: FAIL — Cannot find module './empty-state'.

- [ ] **Step 3: Implement**

`components/ui/empty-state.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/ui/cn'

export function EmptyState({
  message,
  action,
  className,
}: {
  message: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400',
        className
      )}
    >
      <svg
        className="h-8 w-8 text-gray-300 dark:text-gray-600"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 7l1.5-3h15L21 7M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7M3 7h18M8 11h8"
        />
      </svg>
      <p>{message}</p>
      {action}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/empty-state.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/empty-state.tsx components/ui/empty-state.test.tsx
git commit -m "feat: add EmptyState UI primitive"
```

---

### Task 10: `Toast` primitive

**Files:**
- Create: `components/ui/toast.tsx`
- Test: `components/ui/toast.test.tsx`
- Depends on: Task 2 (`cn`)

Per Convention 19 / 15, this primitive's own render/mount behavior gets a light automated test; the 3-second auto-dismiss timer and query-param cleanup are verified manually in each retrofit task and in Task 22, not with fake timers here.

- [ ] **Step 1: Write the failing test**

`components/ui/toast.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  usePathname: () => '/checkin',
  useRouter: () => ({ replace: vi.fn() }),
}))

import { Toast } from './toast'

describe('Toast', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<Toast message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message when provided', () => {
    render(<Toast message="등록되었습니다" />)
    expect(screen.getByRole('status')).toHaveTextContent('등록되었습니다')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/toast.test.tsx`
Expected: FAIL — Cannot find module './toast'.

- [ ] **Step 3: Implement**

`components/ui/toast.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const DISMISS_AFTER_MS = 3000

export function Toast({ message }: { message?: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(Boolean(message))

  useEffect(() => {
    if (!message) return

    // Re-arms visibility when a new message arrives after a previous toast
    // already dismissed itself (visible=false) — the initial-render case is
    // already covered by useState's initializer, so this only fires on change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(true)
    const dismissTimer = setTimeout(() => setVisible(false), DISMISS_AFTER_MS)
    const cleanupTimer = setTimeout(() => router.replace(pathname, { scroll: false }), DISMISS_AFTER_MS + 200)

    return () => {
      clearTimeout(dismissTimer)
      clearTimeout(cleanupTimer)
    }
  }, [message, pathname, router])

  if (!message || !visible) return null

  return (
    <div
      role="status"
      className="fixed bottom-4 right-4 z-50 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 shadow-sm dark:border-green-900 dark:bg-green-950 dark:text-green-400"
    >
      {message}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/toast.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/toast.tsx components/ui/toast.test.tsx
git commit -m "feat: add Toast UI primitive"
```

---

### Task 11: `ThemeToggle` primitive

**Files:**
- Create: `components/ui/theme-toggle.tsx`
- Test: `components/ui/theme-toggle.test.tsx`
- Depends on: Task 1 (the `.dark` class strategy it toggles)

- [ ] **Step 1: Write the failing test**

`components/ui/theme-toggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './theme-toggle'

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    window.localStorage.clear()
  })

  it('adds the dark class and persists the choice when toggled from light', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(window.localStorage.getItem('theme')).toBe('dark')
  })

  it('removes the dark class and persists the choice when toggled from dark', () => {
    document.documentElement.classList.add('dark')
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(window.localStorage.getItem('theme')).toBe('light')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/theme-toggle.test.tsx`
Expected: FAIL — Cannot find module './theme-toggle'.

- [ ] **Step 3: Implement**

`components/ui/theme-toggle.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

function SunIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 15a5 5 0 100-10 5 5 0 000 10zM10 0a1 1 0 011 1v1a1 1 0 11-2 0V1a1 1 0 011-1zm0 17a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM3.1 3.1a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zm11.7 11.7a1 1 0 011.4 0l.7.7a1 1 0 01-1.4 1.4l-.7-.7a1 1 0 010-1.4zM0 10a1 1 0 011-1h1a1 1 0 110 2H1a1 1 0 01-1-1zm17 0a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM3.1 16.9a1 1 0 010-1.4l.7-.7a1 1 0 111.4 1.4l-.7.7a1 1 0 01-1.4 0zm11.7-11.7a1 1 0 010-1.4l.7-.7a1 1 0 111.4 1.4l-.7.7a1 1 0 01-1.4 0z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M17.3 13.4A8 8 0 016.6 2.7a8 8 0 1010.7 10.7z" />
    </svg>
  )
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Reads the class Task 1's blocking pre-hydration script already set on <html>.
    // Can't be a lazy useState initializer: this component is server-rendered too
    // (no `document`), so the effect is the only SSR-safe place to read it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
    setIsDark(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className="flex h-11 w-11 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/theme-toggle.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add components/ui/theme-toggle.tsx components/ui/theme-toggle.test.tsx
git commit -m "feat: add ThemeToggle UI primitive"
```

---

### Task 12: Wire the `?success=` redirect convention into action files

**Files:**
- Modify: `app/(app)/checkin/actions.ts` (+ `app/(app)/checkin/actions.test.ts`)
- Modify: `app/(app)/coding/actions.ts` (+ `app/(app)/coding/actions.test.ts`)
- Modify: `app/(app)/jobposts/actions.ts` (+ `app/(app)/jobposts/actions.test.ts`)
- Modify: `app/(app)/interviews/actions.ts` (+ `app/(app)/interviews/actions.test.ts`)
- Depends on: none of the UI primitives directly (this only touches server actions); pairs with Task 10 (`Toast`) for the retrofit tasks that render it.

Per Convention 15, only each page's single primary "create a new top-level item" action gets a success redirect: `createCheckinPost`, `createProblem`, `updateGithubUsername`, `createJobPost`, `createSession`, `createInterviewQa`. Every other action (comment/reply, reaction toggle, delete, participation toggle, admin approve/reject/kick, `updateGithubUsername`'s sibling `deleteProblem`/`adminRemoveCheck`) is untouched — they have no existing redirect to extend and stay exactly as they are today.

**Important test-mechanics note:** in every `*.actions.test.ts` file in this codebase, `redirect` from `next/navigation` is mocked to *throw* (`vi.fn((url) => { throw new Error('REDIRECT:' + url) })`), matching real Next.js behavior. Today, the success path of each action above resolves normally (`await fn(formData)` with no `.rejects`) because it never calls `redirect` on success. Adding a success-path redirect means those specific existing "creates successfully" test cases must change from a plain `await fn(...)` into `await expect(fn(...)).rejects.toThrow()`, with a new assertion added for the `redirect` call — the assertions on `insertMock`/`revalidatePathMock` that already exist in those tests keep working unchanged, because they fire *before* the new `redirect(...)` call (which is now the very last thing to run before the successful `return`).

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts" "app/(app)/coding/actions.test.ts" "app/(app)/jobposts/actions.test.ts" "app/(app)/interviews/actions.test.ts"`
Expected: note current pass count as baseline.

- [ ] **Step 2: `app/(app)/checkin/actions.ts` — add success redirect to `createCheckinPost`**

At the end of `createCheckinPost`, replace:

```ts
  revalidatePath('/checkin')
  revalidatePath('/')
}
```

with:

```ts
  revalidatePath('/checkin')
  revalidatePath('/')
  redirect('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
}
```

Update `app/(app)/checkin/actions.test.ts`: the two `createCheckinPost` success tests ("creates a post without a photo..." / "...with a photo...") change from `await createCheckinPost(formData)` to `await expect(createCheckinPost(formData)).rejects.toThrow()`, and each gains:

```ts
expect(redirectMock).toHaveBeenCalledWith('/checkin?success=' + encodeURIComponent('인증을 등록했어요'))
```

- [ ] **Step 3: `app/(app)/coding/actions.ts` — add success redirects to `createProblem` and `updateGithubUsername`**

At the end of `createProblem`, after `revalidatePath('/coding')`, add:

```ts
  redirect('/coding?success=' + encodeURIComponent('문제를 등록했어요'))
```

At the end of `updateGithubUsername`, after `revalidatePath('/coding')`, add:

```ts
  redirect('/coding?success=' + encodeURIComponent('GitHub 아이디를 저장했어요'))
```

Update `app/(app)/coding/actions.test.ts` the same way as Step 2 for each function's success test case(s).

- [ ] **Step 4: `app/(app)/jobposts/actions.ts` — add success redirect to `createJobPost`**

At the end of `createJobPost`, after the final `revalidatePath('/jobposts')`, add:

```ts
  redirect('/jobposts?success=' + encodeURIComponent('자소서를 등록했어요'))
```

(This sits after the conditional `feedback_docs` insert block, so it only fires once the whole creation — post plus optional feedback doc — has actually succeeded.)

Update `app/(app)/jobposts/actions.test.ts` the same way for `createJobPost`'s success case(s).

- [ ] **Step 5: `app/(app)/interviews/actions.ts` — add success redirects to `createSession` and `createInterviewQa`**

At the end of `createSession`, after `revalidatePath('/interviews')`, add:

```ts
  redirect('/interviews?success=' + encodeURIComponent('세션을 만들었어요'))
```

At the end of `createInterviewQa`, after `revalidatePath(`/interviews/${sessionId}`)`, add:

```ts
  redirect(`/interviews/${sessionId}?success=` + encodeURIComponent('답변을 등록했어요'))
```

Update `app/(app)/interviews/actions.test.ts` the same way for both functions' success case(s). (`app/(app)/interviews/[sessionId]/actions.ts` just re-exports from `../actions` and needs no change.)

- [ ] **Step 6: Re-run tests**

Run: `npx vitest run "app/(app)/checkin/actions.test.ts" "app/(app)/coding/actions.test.ts" "app/(app)/jobposts/actions.test.ts" "app/(app)/interviews/actions.test.ts"`
Expected: same pass count as the Step 1 baseline (test *bodies* changed for the success cases listed above, but no tests were added or removed).

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/checkin/actions.ts" "app/(app)/checkin/actions.test.ts" "app/(app)/coding/actions.ts" "app/(app)/coding/actions.test.ts" "app/(app)/jobposts/actions.ts" "app/(app)/jobposts/actions.test.ts" "app/(app)/interviews/actions.ts" "app/(app)/interviews/actions.test.ts"
git commit -m "feat: add success redirects for primary create actions"
```

---

## Retrofit tasks (Tasks 13-21)

Each retrofit task follows this pattern:

1. Run the existing test file(s) for the files being touched, note the pass count (baseline).
2. Replace each file's content with the new version below.
3. Re-run the same test file(s); pass count must be identical to the baseline (unless a step explicitly says otherwise, e.g. an `EmptyState` swap changing what text is rendered).
4. Manually verify in the browser anything called out as manual-only (pending spinner, toast, dark toggle — see Task 22 for the full checklist; individual tasks call out only what's new to that page).
5. Commit.

All retrofit tasks depend on Tasks 1-12 being complete.

---

### Task 13: Retrofit `Nav` (+ `ThemeToggle`)

**Files:**
- Modify: `components/nav.tsx`
- Test (run only, unchanged): `components/nav.test.tsx`
- Depends on: Task 11 (`ThemeToggle`)

- [ ] **Step 1: Run baseline test**

Run: `npx vitest run components/nav.test.tsx`
Expected: PASS (2 tests) — note this as baseline.

- [ ] **Step 2: Replace `components/nav.tsx`**

```tsx
import Link from 'next/link'
import { logOut } from '@/lib/auth/logout'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const links = [
  { href: '/checkin', label: '인증' },
  { href: '/coding', label: '코테 스터디' },
  { href: '/jobposts', label: '자소서/공고' },
  { href: '/interviews', label: '모의면접' },
]

export function Nav() {
  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
      <div className="flex gap-4">
        <Link href="/" className="font-bold">
          홈
        </Link>
        {links.map((link) => (
          <Link key={link.href} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <form action={logOut}>
          <button type="submit" className="text-sm text-gray-500 dark:text-gray-400">
            로그아웃
          </button>
        </form>
      </div>
    </nav>
  )
}
```

- [ ] **Step 3: Re-run test**

Run: `npx vitest run components/nav.test.tsx`
Expected: PASS (2 tests) — `ThemeToggle`'s button has no accessible name collision with existing assertions since the test file only checks for the nav links/logout button by name.

- [ ] **Step 4: Manually verify in the browser**

Click the new sun/moon button in the nav: the page should flip between light/dark instantly, and reloading the page should keep the chosen theme (this persistence-across-reload behavior is not covered by an automated test — see Convention 19).

- [ ] **Step 5: Commit**

```bash
git add components/nav.tsx
git commit -m "style: apply design tokens to Nav and add theme toggle"
```

---

### Task 14: Retrofit auth pages (login, signup, pending)

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/signup/page.tsx`
- Modify: `app/pending/page.tsx`
- Tests (run only, unchanged): `app/login/page.test.tsx`, `app/signup/page.test.tsx`, `app/pending/page.test.tsx`

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run app/login/page.test.tsx app/signup/page.test.tsx app/pending/page.test.tsx`
Expected: PASS (7 tests total) — note as baseline.

- [ ] **Step 2: Replace `app/login/page.tsx`**

```tsx
import Link from 'next/link'
import { logIn } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <PageShell title="로그인" width="sm" top="auth">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <Card as="form" action={logIn} className="flex flex-col gap-4">
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required />
        <Button type="submit" size="lg">
          로그인
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="underline">
          회원가입
        </Link>
      </p>
    </PageShell>
  )
}
```

This login snippet uses `next/link`'s `Link` (not a plain `<a>`) for the `/signup` cross-link, matching the site's existing internal-navigation convention (commit `5e3c808`, "use next/link for internal navigation instead of `<a>` tags" — prefetching/client-side transitions). Keep this consistent when retrofitting.

- [ ] **Step 3: Replace `app/signup/page.tsx`**

```tsx
import Link from 'next/link'
import { signUp } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <PageShell title="회원가입" width="sm" top="auth">
      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <Card as="form" action={signUp} className="flex flex-col gap-4">
        <Label htmlFor="name" className="sr-only">
          이름
        </Label>
        <Input id="name" name="name" placeholder="이름" required />
        <Label htmlFor="email" className="sr-only">
          이메일
        </Label>
        <Input id="email" name="email" type="email" placeholder="이메일" required />
        <Label htmlFor="password" className="sr-only">
          비밀번호
        </Label>
        <Input id="password" name="password" type="password" placeholder="비밀번호" required minLength={6} />
        <Button type="submit" size="lg">
          가입하기
        </Button>
      </Card>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="underline">
          로그인
        </Link>
      </p>
    </PageShell>
  )
}
```

- [ ] **Step 4: Replace `app/pending/page.tsx`**

```tsx
import { PageShell } from '@/components/ui/page-shell'

export default function PendingPage() {
  return (
    <PageShell title="승인 대기 중입니다" width="sm" top="auth" align="center">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        관리자가 가입 신청을 승인하면 서비스를 이용하실 수 있습니다.
      </p>
    </PageShell>
  )
}
```

- [ ] **Step 5: Re-run tests**

Run: `npx vitest run app/login/page.test.tsx app/signup/page.test.tsx app/pending/page.test.tsx`
Expected: PASS (7 tests total)

- [ ] **Step 6: Manually verify in the browser**

Submit the login/signup forms with something that keeps the request pending for a moment (e.g. throttle network in devtools) and confirm the button shows a spinner + disables itself instead of allowing a double-submit.

- [ ] **Step 7: Commit**

```bash
git add app/login/page.tsx app/signup/page.tsx app/pending/page.tsx
git commit -m "style: apply design system to auth pages"
```

---

### Task 15: Retrofit dashboard

**Files:**
- Modify: `app/(app)/page.tsx`
- Test (run only, unchanged): `app/(app)/page.test.tsx`

Unchanged from the original minimal-scope plan — no size/EmptyState/Toast applies here (the dashboard has no create-form and its member table isn't a "list that can be empty" in the EmptyState sense).

- [ ] **Step 1: Run baseline test**

Run: `npx vitest run "app/(app)/page.test.tsx"`
Expected: PASS (3 tests) — note as baseline.

- [ ] **Step 2: Replace `app/(app)/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { buildTodayStatus, getMissingTypes, CHECKIN_TYPES } from '@/lib/checkin/status'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

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
    <PageShell title="대시보드" width="3xl">
      {missingTypes.length > 0 ? (
        <Alert variant="warning">
          오늘 아직 {missingTypes.map((t) => CHECKIN_TYPE_LABELS[t]).join(', ')} 인증을 하지 않았어요.
        </Alert>
      ) : (
        <Alert variant="success">오늘의 인증을 모두 완료했어요!</Alert>
      )}

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-gray-200 p-2 text-left dark:border-gray-800">멤버</th>
            {CHECKIN_TYPES.map((type) => (
              <th key={type} className="border border-gray-200 p-2 dark:border-gray-800">
                {CHECKIN_TYPE_LABELS[type]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statusRows.map((row) => (
            <tr key={row.member.id}>
              <td className="border border-gray-200 p-2 dark:border-gray-800">{row.member.name}</td>
              {CHECKIN_TYPES.map((type) => (
                <td key={type} className="border border-gray-200 p-2 text-center dark:border-gray-800">
                  {row.completed[type] ? '✅' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
```

- [ ] **Step 3: Re-run test**

Run: `npx vitest run "app/(app)/page.test.tsx"`
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "style: apply design system to dashboard"
```

---

### Task 16: Retrofit checkin (page, post-card, post-form, calendar)

**Files:**
- Modify: `app/(app)/checkin/page.tsx`
- Modify: `app/(app)/checkin/post-card.tsx`
- Modify: `app/(app)/checkin/post-form.tsx`
- Modify: `app/(app)/checkin/calendar/page.tsx`
- Tests: `app/(app)/checkin/page.test.tsx` (needs one small addition, see note below), `app/(app)/checkin/post-card.test.tsx`, `app/(app)/checkin/post-form.test.tsx`, `app/(app)/checkin/calendar/page.test.tsx` (these three: run only, unchanged)
- Depends on: Task 10 (`Toast`), Task 12 (`?success=` on `createCheckinPost`)

**Test-mechanics note (discovered during execution, applies to every later task that wires `<Toast>` into a page — Tasks 17/18/19 too):** `Toast` calls `useRouter()`/`usePathname()` from `next/navigation`, which throws outside an App Router test context. `page.test.tsx` doesn't otherwise need to know about routing, so add the same `vi.mock('next/navigation', ...)` block already used in `components/ui/toast.test.tsx` (`usePathname: () => '<this page's own path>'`, `useRouter: () => ({ replace: vi.fn() })`) to the top of `page.test.tsx` — this is a one-time addition, not a pass-count change (still "run only" in spirit, just needs this one mock to keep passing once `<Toast>` is actually rendered).

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/checkin"`
Expected: note current pass count as baseline (this directory-wide pattern also picks up `calendar/page.test.tsx`).

- [ ] **Step 2: Replace `app/(app)/checkin/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { CheckinPost, CheckinType } from '@/lib/checkin/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
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

  const [{ data: comments }, { data: reactions }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase
        .from('checkin_comments')
        .select('id, post_id, author_id, body, created_at')
        .in('post_id', postIds)
        .order('created_at', { ascending: true })
    ),
    queryIfAny(postIds, () =>
      supabase.from('checkin_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
  ])

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
    <PageShell
      title="인증"
      headerExtra={
        <Link href="/checkin/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {checkinPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
```

- [ ] **Step 3: Replace `app/(app)/checkin/post-card.tsx`**

```tsx
import { CHECKIN_TYPE_LABELS, REACTION_EMOJIS, type CheckinPost } from '@/lib/checkin/types'
import { addComment, toggleReaction, deleteCheckinPost } from './actions'
import { Card } from '@/components/ui/card'

export function PostCard({
  post,
  currentUserId,
  isAdmin,
}: {
  post: CheckinPost
  currentUserId: string
  isAdmin: boolean
}) {
  return (
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium dark:bg-gray-800">
            {CHECKIN_TYPE_LABELS[post.type]}
          </span>
          <span className="font-medium">{post.authorName}</span>
        </div>
        {isAdmin && (
          <form action={deleteCheckinPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm">{post.body}</p>

      {post.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.photoUrl} alt="인증 사진" className="mt-2 max-h-64 rounded object-cover" />
      )}

      <div className="mt-3 flex gap-2">
        {REACTION_EMOJIS.map((emoji) => {
          const count = post.reactions.filter((r) => r.emoji === emoji).length
          const reacted = post.reactions.some((r) => r.emoji === emoji && r.authorId === currentUserId)
          return (
            <form key={emoji} action={toggleReaction.bind(null, post.id, emoji)}>
              <button
                type="submit"
                className={`rounded border px-2 py-1 text-xs ${
                  reacted
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {emoji}
                {count > 0 ? ` ${count}` : ''}
              </button>
            </form>
          )
        })}
      </div>

      <ul className="mt-3 flex flex-col gap-1">
        {post.comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <span className="font-medium">{comment.authorName}</span> {comment.body}
          </li>
        ))}
      </ul>

      <form action={addComment.bind(null, post.id)} className="mt-2 flex gap-2">
        <input
          name="body"
          placeholder="댓글 달기"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700"
        />
        <button type="submit" className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700">
          등록
        </button>
      </form>
    </Card>
  )
}
```

(Unchanged from the original plan — `addComment` deliberately did not gain a `?success=` redirect, per Convention 15, so this file has no `Toast` involvement.)

- [ ] **Step 4: Replace `app/(app)/checkin/post-form.tsx`**

```tsx
import { createCheckinPost } from './actions'
import { CHECKIN_TYPE_LABELS } from '@/lib/checkin/types'
import { Card } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function PostForm() {
  return (
    <Card as="form" action={createCheckinPost} className="flex flex-col gap-3">
      <Select name="type" required defaultValue="">
        <option value="" disabled>
          인증 종류 선택
        </option>
        {Object.entries(CHECKIN_TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Textarea name="body" placeholder="오늘의 인증 내용을 남겨주세요" required />
      <input type="file" name="photo" accept="image/*" className="text-sm" />
      <Button type="submit" size="lg" className="self-start">
        인증하기
      </Button>
    </Card>
  )
}
```

- [ ] **Step 5: Replace `app/(app)/checkin/calendar/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarPost } from '@/lib/checkin/calendar'
import { CHECKIN_TYPE_LABELS, type CheckinType } from '@/lib/checkin/types'
import { PageShell } from '@/components/ui/page-shell'

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
    <PageShell title={`인증 달력 (${year}년 ${month}월)`} width="3xl">
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`/checkin/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
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
              <ul className="mt-1 flex flex-col gap-0.5 text-sm text-gray-600 dark:text-gray-400">
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
    </PageShell>
  )
}
```

- [ ] **Step 6: Re-run tests**

Run: `npx vitest run "app/(app)/checkin"`
Expected: same pass count as the Step 1 baseline.

- [ ] **Step 7: Manually verify in the browser**

Submit the check-in form and confirm: the submit button shows a spinner while pending; on success a green "인증을 등록했어요" toast appears bottom-right and disappears after ~3 seconds; the URL's `?success=` param is gone after the toast clears (refreshing doesn't re-show it).

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/checkin"
git commit -m "style: apply design system to checkin pages"
```

---

### Task 17: Retrofit coding (page, github-settings-form, problem-card, problem-form)

**Files:**
- Modify: `app/(app)/coding/page.tsx`
- Modify: `app/(app)/coding/github-settings-form.tsx`
- Modify: `app/(app)/coding/problem-card.tsx`
- Modify: `app/(app)/coding/problem-form.tsx`
- Tests: `app/(app)/coding/page.test.tsx` (needs the `next/navigation` mock — see Task 16's note), `app/(app)/coding/github-settings-form.test.tsx`, `app/(app)/coding/problem-card.test.tsx`, `app/(app)/coding/problem-form.test.tsx` (these three: run only, unchanged)
- Depends on: Task 9 (`EmptyState`), Task 10 (`Toast`), Task 12 (`?success=` on `createProblem`/`updateGithubUsername`)

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/coding"`
Expected: note current pass count as baseline.

- [ ] **Step 2: Replace `app/(app)/coding/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { groupByWeek, formatWeekLabel } from '@/lib/coding/week'
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
      .select('id, title, link, week_of, created_by, created_at')
      .order('week_of', { ascending: false }),
  ])

  const isAdmin = session?.role === 'admin'
  const members: Member[] = (profiles ?? []).map((p) => ({ id: p.id, name: p.name as string }))

  const problemIds = (problems ?? []).map((p) => p.id)

  const { data: checks } = await queryIfAny(problemIds, () =>
    supabase.from('coding_checks').select('problem_id, user_id').in('problem_id', problemIds)
  )

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
    <PageShell title="코테 스터디">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
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

- [ ] **Step 3: Replace `app/(app)/coding/github-settings-form.tsx`**

```tsx
import { updateGithubUsername } from './actions'
import { Card } from '@/components/ui/card'

export function GithubSettingsForm({ currentUsername }: { currentUsername: string | null }) {
  return (
    <Card as="form" action={updateGithubUsername} className="mb-6 flex items-center gap-2 text-sm">
      <label htmlFor="githubUsername" className="whitespace-nowrap font-medium">
        내 GitHub 아이디
      </label>
      <input
        id="githubUsername"
        name="githubUsername"
        placeholder="GitHub 아이디"
        defaultValue={currentUsername ?? ''}
        required
        className="flex-1 rounded border border-gray-300 px-3 py-1 dark:border-gray-700"
      />
      <button type="submit" className="rounded border border-gray-300 px-3 py-1 dark:border-gray-700">
        저장
      </button>
    </Card>
  )
}
```

(Unchanged — this stays a compact inline form per Convention 8, so it keeps raw `<input>`/`<button>` rather than `Input`/`Button`, even though `updateGithubUsername` now redirects with `?success=`.)

- [ ] **Step 4: Replace `app/(app)/coding/problem-card.tsx`**

```tsx
import type { CodingProblem, Member } from '@/lib/coding/types'
import { adminRemoveCheck, deleteProblem } from './actions'
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
        {members.map((member) => {
          const checked = problem.checkedUserIds.includes(member.id)
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
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
```

- [ ] **Step 5: Replace `app/(app)/coding/problem-form.tsx`**

```tsx
import { createProblem } from './actions'
import { getMostRecentTuesday } from '@/lib/coding/week'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function ProblemForm() {
  const defaultWeek = getMostRecentTuesday(new Date())

  return (
    <Card as="form" action={createProblem} className="flex flex-col gap-3">
      <Label htmlFor="title" className="sr-only">
        문제명
      </Label>
      <Input id="title" name="title" placeholder="문제명" required />
      <Label htmlFor="link" className="sr-only">
        문제 링크
      </Label>
      <Input id="link" name="link" type="url" placeholder="문제 링크" required />
      <Label htmlFor="weekOf" className="sr-only">
        대상 주차
      </Label>
      <Input id="weekOf" name="weekOf" type="date" defaultValue={defaultWeek} required />
      <Label htmlFor="matchKeyword" className="sr-only">
        저장소 매칭 키워드 (선택)
      </Label>
      <Input id="matchKeyword" name="matchKeyword" placeholder="저장소 매칭 키워드 (선택, 비우면 문제명 사용)" />
      <Button type="submit" size="lg" className="self-start">
        문제 등록
      </Button>
    </Card>
  )
}
```

- [ ] **Step 6: Re-run tests**

Run: `npx vitest run "app/(app)/coding"`
Expected: same pass count as the Step 1 baseline, **except** `page.test.tsx` — if it has a test asserting the old text `아직 등록된 문제가 없습니다.` via `getByText`, that assertion still passes (`EmptyState` renders the same string), so the count should in fact stay identical; only revisit this if a test specifically asserted the *absence* of a decorative icon or similar, which none currently do.

- [ ] **Step 7: Manually verify in the browser**

Submit a new problem (as admin) and confirm the spinner-then-toast flow, same as Task 16. With zero problems registered, confirm the dashed-border `EmptyState` box (with inbox icon) renders instead of the old bare paragraph.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/coding"
git commit -m "style: apply design system to coding pages"
```

---

### Task 18: Retrofit jobposts (page, post-card, post-form, calendar)

**Files:**
- Modify: `app/(app)/jobposts/page.tsx`
- Modify: `app/(app)/jobposts/post-card.tsx`
- Modify: `app/(app)/jobposts/post-form.tsx`
- Modify: `app/(app)/jobposts/calendar/page.tsx`
- Tests: `app/(app)/jobposts/page.test.tsx` (needs the `next/navigation` mock — see Task 16's note), `app/(app)/jobposts/post-card.test.tsx`, `app/(app)/jobposts/post-form.test.tsx`, `app/(app)/jobposts/calendar/page.test.tsx` (these three: run only, unchanged)
- Depends on: Task 10 (`Toast`), Task 12 (`?success=` on `createJobPost`)

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/jobposts"`
Expected: note current pass count as baseline (this directory-wide pattern also picks up `calendar/page.test.tsx`).

- [ ] **Step 2: Replace `app/(app)/jobposts/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { PostForm } from './post-form'
import { PostCard } from './post-card'
import type { JobPost } from '@/lib/jobposts/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

export default async function JobPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
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

  const [{ data: reactions }, { data: feedbackDocs }] = await Promise.all([
    queryIfAny(postIds, () =>
      supabase.from('job_post_reactions').select('id, post_id, author_id, emoji').in('post_id', postIds)
    ),
    queryIfAny(postIds, () =>
      supabase.from('feedback_docs').select('id, job_post_id').in('job_post_id', postIds)
    ),
  ])

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
    <PageShell
      title="자소서 / 공고"
      headerExtra={
        <Link href="/jobposts/calendar" className="text-sm text-gray-500 underline dark:text-gray-400">
          달력 보기
        </Link>
      }
    >
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <PostForm />
      <ul className="mt-6 flex flex-col gap-4">
        {jobPosts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
```

- [ ] **Step 3: Replace `app/(app)/jobposts/post-card.tsx`**

```tsx
import Link from 'next/link'
import { REACTION_EMOJIS } from '@/lib/checkin/types'
import type { JobPost } from '@/lib/jobposts/types'
import { toggleReaction, deleteJobPost } from './actions'
import { Card } from '@/components/ui/card'

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
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">{post.companyName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{post.authorName}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{post.postDate}</span>
        </div>
        {isAdmin && (
          <form action={deleteJobPost.bind(null, post.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {post.postingInfo && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{post.postingInfo}</p>
      )}

      <div className="flex flex-col gap-3">
        {post.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{q.question}</p>
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
                className={`rounded border px-2 py-1 text-xs ${
                  reacted
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-gray-300 dark:border-gray-700'
                }`}
              >
                {emoji}
                {count > 0 ? ` ${count}` : ''}
              </button>
            </form>
          )
        })}
      </div>

      {post.feedbackDocId && (
        <Link
          href={`/feedback/${post.feedbackDocId}`}
          className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
        >
          피드백 보기
        </Link>
      )}
    </Card>
  )
}
```

- [ ] **Step 4: Replace `app/(app)/jobposts/post-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createJobPost } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <Card as="form" action={createJobPost} className="flex flex-col gap-3">
      <Label htmlFor="companyName" className="sr-only">
        회사명
      </Label>
      <Input id="companyName" name="companyName" placeholder="회사명" required />
      <Label htmlFor="postingInfo" className="sr-only">
        공고 정보
      </Label>
      <Textarea id="postingInfo" name="postingInfo" placeholder="공고 링크/정보 (선택)" />

      <input type="hidden" name="questionCount" value={questions.length} />

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <Card key={index} padding="sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">문항 {index + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  삭제
                </button>
              )}
            </div>
            <Label htmlFor={`question-${index}`} className="sr-only">
              질문
            </Label>
            <Input
              id={`question-${index}`}
              name={`question-${index}`}
              placeholder="질문 (예: 지원동기를 작성해주세요)"
              required
              value={q.question}
              onChange={(e) => updateQuestion(index, 'question', e.target.value)}
              className="mb-2"
            />
            <Label htmlFor={`answer-${index}`} className="sr-only">
              답변
            </Label>
            <Textarea
              id={`answer-${index}`}
              name={`answer-${index}`}
              placeholder="답변"
              required
              rows={5}
              value={q.answer}
              onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
            />
          </Card>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addQuestion} className="self-start">
        + 문항 추가
      </Button>

      <Label htmlFor="postDate" className="sr-only">
        날짜
      </Label>
      <Input id="postDate" name="postDate" type="date" defaultValue={today} required />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="feedbackRequested" />
        피드백 받고 싶어요
      </label>
      <Button type="submit" size="lg" className="self-start">
        등록
      </Button>
    </Card>
  )
}
```

- [ ] **Step 5: Replace `app/(app)/jobposts/calendar/page.tsx`**

```tsx
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { buildMonthCalendar, groupPostsByMember, type CalendarJobPost } from '@/lib/jobposts/calendar'
import { PageShell } from '@/components/ui/page-shell'

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
    <PageShell title={`자소서 달력 (${year}년 ${month}월)`} width="3xl">
      <div className="mb-4 flex gap-3 text-sm">
        <Link
          href={`/jobposts/calendar?year=${year}&month=${month}&view=date`}
          className={view === 'date' ? 'font-bold underline' : ''}
        >
          날짜별
        </Link>
        <Link
          href={`/jobposts/calendar?year=${year}&month=${month}&view=member`}
          className={view === 'member' ? 'font-bold underline' : ''}
        >
          멤버별
        </Link>
      </div>

      {view === 'date' ? (
        <table className="w-full table-fixed border-collapse text-center text-sm">
          <tbody>
            {buildMonthCalendar(year, month, calendarPosts).map((week, i) => (
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
          {groupPostsByMember(calendarPosts).map((member) => (
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
    </PageShell>
  )
}
```

- [ ] **Step 6: Re-run tests**

Run: `npx vitest run "app/(app)/jobposts"`
Expected: same pass count as the Step 1 baseline.

- [ ] **Step 7: Manually verify in the browser**

Submit a new job post (with at least one question/answer) and confirm the spinner-then-toast flow.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/jobposts"
git commit -m "style: apply design system to jobposts pages"
```

---

### Task 19: Retrofit interviews (page, session-card, session-form, session detail, qa-card, qa-form)

**Files:**
- Modify: `app/(app)/interviews/page.tsx`
- Modify: `app/(app)/interviews/session-card.tsx`
- Modify: `app/(app)/interviews/session-form.tsx`
- Modify: `app/(app)/interviews/[sessionId]/page.tsx`
- Modify: `app/(app)/interviews/[sessionId]/qa-card.tsx`
- Modify: `app/(app)/interviews/[sessionId]/qa-form.tsx`
- Tests: `app/(app)/interviews/page.test.tsx` AND `app/(app)/interviews/[sessionId]/page.test.tsx` (both render `<Toast>` in this task — both need the `next/navigation` mock, see Task 16's note), `app/(app)/interviews/session-card.test.tsx`, `app/(app)/interviews/session-form.test.tsx`, `app/(app)/interviews/[sessionId]/qa-card.test.tsx`, `app/(app)/interviews/[sessionId]/qa-form.test.tsx` (these four: run only, unchanged)
- Depends on: Task 10 (`Toast`), Task 12 (`?success=` on `createSession`/`createInterviewQa`)

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/interviews"`
Expected: note current pass count as baseline.

- [ ] **Step 2: Replace `app/(app)/interviews/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { SessionForm } from './session-form'
import { SessionCard } from './session-card'
import type { InterviewSession } from '@/lib/interviews/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

export default async function InterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { error: queryError, success } = await searchParams
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

  const { data: participants } = await queryIfAny(sessionIds, () =>
    supabase.from('interview_participants').select('id, session_id, user_id').in('session_id', sessionIds)
  )

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
    <PageShell title="모의면접">
      <Toast message={success} />
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <SessionForm />
      <ul className="mt-6 flex flex-col gap-4">
        {interviewSessions.map((s) => (
          <li key={s.id}>
            <SessionCard session={s} currentUserId={session!.userId} isAdmin={isAdmin} />
          </li>
        ))}
      </ul>
    </PageShell>
  )
}
```

- [ ] **Step 3: Replace `app/(app)/interviews/session-card.tsx`**

```tsx
import Link from 'next/link'
import type { InterviewSession } from '@/lib/interviews/types'
import { toggleParticipation, deleteSession } from './actions'
import { Card } from '@/components/ui/card'

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
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Link href={`/interviews/${session.id}`} className="font-medium underline">
            {session.title}
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-400">{session.sessionAt}</p>
        </div>
        {canDelete && (
          <form action={deleteSession.bind(null, session.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      {session.description && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{session.description}</p>
      )}

      <form action={toggleParticipation.bind(null, session.id)} className="flex items-center gap-2">
        <button
          type="submit"
          className={`rounded border px-2 py-1 text-xs ${
            isParticipating
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-gray-300 dark:border-gray-700'
          }`}
        >
          {isParticipating ? '참석 취소' : '참석하기'}
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {`참석 ${session.participants.length}명${
            session.participants.length > 0
              ? ` (${session.participants.map((p) => p.userName).join(', ')})`
              : ''
          }`}
        </span>
      </form>
    </Card>
  )
}
```

- [ ] **Step 4: Replace `app/(app)/interviews/session-form.tsx`**

```tsx
import { createSession } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function SessionForm() {
  return (
    <Card as="form" action={createSession} className="flex flex-col gap-3">
      <Label htmlFor="title" className="sr-only">
        세션 제목
      </Label>
      <Input id="title" name="title" placeholder="세션 제목" required />

      <Label htmlFor="sessionAt">일시</Label>
      <Input id="sessionAt" name="sessionAt" type="datetime-local" required />

      <Label htmlFor="description" className="sr-only">
        설명
      </Label>
      <Textarea id="description" name="description" placeholder="장소/링크 등 (선택)" />

      <Button type="submit" size="lg" className="self-start">
        세션 만들기
      </Button>
    </Card>
  )
}
```

- [ ] **Step 5: Replace `app/(app)/interviews/[sessionId]/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getSessionProfile } from '@/lib/auth/session'
import { queryIfAny } from '@/lib/supabase/query-if-any'
import { QaForm } from './qa-form'
import { QaCard } from './qa-card'
import { groupQasByAuthor } from '@/lib/interviews/grouping'
import type { InterviewQa } from '@/lib/interviews/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'
import { Toast } from '@/components/ui/toast'

export default async function InterviewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>
  searchParams: Promise<{ error?: string; success?: string }>
}) {
  const { sessionId } = await params
  const { error: queryError, success } = await searchParams
  const supabase = await createClient()

  const [caller, { data: session }, { data: profiles }, { data: qas }] = await Promise.all([
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

  const isAdmin = caller?.role === 'admin'

  if (!session) {
    redirect('/interviews?error=' + encodeURIComponent('존재하지 않는 세션입니다'))
    return
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name as string]))

  const qaIds = (qas ?? []).map((q) => q.id)

  const { data: feedbackDocs } = await queryIfAny(qaIds, () =>
    supabase.from('feedback_docs').select('id, interview_qa_id').in('interview_qa_id', qaIds)
  )

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
    <PageShell title={session.title}>
      <Toast message={success} />
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{session.session_at}</p>
      {session.description && (
        <p className="mb-6 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{session.description}</p>
      )}
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
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
                  <QaCard qa={qa} currentUserId={caller!.userId} isAdmin={isAdmin} />
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

- [ ] **Step 6: Replace `app/(app)/interviews/[sessionId]/qa-card.tsx`**

```tsx
import Link from 'next/link'
import type { InterviewQa } from '@/lib/interviews/types'
import { deleteInterviewQa } from './actions'
import { Card } from '@/components/ui/card'

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
    <Card as="article">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">{qa.authorName}</span>
        {canDelete && (
          <form action={deleteInterviewQa.bind(null, qa.sessionId, qa.id)}>
            <button type="submit" className="text-xs text-red-600 dark:text-red-400">
              삭제
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {qa.questions.map((q, index) => (
          <div key={index}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{q.question}</p>
            <p className="whitespace-pre-wrap text-sm">{q.answer}</p>
          </div>
        ))}
      </div>

      <Link
        href={`/feedback/${qa.feedbackDocId}`}
        className="mt-3 inline-block text-sm text-gray-500 underline dark:text-gray-400"
      >
        피드백 보기
      </Link>
    </Card>
  )
}
```

- [ ] **Step 7: Replace `app/(app)/interviews/[sessionId]/qa-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { createInterviewQa } from './actions'
import { Card } from '@/components/ui/card'
import { Input, Textarea, Label } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <Card as="form" action={createInterviewQa.bind(null, sessionId)} className="flex flex-col gap-3">
      <input type="hidden" name="questionCount" value={questions.length} />

      <div className="flex flex-col gap-3">
        {questions.map((q, index) => (
          <Card key={index} padding="sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">문항 {index + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(index)}
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  삭제
                </button>
              )}
            </div>
            <Label htmlFor={`question-${index}`} className="sr-only">
              질문
            </Label>
            <Input
              id={`question-${index}`}
              name={`question-${index}`}
              placeholder="받은 질문"
              required
              value={q.question}
              onChange={(e) => updateQuestion(index, 'question', e.target.value)}
              className="mb-2"
            />
            <Label htmlFor={`answer-${index}`} className="sr-only">
              답변
            </Label>
            <Textarea
              id={`answer-${index}`}
              name={`answer-${index}`}
              placeholder="내 답변"
              required
              rows={5}
              value={q.answer}
              onChange={(e) => updateQuestion(index, 'answer', e.target.value)}
            />
          </Card>
        ))}
      </div>

      <Button type="button" variant="secondary" onClick={addQuestion} className="self-start">
        + 문항 추가
      </Button>

      <Button type="submit" size="lg" className="self-start">
        등록
      </Button>
    </Card>
  )
}
```

- [ ] **Step 8: Re-run tests**

Run: `npx vitest run "app/(app)/interviews"`
Expected: same pass count as the Step 1 baseline.

- [ ] **Step 9: Manually verify in the browser**

Create a session and submit a Q&A within it; confirm the spinner-then-toast flow on both.

- [ ] **Step 10: Commit**

```bash
git add "app/(app)/interviews"
git commit -m "style: apply design system to interviews pages"
```

---

### Task 20: Retrofit feedback (page, comment-thread, feedback-lines)

**Files:**
- Modify: `app/(app)/feedback/[id]/page.tsx`
- Modify: `app/(app)/feedback/[id]/comment-thread.tsx`
- Modify: `app/(app)/feedback/[id]/feedback-lines.tsx`
- Tests (run only, unchanged): `app/(app)/feedback/[id]/page.test.tsx`, `app/(app)/feedback/[id]/comment-thread.test.tsx`, `app/(app)/feedback/[id]/feedback-lines.test.tsx`

No `Toast`/`?success=` here — `addFeedbackComment` intentionally keeps its current no-redirect-on-success behavior (Convention 15) because a redirect would reset `FeedbackLines`'s client-side `expandedIndex` state, collapsing whatever comment thread the user just replied in.

- [ ] **Step 1: Run baseline tests**

Run: `npx vitest run "app/(app)/feedback"`
Expected: note current pass count as baseline.

- [ ] **Step 2: Replace `app/(app)/feedback/[id]/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { groupCommentsByLine } from '@/lib/jobposts/comments'
import { FeedbackLines, type FeedbackLineWithComments } from './feedback-lines'
import type { FeedbackLine } from '@/lib/jobposts/types'
import { PageShell } from '@/components/ui/page-shell'
import { Alert } from '@/components/ui/alert'

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
    <PageShell title={heading} width="3xl">
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">작성자: {authorName}</p>
      {queryError && (
        <Alert variant="danger" className="mb-4">
          {queryError}
        </Alert>
      )}
      <FeedbackLines feedbackDocId={id} lines={feedbackLines} />
    </PageShell>
  )
}
```

- [ ] **Step 3: Replace `app/(app)/feedback/[id]/comment-thread.tsx`**

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
        <ul className="ml-4 border-l border-gray-200 pl-2 dark:border-gray-800">
          {comment.replies.map((reply) => (
            <CommentNode key={reply.id} feedbackDocId={feedbackDocId} lineIndex={lineIndex} comment={reply} />
          ))}
        </ul>
      )}
      <form
        action={addFeedbackComment.bind(null, feedbackDocId, lineIndex, comment.id)}
        className="ml-4 mt-1 flex gap-2"
      >
        <input
          name="body"
          placeholder="답글"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
        />
        <button type="submit" className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700">
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
        <input
          name="body"
          placeholder="댓글 추가"
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700"
        />
        <button type="submit" className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-700">
          등록
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Replace `app/(app)/feedback/[id]/feedback-lines.tsx`**

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
            {isNewQuestion && (
              <h2 className="mb-1 mt-4 text-sm font-semibold text-gray-700 dark:text-gray-300">{line.question}</h2>
            )}
            <div
              className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-sm ${
                expanded ? 'border border-accent' : 'border border-transparent'
              }`}
            >
              <span className="text-xs text-gray-400 dark:text-gray-500">{displayNumber}</span>
              <p className="flex-1 whitespace-pre-wrap">{line.text}</p>
              <button
                type="button"
                onClick={() => toggle(line.index)}
                className="shrink-0 text-xs text-gray-500 dark:text-gray-400"
              >
                {commentCount > 0 ? `💬 ${commentCount}` : '+'}
              </button>
            </div>
            {expanded && (
              <div className="ml-4 mb-2 rounded border border-accent/40 p-3">
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

- [ ] **Step 5: Re-run tests**

Run: `npx vitest run "app/(app)/feedback"`
Expected: same pass count as the Step 1 baseline.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/feedback"
git commit -m "style: apply design system to feedback pages"
```

---

### Task 21: Retrofit admin page

**Files:**
- Modify: `app/(app)/admin/page.tsx`
- Test (run only, unchanged): `app/(app)/admin/page.test.tsx`
- Depends on: Task 9 (`EmptyState`)

No `Toast`/`?success=` here — `approveUser`/`rejectUser` have no existing redirect to extend (Convention 15).

- [ ] **Step 1: Run baseline test**

Run: `npx vitest run "app/(app)/admin"`
Expected: note current pass count as baseline.

- [ ] **Step 2: Replace `app/(app)/admin/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server'
import { approveUser, rejectUser } from './actions'
import { PageShell } from '@/components/ui/page-shell'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

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
    <PageShell title="관리자 페이지">
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">가입 대기 ({pendingList.length})</h2>
        {pendingList.length === 0 ? (
          <EmptyState message="대기 중인 가입 신청이 없습니다." />
        ) : (
          <ul className="flex flex-col gap-3">
            {pendingList.map((user) => (
              <Card key={user.id} as="li" padding="sm" className="flex items-center justify-between">
                <span>{user.name}</span>
                <div className="flex gap-2">
                  <form action={approveUser.bind(null, user.id)}>
                    <Button type="submit">승인</Button>
                  </form>
                  <form action={rejectUser.bind(null, user.id)}>
                    <Button type="submit" variant="secondary">
                      거부
                    </Button>
                  </form>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">멤버 ({approvedList.length})</h2>
        <ul className="flex flex-col gap-3">
          {approvedList.map((member) => (
            <Card key={member.id} as="li" padding="sm" className="flex items-center justify-between">
              <span>{member.name}</span>
              {member.role !== 'admin' && (
                <form action={rejectUser.bind(null, member.id)}>
                  <Button type="submit" variant="secondary" className="text-red-600 dark:text-red-400">
                    강퇴
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </ul>
      </section>
    </PageShell>
  )
}
```

- [ ] **Step 3: Re-run test**

Run: `npx vitest run "app/(app)/admin"`
Expected: same pass count as the Step 1 baseline (the `EmptyState` swap renders the identical message string a `getByText` assertion would already be checking for, if one exists).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/admin"
git commit -m "style: apply design system to admin page"
```

---

### Task 22: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm no stray worktrees before trusting the full suite**

Run: `ls .claude/worktrees 2>/dev/null`
Expected: empty or directory not found. If any worktrees are present, investigate before proceeding (see project memory on false vitest failures from stray worktrees).

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. Total test count will be higher than `main` before this branch — Tasks 3-11 add new primitive test files (Spinner, Button's pending-state case, Input's size cases, Card's `lg`/shadow cases, Alert's icon/background cases, EmptyState, Toast, ThemeToggle), and Task 12 changes (not adds/removes) four existing `actions.test.ts` cases. No retrofit task adds or removes a test.

- [ ] **Step 3: Run lint**

Run: `npx eslint .`
Expected: no errors from files this plan touches. `eslint-config-next`'s `react-hooks/set-state-in-effect` rule flags the mount-time `setState` calls in `ThemeToggle` (Task 11) and `Toast` (Task 10) — both are legitimate SSR-safe reads of external state with no cleaner alternative (see the `eslint-disable-next-line` comments already in those tasks' code blocks). Separately, `app/(app)/feedback/[id]/feedback-lines.tsx:40` trips `react-hooks/immutability` on a `lastQuestionIndex` reassignment during render — this line predates this plan entirely (confirmed via `git log`, present since the original `feedback-lines.tsx` was added, untouched by Task 20's retrofit) and is out of scope here; leave it alone rather than fixing unrelated pre-existing code.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual smoke check in a real browser**

Run: `npm run dev`, then visit `http://localhost:3000` and click through: login/signup, dashboard, checkin (create a post, react, comment), coding (create a problem as admin), jobposts (create a post with questions), interviews (create a session, open it, submit a Q&A), a feedback doc, and admin. Confirm:
- Buttons/inputs/cards look consistent across pages (same radius, spacing, shadow, accent color on primary actions), and the `lg`-sized primary submit buttons on each creation form stand out visually from secondary actions.
- Every primary create-action (checkin, coding's problem form and GitHub-username form, jobposts, interviews' session and Q&A forms) shows a spinner on its submit button while pending, then a green success toast bottom-right that clears itself after a few seconds — and the `?success=` param is gone from the address bar once it does.
- Coding's problem list and admin's pending-signup list show the dashed-border `EmptyState` box when empty (temporarily clear the data or test on a fresh project to confirm).
- Click `ThemeToggle` in the nav: theme flips instantly and holds after a full page reload (not just client navigation).
- With the toggle left on dark, do a hard refresh — confirm there's no flash of light theme before dark applies (FOUC check).
- All error banners (`Alert variant="danger"`) still show background + border + icon, e.g. by submitting a form with a required field left empty.
- Browser tab shows "EOE" as the title.

Stop the dev server after checking (`Ctrl+C`).

- [ ] **Step 6: Commit** (only if Steps 3-4 required fixes; otherwise skip — no files changed)

```bash
git add -A
git commit -m "fix: address lint/typecheck issues from design system rollout"
```
