---
phase: 05-ai-credits-system
plan: 01
subsystem: api
tags: [convex, convex-test, mutations, credits, toctou, idor]

# Dependency graph
requires:
  - phase: 02-payments-credits-backend
    provides: aiCredits/creditTransactions schema, resetCredits, getCredits, subscriptions.getSubscription identity-derivation pattern
provides:
  - "deductCredit internalMutation: TOCTOU-safe atomic balance decrement + deduction transaction row"
  - "runAiAction public mutation: identity-derived, deducts 1 credit, runs placeholder action, implemented-but-unreachable refund branch"
  - "getMyCredits public query: identity-derived balance read for the toolbar badge"
  - "creditTransactions.type schema union extended with 'refund' literal"
affects: [05-04-toolbar-ui, 05-02-addCredits-topup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "applyDeduction: read+branch+patch/insert inside a single mutation handler (never split across ctx.runMutation) — the TOCTOU-safety mechanism"
    - "ConvexError(string) for client-distinguishable errors (INSUFFICIENT_CREDITS), never bare Error (message is redacted at the client boundary)"
    - "identity.subject as the sole source of clerkUserId in public functions — args: {} — no client-supplied user identifier (IDOR mitigation)"

key-files:
  created: []
  modified:
    - convex/schema.ts
    - convex/aiCredits.ts
    - convex/aiCredits.test.ts

key-decisions:
  - "deductCredit throws ConvexError('INSUFFICIENT_CREDITS') (not a bare Error) so the toolbar's onError handler can distinguish it via err.data — matches the notes.ts NOTE_LIMIT_REACHED precedent"
  - "runAiAction inlines applyDeduction directly rather than calling ctx.runMutation(internal.aiCredits.deductCredit) so deduct + placeholder action + refund all share one transaction"
  - "Placeholder action in runAiAction is hardcoded actionSucceeded = true (D-01); the refund branch is fully implemented but intentionally unreachable this phase (D-04/D-06)"

patterns-established:
  - "Public wrapper mutations/queries in this codebase take args: {} and derive clerkUserId exclusively from ctx.auth.getUserIdentity().subject — reused from subscriptions.ts getSubscription"

requirements-completed: [CRED-04, CRED-02]

duration: 5min
completed: 2026-07-10
---

# Phase 05 Plan 01: AI Credits Deduction Core Summary

**TOCTOU-safe `deductCredit` + identity-derived public `runAiAction`/`getMyCredits` establishing the `INSUFFICIENT_CREDITS` ConvexError contract for the toolbar.**

## Performance

- **Duration:** 5 min (commit-to-commit)
- **Started:** 2026-07-10T22:10:27+02:00
- **Completed:** 2026-07-10T22:15:12+02:00
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- `deductCredit` internalMutation now atomically decrements balance, records a `"deduction"` `creditTransactions` row, throws `ConvexError("INSUFFICIENT_CREDITS")` at balance 0 (or no row), and is proven TOCTOU-safe by a `Promise.allSettled` concurrency test (exactly one of two simultaneous calls at balance=1 succeeds; final balance is 0, never -1).
- New public `runAiAction` mutation: derives `clerkUserId` exclusively from `ctx.auth.getUserIdentity().subject` (`args: {}`, no client-supplied identifier), deducts 1 credit via `applyDeduction` in the same transaction, runs a placeholder action (always succeeds this phase), and contains a fully implemented but currently-unreachable refund branch.
- New public `getMyCredits` query: identity-derived balance read (`args: {}`), returns `null` when unauthenticated or no row — this is what Plan 04's toolbar badge will subscribe to.
- `creditTransactions.type` schema union extended with `v.literal("refund")`.

## Task Commits

Each task followed RED → GREEN (TDD):

1. **Task 1: Add "refund" schema literal + implement deductCredit body**
   - `a99a388` test(05-01): add failing tests for deductCredit deduction/insufficient/concurrency + refund literal (RED)
   - `8f3d446` feat(05-01): implement deductCredit with TOCTOU-safe atomic transaction (GREEN)
2. **Task 2: Add public runAiAction mutation + getMyCredits query**
   - `91fea6b` test(05-01): add failing tests for runAiAction mutation + getMyCredits query (RED)
   - `a6ee483` feat(05-01): add public runAiAction mutation + getMyCredits query (GREEN)

No REFACTOR commits were needed — implementation matched the plan's action spec on first pass with no post-GREEN cleanup required.

**Plan metadata:** committed alongside this SUMMARY (worktree mode — STATE.md/ROADMAP.md excluded, owned by orchestrator).

## Files Created/Modified

- `convex/schema.ts` — added `v.literal("refund")` to `creditTransactions.type` union
- `convex/aiCredits.ts` — added `applyDeduction` helper, implemented `deductCredit`, added `runAiAction` and `getMyCredits`
- `convex/aiCredits.test.ts` — added `describe("aiCredits.deductCredit")` (6 tests incl. concurrency), `describe("aiCredits.runAiAction")` (4 tests), `describe("aiCredits.getMyCredits")` (3 tests)

## Decisions Made

- Used `ConvexError("INSUFFICIENT_CREDITS")` (per 05-PATTERNS.md's explicit resolution of the `notes.ts`-precedent-vs-UI-SPEC-example split) rather than a bare `Error`, since `runAiAction` is client-triggered and the toolbar must distinguish this failure via `err.data`.
- Inlined `applyDeduction(ctx, clerkUserId, 1)` directly in `runAiAction` rather than `ctx.runMutation(internal.aiCredits.deductCredit, ...)`, keeping deduct + action + refund in one transaction (avoids reopening the TOCTOU window per RESEARCH.md Pitfall 1).

## Deviations from Plan

None — plan executed exactly as written. `convex/_generated/ai/guidelines.md` referenced by CLAUDE.md and the plan's `<context>` block does not exist in this worktree (it's an untracked directory in the main checkout, not committed, so it isn't present in the linked worktree); proceeded using the equivalent in-codebase precedents already cited in the plan's `<interfaces>` section (`subscriptions.ts` identity derivation, `notes.ts` `ConvexError` pattern) and 05-PATTERNS.md, which is committed and available.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 04 (toolbar UI, running in the sibling worktree) can consume `api.aiCredits.runAiAction` (mutation, `args: {}`, returns `{ success: boolean }`, throws `ConvexError` with `.data === "INSUFFICIENT_CREDITS"`) and `api.aiCredits.getMyCredits` (query, `args: {}`, returns the `aiCredits` row or `null`) exactly as specified in this plan's `<output>` contract.
- `deductCredit`'s TOCTOU-safety is proven by test, satisfying ROADMAP SC1.
- `runAiAction`'s balance=0/no-row rejection satisfies ROADMAP SC3.
- Full `npx vitest run` (72 tests, 7 files) and `npx tsc --noEmit` both pass with no regressions.

---

_Phase: 05-ai-credits-system_
_Completed: 2026-07-10_
