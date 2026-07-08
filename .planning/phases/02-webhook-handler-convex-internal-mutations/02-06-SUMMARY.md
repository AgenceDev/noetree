---
phase: 02-webhook-handler-convex-internal-mutations
plan: 06
subsystem: infra
tags: [stripe, convex, env-vars, webhooks, secrets]

# Dependency graph
requires:
  - phase: 02-05
    provides: "Next.js webhook route (signature-verified) and stripeWebhooks.ts dispatcher action expecting INTERNAL_WEBHOOK_SECRET"
provides:
  - "INTERNAL_WEBHOOK_SECRET generated and set identically in local .env.local and the local Convex dev deployment"
affects: [phase-03, phase-04, phase-05, webhooks, payments]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared-secret env var propagated per-environment via `npx convex env set` (mirrors Phase 1 Stripe webhook secret pattern)"

key-files:
  created: []
  modified: [.env.local]

key-decisions:
  - "INTERNAL_WEBHOOK_SECRET generated locally via Node's crypto.randomBytes(32).toString('hex') (openssl also available but Node used for determinism); value never logged in full outside this session's local verification step"
  - ".env.local remains gitignored/untracked; the generated secret is never committed to git"

patterns-established: []

requirements-completed: [] # PAY-03/CRED-01 not yet complete — plan is PARTIALLY done (1/3 tasks); do not mark requirements complete until Task 3 sign-off

# Metrics
duration: 5min
completed: IN PROGRESS — Task 1 of 3 complete
---

# Phase 2 Plan 06: INTERNAL_WEBHOOK_SECRET Generation and Local Propagation Summary (PARTIAL — 1/3 tasks)

**Generated a 64-char hex INTERNAL_WEBHOOK_SECRET locally and set it identically on both `.env.local` and the local Convex dev deployment (`frugal-echidna-922`); staging/production propagation (Task 2) and live Stripe CLI sign-off (Task 3) remain, both blocked on human action outside this environment's capabilities.**

## Performance

- **Duration:** ~3 min active execution (Task 1 only)
- **Completed:** Task 1 done 2026-07-08; Tasks 2-3 pending
- **Tasks:** 1/3 completed (Task 1 done; Task 2 checkpoint reached; Task 3 not started)
- **Files modified:** 1 (`.env.local`, gitignored — not committed)

## Accomplishments

- Generated a cryptographically random 64-character hex `INTERNAL_WEBHOOK_SECRET` via `node -e "require('crypto').randomBytes(32).toString('hex')"`
- Appended `INTERNAL_WEBHOOK_SECRET=<value>` to `.env.local` without modifying any pre-existing `STRIPE_*`/`CONVEX_*`/`NEXT_PUBLIC_*` lines
- Ran `npx convex env set INTERNAL_WEBHOOK_SECRET <value>` against the local Convex dev deployment (`frugal-echidna-922`)
- Verified via `npx convex env get INTERNAL_WEBHOOK_SECRET` that the local Convex value matches `.env.local` exactly
- Reached Task 2's blocking human-action checkpoint (Vercel + staging/production Convex propagation) — no Vercel CLI/API token or staging/production Convex deployment access available in this environment, confirmed consistent with Phase 1 Plan 01-04's identical finding

## Task Commits

Task 1's only deliverable — the local secret written to `.env.local` — is intentionally uncommitted because `.env.local` is gitignored (live secrets must never enter git history), matching the established pattern from Phase 1 Plan 01-04.

- **Task 1: Generate and set INTERNAL_WEBHOOK_SECRET locally** — no git commit (`.env.local` gitignored by design); verified via `npx convex env get`
- **Task 2: Propagate to Vercel + staging/production Convex** — CHECKPOINT REACHED (human-action, blocking) — awaiting user confirmation
- **Task 3: Manual end-to-end Stripe CLI verification** — NOT STARTED (depends on Task 2 completion)

**Plan metadata (this partial SUMMARY):** committed separately, to be appended/finalized once Tasks 2-3 complete.

## Files Created/Modified

- `.env.local` — added `INTERNAL_WEBHOOK_SECRET=<64-char hex>`. Gitignored/untracked; not committed. All pre-existing keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TOPUP_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`) unchanged.

## Decisions Made

- Used Node's `crypto.randomBytes(32).toString('hex')` for generation (both `openssl` and `node` were available in this environment; Node chosen for straightforward one-liner output capture)

## Deviations from Plan

None - Task 1 executed exactly as written.

## Issues Encountered

None for Task 1. Task 2 is a genuine environment limitation (no Vercel CLI/API token, no staging/production Convex deployment access) — expected per the plan's own framing, not a deviation.

## User Setup Required

**External services require manual configuration before this plan can proceed to Task 3.** See Task 2's checkpoint below:

1. In Vercel Project Settings -> Environment Variables, add `INTERNAL_WEBHOOK_SECRET` (value below) to Development, Preview, and Production scopes, marked "Sensitive".
2. For each of the staging and production Convex deployments, run `npx convex env set INTERNAL_WEBHOOK_SECRET <value> --prod` (or the staging-deployment equivalent).

## Next Phase Readiness

- Local environment fully ready: `.env.local` and local Convex dev deployment both have the matching `INTERNAL_WEBHOOK_SECRET`, sufficient for a local `stripe listen` end-to-end test once Task 2 unblocks Task 3
- Task 2 (Vercel + staging/production propagation) and Task 3 (live Stripe CLI verification + ROADMAP sign-off) remain outstanding — phase 2 is NOT complete until both finish
- This SUMMARY.md will be updated/finalized when the continuation agent completes Tasks 2 and 3

## Self-Check: PASSED

- `.env.local` contains exactly 1 `INTERNAL_WEBHOOK_SECRET=` line with a non-empty 64-char hex value — CONFIRMED (`grep -c "^INTERNAL_WEBHOOK_SECRET=" .env.local` returned 1)
- `npx convex env get INTERNAL_WEBHOOK_SECRET` returned the identical value written to `.env.local` — CONFIRMED
- All pre-existing `.env.local` keys unchanged — CONFIRMED (verified by diff before/after edit)
- No git commit expected for Task 1 (gitignored secrets file) — CONFIRMED, consistent with Phase 1 Plan 01-04 precedent

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Status: PARTIAL — 1/3 tasks complete, awaiting human action on Task 2_
