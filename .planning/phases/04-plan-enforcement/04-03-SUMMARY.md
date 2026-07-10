---
phase: 04-plan-enforcement
plan: 03
subsystem: ui
tags: [react, tanstack-query, convex, upgrade-modal, plan-enforcement]

# Dependency graph
requires:
  - phase: 04-plan-enforcement (plan 01)
    provides: server-side NOTE_LIMIT_REACHED error contract in convex/notes.ts createNote
  - phase: 04-plan-enforcement (plan 02)
    provides: useUpgradeModal()/UpgradeModalProvider global modal singleton mounted in (app) layout
provides:
  - Both createNote call sites (child-note hook and root Notes page) open the shared upgrade modal on NOTE_LIMIT_REACHED
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'onError limit-branch pattern: preserve existing optimistic-revert block unchanged, then add `if (err.message === "NOTE_LIMIT_REACHED") { upgradeModal.open(); }` as an additional guarded branch'

key-files:
  created: []
  modified:
    - hooks/useNoteMutations.ts
    - "app/[locale]/(app)/notes/page.tsx"

key-decisions:
  - "Called useUpgradeModal() once per component/hook body (not per mutation), matching the plan's guidance and avoiding redundant context reads"
  - "Left all other mutations (updateNoteTitle, deleteNote, updateChildNotes, moveNote / renameTree, removeTree, updateTreeIndex, togglePin) completely untouched — only the two createNote onError handlers were modified"

patterns-established: []

requirements-completed: [PLAN-04]

# Metrics
duration: 6min
completed: 2026-07-10
---

# Phase 04 Plan 03: Wire createNote Errors to Upgrade Modal Summary

**Both `createNote` call sites (the child-note hook in `hooks/useNoteMutations.ts` and the root `Notes` page mutation) now open the shared `useUpgradeModal()` singleton when the server throws `NOTE_LIMIT_REACHED`, while every other error path keeps its existing silent optimistic-revert behavior unchanged.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-10T17:35:00+02:00 (approx.)
- **Completed:** 2026-07-10T17:40:29+02:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- `hooks/useNoteMutations.ts`'s `createNote` mutation `onError` now opens the upgrade modal via `useUpgradeModal().open()` when `err.message === "NOTE_LIMIT_REACHED"`, after preserving the existing `context?.previousTree` revert
- `app/[locale]/(app)/notes/page.tsx`'s root `createNote` mutation `onError` gets the identical treatment against `context?.previousTrees`
- Confirmed via grep that no other mutation handler in either file was touched

## Task Commits

Each task was committed atomically:

1. **Task 1: Open upgrade modal from the child-note createNote onError** - `46b2964` (feat)
2. **Task 2: Open upgrade modal from the root createNote onError** - `6a7b22b` (feat)

_No TDD tasks in this plan — both `type="auto"` UI-wiring tasks._

## Files Created/Modified

- `hooks/useNoteMutations.ts` - Imports `useUpgradeModal` from `@/providers/UpgradeModalProvider`, calls it once in the hook body, and the `createNote` mutation's `onError` opens the modal on `NOTE_LIMIT_REACHED` after the existing tree revert
- `app/[locale]/(app)/notes/page.tsx` - Same pattern: imports `useUpgradeModal`, calls it once in the `Notes` component body, and the root `createNote` mutation's `onError` opens the modal on `NOTE_LIMIT_REACHED` after the existing trees revert

## Decisions Made

- Followed the plan's exact interface contract: guard on `err.message === "NOTE_LIMIT_REACHED"` (string confirmed from 04-01-SUMMARY.md's error contract), call `upgradeModal.open()` with no arguments since the modal has fixed copy (per 04-02-SUMMARY.md)
- Placed the new guarded branch after the existing revert logic in both onError handlers, so the optimistic UI always rolls back first regardless of error type, and the modal opens as an additional side effect only for the limit error
- Left `components/NotesTree.tsx` untouched, per the plan's explicit pattern-mapper correction (the child-note mutation lives in `hooks/useNoteMutations.ts`, invoked from `providers/TreeProvider.tsx`, not in `NotesTree.tsx`)

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their action/acceptance criteria on first implementation. Prettier/ESLint pre-commit hooks reformatted nothing behaviorally (only ran their standard staged-file pipeline).

## Issues Encountered

None. `npx tsc --noEmit -p tsconfig.json` was clean after each task.

## User Setup Required

None - no external service configuration required. This plan only touches client-side React Query mutation handlers.

## Next Phase Readiness

- Both note-creation UI call sites are now fully wired end-to-end: server gate (plan 01) -> shared modal (plan 02) -> onError wiring (this plan). The plan-enforcement UX loop (D-07) is complete for note creation.
- No blockers for subsequent phases. `components/NotesTree.tsx` confirmed unchanged, satisfying the plan's explicit success criterion.

---

_Phase: 04-plan-enforcement_
_Completed: 2026-07-10_
