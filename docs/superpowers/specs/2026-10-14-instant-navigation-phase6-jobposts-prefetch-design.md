# Instant Navigation Phase 6: `/jobposts` Runtime Prefetch — Design

**Status:** approved in brainstorming, 2026-10-14
**Predecessor:** `docs/superpowers/plans/2026-09-13-instant-navigation-phase5-remaining-routes.md` ("Deferred to Phase 6")

## Goal

Give `/jobposts` the same validated runtime instant prefetch that `/interviews` got in Phase 5 (`unstable_instant = { prefetch: 'runtime', samples }`, build table `1m 1h`), by removing the one thing that blocks it: `PostForm` calling `new Date()` during render.

Fix a latent bug on the way: the job post date defaults to the **UTC** date in both the form and the server action, so between 00:00 and 08:59 KST it defaults to yesterday.

## Scope

**In scope**

- `app/(app)/jobposts/post-form.tsx` — stop computing the default date during render.
- `app/(app)/jobposts/actions.ts` — default an empty `postDate` to the KST date.
- `app/(app)/jobposts/page.tsx` — adopt runtime instant prefetch.
- Tests for the three changes above.

**Out of scope — decided, not deferred by accident**

`/feedback/[id]` and `/interviews/[sessionId]` (the other Phase 6 candidate) are **not** converted. Both pages derive everything — including the page title and, on the interviews page, the Q&A form's `sessionId` — from the dynamic URL param. Under Cache Components, awaiting `params` without `generateStaticParams` is runtime data, so the only content that could sit in a static shell is the nav plus a skeleton, which is what their `loading.tsx` already renders. A real speedup would require caching their data with `'use cache'` and adding tag invalidation to every mutation that touches it (feedback comments, interview Q&A create/delete, feedback doc creation). The user judged that cost not worth it now; the pages stay as they are, with their `loading.tsx`.

The open question Phase 5 recorded for those pages — how `redirect()` behaves inside a Suspense boundary after the shell is flushed — is already answered and needs no work: their `loading.tsx` already puts them in a streaming context, and per `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`, a redirect during streaming is emitted as a client-side meta-tag redirect; only the HTTP status (200 rather than 307) differs.

## Why `/jobposts` is blocked today

Under `prefetch: 'runtime'` the route is actually prerendered, and the build fails with:

```
Error: Route "/jobposts" used `new Date()` inside a Client Component without a Suspense boundary above it.
    at app\(app)\jobposts\post-form.tsx:15:17
```

`PostForm` is rendered in the static shell (outside every `<Suspense>` in `page.tsx`) and computes `const today = new Date().toISOString().slice(0, 10)` in its render body for the date input's `defaultValue`. Under `unstable_instant = false` the route was never prerendered, so this never surfaced.

## Design

### 1. `PostForm` fills the date after mount

- Remove the render-time `new Date()` call and the date input's `defaultValue`.
- The date input stays **uncontrolled**, as it is today. A `ref` is attached to it.
- A `useEffect` (empty dependency array) runs once after mount: if `ref.current.value` is empty, set it to `getKstDateString(new Date().toISOString())`. The emptiness check means a value the user has already entered is never overwritten.
- The value is written through the DOM ref rather than React state on purpose: setting state inside an effect can trip the React Compiler lint rules (`react-hooks/*`) this repo runs; writing to a ref-held DOM node does not, and keeps the input uncontrolled with no other behavior change.
- `getKstDateString` comes from `lib/checkin/time.ts`. It is a pure function with no server-only imports, so it is safe in a Client Component. It is reused as-is rather than moved; it is the app's existing KST date helper.
- Remove `required` from the date input. Before hydration (or with JavaScript disabled) the field is empty; a `required` empty field would block native form submission, whereas without it the empty value reaches the server action, which fills it in (§2).

**Accepted tradeoff:** before hydration, the date field renders empty for a moment. The form itself stays in the static shell and is therefore part of what runtime prefetch delivers instantly.

### 2. Server action defaults to the KST date

In `createJobPost`, change

```ts
const postDate = (formData.get('postDate') as string) || new Date().toISOString().slice(0, 10)
```

to use `getKstDateString(new Date().toISOString())` as the fallback. This is the path taken whenever the date arrives empty (pre-hydration or no-JS submission), and it fixes the UTC bug on the server side.

### 3. `/jobposts` adopts runtime instant prefetch

Replace `export const unstable_instant = false` in `app/(app)/jobposts/page.tsx` with the same configuration `/interviews` uses:

```ts
export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      headers: [
        ['x-user-id', '00000000-0000-0000-0000-000000000000'],
        ['x-user-role', 'member'],
        ['x-user-status', 'approved'],
      ],
      searchParams: { error: null, success: null },
    },
  ],
}
```

Both rules recorded in Phase 5 apply: no type assertions anywhere in the object (a cast makes the build fail with "Invalid segment configuration export detected"), and every search param the route reads is declared, absent ones as `null`.

Replace the existing comment block above the export: it currently explains why runtime prefetch was reverted. The new comment states that runtime prefetch is enabled, keeps the two rules above, and notes that it became possible once `PostForm` stopped calling `new Date()` during render.

No other part of `page.tsx` changes. `PostForm` stays outside any `<Suspense>` boundary.

## Testing

- **`post-form.test.tsx`**
  - With the system time frozen at `2026-10-13T23:30:00Z` (08:30 KST on 2026-10-14), after render and effects the date input's value is `2026-10-14`. This distinguishes KST from UTC: a UTC implementation would produce `2026-10-13`.
  - The date input is not `required`.
  - The "only fill when empty" guard covers a user typing before hydration. React Testing Library runs effects synchronously during `render`, so that window cannot be reproduced in a unit test; the guard is kept as a one-line condition and verified by code review rather than by a test.
- **`actions.test.ts`** — with `postDate` empty and the system time frozen at `2026-10-13T23:30:00Z`, the inserted row's `post_date` is `2026-10-14`. Existing tests that pass an explicit `postDate` keep passing unchanged.
- **Build** — `npm run build` exits 0 with 20/20 pages and no `Error: Route` line; the route table shows `/jobposts  1m  1h`, and `/interviews` still shows `1m  1h`. Because `next build` aborts at the first prerender error, the presence of the `/jobposts` lifetime in the table is the positive proof that the route was actually prerendered.
- **Suite** — run with `npx vitest run --exclude ".claude/**"` if any worktree exists under `.claude/worktrees/`, so copied test files in a worktree are not picked up.

## Risks

- **Prefetched shell shows an empty date field.** Intended; the field fills on hydration.
- **The React Compiler lint may still object to the ref write.** If it does, the implementation stops and reports rather than suppressing the rule; the fallback is a `useSyncExternalStore`-based value with a server snapshot of `''`.
