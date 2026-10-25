# Public Tour (`/tour`) — Design

## Goal

Give people outside the study group, mainly recruiters and interviewers who follow a link from a portfolio or résumé, a way to see what EOESite does in one to three minutes, without an account and without exposing any real member data.

`/tour` is a public, read-only copy of the app: the same screens, rendered by the same components, filled with hard-coded fictional data. Every write is intercepted in the browser and answered with a toast.

## Context

Today every route goes through `proxy.ts` → `getRedirectPath` (`lib/auth/access.ts`): a visitor with no session is sent to `/login`, a pending user to `/pending`. Pages read Supabase directly inside their `page.tsx` (most through `'use cache'` scopes), and the cards they render wire every write as `<form action={serverAction}>`, plus one `onClick` write in `goals-editor.tsx`. Approved members can read every member's check-ins under RLS, so a demo account on the real database would leak real data; that option was rejected.

## Decisions (from the design interview)

| # | Decision |
|---|---|
| Audience | Recruiters and interviewers (portfolio link). Not prospective members. |
| Approach | Public `/tour` routes that reuse the real components with fixture data. No demo account, no second Supabase project, no screenshots. |
| Scope | The six tabs' read screens (dashboard, check-in feed and calendar, coding board, problem list and detail, job posts and calendar, feedback detail, interviews and session detail) plus an intro page. No admin page, no create/edit pages. |
| Writes | Buttons and forms look real. Submitting shows the toast "체험 모드에서는 저장되지 않아요" and changes nothing. Client-only interactions (feedback line expand, download panel language/preview/download, goals edit mode) keep working. |
| Visitor identity | A fixed fictional member, "나 (체험)", non-admin. Already checked in today; one of two assigned coding problems solved. |
| Write blocking | One client wrapper, `DemoGuard`, cancels every `submit` event in the capture phase (before React's bubble-phase form-action dispatch). Forms inside `[data-demo-allow]` pass (the problem search form is a GET). `goals-editor.tsx`'s `onClick` save checks `useDemoMode()`. The server actions' own `getVerifiedUser()` check is the second line of defense (e.g. a submit before hydration). |
| Page reuse | Each page's markup is moved into a pure view component next to it (`views.tsx`, `dashboard-views.tsx`). The real `page.tsx` keeps every query, `'use cache'` scope, `cacheTag`/`cacheLife` call and Suspense boundary unchanged and just renders the view. `/tour` renders the same views from fixtures. |
| Internal links | Views and the four cards that link internally (`jobposts/post-card`, `interviews/session-card`, `interviews/[sessionId]/qa-card`, `problems/[id]/download-panel`) take an optional `basePath` (default `''`); `/tour` passes `'/tour'`. |
| Access | `/tour` joins `ALWAYS_ALLOWED_PATHS`: reachable by visitors, pending users and members alike, never redirected. |
| Routes | `app/tour/` (outside the `(app)` group, so it does not inherit the logout nav). `/tour` is the intro, the dashboard is `/tour/dashboard`, the rest mirror the real paths under `/tour`. One `app/tour/loading.tsx` covers all of them. |
| Nav | `Nav` takes optional `links` and `trailing` props. The link list moves to `components/nav-links.ts` (a client module's exports are client references on the server, so the tour layout could not map over them otherwise). Tour nav: "소개" + the six real tabs under `/tour`; "로그인" link instead of logout. |
| Banner | Every `/tour` page: "체험 모드: 모든 데이터는 가상이며 저장되지 않습니다." |
| Entry points | `/tour` URL directly in the portfolio; a "로그인 없이 둘러보기 →" link under the login form. |
| Indexing | `robots: noindex, nofollow` on the tour layout. |
| Fixture dates | Relative to today: `buildTourFixtures(todayKst)` is pure and deterministic; pages call it per request after `connection()`. The demo always looks like it is running right now. |
| Fixture size | 6 members; check-ins for the last 14 days; 3 coding weeks (the current one contains today); 5 job posts; 1 job-post feedback doc; 2 interview sessions (one past, one upcoming) with 2 Q&As and their feedback docs; 3 bank problems that pass the real `validateProblem`. |
| Desk photos | The owner provides 4–6 real desk photos for `public/tour/`. EXIF (GPS) is stripped and they are resized to ≤1280px / ~200KB before commit. Until then, six generated SVG placeholders stand in; `TOUR_DESK_PHOTOS` lists the paths. |
| Intro page | One-line description, six feature cards linking into the tour, a line on admin features, four engineering highlights, tech stack, GitHub repo and author link. Every claim in the highlights was checked against the code. |
| Delivery | One branch, one PR. Merging the access change alone would publish an empty public route. |

## Out of scope

- Simulating writes in the browser (e.g. toggling a reaction locally). Can be added per interaction later.
- The admin page and the create/edit pages.
- A real HTTP 404 status for unknown tour ids: like the real detail pages, the loading boundary streams first, so `notFound()` renders the 404 UI with a 200 status.

## Testing

- `lib/auth/access.test.ts`: `/tour` and nested paths reachable for null, pending and approved profiles; `/tourist` is not.
- `components/tour/demo-guard.test.tsx`: a positive control (the same form outside the guard does run its action), then blocked action and `onSubmit`, `data-demo-allow` passthrough, toast timeout, context value.
- `goals-editor.test.tsx`: save inside the guard shows the toast and does not call `updateCheckinGoals`.
- Card tests: each `basePath` prefix.
- `lib/tour/fixtures.test.ts`: invariants across month/year boundaries, a leap day, a Sunday and a Monday; bank problems pass `validateProblem` and generate in every language; every desk photo path exists under `public/`.
- `app/tour/tour-pages.test.tsx`: every tour page renders its key content, and every internal link on it stays under `/tour`.
- All existing page tests keep passing unchanged (they are the regression net for the view extraction).
- `e2e/tour.spec.ts` (logged-out): every page answers 200 with its heading and the banner; noindex meta; clicking a reaction, a comment submit and "완료 처리" shows the toast and sends **no POST at all**; the problem search still navigates; the login page links to `/tour`.
