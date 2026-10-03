<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Subagent model selection

When dispatching subagents (Agent tool), always set `model` explicitly. Use the least capable model that can do the job reliably; escalate on risk, not on habit.

| Tier | Model | Use for | Examples from this repo |
|---|---|---|---|
| 1 | `haiku` | Mechanical work with a complete spec: touches 1–2 files, no design choices left open | Single migration file, one server action + its test, adding a type field, filling a test-coverage gap a reviewer already pinpointed |
| 2 | `sonnet` | Integration and judgment: multiple files, wiring across layers, debugging, fixing review findings | Wiring a page to new actions, fixing a regression, applying a multi-point review, re-reviewing plan fixes |
| 3 | `opus` | Design, architecture, and final authority | Writing/revising specs and plans, final whole-feature review, final verification before merge |

**Always escalate to at least `sonnet` for review, and to `opus` for implementation design, when a task touches:**
- Auth/session handling (`proxy.ts`, `lib/auth/`, `lib/supabase/`)
- Supabase RLS policies or any migration that changes existing columns/data
- `/api/github-webhook` (HMAC verification, `source` handling)
- Caching and invalidation (`'use cache'`, `cacheTag`, `updateTag`/`revalidateTag`/`revalidatePath`) — see the soft-tag pitfall in memory
- Money (fines, payment status)

**Escalation on failure:** if a subagent reports BLOCKED, produces a fix that fails review twice, or its spec turns out to be ambiguous, re-dispatch that task one tier higher instead of retrying on the same model.

**Reviews:** the reviewer must be a different subagent from the implementer. Per-task spec/code-quality reviews may use the same tier as the implementation (minimum `haiku` for tier-1 tasks); the final whole-feature review always uses `opus`.

**Read-only searches** across many files go to the `Explore` agent rather than a tiered general-purpose agent.

# AI usage record (`docs/ai-usage.md`)

`docs/ai-usage.md` is the owner's running record of how Claude Code was used on this project (for job applications). It and `scripts/ai-usage-stats.mjs` are local-only (listed in `.git/info/exclude`), so skip this section if they don't exist in your checkout. Keep it current:

- **When:** after a feature branch is merged (end of `finishing-a-development-branch`), or when the user introduces a new skill/workflow/guideline.
- **How:** run `node scripts/ai-usage-stats.mjs` (add `--tests` for the test count), append a dated row to section 6 — never edit or delete earlier rows — then add new features to section 1, new tools/skills/methods to section 2, and an entry to section 7. Update the "마지막 갱신" date.
- **Session counts shrink** because Claude Code deletes transcripts older than the retention period; in the body, cite the largest measured value with its date, never overwrite it with a smaller one.
- **Section 3 (the owner's own judgments/catches) and section 0 (real-usage numbers):** only add or change after confirming with the user — do not attribute decisions or discoveries to them on your own.
- Write in Korean, matching the existing tone.
