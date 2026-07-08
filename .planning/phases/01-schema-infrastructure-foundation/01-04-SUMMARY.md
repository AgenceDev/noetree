---
phase: 01-schema-infrastructure-foundation
plan: 04
subsystem: infra
tags: [stripe, vercel, env-vars, webhooks, secrets]

# Dependency graph
requires:
  - phase: 01-03
    provides: "STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_PRO_PRICE_ID, STRIPE_TOPUP_PRICE_ID captured in .env.local"
provides:
  - "All 5 required Stripe env vars propagated to Vercel Development/Preview/Production scopes"
  - "3 distinct STRIPE_WEBHOOK_SECRET values (local CLI, staging, production)"
  - "2 Stripe webhook endpoints (staging + production) enabled for the 5 Phase-2 event types"
  - "Local STRIPE_WEBHOOK_SECRET captured in .env.local"
  - "Phase 1 complete — all 5 ROADMAP success criteria confirmed"
affects: [phase-02, phase-03, phase-05, webhooks, payments]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-environment webhook signing secrets (never reuse a secret across environments)"
    - "Secrets kept out of NEXT_PUBLIC_ namespace; marked Sensitive in Vercel"

key-files:
  created: []
  modified: [.env.local]

key-decisions:
  - "3 distinct STRIPE_WEBHOOK_SECRET values per environment (D-05) — local, staging, production"
  - ".env.local remains gitignored/untracked; secrets are never committed to git"

patterns-established:
  - "Environment secret propagation: 4 shared test-mode vars across all Vercel scopes + 1 per-scope webhook secret"

requirements-completed: [PLAN-05]

# Metrics
duration: 5min
completed: 2026-07-08
---

# Phase 1 Plan 04: Stripe/Vercel Environment Variable Propagation Summary

**All 5 required Stripe env vars propagated across Vercel's three scopes with per-environment webhook signing secrets, closing the last unmet ROADMAP Phase 1 success criterion (SC-2).**

## Performance

- **Duration:** ~5 min active execution (excludes human-action wait)
- **Completed:** 2026-07-08
- **Tasks:** 2 (both blocking checkpoints)
- **Files modified:** 1 (`.env.local`, gitignored — not committed)

## Accomplishments

- Local `STRIPE_WEBHOOK_SECRET` (from `stripe listen --print-secret`) captured in `.env.local`
- User propagated all 5 vars to Vercel Development/Preview/Production scopes, with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` marked Sensitive
- User created 2 distinct Stripe webhook endpoints (staging `https://staging.noetree.com/api/webhooks/stripe`, production `https://noetree.com/api/webhooks/stripe`), each with its own signing secret in the matching Vercel scope
- All 5 ROADMAP Phase 1 success criteria verified and signed off by the user

## Task Commits

Both tasks were human-checkpoint tasks. Task 1's only deliverable — the local webhook secret written to `.env.local` — is intentionally uncommitted because `.env.local` is gitignored (live secrets must never enter git history). Task 2 was verification-only (no files modified).

- **Task 1: Propagate env vars + create webhook secrets** — no git commit (`.env.local` gitignored by design)
- **Task 2: Final Phase 1 success-criteria sign-off** — no files modified (verification-only)

**Plan metadata:** committed with SUMMARY/STATE/ROADMAP/REQUIREMENTS updates.

## Files Created/Modified

- `.env.local` — added `STRIPE_WEBHOOK_SECRET=whsec_…` (local CLI signing secret). Gitignored/untracked; not committed.

## Verification Results

All 5 ROADMAP Phase 1 success criteria, confirmed by automated checks and user sign-off:

| #    | Criterion                                                                  | Result                                                                                                          |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| SC-1 | `npx convex dev --once` compiles cleanly                                   | PASS — "Convex functions ready!", no errors                                                                     |
| SC-2 | 5 env vars in local + Vercel 3 scopes; no `NEXT_PUBLIC_` prefix on secrets | PASS — all 5 present locally with correct framing; Vercel scopes + 2 distinct webhook secrets confirmed by user |
| SC-3 | `node -e "require('stripe')"` succeeds                                     | PASS — "stripe require OK"                                                                                      |
| SC-4 | Webhook routes excluded from auth, app routes protected                    | PASS — `proxy.ts` public matcher `/api/webhooks/(.*)`, protected `/notes(.*)`                                   |
| SC-5 | `subscriptions.ts` + `aiCredits.ts` deployed without errors                | PASS — both deployed cleanly in SC-1 run                                                                        |

## Deviations from Plan

None — plan executed exactly as written. Both checkpoints were reached, presented to the user, and resolved with explicit user responses (Task 1 "done" + relayed secret; Task 2 "approved").

## Notes

- SC-4 plan text references `/dashboard`; this project's gated app route is `/notes` (per `proxy.ts` and the STATE decision on the Next 16 `middleware.ts` → `proxy.ts` rename). Webhooks are excluded and the gated app area is protected — criterion satisfied in substance.
- Threat mitigations applied: T-01-10 (both secrets marked Sensitive in Vercel), T-01-11 (3 distinct webhook secrets, no reuse). T-01-12 (Convex staging topology) accepted/deferred to Phase 2 per the plan's threat register.

## Self-Check: PASSED

- SUMMARY.md exists at `.planning/phases/01-schema-infrastructure-foundation/01-04-SUMMARY.md` — FOUND
- `.env.local` contains exactly 1 `STRIPE_WEBHOOK_SECRET=whsec_` — CONFIRMED
- No per-task git commits expected (Task 1 deliverable is a gitignored secrets file; Task 2 verification-only)
