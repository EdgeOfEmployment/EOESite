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
