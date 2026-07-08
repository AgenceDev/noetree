---
phase: 02-webhook-handler-convex-internal-mutations
plan: 03
subsystem: payments
tags: [convex, stripe, credits, idempotency, vitest, convex-test]

# Dependency graph
requires:
  - phase: 02-webhook-handler-convex-internal-mutations
    provides: "Plan 02-01's Vitest + convex-test toolchain and subscriptions.by_stripeSubscriptionId schema index"
provides:
  - "Real resetCredits/getCredits implementations in convex/aiCredits.ts (CRED-01)"
  - "convex/aiCredits.test.ts — convex-test coverage for cross-table clerkUserId resolution, balance reset, and stripeEventId idempotency"
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resetCredits resolves clerkUserId internally via subscriptions.by_stripeSubscriptionId instead of receiving it as an argument (contrast with subscriptions.ts's clerkUserId-as-arg functions)"
    - "Idempotency check-and-mark (processedStripeEvents) and the state write happen inside one internalMutation transaction, never split across an action's runQuery/runMutation calls"
    - "D-12 anomaly cases return a sentinel object ({ anomaly: ... }) instead of throwing, so the caller (Plan 02-04's dispatcher action) can treat them as a 200 no-op"

key-files:
  created: [convex/aiCredits.test.ts]
  modified: [convex/aiCredits.ts]

key-decisions:
  - "Ran `pnpm install --frozen-lockfile` at the start of this plan because node_modules was entirely absent in this worktree (fresh checkout) — required before any vitest/tsc verification could run; no lockfile or package.json changes resulted"
  - 'Worked around a TS2339 (`Property ''glob'' does not exist on type ''ImportMeta''`) in the RED test by casting `import.meta` through an inline structural type instead of adding a `vite/client` triple-slash reference — vite is a transitive dependency (via vitest) not hoisted to top-level node_modules under this repo''s pnpm layout, so `/// <reference types="vite/client" />` would not resolve. The cast preserves the literal `import.meta.glob(...)` call shape so Vite''s static glob transform still detects it at test-run time (confirmed: tests still pass post-cast).'

patterns-established:
  - "Convex-side TDD tests seed cross-table fixtures directly via `t.run(ctx => ctx.db.insert(...))` rather than calling not-yet-implemented sibling mutations (subscriptions.ts's upsertSubscription is still a Phase 1 stub in this parallel wave)"

requirements-completed: [CRED-01]

# Metrics
duration: ~25min
completed: 2026-07-08
---

# Phase 02 Plan 03: resetCredits/getCredits Cross-Table Credit Reset Summary

**Implemented `resetCredits` (CRED-01) — an internalMutation that resolves `clerkUserId` via the `subscriptions.by_stripeSubscriptionId` index and atomically resets `aiCredits.balance` to 100 with idempotent replay protection, verified by 6 passing convex-test cases**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-08T15:03Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2 (convex/aiCredits.ts, convex/aiCredits.test.ts)

## Accomplishments

- `resetCredits` resolves `clerkUserId` exclusively via `subscriptions.by_stripeSubscriptionId` — never via a direct argument, matching D-08/D-09
- Balance reset to exactly `MONTHLY_CREDIT_QUOTA = 100` on both the insert path (no prior `aiCredits` row) and the patch path (existing row)
- Idempotent by `stripeEventId`: replaying the same event returns `{ alreadyProcessed: true }` without a second `creditTransactions` insert (D-14/D-15)
- Unresolvable `stripeSubscriptionId` returns `{ anomaly: "no subscription for stripeSubscriptionId" }` and logs via `console.error` — never throws (D-12)
- `getCredits` implemented as a real query against `by_clerkUserId`, returning `null` when no row exists
- `deductCredit`/`addCredits` left untouched as Phase 1 stubs, correctly deferred to Phase 5 (CRED-04/PAY-05)
- `npx vitest run convex/aiCredits.test.ts` — 6/6 passing; `npx tsc --noEmit` — clean

## Task Commits

Each task was committed atomically, following the RED → GREEN TDD gate sequence:

1. **Task 1 (RED): failing tests for resetCredits/getCredits** - `8d913c4` (test)
2. **Task 1 (GREEN): resetCredits/getCredits implementation** - `a0dee09` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `convex/aiCredits.ts` - `getCredits` now queries `aiCredits` by `by_clerkUserId` and returns the row or `null`. `resetCredits`'s args changed from `{ clerkUserId }` to `{ stripeEventId, eventType, stripeSubscriptionId }`; handler resolves `clerkUserId` via `subscriptions.by_stripeSubscriptionId`, checks/marks `processedStripeEvents` idempotency inside the same transaction, patches-or-inserts `aiCredits`, and inserts one `creditTransactions` row of `type: "reset"`. `deductCredit`/`addCredits` untouched (Phase 1 stub bodies preserved, `// LEAVE UNCHANGED` comments added for clarity).
- `convex/aiCredits.test.ts` - New. 6 convex-test cases covering insert path, patch path, idempotent replay, D-12 anomaly sentinel (no throw), single `creditTransactions` row assertion, and `getCredits` null case.

## Decisions Made

- **`pnpm install --frozen-lockfile` before any verification:** this worktree had no `node_modules` at all (fresh checkout of a worktree branch); installed strictly from the existing `pnpm-lock.yaml` with zero lockfile drift.
- **`import.meta.glob` typing workaround:** cast `import.meta` through an inline structural type (`{ glob: (pattern: string) => Record<string, () => Promise<unknown>> }`) rather than referencing `vite/client` types, since `vite` is a transitive (not hoisted, not direct) dependency in this repo's pnpm layout and a triple-slash reference to it would fail to resolve. Verified the cast doesn't interfere with Vite's build-time `import.meta.glob` static analysis — tests still execute and pass with real module resolution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing node_modules via `pnpm install --frozen-lockfile`**

- **Found during:** Task 1, before writing the RED test (attempting to run `npx vitest` failed — no node_modules present)
- **Issue:** This worktree checkout had zero installed dependencies; `convex-test`/`vitest`/`@edge-runtime/vm` (installed by Plan 02-01 in a different worktree, already recorded in `pnpm-lock.yaml`) were unavailable locally.
- **Fix:** Ran `pnpm install --frozen-lockfile` to install exactly what's pinned in the existing lockfile — no dependency versions changed, no lockfile diff.
- **Files modified:** none (node_modules is gitignored; `git status --short` confirmed zero diff after install)
- **Verification:** `git status --short` empty after install; `npx vitest run --passWithNoTests`-equivalent (actual test run) succeeded afterward.
- **Committed in:** N/A — no files changed, nothing to commit.

**2. [Rule 3 - Blocking] Fixed `TS2339: Property 'glob' does not exist on type 'ImportMeta'` in the RED test**

- **Found during:** Task 1, GREEN phase (`npx tsc --noEmit` run as part of pre-commit verification)
- **Issue:** The root `tsconfig.json`'s `include: ["**/*.ts", ...]` type-checks `convex/aiCredits.test.ts`, but its `types: ["jest", "node"]` compiler option has no Vite client types, so `import.meta.glob(...)` (required by `convex-test`'s documented setup) failed to type-check. Adding `/// <reference types="vite/client" />` was not viable since `vite` is a transitive dependency of `vitest`, not hoisted to top-level `node_modules` and not a direct `package.json` dependency in this repo's pnpm layout.
- **Fix:** Replaced the literal `import.meta.glob(...)` call with a structurally-typed cast: `(import.meta as unknown as { glob: (pattern: string) => Record<string, () => Promise<unknown>> }).glob("./**/*.ts")`. This preserves the exact AST shape Vite's glob transform statically detects at test-run time.
- **Files modified:** `convex/aiCredits.test.ts`
- **Verification:** `npx tsc --noEmit` exits clean; `npx vitest run convex/aiCredits.test.ts` still passes 6/6 after the change (confirms Vite's transform still fires correctly through the cast).
- **Committed in:** `a0dee09` (GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues preventing task verification)
**Impact on plan:** Both fixes were prerequisites for running the plan's own required verification command (`npx vitest run convex/aiCredits.test.ts`) and for keeping `npx tsc --noEmit` clean, which is this repo's established Phase 1 convention. No scope creep — no additional features added beyond Task 1's `resetCredits`/`getCredits` implementation.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `convex/aiCredits.ts`'s `resetCredits` is ready to be called from Plan 02-04's `stripeWebhooks.ts` dispatcher action via `ctx.runMutation(internal.aiCredits.resetCredits, { stripeEventId, eventType, stripeSubscriptionId })` for `invoice.paid` events with `billing_reason: "subscription_cycle"`
- `getCredits` is ready for Settings page consumption (later phase) via `api.aiCredits.getCredits`
- `deductCredit`/`addCredits` remain correctly unimplemented, deferred to Phase 5 (CRED-04/PAY-05) — no action needed from this phase
- No blockers for Plan 02-04 (dispatcher action), which depends on this plan's `resetCredits` signature

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Completed: 2026-07-08_

## Self-Check: PASSED

- FOUND: convex/aiCredits.ts
- FOUND: convex/aiCredits.test.ts
- FOUND: .planning/phases/02-webhook-handler-convex-internal-mutations/02-03-SUMMARY.md
- FOUND: commit 8d913c4 (test - RED)
- FOUND: commit a0dee09 (feat - GREEN)
