---
phase: 02-webhook-handler-convex-internal-mutations
plan: 04
subsystem: payments
tags: [stripe, convex, action, webhook-dispatch, vitest, convex-test]

# Dependency graph
requires:
  - phase: 02-webhook-handler-convex-internal-mutations
    provides: "upsertSubscription/deleteSubscription/markPastDue (02-02) and resetCredits (02-03) internalMutations with idempotent check-and-write bodies"
provides:
  - "convex/stripeWebhooks.ts — the single public dispatcher action processWebhookEvent, the sole entry point between the Next.js webhook route and the Phase-1 tables"
  - "mapStripeSubscriptionStatus helper mapping Stripe's 8-value status union to the app's 3-value schema union"
  - "Full convex-test coverage (18 tests) of the auth gate and all 5 event-type dispatch branches plus the unhandled-type no-op"
affects: ["02-05"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Convex action calling ctx.runMutation(internal.*) exactly once per event-type branch, never runQuery-then-runMutation (closes the idempotency race per D-14/Pitfall 1)"
    - "action() builder requires an explicit `returns: v.any()` validator plus an explicit `Promise<any>` handler return-type annotation when the action module imports `internal`/`api` from _generated/api while also being one of the modules that api.d.ts aggregates — otherwise TypeScript raises a TS7022/TS7023 circular-inference error"

key-files:
  created: [convex/stripeWebhooks.ts, convex/stripeWebhooks.test.ts]
  modified: [convex/_generated/api.d.ts]

key-decisions:
  - "Manually patched convex/_generated/api.d.ts to register the new stripeWebhooks module (import + fullApi entry) since no live Convex deployment is configured in this worktree to run `npx convex dev`/`npx convex codegen`; the runtime api/internal objects use convex/server's anyApi Proxy so tests pass regardless, this patch only restores compile-time type correctness for api.stripeWebhooks.*/internal.stripeWebhooks.*"
  - "Added `returns: v.any()` to the action config and an explicit `Promise<any>` return-type annotation on the handler to break a TS7022/TS7023 circular type-inference error (stripeWebhooks.ts importing `internal` from _generated/api, which in turn aggregates typeof stripeWebhooks — a genuine self-reference the TS compiler cannot resolve without an explicit boundary)"
  - "subscription.id (the Subscription object's own ID) is read as a plain string, not run through the string-or-object narrowing used for session.customer/session.subscription/invoice.parent.subscription_details.subscription — Stripe's Subscription.id field is always a bare string on the object itself, unlike a reference field that can be expanded"

patterns-established:
  - "Dispatch-adjacent business logic (status-union mapping) lives in stripeWebhooks.ts, not in subscriptions.ts/aiCredits.ts, keeping those modules pure data-access per D-04"

requirements-completed: [PAY-03, CRED-01]

# Metrics
duration: ~25min
completed: 2026-07-08
---

# Phase 2 Plan 04: Stripe Webhook Dispatcher Action Summary

**Single public Convex action `processWebhookEvent` gating all 5 handled Stripe event types behind a shared-secret check and dispatching each to exactly one `internalMutation`, verified by 18 passing convex-test tests**

## Performance

- **Duration:** ~25 min
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `processWebhookEvent` action created as the sole public entry point: rejects any call whose `secret` doesn't match `process.env.INTERNAL_WEBHOOK_SECRET` with an `Error` whose message starts with `"Unauthorized"` (the exact prefix Plan 02-05's route handler will check to distinguish 400 from 500)
- `checkout.session.completed` resolves `clerkUserId` from `session.metadata?.clerkUserId` (nullable, per D-06) and reads the route-attached `subscriptionSnapshot` for status/currentPeriodEnd/cancelAtPeriodEnd, dispatching to `internal.subscriptions.upsertSubscription`
- `customer.subscription.updated`/`.deleted` resolve `clerkUserId` from `subscription.metadata.clerkUserId` (non-nullable, per D-07), reading `currentPeriodEnd` from `items.data[0].current_period_end` (the installed Stripe SDK has no top-level field)
- `mapStripeSubscriptionStatus` maps all 8 Stripe subscription statuses to the app's 3-value union (`trialing`/`active` → `active`; `past_due`/`unpaid`/`incomplete`/`paused` → `past_due`; `canceled`/`incomplete_expired` → `canceled`), covered by a parametrized test for every input
- `invoice.paid` resolves `stripeSubscriptionId` via `invoice.parent?.subscription_details?.subscription` (string or object form) and only calls `internal.aiCredits.resetCredits` when `billing_reason === "subscription_cycle"` — any other billing reason is a no-op, matching the Phase 2 scope boundary from RESEARCH.md Open Question 1
- `invoice.payment_failed` resolves the subscription the same way and calls `internal.subscriptions.markPastDue`
- Any event type outside the 5 handled ones falls through to `{ skipped: true }`, calling no mutation at all (D-13)

## Task Commits

Each task followed the RED → GREEN TDD cycle:

1. **Task 1: Auth gate + checkout.session.completed + subscription.updated/deleted dispatch**
   - `06fcab2` (test) — 13 failing tests for auth gate, checkout dispatch, subscription update/delete, status mapping
   - `6321aee` (feat) — `processWebhookEvent` handler implementing the auth gate + 3 event-type branches + `mapStripeSubscriptionStatus`; also patched `convex/_generated/api.d.ts` to register the new module
2. **Task 2: invoice.paid (billing_reason gate) + invoice.payment_failed + unhandled no-op**
   - `1e255a5` (test) — 5 additional failing/no-op tests for invoice.paid gate, invoice.payment_failed, object-form subscription resolution, unhandled type
   - `0ffc387` (feat) — implemented `invoice.paid`/`invoice.payment_failed` branches and the `default` no-op case

_No refactor commit was needed — the GREEN implementation for each task matched the plan's action block directly with no follow-up cleanup required._

## TDD Gate Compliance

Both tasks followed the mandatory RED → GREEN sequence:

- Task 1: `test(02-04)` commit `06fcab2` confirmed 13/13 new tests failing (module not found) before any implementation existed, then `feat(02-04)` commit `6321aee` brought all 13 to green.
- Task 2: `test(02-04)` commit `1e255a5` added 5 more tests; 3 asserted new behavior and failed as expected (invoice.paid reset, invoice.payment_failed, object-form resolution), while 2 (no-op billing_reason, unhandled type) passed trivially against the Task 1 placeholder — both are legitimate assertions of the placeholder's already-correct behavior, not accidentally-passing tests of the new logic under test. Then `feat(02-04)` commit `0ffc387` brought the full 18-test file to green.

Final state: `npx vitest run convex/stripeWebhooks.test.ts` → 18/18 passing. `npx vitest run convex/` (full suite) → 35/35 passing.

## Files Created/Modified

- `convex/stripeWebhooks.ts` - The `processWebhookEvent` public action: shared-secret gate, `mapStripeSubscriptionStatus` helper, switch/dispatch over all 5 handled event types plus default no-op
- `convex/stripeWebhooks.test.ts` - 18 convex-test tests covering the auth gate, all 5 dispatch branches (including the D-12 null-metadata anomaly path and the D-13 billing_reason/unhandled-type no-op paths), and the full 8-value status-mapping table
- `convex/_generated/api.d.ts` - Registered the new `stripeWebhooks` module (import + `fullApi` entry) so `api.stripeWebhooks.*`/`internal.stripeWebhooks.*` type-check correctly

## Decisions Made

- Manually patched `convex/_generated/api.d.ts` rather than running `npx convex dev` (no live deployment configured in this isolated worktree). The runtime `api`/`internal` objects are `anyApi` Proxies (see `convex/_generated/api.js`) that resolve function paths dynamically regardless of what's declared in the `.d.ts` file, so tests were never blocked by this — the patch exists purely to keep `npx tsc --noEmit` clean. This should be verified/regenerated properly by `npx convex dev` the next time a live deployment is available (flagging for phase-level attention, not a re-open of this plan).
- Added `returns: v.any()` to the action definition and an explicit `Promise<any>` return-type annotation on the handler to resolve a genuine TypeScript circular-inference error (TS7022/TS7023): `stripeWebhooks.ts` is the only module in this codebase that both defines an exported Convex function AND imports `internal` from `_generated/api` to call other modules' mutations — `_generated/api.d.ts`'s `fullApi` type aggregates `typeof stripeWebhooks`, creating a genuine self-reference that TypeScript cannot resolve without an explicit type boundary. This is a documented Convex pattern, not a workaround for a code bug.
- `subscription.id` in the `customer.subscription.updated`/`.deleted` branches is read as a plain string (no string-or-object narrowing) because Stripe's `Subscription.id` field on the subscription object itself is always a bare string — the string-or-object union only applies to _reference_ fields like `session.subscription` or `invoice.parent.subscription_details.subscription`, which can be expanded to the full nested object depending on the API call that produced them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `returns: v.any()` + explicit `Promise<any>` handler return type to break a TS7022/TS7023 circular-inference error**

- **Found during:** Task 1, after GREEN tests passed — `npx tsc --noEmit -p .` failed with `processWebhookEvent implicitly has type 'any' because it is referenced in its own initializer`
- **Issue:** The plan's action block as written (no `returns` validator, no explicit handler return type) compiles at the JS/test level but fails `tsc --noEmit`, since `stripeWebhooks.ts` is the first module in the repo to both export a Convex function and import `internal` from `_generated/api` — creating a genuine circular type dependency through `fullApi`
- **Fix:** Added `returns: v.any()` to the action config and `: Promise<any>` on the handler's async function signature
- **Files modified:** `convex/stripeWebhooks.ts`
- **Verification:** `npx tsc --noEmit -p .` produces zero errors referencing `stripeWebhooks.ts`; all 18 tests still pass
- **Committed in:** `6321aee` (Task 1 commit)

**2. [Rule 3 - Blocking] Manually registered the new module in `convex/_generated/api.d.ts`**

- **Found during:** Task 1, immediately after creating `convex/stripeWebhooks.ts`
- **Issue:** `api.d.ts`/`internal.d.ts` type declarations only list modules present at last codegen; this worktree has no `CONVEX_DEPLOYMENT` configured, so `npx convex dev`/`npx convex codegen` cannot run to auto-regenerate them, leaving `api.stripeWebhooks.*` and `internal.stripeWebhooks.*` untyped (`tsc` errors, though tests still ran fine via the runtime `anyApi` Proxy)
- **Fix:** Added `import type * as stripeWebhooks from "../stripeWebhooks.js";` and a `stripeWebhooks: typeof stripeWebhooks;` entry to `fullApi` in `convex/_generated/api.d.ts`, matching the existing pattern for `aiCredits`/`notes`/`subscriptions`/`users`
- **Files modified:** `convex/_generated/api.d.ts`
- **Verification:** `npx tsc --noEmit -p .` clean; existing `subscriptions.test.ts`/`aiCredits.test.ts` still pass (35/35 full suite)
- **Committed in:** `6321aee` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking TypeScript/codegen issues)
**Impact on plan:** Both fixes were necessary to keep the codebase's `tsc --noEmit` check green; neither changes the behavior described in the plan's `<behavior>`/`<action>` blocks. No scope creep.

## Verification Note: Plan Acceptance-Criteria Grep Pattern Discrepancy

Task 1's acceptance criteria includes: `grep -c "items?.data?\[0\]?.current_period_end\|items.data\[0\].current_period_end" convex/stripeWebhooks.ts` returns at least 1. As literally written (BRE, no `-E`), this pattern cannot match valid TypeScript optional-chaining syntax `items?.data?.[0]?.current_period_end` — the pattern's `?` characters are treated as literal characters (not quantifiers) in POSIX BRE, and neither alternative accounts for the second `.` that valid `?.[` computed-optional-chaining syntax requires. This returns 0 regardless of correctness. The actual code at `convex/stripeWebhooks.ts` (both `customer.subscription.updated` and the general pattern) correctly reads `subscription.items?.data?.[0]?.current_period_end ?? 0` — never the nonexistent top-level `subscription.current_period_end` field (confirmed separately: that grep returns 0 as required). This is flagged as a plan-verification-script issue, not a code defect; the real verification (the 18-test vitest suite, including the explicit `999`-value assertion on `currentPeriodEnd` in the `customer.subscription.updated` test) passes.

## Issues Encountered

None beyond the TypeScript circularity issue documented above under Deviations.

## User Setup Required

None — no external service configuration required by this plan. `INTERNAL_WEBHOOK_SECRET` was already documented in `.env.example` by Plan 02-01; this plan only reads it via `process.env`.

## Next Phase Readiness

- `convex/stripeWebhooks.ts`'s `processWebhookEvent` is ready to be called from Plan 02-05's Next.js route handler (`app/api/webhooks/stripe/route.ts`) via `convex.action(api.stripeWebhooks.processWebhookEvent, { event, secret })`
- The `"Unauthorized"`-prefixed error message contract is in place for Plan 02-05 to map to a 400 response
- Flag for later: this worktree has no live Convex deployment configured, so `convex/_generated/api.d.ts`/`api.js` were hand-patched for the new module rather than regenerated via `npx convex dev`. The next environment with a live deployment should run `npx convex dev` once to confirm the generated files match what would be auto-produced (expected: identical, since the hand-patch followed the exact existing pattern) — no action required unless a mismatch is found.

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Completed: 2026-07-08_

## Self-Check: PASSED

- FOUND: convex/stripeWebhooks.ts
- FOUND: convex/stripeWebhooks.test.ts
- FOUND: .planning/phases/02-webhook-handler-convex-internal-mutations/02-04-SUMMARY.md
- FOUND: 06fcab2 (test commit, Task 1 RED)
- FOUND: 6321aee (feat commit, Task 1 GREEN)
- FOUND: 1e255a5 (test commit, Task 2 RED)
- FOUND: 0ffc387 (feat commit, Task 2 GREEN)
