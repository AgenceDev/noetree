---
phase: 2
slug: webhook-handler-convex-internal-mutations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-08
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | None currently wired for Convex-side unit tests (Jest is a devDependency but unconfigured — `test` script only runs `prettier --write` + `eslint --fix`, not a test runner). Add **Vitest** — Convex's official `convex-test` harness requires Vitest + `@edge-runtime/vm`, not Jest. |
| **Config file**        | none — Wave 0 installs (`vitest.config.ts` with `environment: "edge-runtime"`)                                                                                                                                                                                                        |
| **Quick run command**  | `npx vitest run convex/` (after Wave 0 setup)                                                                                                                                                                                                                                         |
| **Full suite command** | `npx vitest run` (after Wave 0 setup)                                                                                                                                                                                                                                                 |
| **Estimated runtime**  | ~15s quick / ~30s full                                                                                                                                                                                                                                                                |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run convex/` (after Wave 0 setup; before Wave 0, run `npx tsc --noEmit` as an interim smoke check)
- **After every plan wave:** Run `npx vitest run` (full suite) + one manual `stripe listen`/`stripe trigger` pass covering all 5 event types
- **Before `/gsd:verify-work`:** Full suite green + manual Stripe CLI verification of all 5 event types (per ROADMAP SC1) and one replay test (per ROADMAP SC2)
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement    | Threat Ref              | Secure Behavior                                                                            | Test Type          | Automated Command                                                                                                                             | File Exists                  | Status     |
| -------- | ---- | ---- | -------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- |
| 02-01-xx | 01   | 0    | — (infra)      | —                       | Vitest + convex-test + @edge-runtime/vm installed and configured                           | smoke              | `npx vitest run --reporter=verbose` (empty pass, config loads)                                                                                | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | PAY-03         | T-Spoofing (D-10)       | Invalid Stripe signature or wrong `INTERNAL_WEBHOOK_SECRET` returns 400, never 500         | integration        | `npx vitest run app/api/webhooks/stripe/route.test.ts`                                                                                        | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | PAY-03         | —                       | `checkout.session.completed` creates a `subscriptions` row with correct `clerkUserId`      | unit (convex-test) | `npx vitest run convex/subscriptions.test.ts -t "checkout.session.completed"`                                                                 | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | PAY-03         | Idempotency (D-14/D-15) | Replaying the same `stripeEventId` produces no duplicate row and no error                  | unit (convex-test) | `npx vitest run convex/subscriptions.test.ts -t "idempotent replay"`                                                                          | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | PAY-03         | —                       | All 5 handled event types + unhandled types return 200                                     | integration        | `npx vitest run app/api/webhooks/stripe/route.test.ts -t "event type dispatch"`                                                               | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | CRED-01        | —                       | `invoice.paid` with `billing_reason: subscription_cycle` resets `aiCredits` balance to 100 | unit (convex-test) | `npx vitest run convex/aiCredits.test.ts -t "subscription_cycle reset"`                                                                       | ❌ W0                        | ⬜ pending |
| 02-0x-xx | TBD  | TBD  | PAY-03/CRED-01 | —                       | Manual end-to-end smoke test across all 5 event types via live Stripe CLI                  | manual-only        | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger checkout.session.completed` / `stripe trigger invoice.paid` | n/a — ROADMAP SC1/SC3 manual | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

_Task IDs above are placeholders (`02-0x-xx`) — the planner assigns final plan/task IDs; this map should be reconciled against actual PLAN.md task IDs during plan-checker review._

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — `environment: "edge-runtime"` per `convex-test` docs
- [ ] `npm install --save-dev vitest convex-test @edge-runtime/vm` (verified live against npm registry: `vitest@4.1.10`, `convex-test@0.0.54`, `@edge-runtime/vm@5.0.0`)
- [ ] `convex/subscriptions.test.ts` — stubs for PAY-03 (row creation, idempotent replay, D-12 anomaly no-throw)
- [ ] `convex/aiCredits.test.ts` — stubs for CRED-01 (subscription_cycle reset to 100)
- [ ] `app/api/webhooks/stripe/route.test.ts` — stubs for PAY-03 signature verification (400 on bad sig, 400 on wrong shared secret, 200 across all 5 + unhandled event types)

**Package legitimacy note:** `vitest` was flagged `[SUS]` by slopcheck as a name-similarity false positive against `vite` — verified legitimate against npm registry and `github.com/vitest-dev/vitest` during research. Planner should note this in the Wave 0 task but does not need to block on it.

---

## Manual-Only Verifications

| Behavior                                                                               | Requirement  | Why Manual                                                                                                                                                                                  | Test Instructions                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| End-to-end webhook flow against a real local dev server and live Stripe CLI forwarding | PAY-03 (SC1) | ROADMAP SC1 explicitly specifies `stripe listen --forward-to localhost:3000/api/webhooks/stripe` as the verification method — this is a live network/process interaction, not unit-testable | Run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then `stripe trigger checkout.session.completed`; confirm a `subscriptions` row appears in the Convex dashboard with correct `clerkUserId` |
| Wrong webhook secret simulated via env var change                                      | PAY-03 (SC5) | Requires restarting the dev server with a modified `STRIPE_WEBHOOK_SECRET` env var — external process state, not unit-testable                                                              | Temporarily change `STRIPE_WEBHOOK_SECRET` to an incorrect value, restart dev server, send a real Stripe test event, confirm 400 (not 500)                                                                      |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
