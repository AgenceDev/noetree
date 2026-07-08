---
phase: 02-webhook-handler-convex-internal-mutations
plan: 01
subsystem: testing
tags: [vitest, convex-test, edge-runtime, convex, schema, stripe, env-config]

# Dependency graph
requires:
  - phase: 01-schema-infrastructure-foundation
    provides: subscriptions/aiCredits/creditTransactions/processedStripeEvents tables, internalMutation-only write pattern
provides:
  - Vitest + convex-test + @edge-runtime/vm test toolchain, wired via vitest.config.ts and npm run test:unit
  - subscriptions.by_stripeSubscriptionId index for invoice-event lookups without full table scan
  - INTERNAL_WEBHOOK_SECRET documented in .env.example as the shared secret between the Next.js webhook route and the Convex dispatcher action
affects: [02-02, 02-03, 02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: [vitest@4.1.10, convex-test@0.0.54, "@edge-runtime/vm@5.0.0"]
  patterns:
    - 'Convex-side unit tests run under Vitest with environment: edge-runtime and server.deps.inline: ["convex-test"] (convex-test''s documented requirement, not Jest)'
    - "vitest.config.ts excludes cypress/** so Cypress *.spec.ts files (which use its own global describe/it) are not picked up by Vitest's default include glob"

key-files:
  created:
    [
      vitest.config.ts,
      .planning/phases/02-webhook-handler-convex-internal-mutations/deferred-items.md,
    ]
  modified:
    [
      package.json,
      pnpm-lock.yaml,
      convex/schema.ts,
      .env.example,
      convex/_generated/api.d.ts,
    ]

key-decisions:
  - "Used pnpm (not npm as literally written in the plan) to install the new devDependencies, since this repo's actual package manager is pnpm (pnpm-workspace.yaml + pnpm-lock.yaml present, no package-lock.json) - avoids creating a conflicting lockfile"
  - 'Added exclude: ["cypress/**", ...] to vitest.config.ts beyond what the plan specified, because Vitest''s default test glob otherwise matches cypress/integration/app.spec.ts and fails with ''describe is not defined'' (Cypress''s global test API isn''t Vitest''s)'
  - "Checkpoint Task 1 (vitest legitimacy verification) was auto-approved per orchestrator's auto-mode instructions, citing 02-RESEARCH.md's Package Legitimacy Audit which already verified vitest@4.1.10 against npmjs.com (vitest-dev org) and github.com/vitest-dev/vitest as a name-similarity false positive against 'vite', not a real typosquat"

patterns-established:
  - "New required env vars get a comment block matching the existing STRIPE_WEBHOOK_SECRET style: purpose, SECRET/server-only marker, per-environment setup instructions, generation command"
  - "Multi-index chaining on defineTable(...) follows the existing style used by the users and shares tables in convex/schema.ts"

requirements-completed: [PAY-03, CRED-01]

# Metrics
duration: ~20min
completed: 2026-07-08
---

# Phase 02 Plan 01: Vitest Toolchain + Schema/Env Prerequisites Summary

**Installed the Vitest + convex-test + @edge-runtime/vm test toolchain (repo previously had zero working test runner) and landed the by_stripeSubscriptionId schema index plus INTERNAL_WEBHOOK_SECRET env var documentation required by every later Phase 2 wave**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-08T12:26:25Z
- **Tasks:** 3 (1 checkpoint auto-approved, 2 auto)
- **Files modified:** 6 (package.json, pnpm-lock.yaml, vitest.config.ts [new], convex/schema.ts, .env.example, convex/\_generated/api.d.ts)

## Accomplishments

- Vitest test toolchain installed and configured with the `edge-runtime` environment required by `convex-test`, ready for Wave 1 TDD plans
- `npx vitest run --passWithNoTests` exits 0 (zero test files, no errors)
- `subscriptions` table now has `by_stripeSubscriptionId` index (D-08), unblocking invoice-event handler lookups in later waves
- `.env.example` documents `INTERNAL_WEBHOOK_SECRET` (D-02) matching the existing Stripe secret documentation style
- `npx tsc --noEmit` and `npx convex dev --once` both pass cleanly with the new schema index deployed

## Task Commits

Each task was committed atomically:

1. **Task 1: Verify `vitest` package legitimacy before install (slopcheck SUS flag)** - auto-approved checkpoint, no commit (verification-only, no files modified)
2. **Task 2: Install Vitest test toolchain and wire config** - `9778de2` (feat)
3. **Task 3: Add by_stripeSubscriptionId schema index (D-08) and INTERNAL_WEBHOOK_SECRET env var (D-02)** - `9eda4b0` (feat)

_Note: Task 1 is a `checkpoint:human-verify` gate with no code changes of its own — it exists solely to require legitimacy confirmation before Task 2's install runs._

## Files Created/Modified

- `vitest.config.ts` - New. Vitest config with `environment: "edge-runtime"`, `server.deps.inline: ["convex-test"]`, and a `cypress/**` exclude (deviation, see below)
- `package.json` - Added `vitest`, `convex-test`, `@edge-runtime/vm` to devDependencies; added `"test:unit": "vitest run"` script; existing `"test"` script (prettier+eslint) untouched
- `pnpm-lock.yaml` - Updated by `pnpm add -D`
- `convex/schema.ts` - `subscriptions` table now chains `.index("by_clerkUserId", ...)` and `.index("by_stripeSubscriptionId", ["stripeSubscriptionId"])`
- `.env.example` - New 6-line block documenting `INTERNAL_WEBHOOK_SECRET` inserted between `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRO_PRICE_ID`
- `convex/_generated/api.d.ts` - Regenerated by `npx convex dev --once` (picks up existing `aiCredits`/`subscriptions` modules from Phase 1); confirms schema deploys cleanly
- `.planning/phases/02-webhook-handler-convex-internal-mutations/deferred-items.md` - New. Logs pre-existing CRLF/LF-only drift in other `convex/_generated/*` files (out of scope for this task)

## Decisions Made

- **pnpm over npm for install:** the plan's literal action text says `npm install --save-dev ...`, but this repo's actual package manager is pnpm (pnpm-workspace.yaml + pnpm-lock.yaml, no package-lock.json anywhere in the repo). Ran `pnpm add -D vitest convex-test @edge-runtime/vm` instead to avoid introducing a second, conflicting lockfile. Installed exact versions match 02-RESEARCH.md's live registry verification: `vitest@4.1.10`, `convex-test@0.0.54`, `@edge-runtime/vm@5.0.0`.
- **Checkpoint auto-approval:** Task 1's blocking-human checkpoint was auto-approved per the orchestrator's explicit auto-mode directive for this execution, citing 02-RESEARCH.md's own legitimacy audit (vitest's `[SUS]` flag is a documented name-similarity false positive against `vite`, verified live against npmjs.com and github.com/vitest-dev/vitest during research).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `cypress/**` exclude to vitest.config.ts\*\*

- **Found during:** Task 2 (verifying `npx vitest run --passWithNoTests` exits 0)
- **Issue:** Vitest's default test-file glob (`**/*.{test,spec}.*`) matched the existing `cypress/integration/app.spec.ts`, which uses Cypress's own global `describe`/`it` API (not registered in Vitest). Running `npx vitest run --passWithNoTests` failed with `ReferenceError: describe is not defined`, blocking the task's required verification command.
- **Fix:** Added `exclude: ["node_modules/**", "cypress/**", ".next/**"]` to `vitest.config.ts`'s `test` block, beyond the plan's specified `environment`/`server.deps.inline` fields.
- **Files modified:** `vitest.config.ts`
- **Verification:** `npx vitest run --passWithNoTests` now exits 0 with "No test files found".
- **Committed in:** `9778de2` (Task 2 commit)

**2. [Rule 3 - Blocking, tooling substitution] Used pnpm instead of npm for the install command**

- **Found during:** Task 2 (before running the install)
- **Issue:** The plan's action text specifies `npm install --save-dev vitest convex-test @edge-runtime/vm`, but the repo has no `package-lock.json` and is fully pnpm-managed (`pnpm-workspace.yaml`, `pnpm-lock.yaml`). Running `npm install` would have created a conflicting `package-lock.json` alongside the existing `pnpm-lock.yaml`.
- **Fix:** Ran `pnpm add -D vitest convex-test @edge-runtime/vm` instead, which produced the identical devDependency versions specified in 02-RESEARCH.md.
- **Files modified:** `package.json`, `pnpm-lock.yaml`
- **Verification:** `package.json` devDependencies contains `vitest`, `convex-test`, `@edge-runtime/vm`; no `package-lock.json` was created.
- **Committed in:** `9778de2` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking issues preventing task verification/correctness)
**Impact on plan:** Both fixes were necessary to satisfy the plan's own acceptance criteria (`npx vitest run --passWithNoTests` exits 0) and to avoid introducing an inconsistent package-manager state. No scope creep — no additional features added beyond what Task 2/3 required.

## Issues Encountered

- `npx convex dev --once` initialized a brand-new local Convex deployment (`Setting up a new project...`), writing fresh `CONVEX_DEPLOYMENT`/`NEXT_PUBLIC_CONVEX_URL` values to `.env.local`. This is expected in an isolated worktree with no prior local Convex state; `.env.local` is gitignored (`.env*` excluded except `.env.example`) so this had no effect on committed files.
- `convex/_generated/api.js`, `dataModel.d.ts`, `server.d.ts`, `server.js` showed as modified in `git status` before and after this plan's work, but `git diff` shows zero content difference — confirmed to be CRLF/LF line-ending normalization only (git printed "LF will be replaced by CRLF" warnings). Pre-existing drift unrelated to this plan's scope; logged to `deferred-items.md` and left untouched rather than force-fixed.

## User Setup Required

None - no external service configuration required. `INTERNAL_WEBHOOK_SECRET` is documented in `.env.example` but its actual value generation/propagation (`npx convex env set`, Vercel dashboard entry) is scoped to a later wave/plan per 02-RESEARCH.md.

## Next Phase Readiness

- Wave 1 TDD plans (02-02 onward) can now write real `*.test.ts` files against the working Vitest + convex-test harness (`npm run test:unit`)
- `convex/aiCredits.ts` (Plan 02-03) can safely reference `subscriptions.by_stripeSubscriptionId` via `ctx.db.query("subscriptions").withIndex("by_stripeSubscriptionId", ...)` as planned
- No blockers for subsequent waves in this phase

---

_Phase: 02-webhook-handler-convex-internal-mutations_
_Completed: 2026-07-08_

## Self-Check: PASSED

- FOUND: vitest.config.ts
- FOUND: .planning/phases/02-webhook-handler-convex-internal-mutations/deferred-items.md
- FOUND: .planning/phases/02-webhook-handler-convex-internal-mutations/02-01-SUMMARY.md
- FOUND: commit 9778de2
- FOUND: commit 9eda4b0
