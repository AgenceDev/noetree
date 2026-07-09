---
phase: 03-checkout-flow-pricing-page
plan: 02
subsystem: payments
tags:
  [
    stripe,
    checkout-session,
    server-action,
    clerk-auth,
    next-intl,
    convex-reactive-query,
    cypress,
    clerk-testing,
  ]

# Dependency graph
requires:
  - phase: 01-schema-infrastructure-foundation
    provides: subscriptions table with by_clerkUserId index, STRIPE_PRO_PRICE_ID/STRIPE_SECRET_KEY env vars
  - phase: 02-webhook-handler-convex-internal-mutations
    provides: Stripe webhook -> Convex subscriptions upsert consuming the dual clerkUserId metadata this plan writes
  - phase: 03-checkout-flow-pricing-page (03-01)
    provides: APP_URL env var, Pricing/CheckoutSuccess i18n namespaces, badge primitive, RED test scaffolds (actions.test.ts, pricing.spec.ts, checkout-redirect.spec.ts)
  - phase: 03-checkout-flow-pricing-page (03-05)
    provides: chrome-free (marketing) route-group shell that /pricing renders inside
provides:
  - createCheckoutSession Server Action (app/[locale]/(marketing)/pricing/actions.ts) — sign-in redirect, active-status short-circuit, customer reuse, dual clerkUserId metadata, external Stripe redirect
  - Public pricing comparison page (app/[locale]/(marketing)/pricing/page.tsx) — Free/Pro cards, reactive Current-plan state, Upgrade CTA
  - Working Cypress Clerk auth harness (cy.clerkSignIn via addClerkCommands + a dedicated test user) enabling automated signed-in e2e verification of the checkout redirect
affects: [03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action clerkUserId sourced exclusively from (await auth()).userId — never a client-passed argument (T-03-02)"
    - "Internal redirects use @/i18n/routing's redirect; the external Stripe Checkout URL redirect uses next/navigation's redirect directly (never mixed)"
    - 'convexQuery gated with the "skip" args sentinel for signed-out visitors instead of enabled: false'
    - 'Cypress e2e auth: addClerkCommands registered once in cypress/support/commands.ts; specs needing a real session call cy.clerkSignIn({ strategy: "password", identifier, password }) sourced from Cypress.env(), backed by a dedicated Clerk test user'

key-files:
  created:
    - app/[locale]/(marketing)/pricing/actions.ts
    - app/[locale]/(marketing)/pricing/page.tsx
    - cypress.env.json (gitignored — Clerk test-user credentials, not committed)
  modified:
    - app/[locale]/(marketing)/pricing/actions.test.ts (fixed incomplete next/navigation mock)
    - vitest.config.ts (inlined next-intl for correct SSR module resolution)
    - cypress/support/commands.ts (registered addClerkCommands)
    - cypress/integration/checkout-redirect.spec.ts (added real cy.clerkSignIn step)
    - .gitignore (cypress.env.json, cypress/videos, cypress/screenshots)

key-decisions:
  - "Created a dedicated Clerk test user (password strategy, e2e_test+clerk_test@example.com) via the Clerk Backend API so checkout-redirect.spec.ts can establish a genuine signed-in session — setupClerkTestingToken() alone only bypasses bot protection, it does not sign a user in"
  - "Omit the Stripe `customer` key entirely (not customer: undefined) when no existing subscription row exists, so Stripe creates a fresh Customer from the collected checkout email (D-06)"
  - "Recreated .env and .env.local in this worktree (gitignored/untracked, not carried over by git worktree add) mirroring the main checkout's real test-mode secrets plus APP_URL, matching the pattern already established by Plan 03-01"

patterns-established:
  - "Server Action + next-intl navigation wrapper: import `redirect` from next/navigation for external URLs, `redirect` (aliased) from @/i18n/routing for internal locale-prefixed routes, in the same file"
  - "Cypress Clerk sign-in: cy.clerkSignIn requires a page that has already loaded Clerk (cy.visit first), then re-visit the target route after establishing the session"

requirements-completed: [PLAN-01, PAY-01]

# Metrics
duration: 55min
completed: 2026-07-09
---

# Phase 3 Plan 2: Checkout Flow + Pricing Page Summary

**Server Action `createCheckoutSession` (sign-in gate, active-status short-circuit, customer reuse, dual clerkUserId metadata) plus the public `/pricing` Free/Pro comparison page with a reactive Current-plan badge and Upgrade-to-Stripe-Checkout control.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-07-09T20:03:00+02:00
- **Completed:** 2026-07-09T20:31:00+02:00
- **Tasks:** 2
- **Files modified:** 9 (2 created for the plan's declared scope, 1 new gitignored local secret, 6 modified to fix pre-existing test-infrastructure gaps)

## Accomplishments

- `createCheckoutSession` Server Action implements the full D-02/D-06/D-07/D-08 contract: signed-out visitors redirect to Clerk sign-in (no Stripe call), already-active subscribers short-circuit straight to `/checkout/success` (no Stripe call), and everyone else gets a Checkout Session with reused `stripeCustomerId` (when present) and `clerkUserId` written into both `session.metadata` and `subscription_data.metadata`
- Public `/pricing` page renders the Free/Pro comparison per the UI-SPEC copy/spacing/color contract, reactively reflecting subscription status via a skip-gated `convexQuery`, and wires "Upgrade to Pro" to the Server Action
- Fixed a genuine gap in the Wave 0 Cypress harness (no signed-in session was ever established) so `checkout-redirect.spec.ts` now performs a real, automated, signed-in verification that clicking Upgrade reaches `checkout.stripe.com`
- All three verification layers green: `vitest run actions.test.ts` (3/3), `cypress run pricing.spec.ts`, `cypress run checkout-redirect.spec.ts`

## Task Commits

1. **Task 1: createCheckoutSession Server Action** - `9332cf3` (feat)
2. **Task 2: Pricing comparison page** - `cf47afc` (feat)

**Plan metadata:** committed separately (worktree mode — orchestrator handles STATE.md/ROADMAP.md after merge)

## Files Created/Modified

- `app/[locale]/(marketing)/pricing/actions.ts` - `"use server"` Checkout Session creation Server Action
- `app/[locale]/(marketing)/pricing/page.tsx` - Public Free/Pro pricing comparison client page
- `app/[locale]/(marketing)/pricing/actions.test.ts` - fixed an incomplete `next/navigation` mock (missing `permanentRedirect`)
- `vitest.config.ts` - inlined `next-intl` in `server.deps.inline` so its internal `next/navigation` import resolves correctly under Vitest
- `cypress/support/commands.ts` - registered `addClerkCommands` (enables `cy.clerkSignIn`/`clerkSignOut`/`clerkLoaded`)
- `cypress/integration/checkout-redirect.spec.ts` - added a real `cy.clerkSignIn` step before clicking Upgrade
- `cypress.env.json` - gitignored, holds the dedicated Clerk test-user's identifier/password
- `.gitignore` - added `cypress.env.json`, `cypress/videos/`, `cypress/screenshots/`
- `.env` / `.env.local` - recreated in this worktree (gitignored, not committed) mirroring the main checkout's secrets + `APP_URL`

## Decisions Made

- Customer key omission: `...(existing?.stripeCustomerId ? { customer: existing.stripeCustomerId } : {})` instead of `customer: existing?.stripeCustomerId`, since the RED test explicitly asserts the `customer` key is entirely absent (not merely `undefined`) when no prior subscription row exists.
- Locale validation happens once at the top of `createCheckoutSession` and the resolved `safeLocale` is reused for every redirect URL built afterward (sign-in return URL, success short-circuit, Stripe `success_url`/`cancel_url`), satisfying T-03-01 without repeating the validation.
- Chose the `password` Clerk sign-in strategy (over `email_code`/`phone_code`) for the Cypress test user because it completes synchronously with no OTP round-trip, keeping the e2e spec fast and deterministic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `next/navigation` module resolution failure under Vitest**

- **Found during:** Task 1 (running `vitest run actions.test.ts` after first implementing the Server Action)
- **Issue:** Importing `@/i18n/routing` (as the plan instructs, for the internal D-08 short-circuit redirect) pulls in next-intl's `createNavigation`, which itself imports `next/navigation`. Vitest's edge-runtime environment failed to resolve that nested import (`Cannot find module .../next-intl/.../node_modules/next/navigation`).
- **Fix:** Added `"next-intl"` to `vitest.config.ts`'s `server.deps.inline` array so Vitest processes it through its own SSR resolution pipeline instead of treating it as an external dependency.
- **Files modified:** `vitest.config.ts`
- **Verification:** `vitest run actions.test.ts` resolves the module correctly (next failure was a different, unrelated missing-export issue, fixed separately below).
- **Committed in:** `9332cf3` (Task 1 commit)

**2. [Rule 1 - Bug] Incomplete `next/navigation` mock in the RED test scaffold**

- **Found during:** Task 1, same test run
- **Issue:** `actions.test.ts`'s `vi.mock("next/navigation", ...)` (written in Plan 03-01) only exported `redirect`. next-intl's `createSharedNavigationFns` destructures both `redirect` and `permanentRedirect` from `next/navigation` at module-load time, so the mock threw `No "permanentRedirect" export is defined`.
- **Fix:** Added `permanentRedirect: vi.fn()` to the mock (never invoked by this action, but required for the destructure to succeed).
- **Files modified:** `app/[locale]/(marketing)/pricing/actions.test.ts`
- **Verification:** All 3 tests in `actions.test.ts` pass.
- **Committed in:** `9332cf3` (Task 1 commit)

**3. [Rule 1 - Bug] `customer: undefined` still satisfies `toHaveProperty`**

- **Found during:** Task 1, same test run
- **Issue:** The RED test's "no existing subscription" branch asserts the created session object has **no** `customer` property at all. Passing `customer: existing?.stripeCustomerId` (which evaluates to `customer: undefined`) still leaves the key present with an `undefined` value, failing `not.toHaveProperty("customer")`.
- **Fix:** Conditionally spread the `customer` key only when `existing?.stripeCustomerId` is truthy.
- **Files modified:** `app/[locale]/(marketing)/pricing/actions.ts`
- **Verification:** All 3 tests in `actions.test.ts` pass.
- **Committed in:** `9332cf3` (Task 1 commit)

**4. [Rule 3 - Blocking] Missing worktree env files (`.env`, `.env.local`)**

- **Found during:** Task 1, before running any test/build/dev command
- **Issue:** Both files are gitignored and untracked; `git worktree add` does not carry them over from the main checkout, so `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `APP_URL`, Clerk keys, etc. were all absent in this worktree.
- **Fix:** Recreated both files locally (never committed) by copying the main checkout's real test-mode values, matching the exact pattern and values Plan 03-01 already established for this same worktree-isolation issue.
- **Files modified:** `.env`, `.env.local` (both gitignored, not committed)
- **Verification:** `npm run build` and the dev server started successfully with all required env vars present.
- **Committed in:** N/A (gitignored, never committed)

**5. [Rule 3 - Blocking] Cypress had no mechanism to establish a signed-in session**

- **Found during:** Task 2, running `npx cypress run --spec cypress/integration/checkout-redirect.spec.ts` for the first time
- **Issue:** The RED spec (written in Plan 03-01) calls `setupClerkTestingToken()` and then clicks "Upgrade to Pro" expecting to land on `checkout.stripe.com`. `setupClerkTestingToken()` only bypasses Clerk's bot protection — it does **not** sign a user in. As a signed-out visitor, the (correctly implemented) Server Action redirected to Clerk's hosted sign-in page instead, so the assertion failed (confirming the Server Action's D-02 behavior is correct — the gap was purely in the test harness).
- **Fix:** (a) Registered `addClerkCommands({ Cypress, cy })` in `cypress/support/commands.ts`, enabling `cy.clerkSignIn`/`clerkSignOut`/`clerkLoaded`. (b) Created a dedicated Clerk test user via the Clerk Backend API (`password` strategy, `e2e_test+clerk_test@example.com`), with credentials stored only in a new gitignored `cypress.env.json`. (c) Updated `checkout-redirect.spec.ts` to call `cy.clerkSignIn({ strategy: "password", identifier, password })` (reading credentials from `Cypress.env()`) before clicking Upgrade.
- **Files modified:** `cypress/support/commands.ts`, `cypress/integration/checkout-redirect.spec.ts`, `.gitignore` (added `cypress.env.json`, `cypress/videos/`, `cypress/screenshots/`)
- **Verification:** `npx cypress run --spec cypress/integration/checkout-redirect.spec.ts` passes — the signed-in test user reaches a `checkout.stripe.com` URL after clicking Upgrade.
- **Committed in:** `cf47afc` (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (2 blocking module-resolution/env fixes, 1 blocking test-harness fix, 2 RED-test-scaffold bugs)
**Impact on plan:** All fixes were necessary to make the plan's own declared verification commands (`vitest run actions.test.ts`, both Cypress specs) actually pass; none altered the Server Action's or page's business logic beyond the one legitimate metadata-shape bug (customer key omission). No scope creep into Plan 03-03/03-04's file ownership.

## Issues Encountered

None beyond the deviations documented above — each was resolved inline during the same task before moving on.

## Known Stubs

None. Both `actions.ts` and `page.tsx` are fully wired: the Server Action makes real Stripe/Convex/Clerk calls, and the page renders live subscription state via the reactive Convex query — no hardcoded/placeholder data paths.

## Threat Flags

None. No new trust boundaries or surface beyond what the plan's `<threat_model>` already declared (T-03-01, T-03-02, T-03-04, T-03-05 — all addressed as specified). The Cypress test-user creation uses the Clerk _test-mode_ Backend API (`sk_test_...`) and only affects the development Clerk instance already used throughout this project.

## User Setup Required

None for the plan's own deliverables (`APP_URL`, Stripe keys, etc. were already documented/set in Plan 03-01). No new external service configuration is required to run this plan's automated tests going forward — the Clerk test user and its credentials are already provisioned and stored in the gitignored `cypress.env.json` in this worktree. Note for the orchestrator/merge: `cypress.env.json` is intentionally not committed (gitignored) per Cypress's own secret-handling convention; any environment that needs to re-run `checkout-redirect.spec.ts` (e.g., CI) will need to provision its own `cypress.env.json` (or `CYPRESS_E2E_CLERK_USER_IDENTIFIER`/`CYPRESS_E2E_CLERK_USER_PASSWORD` env vars) pointing at a valid Clerk test-mode user.

## Next Phase Readiness

- Plan 03-03 (success page) can proceed independently — no file overlap, and it consumes the same `getSubscription` query already exercised here.
- Plan 03-04's manual end-to-end Stripe payment verification can reuse the same Clerk test user (`e2e_test+clerk_test@example.com`, password in `cypress.env.json`) for convenience, though it is not required to.
- No blockers identified for subsequent Wave 2/3 plans.

---

_Phase: 03-checkout-flow-pricing-page_
_Completed: 2026-07-09_

## Self-Check: PASSED

All created files confirmed present on disk (`actions.ts`, `page.tsx`, this SUMMARY.md). Both task commit hashes (`9332cf3`, `cf47afc`) confirmed present in `git log --oneline --all`.
