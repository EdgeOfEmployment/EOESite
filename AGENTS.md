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
