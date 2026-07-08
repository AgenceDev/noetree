---
phase: 02-webhook-handler-convex-internal-mutations
plan: 02
subsystem: payments
tags:
  [convex, stripe, webhooks, idempotency, internalMutation, vitest, convex-test]

# Dependency graph
requires:
  - phase: 02-webhook-handler-convex-internal-mutations
    provides: "Plan 02-01: Vitest + convex-test toolchain, subscriptions.by_stripeSubscriptionId index, INTERNAL_WEBHOOK_SECRET env var"
provides:
  - "Real upsertSubscription/deleteSubscription/markPastDue/getSubscription implementations in convex/subscriptions.ts, replacing all Phase 1 throw-stubs"
  - "Idempotency pattern (check-and-mark processedStripeEvents inside the same atomic mutation) proven out and ready to copy for aiCredits.ts (Plan 02-03)"
affects: [02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Anomaly sentinel return convention: unresolvable clerkUserId / stripeSubscriptionId returns { anomaly: string } instead of throwing, per D-12 — bare-throw convention still applies to genuine Convex errors"
    - "Idempotency-first mutation body shape: query processedStripeEvents by_stripeEventId as step 1 of every writer mutation; early-return { alreadyProcessed: true } before any state mutation, per D-14/D-15"
    - "markPastDue resolves entirely via by_stripeSubscriptionId with no clerkUserId argument, avoiding an extra Stripe API round-trip (D-05/D-08)"

key-files:
  created: [convex/subscriptions.test.ts]
  modified: [convex/subscriptions.ts]

key-decisions:
  - "Used a local type-cast for import.meta.glob in the test file `(import.meta as unknown as { glob: ... }).glob(...)` instead of adding a vite/client triple-slash reference, since vite is only a transitive dependency (not hoisted to top-level node_modules under pnpm) and vitest/importMeta.d.ts does not itself declare `glob` — this keeps `npx tsc --noEmit` clean without adding a direct vite devDependency"
  - "Both deleteSubscription and markPastDue return { success: true } on the happy path, matching upsertSubscription's convention (plan's action text specified this literally only for upsertSubscription but left the other two unspecified beyond 'insert processedStripeEvents row')"

patterns-established:
  - "Every subscriptions.ts internalMutation follows: (1) idempotency check by stripeEventId -> early return, (2) anomaly-sentinel resolution check (clerkUserId or stripeSubscriptionId) -> early return, (3) the actual state mutation, (4) insert processedStripeEvents row, (5) return { success: true }"

requirements-completed: [PAY-03]

# Metrics
duration: ~25min
completed: 2026-07-08
---

# Phase 02 Plan 02: Subscriptions Internal Mutations Summary

**Real, atomic, idempotent upsertSubscription/deleteSubscription/markPastDue/getSubscription implementations in convex/subscriptions.ts, replacing all 3 Phase 1 throw-stubs, covered by 11 passing convex-test cases**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-08T14:49:00+02:00 (approx, first file reads)
- **Completed:** 2026-07-08T15:12:09+02:00
- **Tasks:** 2 (both `tdd="true"`, RED/GREEN gates for each)
- **Files modified:** 2 (`convex/subscriptions.ts`, `convex/subscriptions.test.ts` [new])

## Accomplishments

- `getSubscription` implemented as an indexed `by_clerkUserId` lookup returning the row or `null`
- `upsertSubscription` implemented with atomic idempotency check-and-mark (D-14/D-15), patch-or-insert on `subscriptions`, and a never-throw anomaly sentinel for missing `clerkUserId` (D-12)
- `deleteSubscription` implemented with the same idempotency/anomaly pattern; deleting an already-gone row is treated as a no-op success, not an anomaly
- `markPastDue` implemented resolving entirely via the new `by_stripeSubscriptionId` index — no `clerkUserId` argument, no Stripe API round-trip (D-05/D-08)
- `convex/subscriptions.ts` has zero remaining `"Not implemented — Phase 2"` throw-stubs
- 11/11 tests pass in `convex/subscriptions.test.ts`; `npx tsc --noEmit` and `npx eslint` both clean

## Task Commits

Each task followed the RED -> GREEN TDD gate sequence with its own commits:

1. **Task 1: upsertSubscription + getSubscription**
   - `002411d` (test) - failing tests for creation, idempotent replay, patch-on-second-event, anomaly sentinel, null lookup
   - `1a666df` (feat) - real implementations; all 5 tests green
2. **Task 2: deleteSubscription + markPastDue**
   - `f4e82e8` (test) - failing tests for deletion, idempotent delete replay, delete anomaly, markPastDue resolution/anomaly/idempotency
   - `81c43d0` (feat) - real implementations; full suite (11/11) green

**Plan metadata:** (this commit) - docs: complete plan

_TDD gate sequence verified in git log: test(02-02) -> feat(02-02) -> test(02-02) -> feat(02-02), each GREEN commit immediately following its RED commit._

## Files Created/Modified

- `convex/subscriptions.ts` - All 4 exports (`getSubscription`, `upsertSubscription`, `deleteSubscription`, `markPastDue`) fully implemented; zero remaining Phase 1 stubs
- `convex/subscriptions.test.ts` - New. 11 `convex-test` cases covering idempotency, upsert/patch, delete, anomaly sentinels, and `by_stripeSubscriptionId` resolution

## Decisions Made

- **import.meta.glob typing:** cast to a local ambient type instead of referencing `vite/client` (not a hoisted top-level dependency under this repo's pnpm layout) or extending `tsconfig.json`'s global `types` array (would affect the whole repo's type-checking scope for a test-only concern). Confirmed `npx tsc --noEmit` is clean with the cast in place.
- **Return-value convention for deleteSubscription/markPastDue:** plan's action text only explicitly specified `{ success: true }` for `upsertSubscription`; extended the same convention to the other two happy-path returns for consistency, since no conflicting instruction existed and 02-PATTERNS.md was not present in this worktree to check against (file referenced in plan context did not exist on disk — proceeded using 02-CONTEXT.md's D-12/D-14/D-15 decisions directly, which fully specify the sentinel/idempotency contract).

## Deviations from Plan

None - plan executed as written. The two decisions above are implementation-detail fills for gaps the plan's action text left unspecified (not deviations from anything explicitly stated).

## Issues Encountered

- `node_modules` was not yet installed in this fresh worktree; ran `pnpm install` before any test could execute (no lockfile changes, existing `pnpm-lock.yaml` from Plan 02-01 already had the right versions pinned).
- `.planning/phases/02-webhook-handler-convex-internal-mutations/02-PATTERNS.md` is referenced in the plan's `<context>` block but does not exist in this worktree — proceeded using `02-CONTEXT.md`'s decisions (D-01 through D-15) directly, which fully cover the implementation contract this plan needed (idempotency shape, anomaly sentinel convention, index usage).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `convex/subscriptions.ts` is fully implemented and ready for `convex/stripeWebhooks.ts` (Plan 02-04) to call via `ctx.runMutation(internal.subscriptions.*)`
- The idempotency-first mutation shape established here (`processedStripeEvents` check as step 1, anomaly sentinel as step 2) is the pattern Plan 02-03 (`aiCredits.ts`) should replicate
- No blockers for subsequent waves in this phase

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Completed: 2026-07-08_

## Self-Check: PASSED

- FOUND: convex/subscriptions.ts
- FOUND: convex/subscriptions.test.ts
- FOUND: .planning/phases/02-webhook-handler-convex-internal-mutations/02-02-SUMMARY.md
- FOUND: commit 002411d
- FOUND: commit 1a666df
- FOUND: commit f4e82e8
- FOUND: commit 81c43d0
