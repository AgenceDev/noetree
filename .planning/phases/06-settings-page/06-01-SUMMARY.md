---
phase: 06-settings-page
plan: 01
subsystem: api
tags: [convex, backend, query, identity-derived, tdd]

# Dependency graph
requires:
  - phase: 05-ai-credits-system
    provides: convex/aiCredits.ts (getMyCredits pattern, creditTransactions table + by_clerkUserId index, aiCredits.test.ts harness)
provides:
  - "listMyTopups public Convex query — identity-derived, IDOR-safe, returns only type:'topup' creditTransactions rows for the caller, newest-first, [] when unauthenticated"
affects:
  [
    06-settings-page (later plans building the Settings page Credits Card top-up history UI),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Identity-derived Convex query returning [] for unauthenticated + list-shaped reads (vs. null for singleton reads like getMyCredits)"

key-files:
  created: []
  modified:
    - convex/aiCredits.ts
    - convex/aiCredits.test.ts

key-decisions:
  - "In-handler .filter() on type instead of a new compound index — no by_clerkUserId_and_type index added this phase (RESEARCH.md Pattern 3, avoids unnecessary schema change for a small result set)"
  - "listMyTopups returns [] (not null) when unauthenticated, distinct from getMyCredits' null — matches list-shaped consumer expectations on the Settings page"

patterns-established:
  - "List-shaped identity-derived query: ctx.auth.getUserIdentity() -> [] if null; else withIndex(by_clerkUserId).order('desc').collect() then in-handler .filter()"

requirements-completed: [SET-05]

# Metrics
duration: 3min
completed: 2026-07-11
---

# Phase 6 Plan 1: listMyTopups Convex Query Summary

**Identity-derived `listMyTopups` Convex query added to `convex/aiCredits.ts`, returning only `type:'topup'` creditTransactions rows for the authenticated caller, newest-first, `[]` when unauthenticated — TDD RED/GREEN cycle with 4 new test cases.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-11T12:22:00+02:00
- **Completed:** 2026-07-11T12:25:00+02:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- Added `listMyTopups` public query mirroring the existing `getMyCredits` identity-derivation pattern exactly
- Appended 4 test cases to `convex/aiCredits.test.ts` covering unauthenticated `[]`, type-filtering, cross-user isolation (IDOR), and newest-first ordering
- Confirmed RED (tests fail because the export doesn't exist) then GREEN (all 27 tests in the file pass, zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Append listMyTopups tests to convex/aiCredits.test.ts** - `914a9f0` (test)
2. **Task 2 (GREEN): Implement listMyTopups query in convex/aiCredits.ts** - `c2e68b0` (feat)

_TDD plan: test (RED) -> feat (GREEN); no REFACTOR commit needed — implementation was minimal and clean on first pass._

## Files Created/Modified

- `convex/aiCredits.ts` - New `export const listMyTopups = query(...)` placed after `getMyCredits`; zero-argument, identity-derived, filters `creditTransactions` to `type === "topup"`, `order("desc")`, `.collect()` (no pagination per D-09)
- `convex/aiCredits.test.ts` - New `describe("aiCredits.listMyTopups")` block with 4 `it(...)` cases; reuses existing `IDENTITY` const and `convexTest`/`modules` harness, no duplicate declarations

## Decisions Made

- Followed RESEARCH.md Pattern 3 / Pitfall 3 exactly: in-handler `.filter()` on `type` rather than adding a `by_clerkUserId_and_type` compound index — schema unchanged (verified via `git diff` showing no `convex/schema.ts` changes)
- No new imports required — reused the existing `query` import already present in `convex/aiCredits.ts`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The `convex/_generated/ai/guidelines.md` file referenced by `./CLAUDE.md` and the plan's `read_first` list does not exist in this worktree (it exists only as an untracked file in the main repo checkout per the initial `git status`, so it wasn't copied into this worktree branch). Proceeded using the plan's own `<convex_guidelines>` context block and the `getMyCredits` interface analog already provided in the plan, which fully specified the required identity-derivation, argument-validator, and `.collect()`-vs-`.paginate()` rules — no gap in implementation guidance resulted.

## TDD Gate Compliance

- RED gate: `914a9f0 test(06-01): add failing test for listMyTopups query` — confirmed 4 new tests failed with "Expected a Convex function exported from module aiCredits as listMyTopups, but there is no such export", 23 pre-existing tests unaffected.
- GREEN gate: `c2e68b0 feat(06-01): implement listMyTopups query in convex/aiCredits.ts` — confirmed all 27 tests pass.
- REFACTOR gate: not needed (implementation required no cleanup pass).

Gate sequence verified in `git log`: test commit precedes feat commit. Compliant.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`listMyTopups` is available at `api.aiCredits.listMyTopups` for the Settings page's Credits Card to consume via `useQuery(convexQuery(api.aiCredits.listMyTopups, isSignedIn ? {} : "skip"))` (06-PATTERNS.md "Reactive Convex read on the client"). No blockers for subsequent 06-settings-page plans building the page UI.

---

_Phase: 06-settings-page_
_Completed: 2026-07-11_
