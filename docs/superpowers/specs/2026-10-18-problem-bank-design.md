# Problem Bank (문제은행) — Design

## Goal

Add a new board, `/problems` (nav label **문제은행**), where any approved member can author a coding-test problem (company + title, Markdown description and constraints with inline images, a typed function signature, and test cases) and anyone can download it as a **self-grading single file** in C, JavaScript, Python or Java. The member solves the problem locally in their own toolchain; running the file executes every test case against their `solution` function and prints PASS/FAIL with timing.

The site never executes user code. It is an authoring tool plus a file generator.

## Context

EOESite already has a `/coding` board where admins register external problem **links** (Baekjoon/Programmers) per week, and members get checked off manually or via the GitHub webhook. The problem bank is **independent of that board**: no `coding_weeks` link, no checks, no webhook involvement. It differs from every existing board in one access-control respect: **any approved member can create** (the coding board is admin-only).

Existing patterns this design reuses:
- RLS helpers `is_approved()` / `is_admin()` (`0003_coding.sql`, `0001_init.sql`).
- Public Storage bucket + approved-member upload policy (`checkin-photos`, `0002_checkin.sql:74`), ASCII-only object keys (`resolveExtension` in `app/(app)/checkin/actions.ts`).
- Cached reads via `'use cache'` + a named tag constant in `lib/cache-tags.ts`, invalidated with `updateTag` from server actions (never `revalidatePath` — see the soft-tag comment in `app/(app)/checkin/actions.ts`).
- `PageShell`, `Card`, `Input`, `Button`, `Alert`, `Toast`, `EmptyState` UI components.

## Decisions (from the design interview)

| # | Decision |
|---|---|
| Execution | No server-side execution. Download a file and run it locally. |
| File shape | One file per language: problem text as comments, a `solution` stub, an embedded test harness that self-grades. |
| I/O style | Function style (Programmers-like): fill in `solution(...)`, harness calls it and compares the return value. |
| Types | `int`, `long`, `double`, `bool`, `string`, `int[]`, `string[]`, `int[][]` for params and return. |
| Storage | Supabase table + new public Storage bucket `problem-images`. |
| Placement | Separate board `/problems`, not linked to the weekly coding board. |
| Who can write | Any approved member creates. Author **or admin** can edit/delete. |
| Title | Two fields, `company` and `title`, displayed as `[company]-title`. Company input autocompletes from existing companies. |
| Body | Markdown (`description`, `constraints`) with preview. Image upload inserts `![](url)` at the cursor. |
| Test visibility | Per-case "예시" checkbox. Examples appear on the page. All cases are embedded in the file. The harness reports examples and extra cases separately. Expected values in the file are plaintext (trust-based). |
| Time limit | Per-problem `time_limit_ms`. Harness measures each call and prints a warning (not FAIL) when it is exceeded. No forced kill. |
| Extras | None in v1: no comments, solved-checks, solution sharing, or pagination. |
| Test case input | Table UI: one column per param plus expected value, each cell a JSON literal, validated live against the param type. Server re-validates. |

## Data Model

**Migration `0016_problem_bank.sql`.**

**New table `bank_problems`:**
```
id               uuid primary key default gen_random_uuid()
company          text not null check (char_length(company) between 1 and 30)
title            text not null check (char_length(title) between 1 and 100)
description_md   text not null check (char_length(description_md) between 1 and 20000)
constraints_md   text not null default '' check (char_length(constraints_md) <= 5000)
time_limit_ms    integer not null default 1000 check (time_limit_ms between 100 and 60000)
signature        jsonb not null      -- see Signature below
test_cases       jsonb not null      -- see Test cases below
image_paths      text[] not null default '{}'  -- Storage object keys referenced by the body, for cleanup
created_by       uuid not null references profiles(id) on delete cascade
created_at       timestamptz not null default now()
updated_at       timestamptz not null default now()
```
Indexes: `bank_problems (company)` and `bank_problems (created_at desc)`.

`company` and `title` are normalized by `validateProblem` before insert/update: trim, then collapse internal whitespace runs (including newlines) to a single space. Case is preserved as typed. Autocomplete keeps company variants from splitting, and an admin can fix any that do.

**Signature (jsonb):**
```json
{ "params": [ { "name": "arr", "type": "int[]" }, { "name": "k", "type": "int" } ],
  "returnType": "int" }
```
- 1–6 params.
- Each `name` matches `^[a-z][a-zA-Z0-9_]{0,29}$`, is unique, and is not a reserved word in any target language or harness. One shared list lives in `lib/problems/reserved.ts`: the union of C (including gcc's GNU/C23 keywords such as `typeof`, `nullptr`, `constexpr`, and the libc macros `stdin`/`stdout`/`stderr`/`errno`), JS (including `arguments`, `eval`, `undefined`), Python and Java keywords, plus `solution`, `main`, `ret_len`, `ret_rows`, `ret_cols`.
- The C-expanded names (`<name>_len`, `<name>_rows`, `<name>_cols`) must not collide with another param's name or with a reserved name (e.g. `ret: int[]` would expand to `ret_len`, the array-return out-param).

**Test cases (jsonb):**
```json
[ { "args": [[1,2,3], 2], "expected": 5, "isExample": true }, ... ]
```
- 1–50 cases. `args.length` equals `params.length`.
- Every value validates against its type (see Type Rules).
- At least one case must be an example.

**RLS:**
- `select`: `is_approved()`.
- `insert`: `with check (created_by = auth.uid() and is_approved())`.
- `update`: `using (is_approved() and (created_by = auth.uid() or is_admin()))`, with the same `with check`. The update action never sends `created_by`, so an admin edit keeps the original author.
- `delete`: `using (is_approved() and (created_by = auth.uid() or is_admin()))`.
- RLS does not stop an approved member from writing a row directly through PostgREST and skipping the actions' validation. Because other members execute files generated from these rows, `lib/problems/queries.ts` re-validates every row on read: summaries with an invalid signature are skipped, and `getProblem` returns `null` (→ 404) unless the row passes `validateProblem`. Locking down direct writes (revoking table grants and writing through a `security definer` function) is a possible later hardening.

**Storage bucket `problem-images`** (public, like `checkin-photos`):
- Object key `${userId}/${randomUUID()}${ext}`, ASCII only, reusing `resolveExtension` (moved from `app/(app)/checkin/actions.ts` to `lib/storage/file-extension.ts`).
- Uploads are limited to **4 MB** (png/jpeg/gif/webp), leaving room for multipart overhead under the 5 MB `serverActions.bodySizeLimit`. The same limits are set on the bucket itself (`file_size_limit`, `allowed_mime_types`), so direct Storage API uploads can't bypass them.
- `insert` policy: approved members, and the first path segment must equal `auth.uid()`.
- `select`: anyone (public bucket; URLs are unguessable).
- `delete`: the owner (first path segment = `auth.uid()`) or `is_admin()`.

## Type Rules

Validation lives in **`lib/problems/validate.ts`**, pure and shared by the client form and the server actions.

| Type | JSON value | Validation | Comparison |
|---|---|---|---|
| `int` | number | integer in [-2^31, 2^31-1] | exact |
| `long` | number | integer within ±(2^53-1) (JSON/JS safe-integer limit, stated in the form's help text) | exact |
| `double` | number | finite | `|a-b| <= 1e-6 * max(1, |b|)` |
| `bool` | boolean | — | exact |
| `string` | string | ≤ 10,000 chars; no NUL (`\u0000`, which jsonb can't store and C would truncate) and no unpaired UTF-16 surrogates (jsonb rejects them); same rules per element for `string[]` | exact (byte/codepoint equal) |
| `int[]` | array of `int` | ≤ 100,000 elements | same length, elementwise exact, order-sensitive |
| `string[]` | array of `string` | ≤ 10,000 elements | same length, elementwise exact |
| `int[][]` | array of arrays of `int` | **rectangular** (every row the same length; `[]` allowed) | same shape, elementwise exact |

`int[][]` is rectangular-only so C can use `rows`/`cols`, matching Programmers' C convention. Jagged arrays (such as adjacency lists) are out of scope. Edge lists like `[[1,2],[2,3]]` are rectangular and work.

Each table cell is limited to 200,000 characters of JSON, and the whole serialized payload to 1 MB, which fits under `serverActions.bodySizeLimit: '5mb'`.

## Routes & UI

All routes live under `app/(app)/problems/` and are gated by `proxy.ts` like every other `(app)` route. Nav gets `{ href: '/problems', label: '문제은행' }` after `코테 스터디`.

### `/problems` — list
- Top bar: a **company filter** `<select>` ("전체" plus each company with its count, e.g. `카카오 (5)`, sorted by name), a **search input** (case-insensitive substring over the display title `[company]-title`), and a **문제 작성** button.
- The filter and search live in URL params `?company=…&q=…`. The search submits as a GET `next/form`. The form is keyed by the current params so its uncontrolled controls reset when the URL changes through a soft navigation.
- Rows (`Card`): display title, author name, created date (KST), and a badge with the return type and param count. Ordered newest first. No pagination.
- `EmptyState` covers both "no problems yet" and "no matches".
- Data: one cached read returns every problem summary (`id, company, title, created_by name, created_at`). Filtering and counting run **in memory outside the cache scope**, so `?company`/`?q` never join a cache key.

### `/problems/new` and `/problems/[id]/edit` — form (client component)
- **회사** `Input` with a `<datalist>` of existing companies (from the cached summary read). **문제 제목** `Input`. A live preview of the display title appears below them.
- **문제 설명** and **제한사항**: a Markdown textarea with 작성/미리보기 tabs. The preview uses the same renderer as the detail page. An **이미지 추가** button uploads via the `uploadProblemImage` action (≤ 4 MB; png/jpeg/gif/webp) and inserts `![](publicUrl)` at the cursor as its own paragraph (blank lines added as needed), because an image glued to the end of a line — e.g. a table row — would be swallowed by that line's Markdown.
- **시간 제한 (ms)**: number input, default 1000.
- **함수 시그니처**: a list of `name` + type `<select>` rows (add/remove, 1–6), plus a return-type `<select>`. A read-only line shows the result, e.g. `solution(arr: int[], k: int) -> int`.
- **테스트 케이스** table:
  - One column per param, then `기대값`, then `예시` (checkbox).
  - **+ 케이스 추가** adds a row; each row has a delete button.
  - Each cell is a text input holding a JSON literal (`[1,2,3]`, `"abc"`, `5`).
  - Validation runs on change: a typed-but-invalid cell gets a red border and an inline message (e.g. `int[]의 원소는 int 범위의 정수여야 합니다`). Empty cells show no inline message; they only block submission through the form-level line next to the submit button (`테스트 케이스에 비어 있거나 잘못된 칸이 있습니다`).
  - Form state lives in a pure draft model (`lib/problems/draft.ts`) that keeps cells as raw text and produces either per-cell errors or the validated payload.
  - A newly added row starts with `예시` checked only if it is row 1 or 2.
  - Changing a param's type re-validates that column. Adding a param adds an empty column. Removing a param drops its column after a `confirm()`.
- Submit is disabled while any field is invalid. Enter in a single-line input doesn't submit (it's easy to hit while typing JSON); only the submit button does.
- Image upload captures the selection before the request and inserts into the latest text afterwards, so typing during an upload isn't lost; a failed request shows an inline error and re-enables the button.
- Submission: the form serializes `{ company, title, descriptionMd, constraintsMd, timeLimitMs, signature, testCases }` into one hidden JSON field and calls the server action with **`useActionState`**. On a validation failure the action returns `{ error }` instead of redirecting, so complex form state isn't lost. This is a new pattern in the repo, justified by this form's size. On success the action redirects to `/problems/[id]?success=…`.
- Edit mode: only the author or an admin sees the 수정 entry point. The edit page also checks this server-side and redirects with an error otherwise.

### `/problems/[id]` — detail
- Header: display title, author, created/updated date, time limit.
- 수정/삭제 buttons for the author or an admin. 삭제 uses a form action with a `confirm()`.
- **문제 설명** and **제한사항** rendered with `react-markdown` + `remark-gfm`. Raw HTML stays disabled (the default), so stored Markdown cannot inject markup.
- **함수 시그니처** line.
- **입출력 예** table built from `isExample` cases: one column per param name plus `return`, with values shown as compact JSON.
- **다운로드** section (client component): language buttons C / JavaScript / Python / Java and a **파일 다운로드** button. Generation happens in the browser and saves with a Blob + `<a download>`. A collapsible **미리보기** shows the generated source in a `<pre>`.
- The `[id]` param is checked as a UUID before it reaches the cached read, so malformed URLs can't grow the cache key space. Unknown id → `notFound()`.

### Server actions (`app/(app)/problems/actions.ts`)
- `createProblem(prev, formData)`, `updateProblem(id, prev, formData)`: parse the JSON payload (≤ 1 MB), run `validateProblem()` (same module as the client), `getVerifiedUser()`, derive `image_paths` (below), insert/update (`updated_at = now()` on update), then `updateTag(PROBLEM_BANK_TAG)`, then best-effort image cleanup, then redirect.
- `deleteProblem(id)`: delete the row (RLS enforces author/admin; zero returned rows → permission error), `updateTag`, best-effort image cleanup, redirect to `/problems`.
- `uploadProblemImage(formData)`: validate size/MIME, upload to `problem-images/${userId}/${uuid}${ext}`, and return `{ url }` or `{ error }`.
- **`image_paths` derivation:** scan both Markdown fields for image URLs that start with this bucket's public URL prefix and keep only keys shaped like uploaded objects (`<uuid>/<uuid>.<ext>`, query strings stripped), so `..` or encoded segments never reach `remove()`.
- **Image cleanup:** on update, the keys dropped from `image_paths`; on delete, all of them. Keys still referenced by another `bank_problems` row are skipped (copying a problem's Markdown into a variant is a normal workflow), and the rest are removed best-effort.

### Caching
- New constant `PROBLEM_BANK_TAG = 'problem-bank'` in `lib/cache-tags.ts`, with a doc comment in the style of its neighbours.
- `lib/problems/queries.ts` (`'use cache'`, `cacheTag(PROBLEM_BANK_TAG, MEMBER_NAMES_TAG)`, `cacheLife('minutes')`, `createCacheClient()`):
  - `getProblemSummaries()` for the list, the company counts, and the datalist.
  - `getProblem(id)` for detail and edit.
- RLS grants SELECT on `bank_problems` and `profiles` to every approved member with no per-row clause, so the cookie-free cache client is safe (same argument as `lib/coding/queries.ts`).
- Per-viewer decisions ("can I edit this?") compare `getSessionProfile()` against `createdBy` **outside** the cache scope.
- Invalidation uses only `updateTag(PROBLEM_BANK_TAG)` from the actions. No `revalidatePath`.
- `/problems/new` reads only cached data, so the build prerenders it fully (1-minute revalidation); `updateTag` expires it on every write.

## File Generator

`lib/problems/generate/` is a set of pure TypeScript functions with no DOM or Node APIs, so they run in the browser and in vitest.

```
generate(problem: ProblemContent, lang: 'c' | 'js' | 'python' | 'java', opts: { problemUrl: string })
  -> { filename: string, content: string }
```
Modules: `index.ts` (dispatch and the language list), `shared.ts` (case ordering, header lines, comment rendering, markers), and one module per language with its own literal emitters: `c.ts`, `js.ts`, `python.ts`, `java.ts`.

### Output files

| Lang | Filename | Run command (printed in the header comment) |
|---|---|---|
| C | `solution.c` | `gcc -std=c99 -O2 solution.c -o solution 컴파일 후 ./solution 실행 (Windows: solution.exe)` |
| JS | `solution.js` | `node solution.js` |
| Python | `solution.py` | `python solution.py (macOS/Linux에서는 python3 solution.py)` (Python 3.8+) |
| Java | `Solution.java` | `javac -encoding UTF-8 Solution.java 컴파일 후 java Solution 실행` (Java 11+) |

Run commands are worded as two steps rather than `a && b`, because `&&` is a parse error in Windows PowerShell 5.1.

### File layout (every language)
1. **Header comment**, using line comments only (`//` or `#`) so a description containing `*/` can't break out:
   - display title, problem URL, time limit, run command;
   - `description_md` and `constraints_md` verbatim;
   - each image `![alt](url)` replaced with `[이미지: alt - 사이트에서 확인]` (`[이미지 - 사이트에서 확인]` when alt is empty), with the problem URL given once in the header. Matching never crosses a line break, so a malformed image can't swallow the text after it.
   - Text is split on every line terminator any target honors (`\r\n`, `\r`, `\n`, U+2028, U+2029), so no fragment of a description escapes its comment.
   - Java only: a backslash followed by `u` in comment text becomes `\ u`, because javac processes `\uXXXX` escapes inside comments.
   - C only: `??` becomes `? ?` (gcc's `-std=c99` enables trigraphs, and `??/` is a backslash), and a line ending in `\` gets a trailing `.` so it can't splice the next line in.
2. **Solution stub**: the `solution` signature with a `// TODO` and a type-appropriate default return (`0`, `0L`, `0.0`, `false`, `""`, empty array). This is the only region the member edits. It is marked with `===== 여기에 풀이를 작성하세요 =====` / `===== 아래는 채점 코드입니다 (수정하지 마세요) =====`.
3. **Harness**: the test-case data, a comparator per return type, a value printer, a timer, and a runner. Case data is native literals in C, JS and Python. Java embeds each value as JSON text, chunked into string constants and parsed at runtime by a small reader in the harness, because array initializers compile to per-element bytecode (a few thousand elements would hit the 64 KB method limit) and distinct large ints would exhaust the 65,535-entry constant pool. Each Java case gets its own method.

### Type mapping

| Type | C param | C return | JS (JSDoc) | Python hint | Java |
|---|---|---|---|---|---|
| `int` | `int x` | `int` | `number` | `int` | `int` |
| `long` | `long long x` | `long long` | `number` | `int` | `long` |
| `double` | `double x` | `double` | `number` | `float` | `double` |
| `bool` | `bool x` (`<stdbool.h>`) | `bool` | `boolean` | `bool` | `boolean` |
| `string` | `char* x` | `char*` (malloc'd) | `string` | `str` | `String` |
| `int[]` | `int x[], int x_len` | `int*` + `int* ret_len` | `number[]` | `List[int]` | `int[]` |
| `string[]` | `char* x[], int x_len` | `char**` + `int* ret_len` | `string[]` | `List[str]` | `String[]` |
| `int[][]` | `int** x, int x_rows, int x_cols` | `int**` + `int* ret_rows, int* ret_cols` | `number[][]` | `List[List[int]]` | `int[][]` |

- C params are deliberately **not** `const`: in-place idioms like `qsort(arr, ...)` are common in coding tests, and each case declares its own `static` copy of every argument, so mutation stays inside that case.

- C out-params for the return length come last.
- C empty arrays are passed as `NULL` with length 0, because C99 forbids zero-length array literals. A returned `NULL` with length 0 counts as an empty array.
- Python uses `from typing import List` style hints for 3.8 compatibility.
- Java: `class Solution` has an instance method `public <returnType> solution(...)` (Programmers style); `public static void main` only calls `Harness.run()`, and the whole harness lives in a nested `static final class Harness` so its helper names (`parse`, `eq`, `show`, …) can't clash with the solver's own members. Each case constructs `new Solution()` inside its try, so an exception from the solver's field initializers is reported for that case instead of aborting the run. Non-ASCII characters in Java **string literals** are emitted as `\uXXXX` escapes so the source compiles under any platform encoding; control characters use named or octal escapes, never `\u`, since javac would expand `\u000a` into a real newline before lexing. C string literals emit every byte outside printable ASCII as a 3-digit octal escape of its UTF-8 encoding and escape `?` (trigraphs). JS/Python reuse `JSON.stringify` for strings and arrays.
- C helpers are all referenced from `main` as `(void)h_xxx;` so `-Wall` stays quiet, and C never uses `%lld` (older MinGW printf lacks it).
- Python's harness calls `sys.stdout.reconfigure(errors="backslashreplace")` so printing a Korean or emoji value to a non-UTF-8 pipe can't crash the run.

### Harness behavior
- Runs the examples first, then the extras, each kind numbered from 1. Each case prints its label before the call (flushed, so a C crash shows which case was running), then the result:
  ```
  [Example 1] PASS  3ms
  [Example 2] FAIL  12ms
      expected: [1, 2]
      got:      [2, 1]
  [Extra 1] PASS  1520ms  WARN time limit exceeded (1000ms)
  [Extra 2] ERROR  IndexError: list index out of range
  ----
  Examples: 1/2 passed | Extra: 4/5 passed | ALL PASSED / SOME FAILED
  ```
- Harness output is **ASCII-only English** on purpose: printing UTF-8 Korean from C on a cp949 Windows console garbles it. String values inside `expected`/`got` print as-is.
- Printed values are truncated to 200 characters.
- Timing per call: `clock()` in C, `process.hrtime.bigint()` in JS, `time.perf_counter()` in Python, `System.nanoTime()` in Java. Exceeding the limit is a WARN; the case's PASS/FAIL stands.
- Exceptions (JS/Python/Java) are caught per case and reported as `ERROR <type>: <message>`, and the run continues. Python also catches `SystemExit` (but not `KeyboardInterrupt`, so Ctrl+C still stops an infinite loop). In C a crash ends the run; the last printed case label points to the culprit.
- Comparators are strict about element types: Python's `int[]`/`int[][]` comparators reject bools and floats (`_is_int`), and JS iterates with `Array.from` so holes in a sparse array count as wrong values. JS's harness sits in its own `{ }` block so a solver's top-level `const fmt` can't clash with it, and NaN/Infinity print as such instead of `null`.
- Each case's arguments are freshly constructed or copied, so a solution that mutates its input doesn't affect later cases.
- Exit code: 0 if everything passed, 1 otherwise.

## Error Handling / Edge Cases

- Validation failure (client or server) → `{ error }` from `useActionState`, shown in an `Alert` above the form. Form state is preserved.
- An update or delete that RLS denies (not author/admin) fails silently in PostgREST (no error, zero rows). The actions chain `.select("id")` and treat an empty result as denied → `{ error }` or redirect with `?error=권한이 없습니다`.
- Image upload failure → inline error next to the button. The textarea is untouched.
- Images uploaded during an abandoned edit become orphans in Storage. That's accepted for v1 (small and harmless); see Out of Scope.
- Problem rows store full public image URLs in Markdown. A bucket rename would break them, which is acceptable (same trade-off as `checkin-photos`).
- A signature change that invalidates existing case cells is caught by live validation; the cells must be fixed before saving.
- `company` with only whitespace → empty after normalization → validation error.

## Dependencies

- Add `react-markdown@10.1.0` (peer `react >= 18`) and `remark-gfm@4.0.1`. Markdown styles go under a `.markdown` class in `app/globals.css` rather than adding `@tailwindcss/typography`.

## Testing

- **`lib/problems/validate.ts`**: every type's accept/reject boundaries (int range, safe-integer long, non-finite double, non-rectangular `int[][]`, wrong element types); param-name rules (reserved words, C-suffix collisions, duplicates); case-count and example-required rules.
- **`lib/problems/generate/*`**: for each language, signature and default-return output for all 8 return types and all param types; literal escaping (quotes, backslashes, newlines, Korean, Java `\u` escaping, empty arrays → C `NULL`); header-comment sanitization (`*/`, Java `\u` in comments, C trigraphs and trailing backslashes, image replacement). Focused string assertions, one test file per language.
- **Toolchain check** `lib/problems/generate/toolchain.test.ts`, opt-in with `VERIFY_TOOLCHAINS=1 npx vitest run lib/problems/generate/toolchain.test.ts` (skipped in normal runs and CI): for 8 fixtures that together cover every param and return type plus a hostile description, it generates each language's file and runs it twice with `gcc -std=c99 -Wall -Werror` / `node` / `python` / `javac`. Unmodified (the stub's default return) it must print `SOME FAILED` and exit 1; with a known-correct solution spliced between the markers it must print `ALL PASSED` and exit 0. A missing toolchain skips that language. The prototype passed all 32 runs on gcc 6.3 (MinGW), Node 22, Python 3.12 and JDK 21.
- **Server actions**: create/update/delete happy paths; server-side re-validation rejects a tampered payload; company normalization; `image_paths` derivation and diff-removal on update; author-vs-admin-vs-other permission outcomes.
- **Pages**: list filter and search via search params, company counts, empty states; detail renders examples only in 입출력 예 and shows edit/delete only to author/admin; the edit page rejects a non-author non-admin.
- **Form**: adding/removing params reshapes the case table; invalid cells block submit; first-two-rows example default.

## Out of Scope

- Comments, "solved" checks, solution sharing, likes/ratings.
- Linking bank problems to `/coding` weeks.
- Server-side execution, hidden expected values (hashing), forced timeouts, memory limits.
- Jagged `int[][]`, other types (`char`, `long[]`, `double[]`, maps, objects), stdin/stdout-style problems, class-design problems.
- Bulk JSON test-case input (the table UI is v1; a JSON toggle can come later).
- Pagination, edit history, orphan-image garbage collection.
