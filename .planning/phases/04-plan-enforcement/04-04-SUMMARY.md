---
phase: 04-plan-enforcement
plan: 04
subsystem: testing
tags: [convex, error-handling, human-verify]

requires:
  - phase: 04-plan-enforcement
    provides: server-side note-limit gate (04-01), upgrade modal infra (04-02), error-handler wiring (04-03)
provides:
  - Live human confirmation that ROADMAP SC1-SC4 hold in the running app
  - Gap-closure fix: NOTE_LIMIT_REACHED now survives the Convex client/server boundary
affects:
  [
    any future phase adding new Convex mutation errors that must be inspected client-side,
  ]

tech-stack:
  added: []
  patterns:
    - "Convex application errors that must be matched client-side use ConvexError(data), not a bare thrown Error — a plain Error's .message is redacted crossing the client/server boundary, but ConvexError.data survives. convex-test's in-process calls don't reproduce this redaction, so it can only be caught by live/human verification."

key-files:
  created: []
  modified:
    - convex/notes.ts
    - hooks/useNoteMutations.ts
    - "app/[locale]/(app)/notes/page.tsx"

key-decisions:
  - "Fixed root cause instead of opening a full gap-closure planning cycle: the exact ConvexError-vs-Error boundary rule was already documented and precedented in this codebase (convex/stripeWebhooks.ts, app/api/webhooks/stripe/route.ts from Phase 3), so this was a direct, low-risk mechanical fix rather than a design question."

patterns-established:
  - "Client-side onError handlers matching a specific Convex error must check `err instanceof ConvexError && err.data === '<code>'`, never `err.message === '<code>'`."

requirements-completed: [PLAN-02, PLAN-03, PLAN-04]

duration: ~25min (including gap-closure fix)
completed: 2026-07-10
---

# Phase 4: Plan Enforcement Summary

**Free-tier 20-note cap enforced server-side in Convex `createNote` via `ConvexError("NOTE_LIMIT_REACHED")`, surfaced through a shared upgrade modal wired to both note-creation call sites.**

## Performance

- **Duration:** ~25 min (includes one gap-closure round)
- **Tasks:** 1 automated gate + 1 human-verify checkpoint
- **Files modified:** 3 (gap-closure fix)

## Accomplishments

- Live verification confirmed all four ROADMAP Phase 4 success criteria hold in the running app: Free user blocked at 21st note (root and child-note call sites), Pro user unaffected past 20/21/50 notes, no-subscription-row user treated as Free, upgrade modal renders with correct copy and a working `/pricing` CTA.
- Found and fixed a real bug during verification (see Issues Encountered) rather than a false report — the automated suite (convex-test) could not have caught it because it doesn't reproduce the Convex client/server error-redaction boundary.

## Task Commits

1. **Task 1: Pre-checkpoint automated gate** — verified via `npx vitest run convex/notes.test.ts` (6/6 pass) and `npx tsc --noEmit` (clean); no commit (verification only).
2. **Task 2: Human-verify checkpoint** — initial run failed (modal did not appear); gap-closure fix applied and committed: `f2a7f06` (fix(04): use ConvexError so NOTE_LIMIT_REACHED survives client boundary). Re-verified live — approved.

## Files Created/Modified

- `convex/notes.ts` — `throw new Error("NOTE_LIMIT_REACHED")` → `throw new ConvexError("NOTE_LIMIT_REACHED")`
- `hooks/useNoteMutations.ts` — onError check `err.message === "NOTE_LIMIT_REACHED"` → `err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED"`
- `app/[locale]/(app)/notes/page.tsx` — same onError check fix as above

## Decisions Made

- Applied the fix directly instead of routing through a full `/gsd:plan-phase --gaps` cycle: the root cause matched an existing, already-documented codebase convention (ConvexError required for any error whose data must survive to the client — established in Phase 3's Stripe webhook auth check), making this a mechanical fix rather than a design decision requiring re-planning.

## Deviations from Plan

### Auto-fixed Issues

**1. [Correctness] Convex error redaction broke client-side error matching**

- **Found during:** Task 2 (human-verify checkpoint) — user reported "no modal appear, only error from convex"
- **Issue:** `convex/notes.ts` threw a bare `Error("NOTE_LIMIT_REACHED")`. Convex redacts plain `Error` messages before they cross the client/server boundary in a real deployment; only `ConvexError.data` is guaranteed to survive. Both client `onError` handlers matched on `err.message`, which never equaled `"NOTE_LIMIT_REACHED"` in the live app, so the modal-opening branch never fired. `convex-test`'s in-process mutation calls don't reproduce this redaction, so Task 1's automated gate (and the original 04-01 test suite) passed despite the bug.
- **Fix:** Switched to `ConvexError("NOTE_LIMIT_REACHED")` in `convex/notes.ts` and updated both `onError` handlers to check `err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED"`.
- **Files modified:** `convex/notes.ts`, `hooks/useNoteMutations.ts`, `app/[locale]/(app)/notes/page.tsx`
- **Verification:** `npx tsc --noEmit` clean, `npx vitest run` 59/59 pass, live re-verification by user: approved.
- **Committed in:** `f2a7f06`

---

**Total deviations:** 1 auto-fixed (correctness — error-boundary redaction)
**Impact on plan:** Essential fix; without it, ROADMAP SC4 (upgrade prompt visible) does not hold in production despite all automated tests passing. No scope creep — same three files already touched by 04-01/04-03.

## Issues Encountered

- See Deviations above. Root-caused directly from a precedented codebase pattern (Phase 3's Stripe webhook ConvexError usage) rather than requiring investigation from scratch.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 4 fully delivers ROADMAP goal: Free tier note limit enforced server-side, Pro unlimited, no-subscription-row = Free, upgrade prompt on limit hit — all confirmed live.
- Established pattern (ConvexError for any client-inspected error) should be followed by Phase 5 (AI credits) and Phase 6 (Settings) if either introduces new Free/Pro-gated error paths.

---

_Phase: 04-plan-enforcement_
_Completed: 2026-07-10_
