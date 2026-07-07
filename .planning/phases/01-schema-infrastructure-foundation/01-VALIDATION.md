---
phase: 1
slug: schema-infrastructure-foundation
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework**          | No unit/schema test runner wired for this phase's checks — verification relies on Convex/TypeScript compile gates. Jest 29.7.0 + `@testing-library/react` 16.2.0 are devDependencies but the `test` npm script does not invoke Jest (`scripts.test` = `prettier --write . && eslint app/ --fix`); Cypress 13.17.0 exists as a separate e2e suite. |
| **Config file**        | No standalone `jest.config.*` found at repo root — verify presence during planning; `cypress.config.ts` exists                                                                                                                                                                                                                                    |
| **Quick run command**  | `npx convex dev --once` (Convex schema/stub compile) + `npx tsc --noEmit` (Next.js typecheck)                                                                                                                                                                                                                                                     |
| **Full suite command** | `npm run build` (exercises Next.js typecheck/bundle and confirms Stripe package resolution)                                                                                                                                                                                                                                                       |
| **Estimated runtime**  | ~20s quick / ~90s full                                                                                                                                                                                                                                                                                                                            |

---

## Sampling Rate

- **After every task commit:** Run `npx convex dev --once` and `npx tsc --noEmit`
- **After every plan wave:** Run `npm run build` + manual env var checklist against D-05
- **Before `/gsd:verify-work`:** All 5 phase success criteria manually confirmed true (this phase is infra/config-heavy — full automation of "are all envs set in Vercel dashboard" is not realistic)
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement                 | Threat Ref                          | Secure Behavior                                                                                                                   | Test Type   | Automated Command                                                                                                                                    | File Exists                                 | Status     |
| -------- | ---- | ---- | --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| 01-01-xx | 01   | 1    | SC-1 (schema compiles)      | —                                   | 4 new tables (`subscriptions`, `aiCredits`, `creditTransactions`, `processedStripeEvents`) added without breaking existing schema | smoke       | `npx convex dev --once`                                                                                                                              | ❌ W0 — no existing schema-compile CI check | ⬜ pending |
| 01-01-xx | 01   | 1    | SC-2 (env vars present)     | T-14 Configuration                  | 5 required env vars present in local/staging/prod with no `NEXT_PUBLIC_` prefix on secrets                                        | manual-only | `grep` of `.env.local`/`.env.example` keys vs. D-05 list; Vercel dashboard inspection for staging/prod                                               | N/A — inherently manual                     | ⬜ pending |
| 01-01-xx | 01   | 1    | SC-3 (packages installed)   | —                                   | `stripe` and `@stripe/stripe-js` installed and importable                                                                         | smoke       | `npx tsc --noEmit` over a file importing `Stripe`/`loadStripe` (or covered implicitly once stub files import them)                                   | ❌ W0 — no existing importability check     | ⬜ pending |
| 01-01-xx | 01   | 1    | SC-4 (middleware exclusion) | T-4 Access Control / CVE-2026-41248 | `/api/webhooks/**` bypasses Clerk auth; `/dashboard` still protected; `@clerk/nextjs` bumped to `>=6.39.2`                        | unit/manual | No existing middleware test infra — manual: hit stub `/api/webhooks/test` unauthenticated (no redirect) and `/dashboard` unauthenticated (redirects) | ❌ W0 — no middleware test exists           | ⬜ pending |
| 01-01-xx | 01   | 1    | SC-5 (stubs compile/deploy) | V5 Input Validation                 | `convex/subscriptions.ts` and `convex/aiCredits.ts` stubs compile and deploy cleanly with typed args                              | smoke       | `npx convex dev --once` (same check as SC-1)                                                                                                         | ❌ W0 — same gap as SC-1                    | ⬜ pending |

_Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky_

---

## Wave 0 Requirements

- [ ] No automated check currently exists for "Convex schema compiles cleanly" as a repeatable step — document `npx convex dev --once` as the required pre-merge command for this phase (full CI wiring is out of scope for an infra-foundation phase)
- [ ] No middleware-level test (unit or Cypress) exists to assert `/api/webhooks/**` bypasses auth while `/dashboard` still requires it — manual verification is acceptable for this phase; do not add new test infra unless the planner decides it's in scope
- [ ] Confirm `.gitignore`'s blanket `.env*` rule is patched with `!.env.example` before D-04's `.env.example` file is added, or it will be silently ignored

---

## Manual-Only Verifications

| Behavior                                                                                    | Requirement          | Why Manual                                                                                                             | Test Instructions                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 5 env vars present in local/staging/production with correct secret/public split         | SC-2                 | External system state (Vercel dashboard, local `.env.local`) — no local automated check can verify remote environments | Check `.env.local` and `.env.example` against D-05 list locally; inspect Vercel project settings for staging and production environments; confirm no `NEXT_PUBLIC_` prefix on `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` |
| Clerk middleware correctly excludes webhook routes while preserving `/dashboard` protection | SC-4                 | No middleware test harness exists in this repo                                                                         | Hit a stub `/api/webhooks/test` route while unauthenticated — expect no redirect to sign-in; hit `/dashboard` while unauthenticated — expect redirect to sign-in                                                             |
| Stripe Dashboard test-mode products created with real Price IDs (D-03)                      | SC-2 (Price ID vars) | Requires interaction with external Stripe Dashboard, not scriptable from this repo                                     | Create Pro and Top-up products in Stripe Dashboard test mode; copy `price_xxx` IDs into `STRIPE_PRO_PRICE_ID` / `STRIPE_TOPUP_PRICE_ID`                                                                                      |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — confirmed by gsd-plan-checker: every `auto` task across 01-01–01-04 has a concrete `<automated>` command (`npx convex dev --once`, `npx tsc --noEmit`, `npm ls @clerk/nextjs && node -e "require('stripe')" && npx tsc --noEmit`, `git check-ignore -v .env.example`, `grep -c -E ... .env.local`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references — no `<automated>MISSING</automated>` references found; the Wave 0 items above are pre-existing repo-wide gaps (no CI wiring, no middleware test harness), not blockers for this phase's task-level checks
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-07 (verified by gsd-plan-checker against 01-01–01-04 PLAN.md)
