---
phase: 03
slug: checkout-flow-pricing-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-09
---

# Phase 03 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | Vitest 4.1.10 (`vitest.config.ts`, `environment: "edge-runtime"`, `convex-test` inlined) + Cypress 15.16.0 (`cypress.config.ts`, `@clerk/testing/cypress` already wired via `clerkSetup`) |
| **Config file**        | `vitest.config.ts` (repo root), `cypress.config.ts` (repo root)                                                                                                                           |
| **Quick run command**  | `npm run test:unit`                                                                                                                                                                       |
| **Full suite command** | `npm run test:unit && npm run test-cypress`                                                                                                                                               |
| **Estimated runtime**  | ~90 seconds                                                                                                                                                                               |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:unit`
- **After every plan wave:** Run `npm run test:unit && npm run test-cypress`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement | Threat Ref                    | Secure Behavior                                                                                                                   | Test Type            | Automated Command                                                                                    | File Exists | Status     |
| -------- | ---- | ---- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| 03-01-01 | 01   | 1    | PLAN-01     | —                             | N/A                                                                                                                               | cypress e2e          | `npx cypress run --spec cypress/integration/pricing.spec.ts`                                         | ❌ W0       | ⬜ pending |
| 03-01-02 | 01   | 1    | PAY-01      | T-03-02 (spoofed clerkUserId) | Server Action re-checks `auth()` server-side; never trusts client-supplied clerkUserId                                            | vitest unit          | `vitest run app/[locale]/(marketing)/pricing/actions.test.ts`                                        | ❌ W0       | ⬜ pending |
| 03-01-03 | 01   | 1    | PAY-01      | —                             | Redirect reaches Stripe's hosted checkout domain with correct price/metadata                                                      | cypress e2e          | `npx cypress run --spec cypress/integration/checkout-redirect.spec.ts`                               | ❌ W0       | ⬜ pending |
| 03-02-01 | 02   | 2    | PAY-02      | —                             | Success page reads (never writes) the Convex `subscriptions` row; shows "Subscription active" once webhook-seeded row is `active` | vitest + convex-test | `vitest run app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx` (needs jsdom override) | ❌ W0       | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] `cypress/integration/pricing.spec.ts` — covers PLAN-01
- [ ] `cypress/integration/checkout-redirect.spec.ts` — covers PAY-01 (redirect-reaches-Stripe assertion)
- [ ] `app/[locale]/(marketing)/pricing/actions.test.ts` — covers PAY-01 (Server Action logic, mocked Stripe)
- [ ] `app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx` — covers PAY-02 (needs `jsdom` environment override via `// @vitest-environment jsdom` docblock; add `jsdom` as a Vitest devDependency since only `@edge-runtime/vm` is currently installed)

---

## Manual-Only Verifications

| Behavior                                                                 | Requirement    | Why Manual                                                                                                                           | Test Instructions                                                                                                                                                                                     |
| ------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end real Stripe test-mode card payment completion                 | PAY-01, PAY-02 | Crossing into Stripe's hosted cross-origin checkout domain to enter real test-mode card details is high-effort and flake-prone in CI | Manually complete a Stripe test-mode checkout (card `4242 4242 4242 4242`) against `/pricing`, confirm redirect to success page and eventual "Subscription active" state once Phase 2's webhook fires |
| Duplicate-checkout customer reuse (no duplicate Stripe customer records) | PAY-01         | Requires two full checkout flows with the same email against the live/test Stripe API, not easily mocked meaningfully                | Complete checkout once, then trigger "Upgrade to Pro" again with the same signed-in user/email; confirm in Stripe Dashboard (test mode) that no second Customer object was created                    |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
