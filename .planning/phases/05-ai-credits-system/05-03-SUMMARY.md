---
phase: 05-ai-credits-system
plan: 03
subsystem: payments
tags: [stripe, next-intl, server-actions, react, convex, dialog]

# Dependency graph
requires:
  - phase: 04-plan-enforcement
    provides: UpgradeModal.tsx Dialog pattern and subscriptions.status === "active" Free/Pro check
  - phase: 03-checkout-flow-pricing-page
    provides: Server Action + Stripe Checkout Session creation pattern (pricing/actions.ts)
provides:
  - createTopupCheckoutSession Server Action (payment-mode Stripe Checkout, server-side Pro-only gate)
  - CreditsExhaustedDialog component (branching CTA: Free -> /pricing, Pro-at-zero -> top-up)
  - AiCredits i18n namespace (en/fr) + Editor.tooltips.aiAction key
affects: [05-04 (toolbar wiring), 05-01 (webhook top-up credit handling)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action payment-mode Checkout Session cloned near-1:1 from subscription-mode template (app/[locale]/(marketing)/pricing/actions.ts)"
    - "Defense-in-depth server-side entitlement gate (throw before any Stripe call) independent of UI visibility"

key-files:
  created:
    - "app/[locale]/(app)/notes/actions.ts"
    - "components/CreditsExhaustedDialog.tsx"
  modified:
    - "messages/en.json"
    - "messages/fr.json"

key-decisions:
  - "createTopupCheckoutSession takes no arguments; clerkUserId is derived exclusively from auth() (D-15/T-05-01), never a parameter"
  - 'Pro-only gate re-verifies existing?.status !== "active" server-side and throws TOPUP_REQUIRES_PRO before any Stripe call (T-05-04/D-10) — never trusts the UI-only gate'
  - "success_url/cancel_url both redirect to /notes (no /checkout/success equivalent) per D-13 — balance badge updates reactively once the webhook credits the purchase"
  - "CreditsExhaustedDialog invokes the Server Action via a plain <form action={createTopupCheckoutSession}> (Server Action form binding), not an onClick handler"

patterns-established:
  - "AiCredits flat i18n namespace mirrors PlanEnforcement; badgeTooltip uses next-intl ICU plural (=0/one/other) for future CreditsBalanceBadge (Plan 04)"

requirements-completed: [CRED-03, PAY-05]

# Metrics
duration: 17min
completed: 2026-07-10
---

# Phase 5 Plan 3: Top-up Purchase Flow (Server Action + Dialog + i18n) Summary

**Payment-mode Stripe Checkout Server Action with a server-side Pro-only gate, paired with a CreditsExhaustedDialog whose CTA branches Free (Upgrade to Pro) vs Pro-at-zero (Buy 50 credits), plus the AiCredits i18n namespace.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-10T20:00:00Z
- **Completed:** 2026-07-10T20:16:41Z
- **Tasks:** 3
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `createTopupCheckoutSession` Server Action creates a `payment`-mode Stripe Checkout Session for `STRIPE_TOPUP_PRICE_ID`, refusing any non-Pro caller server-side before touching Stripe
- `CreditsExhaustedDialog` clones `UpgradeModal.tsx`'s structure and branches its CTA reactively on `subscriptions.status === "active"` via Convex `useQuery`
- `AiCredits` i18n namespace (en/fr) plus `Editor.tooltips.aiAction` added, matching the 05-UI-SPEC Copywriting Contract exactly, including the ICU-plural `badgeTooltip` for Plan 04's balance badge

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AiCredits namespace + AI-action tooltip key (en + fr)** - `0eed046` (feat)
2. **Task 2: createTopupCheckoutSession Server Action (payment mode, Pro-only gate)** - `a8fefa4` (feat)
3. **Task 3: CreditsExhaustedDialog with branching CTA** - `bef6400` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit)

## Files Created/Modified

- `app/[locale]/(app)/notes/actions.ts` - New Server Action `createTopupCheckoutSession`: payment-mode Stripe Checkout Session, Pro-only server-side gate (`TOPUP_REQUIRES_PRO`), redirects back to `/notes`
- `components/CreditsExhaustedDialog.tsx` - New client dialog component; `{ open, onOpenChange }` props, `useTranslations("AiCredits")`, branches CTA on reactive `getSubscription` query
- `messages/en.json` - New `AiCredits` namespace (7 keys) + `Editor.tooltips.aiAction`
- `messages/fr.json` - Same additions, French translations

## Decisions Made

- Followed the plan's exact interface contract for the Server Action (no locale param, `success_url`/`cancel_url` both `/notes`, no `subscription_data`) — no deviation from `05-PATTERNS.md`'s prescribed deltas
- Used a `<form action={createTopupCheckoutSession}>` submit button (Server Action form binding) rather than a client `onClick` wrapper, per the plan's explicit suggestion — simplest correct invocation for a `"use server"` function with no arguments and no client-side pending-state requirement this phase
- `redirectToSignIn()` called with no `returnBackUrl` argument (plan text specifies this literally; the action has no locale parameter to build one from, unlike `pricing/actions.ts`)

## Deviations from Plan

None - plan executed exactly as written. (Minor: the repository's pre-commit hook (prettier/eslint via lint-staged) reformatted line-wrapping in `actions.ts` on commit — no semantic change, not a deviation from plan intent.)

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. `STRIPE_TOPUP_PRICE_ID` was already present in `.env.example`/all environments since Phase 1.

## Next Phase Readiness

- Plan 04 (toolbar wiring) can import `createTopupCheckoutSession` from `app/[locale]/(app)/notes/actions.ts` and `CreditsExhaustedDialog` from `components/CreditsExhaustedDialog.tsx` directly — both are self-contained and already type-check cleanly (`npx tsc --noEmit` passes with zero errors)
- `AiCredits.badgeTooltip` (ICU plural) is ready for Plan 04's `CreditsBalanceBadge` tooltip
- No blockers. This plan does not touch `convex/*` (owned by the parallel 05-01 plan in this wave) — no file overlap encountered

---

_Phase: 05-ai-credits-system_
_Completed: 2026-07-10_

## Self-Check: PASSED

All created files (app/[locale]/(app)/notes/actions.ts, components/CreditsExhaustedDialog.tsx, messages/en.json, messages/fr.json, this SUMMARY.md) confirmed present on disk. All 3 task commit hashes (0eed046, a8fefa4, bef6400) confirmed present in git log.
