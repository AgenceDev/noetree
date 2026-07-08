# Phase 2: Webhook Handler + Convex Internal Mutations - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 2-Webhook Handler + Convex Internal Mutations
**Areas discussed:** Convex auth mechanism, clerkUserId resolution per event, Failure/retry semantics, Idempotency mechanics

---

## Convex auth mechanism

| Question             | Option                               | Description                                                                                                                                              | Selected |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Invocation mechanism | Public dispatcher action             | One public Convex `action` receives the verified event via existing `NEXT_PUBLIC_CONVEX_URL`; calls `ctx.runMutation()` internally. No new admin secret. | ✓        |
|                      | Admin/deploy-key client              | ConvexHttpClient + new `CONVEX_DEPLOY_KEY` calls internalMutations directly.                                                                             |          |
|                      | Make mutations public                | Reverses Phase 1's client-write-blocking lock.                                                                                                           |          |
| Action protection    | Shared secret argument               | New `INTERNAL_WEBHOOK_SECRET` env var, set in both Next.js and Convex; action rejects mismatched calls.                                                  | ✓        |
|                      | Re-verify Stripe signature in Convex | Duplicate verification logic; needs Stripe secret in Convex env too.                                                                                     |          |
|                      | No extra check                       | URL is visible client-side — no real protection.                                                                                                         |          |
| Granularity          | One dispatcher action                | Switch on event type internally, single auth check.                                                                                                      | ✓        |
|                      | One action per event type            | 5 separate actions, more surface area to secure.                                                                                                         |          |
| File layout          | New `convex/stripeWebhooks.ts`       | Dedicated dispatcher file, keeps subscriptions.ts/aiCredits.ts pure CRUD.                                                                                | ✓        |
|                      | Add into subscriptions.ts            | Mixes dispatch logic with Phase 1 CRUD module.                                                                                                           |          |

**User's choice:** All recommended options selected without deviation.
**Notes:** None.

---

## clerkUserId resolution per event

| Question                     | Option                                            | Description                                                                                               | Selected |
| ---------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------- |
| subscription.updated/deleted | Read subscription.metadata.clerkUserId            | Metadata already echoed from checkout (Phase 1 D-01).                                                     | ✓        |
|                              | Look up by stripeSubscriptionId                   | Would need new index, unnecessary extra lookup here.                                                      |          |
| invoice.paid/payment_failed  | Look up by stripeSubscriptionId                   | New `by_stripeSubscriptionId` index added to subscriptions table. Row already exists from checkout event. | ✓        |
|                              | Fetch Subscription from Stripe API                | Extra network round-trip, new failure mode.                                                               |          |
| aiCredits linkage            | Reuse resolved clerkUserId                        | Existing `by_clerkUserId` index sufficient.                                                               | ✓        |
|                              | Add direct stripeSubscriptionId link on aiCredits | Redundant storage.                                                                                        |          |

**User's choice:** All recommended options selected without deviation.
**Notes:** This introduces a schema addition (`by_stripeSubscriptionId` index on `subscriptions`) not present in Phase 1 — flagged in CONTEXT.md D-08 for the planner.

---

## Failure/retry semantics

| Question                   | Option                       | Description                                                       | Selected |
| -------------------------- | ---------------------------- | ----------------------------------------------------------------- | -------- |
| Genuine processing failure | 500                          | Stripe auto-retries transient failures over ~3 days.              | ✓        |
|                            | Always 200, log only         | No auto-retry; relies on log monitoring.                          |          |
| Missing clerkUserId/row    | Log + return 200             | Retrying can't fix missing/stale metadata.                        | ✓        |
|                            | Return 500, let Stripe retry | Would retry indefinitely for an unfixable case.                   |          |
| Unhandled event type       | 200, no-op                   | Standard webhook practice, avoids retry storms.                   | ✓        |
|                            | Return 400                   | Would cause endless retries for events never meant to be handled. |          |

**User's choice:** All recommended options selected without deviation.
**Notes:** None.

---

## Idempotency mechanics

| Question           | Option                  | Description                                                                                          | Selected |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Atomicity          | Single atomic mutation  | Check `processedStripeEvents` + write state + insert idempotency row, all in one Convex transaction. | ✓        |
|                    | Separate check then act | Two round-trips, race window between duplicate deliveries.                                           |          |
| Duplicate handling | No-op, return 200       | Matches Stripe's expectation that a replayed event still succeeds.                                   | ✓        |
|                    | Throw an error          | Would cause 500 on a normal Stripe retry-after-slow-response.                                        |          |

**User's choice:** All recommended options selected without deviation.
**Notes:** None.

---

## Claude's Discretion

None flagged — all questions resolved to explicit user selections (the recommended option each time).

## Deferred Ideas

None — discussion stayed within phase scope.
