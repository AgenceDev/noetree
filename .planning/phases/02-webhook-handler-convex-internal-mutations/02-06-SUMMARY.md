---
phase: 02-webhook-handler-convex-internal-mutations
plan: 06
subsystem: infra
tags: [stripe, convex, env-vars, webhooks, secrets, e2e-verification]

# Dependency graph
requires:
  - phase: 02-05
    provides: "Next.js webhook route (signature-verified) and stripeWebhooks.ts dispatcher action expecting INTERNAL_WEBHOOK_SECRET"
provides:
  - "INTERNAL_WEBHOOK_SECRET generated and propagated to local/staging/production"
  - "Live stripe listen/stripe trigger end-to-end verification of all 5 ROADMAP Phase 2 success criteria"
  - "Fix for convex/tsconfig.json missing node types (blocked all convex dev/deploy pushes)"
  - "Fix for invoice.payment_failed 500 on standalone (non-subscription) invoices"
affects: [phase-03, phase-04, phase-05, webhooks, payments]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-secret env var propagated per-environment via `npx convex env set` (mirrors Phase 1 Stripe webhook secret pattern)"
    - "stripe listen/stripe trigger --api-key used to force the CLI onto the same Stripe account as .env.local's STRIPE_SECRET_KEY (CLI's logged-in account differed from the app's configured test account)"
    - "Manual event replay via HMAC-SHA256 Stripe-Signature reconstruction (crypto.createHmac('sha256', wh_secret) over `${ts}.${body}`) used to test idempotency and to craft subscription-linked variants of trigger fixtures that don't natively support cross-referencing an existing subscription"

key-files:
  created: []
  modified:
    [
      .env.local,
      convex/tsconfig.json,
      convex/stripeWebhooks.ts,
      convex/stripeWebhooks.test.ts,
    ]

key-decisions:
  - "INTERNAL_WEBHOOK_SECRET generated locally via Node's crypto.randomBytes(32).toString('hex'); value never logged in full outside this session's local verification step"
  - ".env.local remains gitignored/untracked; the generated secret is never committed to git"
  - "Stripe CLI was logged into a different Stripe test account than .env.local's STRIPE_SECRET_KEY — used --api-key on every stripe listen/trigger invocation to force the correct account, since the webhook route calls stripe.subscriptions.retrieve() with STRIPE_SECRET_KEY during checkout.session.completed enrichment (a cross-account call would 404)"
  - "stripe trigger checkout.session.completed's default fixture is a one-time-payment (mode=payment) session with no customer/subscription attached — overrode to --override checkout_session:mode=subscription --override 'price:recurring.interval=month' --remove checkout_session:payment_intent_data to produce a realistic subscription checkout"
  - "stripe trigger invoice.paid/invoice.payment_failed's default fixtures create standalone invoices with no subscription reference — used stripe events retrieve to fetch a real subscription-linked invoice.paid event's JSON shape, then replayed modified copies (billing_reason override, subscription reference substitution) with freshly-computed valid signatures to exercise SC3 and the subscription-linked path of SC4 against the real dispatcher code"
  - 'Added convex/tsconfig.json types:["node"] (Rule 1 bug fix) — process.env usage in stripeWebhooks.ts was failing TS2591 typecheck, which was hard-blocking every `convex dev`/`convex deploy` push (no functions were live until this was fixed)'
  - "Added a stripeSubscriptionId guard to stripeWebhooks.ts's invoice.payment_failed case (Rule 1 bug fix) — Stripe sends invoice.payment_failed for standalone invoices too; the dispatcher unconditionally called markPastDue with an undefined stripeSubscriptionId, which is a required (non-optional) v.string() arg, crashing with an uncaught ArgumentValidationError -> 500 instead of a graceful no-op"

patterns-established: []

requirements-completed: [] # PAY-03/CRED-01 verified live but NOT marked complete — plan's own success_criteria requires the user to type "approved" in Task 3 before Phase 2 is considered complete. Do not mark complete until that happens.

# Metrics
duration: ~55min (Task 3 live verification + 2 bug fixes)
completed: IN PROGRESS — Tasks 1+2 done, Task 3 technically verified, AWAITING USER "approved" SIGN-OFF
---

# Phase 2 Plan 06: INTERNAL_WEBHOOK_SECRET Propagation + Live Stripe CLI Verification Summary (Tasks 1-2 done, Task 3 verified pending sign-off)

**All 5 ROADMAP Phase 2 success criteria were exercised live against the real webhook route and Convex dispatcher via `stripe listen`/`stripe trigger` (plus two crafted event replays for scenarios the default CLI fixtures can't produce); two genuine bugs were found and fixed along the way (a tsconfig gap that silently blocked every Convex function push, and an uncaught 500 on non-subscription `invoice.payment_failed` events) — final phase completion is gated on the user typing "approved".**

## Performance

- **Duration:** ~55 min active execution (Task 3 only; Tasks 1-2 were ~5 min, done in a prior session)
- **Completed:** Task 3 technical verification done 2026-07-09; awaiting user "approved" sign-off
- **Tasks:** 3/3 executed; Task 3's checkpoint gate (`resume-signal: "approved"`) not yet satisfied
- **Files modified:** 4 (`.env.local`, `convex/tsconfig.json`, `convex/stripeWebhooks.ts`, `convex/stripeWebhooks.test.ts`)

## Accomplishments

- Started `npm run dev` (Next.js `--experimental-https` + `convex dev`) and `stripe listen --forward-to https://localhost:3000/api/webhooks/stripe --skip-verify`, both scoped via `--api-key` to the same Stripe test account as `.env.local`'s `STRIPE_SECRET_KEY` (the Stripe CLI was logged into a different account by default)
- Updated local `STRIPE_WEBHOOK_SECRET` to the value `stripe listen` derives for that account (stable per API key, confirmed by running `--print-secret` twice) and restarted the dev server so Next.js picked it up
- **SC1 verified:** `stripe trigger checkout.session.completed` (overridden to `mode=subscription` with a recurring price, since the default fixture is a one-time payment) created a `subscriptions` row with `clerkUserId: "user_test_e2e_001"`, correct `stripeCustomerId`/`stripeSubscriptionId`/`status`/`currentPeriodEnd`
- **SC2 verified:** replayed the exact same event (fetched via `stripe events retrieve`, re-signed with a fresh valid HMAC-SHA256 signature/timestamp) — response 200, no duplicate row (`processedStripeEvents` idempotency guard held)
- **SC3 verified:** crafted an `invoice.paid` event with `billing_reason: "subscription_cycle"` referencing the created subscription (the default trigger fixture can't produce this combination — its invoice fixture is a standalone invoice unrelated to any subscription) — `aiCredits.balance` reset to 100, `creditTransactions` row inserted with `type: "reset"`
- **SC4 verified:** all 5 handled event types (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`) returned 200; a deliberately bogus `Stripe-Signature` header returned 400
- **SC5 verified:** corrupted `STRIPE_WEBHOOK_SECRET` in `.env.local`, killed and restarted the full `npm run dev` process tree, sent a genuinely-HMAC-signed event — got 400 (not 500); restored the correct secret and restarted again, confirmed 200 returns
- **Found and fixed (Rule 1) a convex/tsconfig.json gap:** `convex dev` was failing TypeScript typecheck (`TS2591: Cannot find name 'process'`) on `stripeWebhooks.ts`'s `process.env.INTERNAL_WEBHOOK_SECRET` reference, which **completely blocked every function push** — no Convex functions were live in the dev deployment until this was fixed. Added `"types": ["node"]` to `convex/tsconfig.json`'s `compilerOptions`.
- **Found and fixed (Rule 1) a live 500 on `invoice.payment_failed`:** the default `stripe trigger invoice.payment_failed` fixture creates a standalone (non-subscription) invoice; the dispatcher unconditionally called `internal.subscriptions.markPastDue` with an `undefined` `stripeSubscriptionId`, which is a required `v.string()` arg — Convex rejected it with an uncaught `ArgumentValidationError`, surfacing as a 500. Added a guard mirroring the existing `invoice.paid` billing_reason gate: skip gracefully when there's no subscription reference. Added a regression test (`convex/stripeWebhooks.test.ts`) for the no-`parent` case. Full test suite (42 tests) passes after the fix.
- Cleaned up: dev server (`npm run dev` tree) and `stripe listen` (+ underlying `stripe.exe`) both killed; port 3000 confirmed free

## Task Commits

- **Task 1: Generate and set INTERNAL_WEBHOOK_SECRET locally** — no git commit (`.env.local` gitignored by design); verified via `npx convex env get` (done in prior session)
- **Task 2: Propagate to Vercel + staging/production Convex** — no git commit (external dashboard config only); user confirmed "done" (done in prior session)
- **Task 3: Manual end-to-end Stripe CLI verification** — `e49a18d` (`fix(02-06): fix convex typecheck + invoice.payment_failed 500 found during live verification`) — the two Rule 1 bug fixes found during live verification. The verification activity itself (starting servers, running triggers, replaying events) produced no additional commits beyond this fix, since `.env.local`'s webhook-secret update is gitignored.

**Plan metadata (this SUMMARY):** to be committed once the user types "approved" and the plan is fully closed out (STATE.md/ROADMAP.md/REQUIREMENTS.md updates + final `docs(02-06)` commit are deferred until then, per the plan's own `<verification>` gate).

## Files Created/Modified

- `.env.local` — `STRIPE_WEBHOOK_SECRET` updated to match the value `stripe listen` derives for the Stripe test account matching `STRIPE_SECRET_KEY` (was previously a stale value from an earlier session/account). Gitignored/untracked; not committed. `INTERNAL_WEBHOOK_SECRET` unchanged from Task 1.
- `convex/tsconfig.json` — added `"types": ["node"]` so `process.env` typechecks in Convex functions (Rule 1 fix)
- `convex/stripeWebhooks.ts` — added a `stripeSubscriptionId` guard in the `invoice.payment_failed` case to skip standalone invoices instead of crashing (Rule 1 fix)
- `convex/stripeWebhooks.test.ts` — added a regression test for `invoice.payment_failed` with no `parent.subscription_details`

## Decisions Made

- Used `--api-key` on every `stripe listen`/`stripe trigger` invocation instead of `stripe login` to a different account, to avoid disturbing the developer's existing Stripe CLI session/account binding
- Used manual HMAC-SHA256 signature reconstruction (rather than relying solely on `stripe trigger`'s built-in fixtures) for SC2's replay and SC3's subscription-linked `invoice.paid` cycle event, since the CLI's fixture library doesn't support attaching a fresh trigger to a pre-existing subscription/customer
- Fixed both bugs found during verification inline (Rule 1) rather than deferring, since they blocked the very success criteria being verified

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] convex/tsconfig.json missing `"types": ["node"]` blocked all Convex function pushes**

- **Found during:** Task 3, immediately after starting `npm run dev`
- **Issue:** `convex dev`'s TypeScript typecheck failed with `TS2591: Cannot find name 'process'` on `stripeWebhooks.ts:33` and `stripeWebhooks.test.ts:38` (both reference `process.env`). This is a hard gate — no Convex functions were pushed to the dev deployment while it failed, meaning the webhook dispatcher action introduced in Plan 02-04 had never actually been live-deployed in this dev environment before now.
- **Fix:** Added `"types": ["node"]` to `convex/tsconfig.json`'s `compilerOptions` (the exact fix TypeScript's own error message suggested). Confirmed `convex dev` then reported "Convex functions ready!" with zero errors.
- **Files modified:** `convex/tsconfig.json`
- **Verification:** `convex dev` restarted cleanly with no typecheck errors across two separate dev-server restarts during this session; full `npx vitest run` suite (42 tests) still passes
- **Committed in:** `e49a18d`

**2. [Rule 1 - Bug] `invoice.payment_failed` crashed with 500 for standalone (non-subscription) invoices**

- **Found during:** Task 3, live SC4 verification (`stripe trigger invoice.payment_failed`)
- **Issue:** The default trigger fixture creates a standalone invoice with no `parent.subscription_details`. The dispatcher's `invoice.payment_failed` case computed `stripeSubscriptionId` as `undefined` in that case and called `internal.subscriptions.markPastDue` anyway, which has a required (non-optional) `stripeSubscriptionId: v.string()` arg — Convex threw an uncaught `ArgumentValidationError`, surfacing as a 500 to Stripe for a legitimate event type this webhook was never meant to act on.
- **Fix:** Added an early-return guard (`if (!stripeSubscriptionId) return { skipped: true };`) in `convex/stripeWebhooks.ts`'s `invoice.payment_failed` case, mirroring the existing `invoice.paid` billing_reason gate's scope-boundary pattern.
- **Files modified:** `convex/stripeWebhooks.ts`, `convex/stripeWebhooks.test.ts` (new regression test)
- **Verification:** Re-ran `stripe trigger invoice.payment_failed` after the fix — 200 (previously 500). Also verified the subscription-linked path still works correctly (crafted a variant referencing the real test subscription — response 200, `subscriptions.status` patched to `"past_due"`). Full test suite (42 tests, including the new regression test) passes.
- **Committed in:** `e49a18d`

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs found live during manual verification)
**Impact on plan:** Both fixes were necessary to complete the very success criteria (SC4) being verified; the tsconfig fix in particular was a pre-existing latent bug (present since Plan 02-04) that had never been caught because `convex dev` had apparently never been run to completion in this environment before this session. No scope creep — no new features, only correctness fixes.

## Issues Encountered

- **Stripe CLI account mismatch:** the Stripe CLI (`stripe config --list`) was logged into a different Stripe test account (`acct_1TqiriBWPMSBebOk`) than the one `.env.local`'s `STRIPE_SECRET_KEY` belongs to (`acct_1TqiprBpxNrbBdng`). The webhook route's `checkout.session.completed` enrichment step calls `stripe.subscriptions.retrieve()` using `STRIPE_SECRET_KEY` — had I used the CLI's default logged-in account, that call would 404 (cross-account resource access). Resolved by passing `--api-key <STRIPE_SECRET_KEY-from-.env.local>` explicitly on every `stripe listen`/`stripe trigger` invocation for the rest of the session. This is worth flagging to the user: if this mismatch is unintentional (vs. e.g. a shared team CLI login), it may be worth running `stripe login` once to align the CLI's default account with the project's `.env.local`, to avoid this friction in future manual verification sessions.
- **Default trigger fixtures don't match real usage shapes:** `stripe trigger checkout.session.completed`'s default fixture is a one-time payment (no customer/subscription); `stripe trigger invoice.paid`/`invoice.payment_failed`'s default fixtures are standalone invoices unrelated to any subscription. Neither shape naturally matches what this app's webhook route is built to receive from a real subscription checkout. Worked around this via CLI overrides (for the checkout session) and manual event-replay-with-modified-fields (for the invoice events), both using freshly-computed valid Stripe-Signature headers so the dispatcher code path being tested was never bypassed.
- **`git stash`-based lint-staged pre-commit hook:** the project's `husky`/`lint-staged` pre-commit hook internally uses `git stash` to back up state before running `prettier --write` and restaging — this is the hook's own configured behavior (not a manual `git stash` invocation by the executor) and ran automatically during the Task 3 fix commit. No manual `git stash` commands were issued.

## User Setup Required

None for Task 3 itself — all verification was performed by Claude. The only outstanding manual action is the plan's own explicit sign-off gate below.

## Next Phase Readiness

- **Local dev environment:** fully verified end-to-end. All 5 ROADMAP Phase 2 success criteria pass live against the real webhook route, real Convex dispatcher, and a real (test-mode) Stripe account.
- **Two genuine bugs fixed** that would otherwise have surfaced later (the tsconfig gap would have blocked ANY future `convex dev`/`deploy`; the `invoice.payment_failed` 500 would have caused Stripe to endlessly retry a webhook for any real-world standalone invoice failure, e.g. a one-off manual invoice sent to a customer who also happens to have a subscription).
- **Test data residue:** the local Convex dev deployment (`frugal-echidna-922`) now contains a real `subscriptions` row, `aiCredits` row, and `creditTransactions`/`processedStripeEvents` rows for a synthetic `user_test_e2e_001`, plus various Stripe test-mode objects (customers, subscriptions, invoices, products, prices) created by the trigger fixtures. This is normal residue of live E2E verification and doesn't block Phase 3, but is worth knowing about if Phase 3's checkout flow work queries these tables without filtering.
- **Phase 2 is NOT yet complete.** Per this plan's own `<verification>` section, the user must explicitly type "approved" confirming all 5 ROADMAP Phase 2 success criteria, having reviewed the evidence above. STATE.md/ROADMAP.md/REQUIREMENTS.md updates and the final `docs(02-06)` plan-completion commit are deferred until that happens.

## Self-Check: PASSED

- `convex/tsconfig.json` contains `"types": ["node"]` — CONFIRMED
- `convex/stripeWebhooks.ts` contains the `invoice.payment_failed` `stripeSubscriptionId` guard — CONFIRMED
- `convex/stripeWebhooks.test.ts` contains the new regression test — CONFIRMED
- Commit `e49a18d` exists in git log — CONFIRMED (`git log --oneline -3` shows it as HEAD)
- Full test suite passes: `npx vitest run` → 4 files, 42 tests, all passed — CONFIRMED
- Live verification evidence for SC1-SC5 captured above matches actual command output during this session (subscriptions/aiCredits/creditTransactions table contents, `stripe listen` response codes) — CONFIRMED
- Background processes (`npm run dev` tree, `stripe listen`, `stripe.exe`) all terminated; port 3000 confirmed free via `netstat` — CONFIRMED

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Status: Tasks 1-3 technically complete; AWAITING USER "approved" SIGN-OFF on Task 3's checkpoint before Phase 2 is marked complete_
