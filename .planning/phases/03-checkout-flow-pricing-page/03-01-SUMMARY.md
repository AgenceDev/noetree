---
phase: 03-checkout-flow-pricing-page
plan: 01
subsystem: testing
tags: [jsdom, vitest, shadcn, badge, next-intl, stripe, env-config]

# Dependency graph
requires:
  - phase: 01-schema-infrastructure-foundation
    provides: subscriptions table with by_clerkUserId index, getSubscription query
  - phase: 02-webhook-handler-convex-internal-mutations
    provides: Stripe webhook -> Convex subscriptions upsert (D-06/D-07 metadata contract this plan's tests encode)
provides:
  - jsdom Vitest devDependency for component-test environment overrides
  - shadcn Badge primitive (components/ui/badge.tsx)
  - APP_URL env var (documented in .env.example, set in .env.local) for absolute Stripe success_url/cancel_url
  - Pricing + CheckoutSuccess i18n namespaces in messages/en.json and messages/fr.json
  - Four RED test scaffolds encoding the Wave 2 contracts for createCheckoutSession and SuccessStatus
affects: [03-02, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: [jsdom@29.1.1 (Vitest devDependency), shadcn badge component]
  patterns:
    - "Vitest per-file environment override via `// @vitest-environment jsdom` docblock (line 1) for component tests, leaving the global edge-runtime environment untouched for the rest of the suite"
    - "Server Action RED-test mocking mirrors the existing webhook route.test.ts convention: vi.mock('stripe'), vi.mock('convex/browser'), plus a new vi.mock('@clerk/nextjs/server') and vi.mock('next/navigation') (redirect throws a REDIRECT: sentinel Error to make Next's throwing-redirect semantics observable in tests)"

key-files:
  created:
    - components/ui/badge.tsx
    - app/[locale]/(marketing)/pricing/actions.test.ts
    - app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx
    - cypress/integration/pricing.spec.ts
    - cypress/integration/checkout-redirect.spec.ts
  modified:
    - package.json / pnpm-lock.yaml (added jsdom devDependency)
    - .env.example (added APP_URL)
    - .env.local (added APP_URL — untracked/gitignored, not committed)
    - messages/en.json (added Pricing, CheckoutSuccess namespaces)
    - messages/fr.json (added Pricing, CheckoutSuccess namespaces, French)

key-decisions:
  - "jsdom (npm registry, ~76M weekly downloads, repo jsdom/jsdom, MIT) verified legitimate before install per Task 1 blocking-human gate — auto-approved per active auto-mode policy for this run"
  - "checkoutError i18n key placed under the Pricing namespace (not CheckoutSuccess) since the Server Action failure it describes surfaces on the pricing page's Upgrade click, not the success page — UI-SPEC did not lock an exact namespace for this string"
  - "actions.test.ts mocks next/navigation's redirect to throw a `REDIRECT:<url>` Error, mirroring Next.js's real throwing-redirect semantics, so tests can assert both the short-circuit (D-08) and post-session-creation redirect paths via `rejects.toThrow(/REDIRECT:/)`"

patterns-established:
  - "RED Server Action test scaffold: vi.mock stripe/convex-browser/@clerk-nextjs-server/next-navigation, dynamic `await import('./actions')` in beforeAll so the file fails at import time until Wave 2 creates the target module"
  - "RED component test scaffold: `// @vitest-environment jsdom` as line 1, vi.mock('@tanstack/react-query') + vi.mock('@convex-dev/react-query') to control returned query state, @testing-library/react + @testing-library/jest-dom/vitest for assertions"

requirements-completed: [PLAN-01, PAY-01, PAY-02]

duration: 21min
completed: 2026-07-09
---

# Phase 3 Plan 1: Checkout Flow Foundation (tooling, env, i18n, RED tests) Summary

**Installed jsdom + shadcn Badge, added the APP_URL env var and Pricing/CheckoutSuccess i18n namespaces, and wrote four RED test scaffolds (createCheckoutSession unit test, SuccessStatus jsdom component test, two Cypress e2e specs) that Wave 2 plans must turn green.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-07-09T16:02:18+02:00
- **Completed:** 2026-07-09T16:23:10+02:00
- **Tasks:** 3 (1 checkpoint + 2 auto)
- **Files modified:** 10 (6 modified, 5 created — one created file, `.env.local`, is gitignored/untracked and not part of any commit)

## Accomplishments

- Verified `jsdom` package legitimacy on the npm registry (76M+ weekly downloads, canonical `jsdom/jsdom` repo, MIT license, exact name match) and installed it as a Vitest devDependency
- Added the shadcn `badge` primitive via the official CLI (`npx shadcn@latest add badge`), matching the `new-york`/`neutral` preset already configured in `components.json`
- Documented and set the new server-only `APP_URL` env var (`.env.example` + `.env.local`), unblocking Stripe's `success_url`/`cancel_url` construction for Wave 2
- Added `Pricing` and `CheckoutSuccess` i18n namespaces to both `messages/en.json` and `messages/fr.json`, covering every UI-SPEC Copywriting Contract string, with verified key parity between locales
- Wrote four RED test files encoding the exact D-06/D-07/D-08/D-09/D-10/D-11 contracts Wave 2 must satisfy, confirmed failing for the expected reason (target modules do not exist yet) while leaving the existing 45-test suite green

## Task Commits

1. **Task 1: Verify jsdom package legitimacy before install** — checkpoint, no commit (verification only; auto-approved per active auto-mode policy, verification performed and recorded below)
2. **Task 2: Install tooling + primitive, add APP_URL env, add i18n namespaces** — `a0cf678` (feat)
3. **Task 3: Four RED test scaffolds** — `02b4619` (test)

**Plan metadata:** committed separately as part of this SUMMARY (worktree mode — orchestrator handles STATE.md/ROADMAP.md after merge)

## Files Created/Modified

- `components/ui/badge.tsx` - shadcn Badge primitive (cva-based variants, `data-slot="badge"`, `cn()` from `@/lib/utils`)
- `package.json` / `pnpm-lock.yaml` - added `jsdom` devDependency
- `.env.example` - documented new `APP_URL` server-only env var
- `.env.local` - set `APP_URL=https://localhost:3000` locally (gitignored, not committed)
- `messages/en.json` / `messages/fr.json` - added `Pricing` + `CheckoutSuccess` namespaces (identical key sets, verified via automated i18n parity check)
- `app/[locale]/(marketing)/pricing/actions.test.ts` - RED unit test for `createCheckoutSession(locale)` covering D-02 (signed-out redirect), D-08 (active-subscription short-circuit), D-06/D-07 (customer reuse + dual metadata)
- `app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx` - RED jsdom component test for loading/confirmed/timeout states (D-09/D-10/D-11)
- `cypress/integration/pricing.spec.ts` - RED e2e test asserting `/en/pricing` renders the Free/Pro copy contract
- `cypress/integration/checkout-redirect.spec.ts` - RED e2e test asserting the Upgrade CTA reaches `checkout.stripe.com`

## Decisions Made

- jsdom legitimacy confirmed directly (npm registry metadata + downloads API): package name `jsdom` exact match, no scope/suffix, `git+https://github.com/jsdom/jsdom.git` repository, MIT license, 76,379,475 downloads in the trailing week — approved for install.
- `checkoutError` i18n key placed in the `Pricing` namespace rather than `CheckoutSuccess`, since the underlying failure (Stripe API error in the Server Action) can only surface from the pricing page's Upgrade click — the success page never initiates checkout and only reads Convex. UI-SPEC/plan text did not lock an exact namespace for this string, so this was left to executor judgment; it does not affect the plan's automated key-parity verification (which only requires identical key sets between `en`/`fr`, not a specific key-to-namespace mapping).
- `next/navigation`'s `redirect` mocked to throw a `REDIRECT:<url>` sentinel `Error` in `actions.test.ts`, mirroring Next.js's real throwing-redirect internals, so both the D-08 short-circuit and the post-Checkout-Session-creation redirect can be asserted via `await expect(...).rejects.toThrow(/REDIRECT:/)` plus inspecting the mock's call arguments.
- `.env.local` recreated in this worktree (it is gitignored and worktrees do not copy untracked files) by mirroring the main checkout's existing secret values plus the new `APP_URL` line, so local Wave 2 development/testing in this worktree has a complete env file. This file is never committed.

## Deviations from Plan

None — plan executed exactly as written. `.env.local` needing to be recreated in this worktree (since it's gitignored and untracked, so `git worktree add` does not carry it over) is expected worktree-isolation behavior, not a deviation from the plan's intent ("confirm APP_URL absent before adding; do not touch existing secret values" — honored by copying forward the existing secret values unchanged and appending `APP_URL`).

## Issues Encountered

None. `npm run test:unit` was run after both Task 2 and Task 3; the new `actions.test.ts` and `SuccessStatus.test.tsx` fail for the expected reason (`Cannot find module './actions'` / `Failed to resolve import "./SuccessStatus"`), confirming RED status as designed, while the pre-existing 45 tests across 4 other test files remain green.

## Known Stubs

None. This plan intentionally produces no implementation code (Server Action, pricing page, success page) — only tooling, config, i18n copy, and failing test scaffolds. The four RED test files are the expected Wave 0 deliverable per `03-VALIDATION.md`; they are not stubs, they define the contract Wave 2 (`03-02`, `03-03`, `03-04`) must implement to pass.

## User Setup Required

None - no external service configuration required. `APP_URL` uses a deterministic local value (`https://localhost:3000`, matching the existing `next dev --experimental-https` dev script) and requires no dashboard/manual step; staging/production values are documented as environment-specific but out of scope for this plan.

## Next Phase Readiness

- Wave 2 plans (`03-02` pricing page, `03-03` Server Action, `03-04` success page — exact plan-to-file mapping per phase ROADMAP) can now implement against pre-written failing tests and available primitives (`Badge`, `APP_URL`, i18n copy) without further tooling setup.
- `03-05` (marketing route-group shell, parallel Wave 1) is unaffected by this plan's file set — no overlap confirmed.
- No blockers identified for Wave 2.

---

_Phase: 03-checkout-flow-pricing-page_
_Completed: 2026-07-09_

## Self-Check: PASSED

All created files confirmed present on disk (`components/ui/badge.tsx`, both RED Vitest test files, both RED Cypress specs, this SUMMARY.md). All three task commit hashes (`a0cf678`, `02b4619`) plus the plan-metadata commit (`3050029`) confirmed present in `git log --oneline --all`.
