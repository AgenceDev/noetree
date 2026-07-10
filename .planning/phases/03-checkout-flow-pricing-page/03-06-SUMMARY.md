---
phase: 03-checkout-flow-pricing-page
plan: 06
subsystem: payments
tags: [stripe, convex, clerk, error-handling, observability, vitest]

# Dependency graph
requires:
  - phase: 03-checkout-flow-pricing-page
    provides: createCheckoutSession Server Action, pricing page UI, Stripe webhook route (03-01/03-02/03-03/03-05)
provides:
  - Dedicated try/catch around the Clerk->Convex auth handshake + getSubscription lookup in createCheckoutSession, re-thrown as distinguishable "subscriptionLookupFailed"
  - console.error logging of the real thrown error in the pricing page's handleUpgrade catch block
  - console.error logging on both the webhook route's 400 signature-failure and 500 processing-failure paths
affects:
  [
    03-checkout-flow-pricing-page,
    future phases touching checkout/webhook error handling,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrow, single-purpose try/catch blocks per failure domain (auth-handshake/lookup vs Stripe API call) so thrown error messages stay distinguishable to developers without changing client-facing UI copy"
    - "console.error at every server-side failure boundary (Server Action catch, client catch, webhook route catch) logging only the caught error object plus a static context string — never tokens/secrets/raw payloads"

key-files:
  created: []
  modified:
    - "app/[locale]/(marketing)/pricing/actions.ts"
    - "app/[locale]/(marketing)/pricing/actions.test.ts"
    - "app/[locale]/(marketing)/pricing/page.tsx"
    - "app/api/webhooks/stripe/route.ts"
    - "app/api/webhooks/stripe/route.test.ts"

key-decisions:
  - "Declared `existing` before the new try/catch (rather than restructuring control flow) so the D-08 active-subscription short-circuit and the existing Stripe try/catch remain outside it and unaffected"
  - "Used a distinct thrown message (subscriptionLookupFailed) rather than reusing checkoutSessionCreationFailed so the two failure domains stay distinguishable in developer consoles even though the client UI renders the same generic checkoutError text for both (T-03-09, accepted)"

patterns-established:
  - "Gap-closure plans for UAT-diagnosed defects: RED-first regression test added before the fix, confirmed failing against the pre-fix code, then confirmed green after"

requirements-completed: [PAY-01, PAY-02]

# Metrics
duration: 20min
completed: 2026-07-10
---

# Phase 03 Plan 06: Checkout & Webhook Failure Diagnosability Summary

**Wrapped the Clerk->Convex auth-handshake/subscription-lookup in `createCheckoutSession` with a dedicated try/catch that re-throws a distinguishable `subscriptionLookupFailed` error, and added `console.error` logging at three previously-silent failure boundaries (pricing page catch, webhook 400 signature-failure, webhook 500 processing-failure) so checkout and webhook failures are diagnosable from UAT Test 2/Test 3.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-10
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Closed the genuine uncaught-exception bug: a thrown Convex auth-handshake or `getSubscription` query failure inside `createCheckoutSession` is now caught, logged, and re-thrown as `Error("subscriptionLookupFailed")` — it can no longer propagate uncaught into the pricing page's catch or be mistaken for a Stripe API failure (`checkoutSessionCreationFailed`).
- The pricing page's `handleUpgrade` catch block now logs the real thrown error via `console.error` before setting the generic error UI state, so a developer can distinguish the two failure modes in the browser console.
- The Stripe webhook route now logs both its 400 signature-verification failure path (pointing at a `STRIPE_WEBHOOK_SECRET`/`stripe listen` mismatch) and its 500 processing-failure path, closing the silent-failure gap identified from the local-forwarder root cause in `success-page-stuck-loading.md`.
- All three new/extended `console.error` call sites were manually reviewed and confirmed to log only the caught error object plus static context strings — never `convexToken`, `rawBody`, `stripe-signature`, or `STRIPE_WEBHOOK_SECRET` (threat T-03-08 mitigated).

## Task Commits

Each task was committed atomically:

1. **Task 1: Guard and log the Convex auth-handshake + subscription lookup in actions.ts** - `575b9a9` (fix) — RED-first test added, confirmed failing against unguarded code, then confirmed green after the try/catch was added.
2. **Task 2: Log the real checkout error in page.tsx's catch block** - `4564c79` (fix)
3. **Task 3: Log webhook signature (400) and processing (500) failures in route.ts** - `dd74fc8` (fix) — extended the existing 400 test with a `console.error` spy assertion.

_Note: Task 1 was executed as a single RED->GREEN cycle within one commit per the plan's TDD instructions (write failing test, confirm red, implement, confirm green, commit once green) — the "test-first" verification step was run via `npx vitest run actions.test` before and after the implementation, both confirmed manually before staging._

## Files Created/Modified

- `app/[locale]/(marketing)/pricing/actions.ts` - Added dedicated try/catch around the auth-handshake + `getSubscription` lookup; re-throws `subscriptionLookupFailed` on failure, logs via `console.error`.
- `app/[locale]/(marketing)/pricing/actions.test.ts` - Added regression test proving a lookup failure surfaces as `subscriptionLookupFailed` and never reaches `stripe.checkout.sessions.create`.
- `app/[locale]/(marketing)/pricing/page.tsx` - `handleUpgrade`'s catch block now binds `err` and calls `console.error("Checkout upgrade failed", err)` before `setError(true)`.
- `app/api/webhooks/stripe/route.ts` - Both the signature-verification (400) and processing-failure (500) catch blocks now bind and log the caught error via `console.error` with static diagnostic context.
- `app/api/webhooks/stripe/route.test.ts` - Extended the 400 signature-failure test with a `console.error` spy assertion (guards against the logging regressing).

## Decisions Made

- Kept the new lookup try/catch strictly scoped to the auth-handshake + `getSubscription` call, leaving the existing Stripe API try/catch and the `localeRedirect`/`redirectToSignIn` control-flow throws untouched and outside it, per the plan's explicit interface notes (Next redirect-control errors must never be swallowed).
- No new i18n strings were added to the pricing page UI — the ask was developer diagnosability via console, not new user-facing copy (per plan and UAT feedback).

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their `<action>` specs; no architectural changes, no new dependencies, no scope creep.

## Issues Encountered

None. TypeScript's `Awaited<ReturnType<typeof convex.query<typeof api.subscriptions.getSubscription>>>` generic-instantiation type reference (needed to type `existing` before the try block, per the plan's instruction to declare it outside) compiled cleanly under the project's TS config with no errors from `npx tsc --noEmit`.

## User Setup Required

None - no external service configuration required. This is a pure code-level diagnosability fix; the environmental root cause of UAT Test 2 (stopped `stripe listen` forwarder) is addressed separately by the manual re-verification in Plan 03-07.

## Next Phase Readiness

- All three UAT-diagnosed defects from Test 2 (webhook silent-failure diagnosability) and Test 3 (uncaught exception / unreadable checkout error) are closed at the code level.
- Full unit suite (53 tests across 6 files) and `npx tsc --noEmit` both green.
- Plan 03-07 (manual Stripe re-verification with the forwarder running) can proceed with the new logging in place to confirm diagnosability end-to-end.

---

_Phase: 03-checkout-flow-pricing-page_
_Completed: 2026-07-10_
