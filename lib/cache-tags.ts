/**
 * The escape-hatch tag for cached `profiles.name` lookups. Established in Phase 4 as the bare
 * string literal `'member-names'` at a single call site (`app/(app)/checkin/page.tsx`); this
 * plan adds three more call sites (`lib/coding/queries.ts`, `app/(app)/page.tsx` twice,
 * `app/(app)/admin/actions.ts`) and promotes all four — including the pre-existing one — to
 * import this constant instead, for the same reason `CODING_BOARD_TAG` and `FINES_TAG` are
 * named exports: a typo in any one bare literal would silently disable invalidation with no
 * build error and no test failure. It lives in its own module rather than under `lib/checkin`
 * or `lib/coding` because no single domain owns it.
 */
export const MEMBER_NAMES_TAG = 'member-names'

/**
 * The single source of truth for the coding-board cache tag. Exported rather than left as a
 * bare string because it recurs in lib/coding/queries.ts, in app/(app)/coding/actions.ts (six
 * times) and in app/api/github-webhook/route.ts — a typo in any one of those would silently
 * disable invalidation with no build error and no test failure. It lives here rather than in
 * lib/coding/queries.ts, which owns the domain but is a `'use cache'` data-access module that
 * pulls in `createCacheClient` and `SUPABASE_SERVICE_ROLE_KEY` — dependencies the public,
 * unauthenticated github-webhook route has no business carrying into its module graph just to
 * read an 11-character string constant. Every call site, including lib/coding/queries.ts itself,
 * imports the constant from here directly, the same way `MEMBER_NAMES_TAG` above is imported
 * rather than re-exported through a domain module.
 */
export const CODING_BOARD_TAG = 'coding-board'
