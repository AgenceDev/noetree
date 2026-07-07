---
phase: 01-schema-infrastructure-foundation
plan: 01
subsystem: database
tags: [convex, stripe, subscriptions, credits, schema, clerk]

# Dependency graph
requires: []
provides:
  - subscriptions/aiCredits/creditTransactions/processedStripeEvents Convex tables with indexes
  - typed stub contracts for subscriptions.ts (getSubscription/upsertSubscription/deleteSubscription)
  - typed stub contracts for aiCredits.ts (getCredits/deductCredit/resetCredits/addCredits)
affects:
  [02-stripe-webhooks, 03-checkout, 04-free-tier-enforcement, 05-ai-credits]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "clerkUserId stored as bare v.string() (no v.id('users')) with by_clerkUserId index for O(log n) lookup"
    - "epoch-millisecond v.number() timestamps for new payment tables (diverges from notes/users ISO-string convention)"
    - "internalMutation for all state-writing functions to block direct client access"
    - "typed-but-unimplemented stubs throwing 'Not implemented — Phase 2' to establish stable contracts"

key-files:
  created:
    - convex/subscriptions.ts
    - convex/aiCredits.ts
  modified:
    - convex/schema.ts

key-decisions:
  - "clerkUserId is a bare string, not a v.id('users') reference (D-01/D-02)"
  - "All 5 write functions declared as internalMutation, never mutation (D-08/D-09, threat T-01-02)"
  - "amount: v.number() on deductCredit/addCredits for consistency with creditTransactions.amount (D-09)"
  - "New timestamp fields use epoch-ms v.number() per RESEARCH A1, deliberately diverging from existing ISO-string convention"

patterns-established:
  - "Payment/credit tables key on clerkUserId string + by_clerkUserId index"
  - "Stub-first: typed signatures land in Phase 1, real logic in Phase 2"

requirements-completed: [PLAN-05]

# Metrics
duration: ~15min
completed: 2026-07-07
---

# Phase 1 Plan 01: Schema & Stub Foundation Summary

**Four new Convex tables (subscriptions, aiCredits, creditTransactions, processedStripeEvents) plus typed-but-unimplemented stub functions establishing stable type contracts for the Stripe monetization work in Phases 2-5.**

## Performance

- **Duration:** ~15 min (excluding a hook-repair escalation handled by team-lead)
- **Started:** 2026-07-07T22:06Z
- **Completed:** 2026-07-07
- **Tasks:** 2
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments

- Extended `convex/schema.ts` with 4 payment tables and 4 new indexes; deployed clean via `npx convex dev --once`
- Created `convex/subscriptions.ts` with 3 typed stub exports (1 query, 2 internalMutation)
- Created `convex/aiCredits.ts` with 4 typed stub exports (1 query, 3 internalMutation)
- All 7 stub handlers throw `"Not implemented — Phase 2"` per D-07 — contracts are stable, no logic wired yet

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 4 new tables + indexes to convex/schema.ts** - `959d703` (feat)
2. **Task 2: Create convex/subscriptions.ts and convex/aiCredits.ts stubs** - `a281dcf` (feat)

## Files Created/Modified

- `convex/schema.ts` - Added subscriptions, aiCredits, creditTransactions, processedStripeEvents tables with by_clerkUserId (x3) and by_stripeEventId indexes
- `convex/subscriptions.ts` - getSubscription (query), upsertSubscription/deleteSubscription (internalMutation) stubs
- `convex/aiCredits.ts` - getCredits (query), deductCredit/resetCredits/addCredits (internalMutation) stubs

## Decisions Made

- clerkUserId stored as bare `v.string()` with a `by_clerkUserId` index rather than a `v.id("users")` FK (D-01/D-02) — decouples payment records from the internal users table and keys directly on the Clerk identity.
- All 5 write functions use `internalMutation` so they are unreachable from any client SDK (D-08/D-09, mitigates threat T-01-02).
- New timestamp fields (`currentPeriodEnd`, `lastResetAt`, `createdAt`, `processedAt`) use epoch-ms `v.number()` per RESEARCH A1 — a deliberate, flagged divergence from the existing notes/users ISO-string convention.

## Deviations from Plan

### Stale acceptance-criteria counts (not a code deviation)

The plan was authored assuming 3 pre-existing tables (users, roles, notes) and thus specified `grep -c "defineTable(" == 7` and `grep -c "v.union(" == 2`. The schema had since gained a 4th table, `shares`, before this plan executed. Actual observed counts after adding the 4 new tables:

- `defineTable(` = **8** (4 pre-existing incl. `shares` + 4 new) — plan expected 7
- `v.union(` = **3** (2 new enums + 1 pre-existing in `shares`) — plan expected 2

The plan's _intent_ (add exactly 4 new tables + 4 indexes, preserve existing tables byte-for-byte) was met exactly. `by_clerkUserId` = 3 and `by_stripeEventId` = 1 matched the plan. No code change was made to accommodate this — only the numeric expectations were stale due to the pre-existing `shares` table.

**Total deviations:** 0 code auto-fixes. 1 documentation reconciliation (stale grep counts).
**Impact on plan:** None. All success criteria met; existing tables untouched.

## Issues Encountered

**Blocked commit — corrupted `.husky/pre-commit` hook (resolved by team-lead).**
Both tasks' code was complete and verified (Convex deployed clean, exit 0) before any commit could land. The tracked husky v8 hook was corrupted: no shebang / no `husky.sh` sourcing (git "Exec format error" on spawn) plus a bare invalid `git add` line, blocking all commits. Per instruction I did not use `--no-verify`; I escalated to the team-lead, who committed a fix (`6856ba2`: shebang + `npx lint-staged` scoped to staged files, lint-staged config added to package.json). I then re-staged and committed both tasks normally through the working hook.

## User Setup Required

None - no external service configuration required for this plan. (Stripe Price IDs / webhook secrets flagged in STATE.md remain due before Phase 3, unaffected here.)

## Next Phase Readiness

- Phase 2 (Stripe webhooks) can write to these tables via the exact `upsertSubscription` / credit function signatures now in place.
- Phase 4 (free-tier enforcement) can read via `getSubscription`; Phase 5 (AI credits) via the aiCredits functions.
- No blockers introduced. All stubs intentionally throw until Phase 2 wires real logic (tracked below).

## Known Stubs

All 7 exported functions in `convex/subscriptions.ts` and `convex/aiCredits.ts` throw `"Not implemented — Phase 2"`. This is intentional per D-07 — Phase 1's sole bar is that everything compiles and deploys. Real implementations land in Phase 2 (webhooks/writes) and Phases 4-5 (reads/enforcement).

## Self-Check: PASSED

All created/modified files exist on disk (convex/schema.ts, convex/subscriptions.ts, convex/aiCredits.ts, 01-01-SUMMARY.md) and both task commits (959d703, a281dcf) are present in git history.

---

_Phase: 01-schema-infrastructure-foundation_
_Completed: 2026-07-07_
