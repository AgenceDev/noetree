---
phase: 06
slug: settings-page
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-11
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| **Framework**          | Vitest (`environment: "edge-runtime"`), `convex-test` for Convex function tests       |
| **Config file**        | `vitest.config.ts`                                                                    |
| **Quick run command**  | `npx vitest run convex/aiCredits.test.ts app/[locale]/(app)/settings/actions.test.ts` |
| **Full suite command** | `npx vitest run`                                                                      |
| **Estimated runtime**  | ~30 seconds                                                                           |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file>`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement      | Threat Ref | Secure Behavior                                                                                                                                                                      | Test Type               | Automated Command                                                              | File Exists                     | Status     |
| -------- | ---- | ---- | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ | ------------------------------- | ---------- |
| 06-01-01 | 01   | 1    | SET-01           | —          | Plan section renders current plan (Free/Pro) from identity-derived query                                                                                                             | manual UI check         | `npx vitest run` (no dedicated file yet)                                       | ❌ W0                           | ⬜ pending |
| 06-01-02 | 01   | 1    | SET-02           | —          | Renewal date rendered via `new Date(currentPeriodEnd * 1000)` — NOT raw seconds                                                                                                      | unit                    | new test asserting correct ms conversion for a realistic epoch-seconds fixture | ❌ W0                           | ⬜ pending |
| 06-01-03 | 01   | 1    | SET-03           | —          | Free user's Plan card shows "Upgrade to Pro" CTA linking to `/pricing`                                                                                                               | manual / component test | N/A (mirrors `UpgradeModal.tsx`'s untested CTA)                                | —                               | ⬜ pending |
| 06-02-01 | 02   | 1-2  | SET-04 / T-06-01 | T-06-01    | Cancel Server Action re-derives subscription via identity-scoped `getSubscription`, server-verifies `status === "active"` before calling Stripe with `cancel_at_period_end: true`    | unit                    | `npx vitest run app/[locale]/(app)/settings/actions.test.ts`                   | ❌ W0                           | ⬜ pending |
| 06-02-02 | 02   | 1-2  | PAY-04 / T-06-01 | T-06-01    | Resume Server Action server-verifies `cancelAtPeriodEnd === true` before calling Stripe with `cancel_at_period_end: false`                                                           | unit                    | same file as above                                                             | ❌ W0                           | ⬜ pending |
| 06-03-01 | 03   | 1    | SET-05 / T-06-04 | T-06-04    | `listMyTopups` is zero-argument, identity-derived (`ctx.auth.getUserIdentity().subject`), filters `type: "topup"`, returns `[]` for unauthenticated, never leaks another user's rows | unit (`convex-test`)    | `npx vitest run convex/aiCredits.test.ts`                                      | ❌ W0 (append to existing file) | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `app/[locale]/(app)/settings/actions.test.ts` — new file, covers SET-04/PAY-04 (cancel/resume Server Actions). Mirror the mock shape of `app/[locale]/(marketing)/pricing/actions.test.ts` exactly (mock `stripe`, `convex/browser`, `@clerk/nextjs/server`); assert the active-subscription guard rejects a Free/canceled caller before any Stripe call, mirroring `TOPUP_REQUIRES_PRO` in `notes/actions.ts`'s existing test coverage pattern.
- [ ] `convex/aiCredits.test.ts` — append test cases for the new `listMyTopups` query: identity-derivation (returns `[]` for unauthenticated, matching `getMyCredits`'s existing test), `type` filtering (mixed deduction/topup/reset/refund rows return only topups), and cross-user isolation (another user's topups never leak).
- [ ] No new framework install needed — Vitest + `convex-test` already fully configured.

---

## Manual-Only Verifications

| Behavior                                                                     | Requirement    | Why Manual                                                                  | Test Instructions                                                                                                                                              |
| ---------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings page renders Plan + Credits cards with correct visual layout        | SET-01, SET-05 | Layout/visual correctness is not meaningfully unit-testable                 | Sign in as both a Free and a Pro user, navigate to `/settings`, confirm both Card sections render as designed                                                  |
| Free user's "Upgrade to Pro" CTA opens the existing Phase 3 checkout flow    | SET-03         | End-to-end navigation + external Stripe Checkout redirect                   | Click CTA as a Free user, confirm redirect to `/pricing` then successful Checkout Session creation                                                             |
| Full cancel → "cancels on [date]" → resume round-trip against Stripe webhook | SET-04, PAY-04 | Requires live Stripe test-mode webhook delivery, not mockable in unit tests | Cancel a Pro subscription in Stripe test mode, confirm UI flips to "Cancels on [date]" after webhook fires, click Resume, confirm UI flips back to active      |
| Downgrade to Free at period end after `customer.subscription.deleted` fires  | SC4 (ROADMAP)  | Requires waiting for/simulating Stripe's period-end event                   | Use Stripe CLI to trigger `customer.subscription.deleted` for a cancelling test subscription, confirm Convex `subscriptions` row and UI both reflect Free plan |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-11 (gsd-plan-checker verification pass)
