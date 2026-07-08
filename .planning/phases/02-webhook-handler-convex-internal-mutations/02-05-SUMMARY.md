---
phase: 02-webhook-handler-convex-internal-mutations
plan: 05
subsystem: api
tags: [stripe, webhooks, nextjs, convex, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-webhook-handler-convex-internal-mutations (plan 04)
    provides: convex/stripeWebhooks.ts processWebhookEvent action (shared-secret-protected dispatcher)
provides:
  - "app/api/webhooks/stripe/route.ts — the sole HTTP entry point for Stripe webhooks, raw-body signature verification + status-code mapping"
  - "checkout.session.completed enrichment via a single stripe.subscriptions.retrieve call before dispatch"
  - "@/* path-alias resolution in vitest.config.ts (previously only relative imports worked in tests)"
affects:
  [
    03-frontend-checkout-and-settings,
    future phases touching app/api or vitest config,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Next.js Route Handler as sole HTTP-layer status-code authority; Convex actions only throw/return sentinels, never know about HTTP codes"
    - "vi.mock with `function` (not arrow) mockImplementation when mocking a class constructor (Stripe, ConvexHttpClient)"

key-files:
  created:
    - app/api/webhooks/stripe/route.ts
    - app/api/webhooks/stripe/route.test.ts
  modified:
    - vitest.config.ts

key-decisions:
  - "Added @/* alias resolution to vitest.config.ts (Rule 3, blocking) — no prior test in the repo imported via the @/ path alias, so vitest had no resolve.alias configured and route.ts's required `@/convex/_generated/api` import failed to resolve under test"
  - "Ran `pnpm install` before test execution — this worktree had no node_modules; this is the existing pnpm-lock.yaml install, not a new/unverified package, so it is a standard project-setup step rather than a Rule 3 excluded package install"

requirements-completed: [PAY-03]

# Metrics
duration: 25min
completed: 2026-07-08
---

# Phase 02 Plan 05: Stripe Webhook Route Handler Summary

**Next.js `POST /api/webhooks/stripe` route verifying Stripe signatures, enriching checkout.session.completed with a subscriptionSnapshot via stripe.subscriptions.retrieve, and mapping the Convex dispatcher's outcome to 400/500/200 per ROADMAP SC4/SC5**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-07-08T15:53:00Z
- **Completed:** 2026-07-08T16:06:44Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created the first file under `app/api/` in this repo: `app/api/webhooks/stripe/route.ts`, the sole Stripe-facing HTTP entry point
- Signature verification via `stripe.webhooks.constructEvent` maps any thrown error to 400 without ever calling Convex (D-10, T-02-01)
- `checkout.session.completed` events are enriched with a `subscriptionSnapshot` (`status`/`currentPeriodEnd`/`cancelAtPeriodEnd`) via exactly one `stripe.subscriptions.retrieve` call, read downstream by Plan 02-04's dispatcher — all other event types skip this call entirely
- Convex dispatcher outcome mapped correctly: success/anomaly/no-op → 200; `Unauthorized`-prefixed action errors → 400 (D-02/D-10); any other thrown error → 500 (D-11, lets Stripe's retry-with-backoff self-heal transient failures)
- 6/6 Vitest tests green with `stripe` and `convex/browser` fully mocked — no live network calls in tests

## Task Commits

Each task was committed atomically (TDD RED/GREEN gates):

1. **Task 1 (RED): failing test for status-code mapping** - `2af2cc6` (test)
2. **Task 1 (GREEN): route implementation + vitest alias fix** - `f945c11` (feat)

**Plan metadata:** (this commit, docs: complete plan)

## TDD Gate Compliance

- RED gate: `test(02-05): add failing test for stripe webhook route status-code mapping` (`2af2cc6`) — confirmed failing at commit time (`Cannot find module './route'`)
- GREEN gate: `feat(02-05): implement stripe webhook route status-code mapping` (`f945c11`) — confirmed all 6 tests passing after implementation
- Gate sequence present and in order per `git log --oneline`.

## Files Created/Modified

- `app/api/webhooks/stripe/route.ts` - `POST` handler: signature verification, checkout.session.completed enrichment, Convex dispatch, status-code mapping
- `app/api/webhooks/stripe/route.test.ts` - Vitest coverage of all 4 status-code branches (400 bad signature, 400 unauthorized, 500 genuine failure, 200 success) plus enrichment/non-enrichment behavior
- `vitest.config.ts` - added `resolve.alias` mapping `@` to the repo root so `@/convex/_generated/api`-style imports resolve under Vitest

## Decisions Made

- Used `ConvexHttpClient` from `"convex/browser"` (server-safe), never `convex/react`'s `ConvexReactClient` — matches the plan's explicit interface guidance
- No `runtime = "edge"` export — `stripe.webhooks.constructEvent` (sync variant) requires Node's crypto primitives
- Mocked `stripe` and `convex/browser` as class constructors using `vi.fn().mockImplementation(function () {...})` rather than arrow functions — Vitest 4's mock implementation rejects arrow functions used as constructors (`TypeError: ... is not a constructor`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `@/*` path-alias resolution to `vitest.config.ts`**

- **Found during:** Task 1, first GREEN-phase test run
- **Issue:** `route.ts` imports `api` from `"@/convex/_generated/api"` per the plan's explicit instruction. No prior test file in the repo imported anything via the `@/` alias (all existing Convex tests use relative `./`-style imports), so `vitest.config.ts` had no `resolve.alias` configured. The test run failed with `Cannot find package '@/convex/_generated/api'`.
- **Fix:** Added `resolve: { alias: { "@": path.resolve(__dirname, ".") } }` to `vitest.config.ts`, mirroring the `@/*` → `./*` mapping already present in `tsconfig.json`.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run app/api/webhooks/stripe/route.test.ts` — import resolved, tests proceeded to the next failure (constructor mock issue, fixed separately)
- **Committed in:** `f945c11` (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Fixed class-constructor mocks in the test file**

- **Found during:** Task 1, second GREEN-phase test run
- **Issue:** `vi.mock("stripe", ...)` and `vi.mock("convex/browser", ...)` initially used `vi.fn().mockImplementation(() => ({...}))` (arrow function) to stand in for the `Stripe` and `ConvexHttpClient` classes. Vitest 4 throws `TypeError: ... is not a constructor` when an arrow-function mock implementation is invoked with `new`.
- **Fix:** Changed both mock implementations to named `function` expressions (`function StripeMock() { return {...}; }`), which are valid `new`-able constructors.
- **Files modified:** `app/api/webhooks/stripe/route.test.ts`
- **Verification:** `npx vitest run app/api/webhooks/stripe/route.test.ts` — all 6 tests pass
- **Committed in:** `f945c11` (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] Ran `pnpm install` before any test execution**

- **Found during:** Start of task, before writing the RED test
- **Issue:** This worktree had no `node_modules` directory at all — a fresh checkout with `pnpm-lock.yaml` present but dependencies never installed.
- **Fix:** Ran `pnpm install` (existing lockfile, no new/unpinned packages added) to materialize `node_modules` before running any Vitest command.
- **Files modified:** none tracked (node_modules is gitignored)
- **Verification:** `npx vitest run convex/stripeWebhooks.test.ts` passed (18/18) immediately after install, confirming test infra was functional
- **Committed in:** N/A (no file changes to commit; not a source-code deviation)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking issues preventing test execution)
**Impact on plan:** All three were required to execute the plan's own TDD instructions (`npx vitest run app/api/webhooks/stripe/route.test.ts`) at all. No scope creep — no source-code behavior beyond the plan's `<action>` spec was added.

## Issues Encountered

None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. `INTERNAL_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_CONVEX_URL` were already documented in `.env.example` by prior phases/plans; this plan only reads them at runtime.

## Next Phase Readiness

- The full Stripe → Next.js route → Convex dispatcher chain is now wired end-to-end and unit-tested at the HTTP layer (ROADMAP SC4/SC5 automatically verified by this plan's test suite)
- `proxy.ts` already excludes `/api/webhooks/(.*)` from Clerk auth — confirmed via read, no changes needed
- Phase 2 is now feature-complete pending Plan 02-06 (whatever remains in the phase plan sequence); no blockers identified for Phase 3 (frontend checkout/settings)

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Completed: 2026-07-08_

## Self-Check: PASSED

All claimed files exist (`app/api/webhooks/stripe/route.ts`, `app/api/webhooks/stripe/route.test.ts`, `vitest.config.ts`) and both commit hashes (`2af2cc6`, `f945c11`) are present in `git log`.
