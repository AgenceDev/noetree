---
phase: 04-plan-enforcement
plan: 02
subsystem: ui
tags: [react, nextjs, next-intl, radix-dialog, shadcn, context-api]

# Dependency graph
requires:
  - phase: 04-plan-enforcement (plan 01)
    provides: server-side Free-tier note limit enforcement (NOTE_LIMIT_REACHED error)
provides:
  - Shared UpgradeModal Dialog component with Free-limit copy and /pricing CTA
  - UpgradeModalProvider global context + useUpgradeModal() hook, mounted in (app) layout
  - PlanEnforcement i18n namespace (en + fr)
affects:
  [
    04-plan-enforcement plan 03 (wiring the two createNote call sites to open this modal),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Global cross-subtree UI state via createContext + Provider + accessor-hook-that-throws (mirrors providers/HeaderProvider.tsx)"

key-files:
  created:
    - components/UpgradeModal.tsx
    - providers/UpgradeModalProvider.tsx
  modified:
    - app/[locale]/(app)/layout.tsx
    - messages/en.json
    - messages/fr.json

key-decisions:
  - "useUpgradeModal() exposes { isOpen, open(), close() } — plan 03 should call useUpgradeModal().open() from onError handlers, no arguments needed since the modal has fixed copy"
  - "UpgradeModalProvider wraps HeaderProvider as an additional outer layer in (app) layout (order doesn't matter, they're independent contexts)"

patterns-established:
  - "Global modal singleton pattern: Provider renders both the context and the modal instance itself, so consumers only need the hook, never the component"

requirements-completed: [PLAN-04]

# Metrics
duration: 12min
completed: 2026-07-10
---

# Phase 04 Plan 02: Upgrade Modal Infrastructure Summary

**Global `useUpgradeModal()` context + `UpgradeModal` Dialog (shadcn/Radix) wired into the `(app)` layout, with a new `PlanEnforcement` i18n namespace in en/fr, so any component under `(app)` can trigger one shared Free-limit upgrade prompt.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-10T15:14:00Z (approx.)
- **Completed:** 2026-07-10T15:26:15Z
- **Tasks:** 3 completed
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- Added `PlanEnforcement` namespace (title/body/upgradeCta/dismiss) to both `messages/en.json` and `messages/fr.json`, matching the UI-SPEC copy contract exactly
- Created `components/UpgradeModal.tsx` — a controlled Dialog (no internal state) showing the Free-limit copy, a primary "Upgrade to Pro" CTA linking to `/pricing`, and a secondary "Maybe later" dismiss that only closes the dialog
- Created `providers/UpgradeModalProvider.tsx` mirroring `HeaderProvider`'s createContext + Provider + throwing-accessor-hook shape, exposing `useUpgradeModal()` with `{ isOpen, open, close }`
- Mounted `UpgradeModalProvider` in `app/[locale]/(app)/layout.tsx`, wrapping the existing `HeaderProvider`/`SidebarProvider` tree so the single shared modal instance is reachable from both `notes/page.tsx` and `notes/[id]/page.tsx` (which mounts `TreeProvider`)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add PlanEnforcement i18n namespace to both catalogs** - `fe62395` (feat)
2. **Task 2: Create UpgradeModal Dialog component** - `3547e50` (feat)
3. **Task 3: Create UpgradeModalProvider and mount it in the (app) layout** - `a790cfd` (feat)

_No TDD tasks in this plan — all `type="auto"` UI/infra tasks._

## Files Created/Modified

- `messages/en.json` - Added top-level `PlanEnforcement` namespace (title, body, upgradeCta, dismiss)
- `messages/fr.json` - Added matching French `PlanEnforcement` namespace
- `components/UpgradeModal.tsx` - Controlled Dialog component rendering the Free-limit copy, /pricing CTA, and dismiss button
- `providers/UpgradeModalProvider.tsx` - Context + `useUpgradeModal()` hook + mounts the single `UpgradeModal` instance
- `app/[locale]/(app)/layout.tsx` - Wrapped children with `UpgradeModalProvider`

## Decisions Made

- Followed the plan's exact interface contract for `useUpgradeModal()` (`isOpen`/`open`/`close`) so plan 03 can wire against it without further exploration
- Kept `UpgradeModalProvider` as an independent outer wrapper around `HeaderProvider` rather than merging logic, since the two contexts are unrelated (matches plan's explicit note that nesting order doesn't matter)

## Deviations from Plan

None - plan executed exactly as written. All three tasks matched their action/acceptance criteria without needing Rule 1-4 fixes. Prettier/ESLint pre-commit hooks reformatted quote style and import ordering automatically (cosmetic only, no behavior change).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. All changes are client-side UI/i18n infrastructure.

## Next Phase Readiness

- Plan 03 can now import `useUpgradeModal` from `@/providers/UpgradeModalProvider` and call `.open()` from the `onError` handlers in `hooks/useNoteMutations.ts` and the root `notes/page.tsx` mutation, per the `04-UI-SPEC.md` `NOTE_LIMIT_REACHED` distinguishable-error contract
- No blockers. The modal, provider, and i18n copy are fully verified (`tsc --noEmit` clean, JSON catalogs valid, `useUpgradeModal`/`href="/pricing"`/`UpgradeModalProvider` all grep-confirmed present)

---

_Phase: 04-plan-enforcement_
_Completed: 2026-07-10_

## Self-Check: PASSED

All created/modified files confirmed present on disk; all 4 commit hashes (fe62395, 3547e50, a790cfd, a3133dc) confirmed in git log.
