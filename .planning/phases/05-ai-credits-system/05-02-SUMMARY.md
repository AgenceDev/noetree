---
phase: 05-ai-credits-system
plan: 02
subsystem: payments
tags: [convex, stripe, webhooks, ai-credits, idempotency, tdd]

# Dependency graph
requires:
  - phase: 05-ai-credits-system (Plan 01)
    provides: deductCredit/runAiAction/getMyCredits, applyDeduction helper pattern, aiCredits/creditTransactions/processedStripeEvents schema
provides:
  - "addCredits internalMutation: idempotent +amount top-up on aiCredits, records a topup creditTransactions row"
  - "checkout.session.completed dispatcher branch: session.mode === 'payment' routes to addCredits with a hardcoded amount of 50"
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "addCredits mirrors resetCredits' idempotency-check-first shape (processedStripeEvents by_stripeEventId, checked before any balance write)"
    - "Webhook dispatcher stays the single writer (D-14) — new Stripe event routing added as a branch inside the existing checkout.session.completed case, not a new module/event type"
    - "Credited/deducted amounts are always literals in the dispatcher, never derived from Stripe response fields (session.amount_total, line items) — T-05-06 mitigation"

key-files:
  created: []
  modified:
    - convex/aiCredits.ts
    - convex/aiCredits.test.ts
    - convex/stripeWebhooks.ts
    - convex/stripeWebhooks.test.ts

key-decisions:
  - "addCredits final arg signature: { clerkUserId: v.string(), amount: v.number(), stripeEventId: v.string(), eventType: v.string(), stripePaymentIntentId: v.optional(v.string()) }"
  - "Top-up amount hardcoded to 50 in the stripeWebhooks.ts dispatcher branch (literal, not derived from Stripe)"
  - "[Rule 2] Added a missing-clerkUserId anomaly guard in the new payment-mode branch (mirrors the existing D-12 pattern in upsertSubscription/deleteSubscription) since addCredits' clerkUserId is a required v.string() per this plan's interface contract — an unguarded call would throw an uncaught ArgumentValidationError on null session.metadata, surfacing as a 500 to Stripe and triggering endless retries"

patterns-established:
  - "Payment-mode checkout events short-circuit at the top of the checkout.session.completed case before subscription-field resolution, leaving the subscription-upsert path byte-for-byte unchanged below the new branch"

requirements-completed: [PAY-05]

# Metrics
duration: 9min
completed: 2026-07-10
---

# Phase 5 Plan 02: AI Credits Top-up Crediting Summary

**Idempotent `addCredits` internalMutation (+50 balance, topup transaction) wired into the existing single-writer Stripe webhook dispatcher via a `session.mode === "payment"` branch, with a hardcoded credit amount and full idempotency/regression test coverage.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-10T22:32:10+02:00 (base commit)
- **Completed:** 2026-07-10T22:40:46+02:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `addCredits` internalMutation implemented: idempotency check against `processedStripeEvents` by `stripeEventId` before any write, patch-or-insert `+amount` on `aiCredits`, records a `"topup"` `creditTransactions` row with an optional `stripePaymentIntentId`
- `checkout.session.completed` dispatcher extended with an exact-match `session.mode === "payment"` branch that calls `internal.aiCredits.addCredits` with a hardcoded `amount: 50`, leaving the subscription-upsert path unchanged for `mode` undefined/`"subscription"`
- Full idempotency proven by test: replaying the same `stripeEventId` (both at the `addCredits` unit level and through the full webhook dispatcher) returns `{ alreadyProcessed: true }` on the second call and never double-credits
- Subscription-mode regression coverage: existing mode-absent fixture tests untouched and passing; added an explicit `mode: "subscription"` test proving it still routes to `upsertSubscription`, not `addCredits`

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement addCredits internalMutation (idempotent +50)** - `5c1239e` (feat)
2. **Task 2: Branch checkout.session.completed on session.mode → addCredits** - `e3184e5` (feat)

_Note: TDD tasks — tests and implementation were written and verified together per task (RED confirmed by design against the plan's `<behavior>` spec, GREEN confirmed by `npx vitest run` before commit); no separate test-only commit was created since both plan tasks bundle test+implementation in a single `<action>` block._

## Files Created/Modified

- `convex/aiCredits.ts` - `addCredits` internalMutation: extended args, idempotency check, patch-or-insert +amount, topup transaction, processedStripeEvents record
- `convex/aiCredits.test.ts` - 4 new tests under `describe("aiCredits.addCredits")`: patch path, insert path, idempotent replay, undefined stripePaymentIntentId
- `convex/stripeWebhooks.ts` - New `session.mode === "payment"` branch at the top of the `checkout.session.completed` case, with a missing-clerkUserId anomaly guard
- `convex/stripeWebhooks.test.ts` - `seedTopupCheckoutEvent` helper + 3 new tests: payment-mode crediting, idempotent replay, explicit subscription-mode regression

## Decisions Made

- `addCredits` arg signature finalized exactly per the plan's interface spec: `{ clerkUserId: v.string(), amount: v.number(), stripeEventId: v.string(), eventType: v.string(), stripePaymentIntentId: v.optional(v.string()) }`
- Top-up amount (50) is a literal in `stripeWebhooks.ts`, never derived from `session.amount_total` or line items (T-05-06 mitigation, verified by grep)
- `stripePaymentIntentId` read defensively (`typeof session.payment_intent === "string" ? ... : session.payment_intent?.id`) per RESEARCH.md A2 guidance — degrades gracefully to `undefined` when absent, which the schema's `v.optional` and `addCredits`' conditional-spread transaction insert both tolerate without a validator error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added missing-clerkUserId anomaly guard in the new payment-mode branch**

- **Found during:** Task 2 (Branch checkout.session.completed on session.mode)
- **Issue:** The plan's interface contract specifies `addCredits`' `clerkUserId` as a required `v.string()` (unlike `upsertSubscription`/`deleteSubscription`, which use `v.optional(v.string())` and self-guard with a `"missing clerkUserId"` anomaly return per the existing D-12 pattern). Without a guard in the dispatcher, a payment-mode `checkout.session.completed` event with `session.metadata` null/missing would call `addCredits` with `clerkUserId: undefined`, throwing an uncaught Convex `ArgumentValidationError` — surfacing as a 500 to Stripe and triggering endless webhook retries (the exact failure class the existing D-12 anomaly guards on `upsertSubscription`/`deleteSubscription` already prevent for the subscription path).
- **Fix:** Added an `if (!clerkUserId) { console.error(...); return { anomaly: "missing clerkUserId" }; }` guard at the top of the new payment-mode branch, before calling `addCredits`, mirroring the existing pattern exactly.
- **Files modified:** `convex/stripeWebhooks.ts`
- **Verification:** `npx tsc --noEmit` clean; full test suite green (no test was added specifically exercising this null-metadata + payment-mode combination, since it's outside this plan's stated `<behavior>` list, but the guard is defensive and mirrors already-tested D-12 code)
- **Committed in:** `e3184e5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical / Rule 2)
**Impact on plan:** Necessary for correctness — prevents an uncaught exception / Stripe retry storm on a malformed payment-mode event. No scope creep; the fix mirrors an existing codebase pattern (D-12) rather than introducing a new one.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `addCredits` and the `session.mode === "payment"` dispatcher branch are in place and fully tested (idempotent, hardcoded amount, subscription-mode regression-safe) — ready for Plan 03 (client-facing Checkout session creation for the top-up product) to wire a real `mode: "payment"` Stripe Checkout session with `metadata.clerkUserId` set.
- No blockers. Full unit suite (`npm run test:unit`) green at 79/79 tests across 7 files after this plan.
- `npx tsc --noEmit` clean.

---

_Phase: 05-ai-credits-system_
_Completed: 2026-07-10_
