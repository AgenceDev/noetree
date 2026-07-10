---
phase: 5
slug: ai-credits-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-10
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                   |
| ---------------------- | ----------------------------------------------------------------------- |
| **Framework**          | vitest (via `convex-test`, `edge-runtime` environment)                  |
| **Config file**        | `vitest.config.ts`                                                      |
| **Quick run command**  | `npx vitest run convex/aiCredits.test.ts convex/stripeWebhooks.test.ts` |
| **Full suite command** | `npm run test:unit` (`vitest run`)                                      |
| **Estimated runtime**  | ~10 seconds                                                             |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/aiCredits.test.ts convex/stripeWebhooks.test.ts`
- **After every plan wave:** Run `npm run test:unit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave   | Requirement   | Threat Ref | Secure Behavior                                                                             | Test Type          | Automated Command                                                          | File Exists                    | Status     |
| -------- | ---- | ------ | ------------- | ---------- | ------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------- | ------------------------------ | ---------- |
| 05-01-01 | 01   | 1      | CRED-04       | T-05-02    | `deductCredit` reduces balance by 1, records `"deduction"` transaction                      | unit               | `npx vitest run convex/aiCredits.test.ts -t "deductCredit"`                | ❌ W0                          | ⬜ pending |
| 05-01-02 | 01   | 1      | CRED-04       | T-05-02    | Insufficient balance throws distinguishable error, does not mutate balance                  | unit               | `npx vitest run convex/aiCredits.test.ts -t "INSUFFICIENT_CREDITS"`        | ❌ W0                          | ⬜ pending |
| 05-01-03 | 01   | 1      | CRED-04 (SC1) | T-05-02    | Two concurrent `deductCredit` calls at balance=1 — only one succeeds (TOCTOU)               | unit               | `npx vitest run convex/aiCredits.test.ts -t "concurrent"`                  | ❌ W0                          | ⬜ pending |
| 05-01-04 | 01   | 1      | CRED-02       | —          | `getCredits` returns current balance reactively                                             | unit (existing)    | `npx vitest run convex/aiCredits.test.ts -t "getCredits"`                  | ✅ existing                    | ⬜ pending |
| 05-02-01 | 02   | 1      | PAY-05        | T-05-03    | `checkout.session.completed` with `mode: "payment"` calls `addCredits`, balance += 50       | unit               | `npx vitest run convex/stripeWebhooks.test.ts -t "payment"`                | ❌ W0                          | ⬜ pending |
| 05-02-02 | 02   | 1      | PAY-05        | T-05-03    | Duplicate payment-mode event (same `stripeEventId`) does not double-credit                  | unit               | `npx vitest run convex/stripeWebhooks.test.ts -t "idempotent"`             | ❌ W0                          | ⬜ pending |
| 05-02-03 | 02   | 1      | PAY-05        | —          | `mode: "subscription"`/absent still routes to `upsertSubscription`, unaffected (regression) | unit (regression)  | `npx vitest run convex/stripeWebhooks.test.ts`                             | ✅ existing, must keep passing | ⬜ pending |
| 05-01-05 | 01   | 1      | D-07          | —          | Schema accepts `type: "refund"` on `creditTransactions`                                     | unit               | covered implicitly by refund-path test                                     | ❌ W0                          | ⬜ pending |
| 05-04-01 | 04   | Manual | T-05-01       | T-05-01    | `clerkUserId` derived server-side only, never accepted as client argument                   | manual/code review | grep for client-supplied `clerkUserId` args in new mutations/Server Action | N/A                            | ⬜ pending |
| 05-04-02 | 04   | Manual | T-05-04       | T-05-04    | Top-up Server Action independently re-verifies Pro status server-side                       | manual/code review | grep for `status === "active"` check in top-up Server Action               | N/A                            | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `convex/aiCredits.test.ts` — new `describe("aiCredits.deductCredit")` block: success path (balance decrements, transaction recorded), insufficient-balance throw, no-existing-row-for-Pro-user edge case, concurrency test using `Promise.all` against two `t.mutation` calls at balance=1.
- [ ] `convex/aiCredits.test.ts` — new `describe("aiCredits.addCredits")` block: success path (balance increments by 50, `"topup"` transaction with `stripePaymentIntentId` recorded), no-existing-row insert path, idempotency by `stripeEventId`.
- [ ] `convex/stripeWebhooks.test.ts` — new test(s) for `checkout.session.completed` with `mode: "payment"`, asserting `addCredits` is invoked and existing subscription-mode tests (no `mode` field on fixture) remain unaffected.
- [ ] No new test-framework install needed — `vitest`/`convex-test`/`edge-runtime` already configured and working.

---

## Manual-Only Verifications

| Behavior                                                                                    | Requirement      | Why Manual                                                                                                                                   | Test Instructions                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar AI button + balance badge render correctly, zero-credit dialog branches CTA by plan | CRED-02, CRED-03 | UI-only, placeholder action has no observable network effect to assert against; no Cypress spec wired into `npm run test:unit` for this flow | Open editor as Free user (button visible, blocked, "Upgrade to Pro" CTA), then as Pro user with balance=0 (blocked, "Buy 50 credits" CTA), then as Pro user with balance>0 (action succeeds, balance decrements in UI) |
| Stripe Checkout top-up purchase end-to-end (real payment redirect)                          | PAY-05 (SC4)     | Requires live/test-mode Stripe Checkout redirect and webhook delivery, not unit-testable                                                     | Trigger "Buy 50 credits" as Pro user, complete Stripe test-mode Checkout, verify balance += 50 and transaction history entry via `stripe listen --forward-to` per Phase 3 established flow                             |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
