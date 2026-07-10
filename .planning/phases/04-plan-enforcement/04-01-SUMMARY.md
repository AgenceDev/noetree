---
phase: 04-plan-enforcement
plan: 01
subsystem: api
tags: [convex, mutations, authorization, subscriptions, plan-enforcement]

# Dependency graph
requires:
  - phase: 02-webhooks
    provides: subscriptions table with by_clerkUserId index and status union (active/canceled/past_due), populated by Stripe webhook handlers
provides:
  - isProUser identity-derived Free/Pro resolver in convex/helpers/helper.ts
  - Server-side 20-note cap enforcement in createNote (NOTE_LIMIT_REACHED error contract)
  - convex-test coverage proving SC1/SC2/SC3 plus past_due/canceled edge cases
affects: [04-02, 04-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Identity-derived authorization: resolve plan/tier exclusively from ctx.auth.getUserIdentity().subject, never a client-supplied argument (mirrors 03-REVIEW.md CR-01 IDOR fix)"
    - "Bounded existence/count checks: .take(N+1) instead of .collect().length to keep query cost O(N) regardless of table size"

key-files:
  created:
    - convex/notes.test.ts
  modified:
    - convex/helpers/helper.ts
    - convex/notes.ts

key-decisions:
  - "isProUser added alongside getUser in helper.ts, reusing existing GenericQueryCtx/DataModel imports (no new imports needed)"
  - "Free-tier count query drops the parentNote clause from by_owner (counts notes at any depth, not just root notes) per D-01"
  - "Gate only createNote; duplicateNote and other mutations left untouched per D-02"
  - 'Error contract is a bare Error("NOTE_LIMIT_REACHED") matching this file''s existing convention, not ConvexError'

patterns-established:
  - "FREE_NOTE_LIMIT = 20 module-level constant in convex/notes.ts is the single source of truth for the note cap; plans 02/03 should reference the same NOTE_LIMIT_REACHED string, not redefine it"

requirements-completed: [PLAN-02, PLAN-03]

# Metrics
duration: 8min
completed: 2026-07-10
---

# Phase 04 Plan 01: Server-Side Note-Limit Enforcement Summary

**Free-tier 20-note cap enforced inside the Convex `createNote` mutation via a new `isProUser` identity-derived resolver, with `NOTE_LIMIT_REACHED` as the error contract consumed by later UI plans.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-10T15:21:00Z (approx, worktree checkout)
- **Completed:** 2026-07-10T15:29:01Z
- **Tasks:** 3 completed
- **Files modified:** 2 modified, 1 created

## Accomplishments

- Added `isProUser` to `convex/helpers/helper.ts` — resolves Pro strictly from an `active` subscription status looked up via `identity.subject` (never client input), with no-row and non-active statuses (`past_due`, `canceled`) both resolving to Free.
- Gated `createNote` in `convex/notes.ts` with a bounded `.take(FREE_NOTE_LIMIT + 1)` owner-scan; Free users are rejected with `Error("NOTE_LIMIT_REACHED")` at their 21st note, Pro users skip the check entirely.
- Added `convex/notes.test.ts` with 6 convex-test cases proving SC1 (Free rejected at 21), the 19→20 boundary, SC3 (no-subscription-row treated as Free), SC2 (Pro creates notes 21 and 50), and both `past_due`/`canceled` → Free cases.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add isProUser helper resolving Free/Pro from authenticated identity** - `4381106` (feat)
2. **Task 2: Gate createNote with the Free-tier 20-note limit** - `848e994` (feat)
3. **Task 3: convex-test coverage for the enforcement rules** - `d85da99` (test)

_Note: This plan's TDD tasks are sequenced helper → gate → coverage (tests exercise the already-built enforcement end-to-end across both Task 1 and Task 2's changes) rather than per-task RED/GREEN, per the plan's own task design._

## Files Created/Modified

- `convex/helpers/helper.ts` - Added `isProUser` export (identity → subscriptions.by_clerkUserId → `status === "active"`)
- `convex/notes.ts` - Added `FREE_NOTE_LIMIT = 20` constant, imported `isProUser`, added the count-and-reject gate in `createNote` before `ctx.db.insert`
- `convex/notes.test.ts` (new) - 6 tests covering SC1/SC2/SC3 and past_due/canceled

## Decisions Made

- Count query intentionally drops `.eq("parentNote", ...)` from the `by_owner` compound index to count notes at every depth (root + nested children), not just root notes, per D-01.
- Used `.take(FREE_NOTE_LIMIT + 1)` rather than `.collect().length` to keep the check bounded to O(21) rows regardless of how many notes a user actually owns (DoS-safety, matches Convex guidelines rule).
- Kept the error as a bare `Error("NOTE_LIMIT_REACHED")` rather than `ConvexError`, matching the existing convention in `notes.ts` (`getTreesByMe`/`createNote` both throw bare `Error`).
- Did not touch `duplicateNote` or any other mutation — enforcement lives only in `createNote` per D-02.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria were met on first implementation; the only iteration was a local test-authoring mistake (using `db.insert` instead of `ctx.db.insert` inside `t.run(async ctx => ...)` callbacks in the first draft of `convex/notes.test.ts`), caught immediately by the first `vitest run` and fixed before committing — not a deviation from the plan's design, just a normal write-then-verify test-authoring correction within Task 3.

## Issues Encountered

None outside the fix described above. `npx tsc --noEmit -p tsconfig.json` was clean after every task, and the full `convex/` test suite (`npx vitest run convex/`) passes 45/45 after this plan's changes.

## User Setup Required

None - no external service configuration required. This plan only touches Convex mutation/helper code and its test suite.

## Next Phase Readiness

- The `NOTE_LIMIT_REACHED` error string and `FREE_NOTE_LIMIT` constant name are now the fixed contract for plans 02/03 (frontend upgrade-modal wiring) to key off of — they should reference this exact string rather than redefining it.
- `isProUser` is exported from `convex/helpers/helper.ts` and can be reused by any other mutation/query needing Free/Pro resolution (e.g., future AI-credit gating), since it takes `GenericQueryCtx<DataModel>`.
- No blockers for 04-02/04-03.

---

_Phase: 04-plan-enforcement_
_Completed: 2026-07-10_

## Self-Check: PASSED

All created/modified files verified present: `convex/helpers/helper.ts`, `convex/notes.ts`, `convex/notes.test.ts`, `.planning/phases/04-plan-enforcement/04-01-SUMMARY.md`.
All task commits verified present in git log: `4381106`, `848e994`, `d85da99`, `7f60c39`.
