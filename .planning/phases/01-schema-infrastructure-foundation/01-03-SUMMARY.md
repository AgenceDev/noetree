---
phase: 01-schema-infrastructure-foundation
plan: 03
subsystem: infra
tags: [stripe, env, gitignore, payments, pricing]

# Dependency graph
requires:
  - phase: 01-02
    provides: stripe/@stripe/stripe-js packages and webhook-route auth exclusion
provides:
  - Committable .env.example documenting all 5 Stripe env vars (secret-vs-public annotated)
  - .gitignore negation (!.env.example) making the template trackable
  - Real Stripe test-mode Pro subscription product + 9€/month recurring price
  - Real Stripe test-mode Credits Top-up product + 2€ one-time price
  - STRIPE_PRO_PRICE_ID / STRIPE_TOPUP_PRICE_ID captured in .env.local
affects:
  [
    Phase 3 checkout flow,
    Phase 5 AI credits top-up,
    01-04 Vercel env propagation,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Env var contract documented in committable .env.example with inline secret-vs-public annotations (D-04/D-05)"
    - "Stripe products/prices provisioned via curl + HTTP Basic auth (secret key as username, empty password)"

key-files:
  created:
    - .env.example
  modified:
    - .gitignore
    - .env.local

key-decisions:
  - "Pro price is recurring monthly 900 EUR; Top-up price is one-time 200 EUR (recurring: null)"
  - "Real Price IDs live only in git-ignored .env.local; .env.example holds placeholders only"

patterns-established:
  - "Pattern: .env.example is the single source of truth for the env var contract, kept trackable via an explicit !.env.example negation"

requirements-completed: [PLAN-05]

# Metrics
duration: 8min
completed: 2026-07-08
---

# Phase 1 Plan 3: Env Var Contract + Stripe Test-Mode Products Summary

**Committable .env.example documenting all 5 Stripe env vars, plus real Stripe test-mode Pro (9€/mo recurring) and Top-up (2€ one-time) products/prices with Price IDs captured in .env.local**

## Performance

- **Duration:** ~8 min (across a human-action checkpoint pause for Stripe keys)
- **Completed:** 2026-07-08
- **Tasks:** 3 (Task 2 was a blocking human-action checkpoint resolved by the user supplying keys)
- **Files modified:** 3 (.gitignore, .env.example, .env.local)

## Accomplishments

- `.gitignore` patched with `!.env.example` so the env template is trackable despite the blanket `.env*` rule
- `.env.example` created documenting all 5 vars with secret-vs-public inline annotations (D-04/D-05)
- Two real Stripe test-mode products created via API: "Noetree Pro" and "Noetree AI Credits Top-up"
- Pro recurring price (900 EUR/month) and Top-up one-time price (200 EUR) created; real Price IDs captured into git-ignored `.env.local` (D-03)

## Task Commits

1. **Task 1: Patch .gitignore and create .env.example** - `466d2da` (chore)
2. **Task 2: Retrieve Stripe test-mode API keys** - no commit (human-action checkpoint; keys stored in git-ignored `.env.local`)
3. **Task 3: Create Stripe products/prices, capture Price IDs** - no commit (only artifact is git-ignored `.env.local`)

**Plan metadata:** committed separately with this SUMMARY.

_Note: Tasks 2 and 3 write exclusively to `.env.local`, which is git-ignored by design (real secrets never enter git), so they produce no source commit._

## Files Created/Modified

- `.gitignore` - Added `!.env.example` negation after the `.env*` blanket rule
- `.env.example` - Template for all 5 Stripe env vars, placeholders only, secret-vs-public annotated
- `.env.local` - Real STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (user-supplied), STRIPE_PRO_PRICE_ID, STRIPE_TOPUP_PRICE_ID (git-ignored)

## Stripe Objects Created (test mode)

- Product `prod_UqPilA69zzumJL` — "Noetree Pro"
  - Price `price_1TqitcBpxNrbBdngt2neRuix` — 900 EUR, recurring monthly → `STRIPE_PRO_PRICE_ID`
- Product `prod_UqPj5eks77CrCW` — "Noetree AI Credits Top-up"
  - Price `price_1TqitdBpxNrbBdng9NSnSFgy` — 200 EUR, one-time (`recurring: null`) → `STRIPE_TOPUP_PRICE_ID`

## Decisions Made

None - followed plan as specified. Pro/Top-up amounts and recurrence match the roadmap (9€/mo Pro, 2€ top-up).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Task 2 was a planned blocking human-action checkpoint: Claude has no Stripe account access and no Stripe CLI on PATH, so the user supplied the two test-mode keys directly, which were then written to `.env.local`.

## User Setup Required

Handled inline. The user supplied test-mode `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (stored in git-ignored `.env.local`). Plan 01-04 will propagate all env vars to Vercel (local/staging/production) and create staging/production webhook secrets.

## Threat Surface Scan

No new security surface beyond the plan's threat model. `.env.example` contains placeholders only (T-01-07 mitigated); `!.env.example` negation is scoped to that single filename, leaving `.env.local` git-ignored (T-01-08 mitigated); secret-vs-public annotations present with no `NEXT_PUBLIC_` prefix on secret vars (T-01-06 mitigated). Secret key transmitted to Stripe over TLS via documented Basic-auth convention (T-01-09 accepted).

## Next Phase Readiness

- D-03 satisfied: real Price IDs exist and are captured for Phase 3 checkout and Phase 5 top-up.
- D-04/D-05 satisfied: env var contract documented and committed.
- Remaining Phase 1 work: 01-04 (Vercel env propagation + staging/production webhook secrets) — Wave 2.

## Self-Check: PASSED

- FOUND: .env.example
- FOUND: .planning/phases/01-schema-infrastructure-foundation/01-03-SUMMARY.md
- FOUND commit: 466d2da (Task 1)

---

_Phase: 01-schema-infrastructure-foundation_
_Completed: 2026-07-08_
