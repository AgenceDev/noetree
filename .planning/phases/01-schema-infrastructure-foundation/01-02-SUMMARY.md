---
phase: 01-schema-infrastructure-foundation
plan: 02
subsystem: infra
tags: [stripe, clerk, nextjs, middleware, pnpm, security, cve]

# Dependency graph
requires:
  - phase: 01-01
    provides: Convex schema (subscriptions, aiCredits, creditTransactions, processedStripeEvents) + typed stub modules
provides:
  - stripe@22.3.0 (server SDK) installed and importable
  - "@stripe/stripe-js@9.9.0 (browser Stripe.js loader) installed"
  - "@clerk/nextjs confirmed at 7.5.1 (>=6.39.2), CVE-2026-41248 mitigated"
  - proxy.ts excludes /api/webhooks/** from Clerk auth via isPublicRoute matcher (D-06)
affects: [02-webhook-handler, 03-checkout-pricing]

# Tech tracking
tech-stack:
  added: [stripe@22.3.0, "@stripe/stripe-js@9.9.0"]
  patterns:
    [
      "isPublicRoute + isProtectedRoute additive gating in clerkMiddleware (D-06)",
    ]

key-files:
  created: []
  modified: [package.json, pnpm-lock.yaml, proxy.ts]

key-decisions:
  - "Used pnpm (project lockfile is pnpm-lock.yaml) instead of npm to avoid a conflicting package-lock.json"
  - "Skipped the planned @clerk/nextjs downgrade to 6.39.2 — repo already at 7.5.1 (>=6.39.2), so CVE-2026-41248 already mitigated; downgrading would regress"
  - "Applied the D-06 webhook-exclusion patch to proxy.ts (Next.js 16 renamed middleware.ts -> proxy.ts); protected route is locale-prefixed /notes, not /dashboard"

patterns-established:
  - "Middleware auth gate: !isPublicRoute(req) && isProtectedRoute(req) before auth.protect()"

requirements-completed: [PLAN-05]

# Metrics
duration: 15min
completed: 2026-07-08
---

# Phase 01 Plan 02: Stripe Packages + Webhook Middleware Exclusion Summary

**Installed Stripe server + browser SDKs via pnpm and patched proxy.ts to exclude /api/webhooks/** from Clerk auth (D-06), with the critical @clerk/nextjs middleware-bypass CVE already covered by the repo's 7.5.1 version.\*\*

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T22:37:00Z
- **Completed:** 2026-07-08
- **Tasks:** 2 executed + 1 human-verify checkpoint (approved)
- **Files modified:** 3

## Accomplishments

- `stripe@22.3.0` and `@stripe/stripe-js@9.9.0` installed and importable (`node -e "require('stripe')"` exits 0) — ROADMAP SC-3.
- `@clerk/nextjs` confirmed at 7.5.1 (satisfies `>=6.39.2`), closing CVE-2026-41248 (critical middleware route-gating bypass, threat T-01-04) — no bump needed.
- `proxy.ts` patched per D-06: `/api/webhooks/**` bypasses Clerk auth while locale-prefixed `/notes` stays protected — ROADMAP SC-4.
- Behavior verified against a live `next dev` server: `/en/notes` → 307 redirect to Clerk sign-in (unauthenticated); `/api/webhooks/probe` → 404 (auth.protect skipped, not redirected).

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Stripe packages** - `4abfb37` (chore)
2. **Task 2: Exclude /api/webhooks/** from Clerk auth in proxy.ts\*\* - `52b99cf` (feat)

**Plan metadata:** (final docs commit — see git log)

## Files Created/Modified

- `package.json` - Added `stripe@22.3.0` and `@stripe/stripe-js@9.9.0` dependencies
- `pnpm-lock.yaml` - Regenerated lockfile for the new dependencies
- `proxy.ts` - Added `isPublicRoute` matcher for `/api/webhooks/(.*)`; gated `auth.protect()` with `!isPublicRoute(req) && isProtectedRoute(req)`

## Decisions Made

- **pnpm over npm:** the repo's committed lockfile is `pnpm-lock.yaml` (plus `pnpm-workspace.yaml`), so all installs go through pnpm to keep the lockfile authoritative. Using npm would have produced a conflicting `package-lock.json`.
- **No Clerk downgrade:** `@clerk/nextjs` is already `^7.4.3` (resolves 7.5.1), a higher major than the plan's `^6.39.2` CVE-fix target, so the mitigation is already in place. Downgrading was rejected as a regression.
- **proxy.ts, not middleware.ts:** Next.js 16 renamed the middleware-file convention to `proxy.ts`; the existing Clerk middleware lives there and protects `/notes` (locale-prefixed), so D-06 was applied there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used pnpm instead of npm; installed pnpm globally**

- **Found during:** Task 1 (package install)
- **Issue:** Plan prescribed `npm install`, but the project's lockfile is `pnpm-lock.yaml` (no `package-lock.json`). pnpm was not present on the machine (`command -v pnpm` empty; no corepack).
- **Fix:** Installed pnpm globally via `npm install -g pnpm` (v11.10.0), then `pnpm add stripe@22.3.0 @stripe/stripe-js@9.9.0`.
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** `node -e "require('stripe')"` exits 0; `pnpm ls @clerk/nextjs` → 7.5.1
- **Committed in:** 4abfb37 (Task 1 commit)

**2. [Rule 3 - Blocking] Clerk CVE bump was a no-op (already patched)**

- **Found during:** Task 1
- **Issue:** Plan assumed `@clerk/nextjs: ^6.12.4` and prescribed bumping to `^6.39.2`. Repo is already at `^7.4.3` (resolves 7.5.1).
- **Fix:** Left the version unchanged — 7.5.1 satisfies `>=6.39.2`, so CVE-2026-41248 (T-01-04) is already mitigated. Downgrading would regress.
- **Files modified:** none (verification only)
- **Verification:** `pnpm ls @clerk/nextjs` → 7.5.1
- **Committed in:** n/a (no change)

**3. [Rule 3 - Blocking] Patched proxy.ts instead of the non-existent middleware.ts**

- **Found during:** Task 2
- **Issue:** Plan targeted `middleware.ts`, which does not exist. Next.js 16 renamed the middleware-file convention to `proxy.ts`, where the existing Clerk middleware lives; it protects locale-prefixed `/notes`, not `/dashboard`.
- **Fix:** Applied the D-06 `isPublicRoute` pattern to `proxy.ts`, gating `auth.protect()` with `!isPublicRoute(req) && isProtectedRoute(req)`. Config matcher left unchanged.
- **Files modified:** proxy.ts
- **Verification:** `grep -c isPublicRoute proxy.ts` → 2; webhook matcher present once; `tsc` no source errors; live curl: `/en/notes` → 307 sign-in, `/api/webhooks/probe` → 404
- **Committed in:** 52b99cf (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking / stale-plan reconciliation)
**Impact on plan:** All three reconcile the plan against a repo that advanced since planning (pnpm, Clerk 7.x, Next.js 16 proxy.ts). Plan intent (D-06 behavior, Stripe SDKs, CVE closed) fully achieved. No scope creep.

## Issues Encountered

- `tsc --noEmit` reports 4 errors, all in stale, gitignored `.next/types/**` referencing a non-existent `app/dashboard/notes` path (old app structure). Zero errors in real source; not introduced by this plan. Left untouched (out of scope, generated build cache).

## User Setup Required

None - no external service configuration required in this plan. (Stripe Price IDs / env-var propagation are handled in plans 01-03 and 01-04.)

## Next Phase Readiness

- Stripe SDKs available for Phase 2's webhook signature verification (`stripe.webhooks.constructEvent`) and Phase 3's client-side checkout redirect.
- Webhook route path `/api/webhooks/**` is reachable without a Clerk session — Phase 2 can mount the handler at `/api/webhooks/stripe`.
- Remaining Phase 1 work: 01-03 (.env.example + real Stripe test-mode Price IDs) and 01-04 (Vercel env propagation + webhook secrets).

## Self-Check: PASSED

- FOUND: `.planning/phases/01-schema-infrastructure-foundation/01-02-SUMMARY.md`
- FOUND commit: `4abfb37` (Task 1)
- FOUND commit: `52b99cf` (Task 2)
- FOUND: `proxy.ts`

---

_Phase: 01-schema-infrastructure-foundation_
_Completed: 2026-07-08_
