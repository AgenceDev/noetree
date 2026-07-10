---
phase: 05-ai-credits-system
plan: 04
subsystem: ui
tags: [react, convex, tanstack-query, tiptap, i18n, shadcn]

# Dependency graph
requires:
  - phase: 05-ai-credits-system
    provides: "Plan 01 (runAiAction/getMyCredits mutations+query, INSUFFICIENT_CREDITS ConvexError) and Plan 03 (CreditsExhaustedDialog component, AiCredits i18n copy)"
provides:
  - "AI action toolbar button (Sparkles icon) wired to api.aiCredits.runAiAction"
  - "Reactive credits balance badge (Badge variant=secondary) via api.aiCredits.getMyCredits"
  - "CreditsExhaustedDialog mounted in the editor toolbar, opened on INSUFFICIENT_CREDITS"
affects: [05-05 human-verification, settings-credits-display]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useConvexMutation + useMutation({ onError }) checking `err instanceof ConvexError && err.data === CODE` to trigger UI branching (mirrors hooks/useNoteMutations.ts NOTE_LIMIT_REACHED pattern)"
    - "convexQuery + useQuery reactive read with `?? 0` fallback for absent rows (D-09 null-safety)"

key-files:
  created: []
  modified:
    - components/editor/EditorToolbar.tsx

key-decisions:
  - "Balance badge is always neutral (variant=secondary), never color-coded or hidden at zero — zero-balance blocking is communicated by CreditsExhaustedDialog, not badge styling (UI-SPEC Color contract)"
  - "AI button is never hidden or disabled based on balance — click always fires the mutation; the server enforces the balance check and the client only reacts to INSUFFICIENT_CREDITS (T-05-02 threat mitigation, D-09)"

patterns-established:
  - "New toolbar groups follow: Separator, ToolbarButton(s), then any accompanying non-button UI (Badge/Tooltip), all within the same `gap-1` flex row"

requirements-completed: [CRED-02, CRED-04]

duration: 15min
completed: 2026-07-10
---

# Phase 5 Plan 04: Editor Toolbar AI Button + Credits Badge Summary

**Wired the Sparkles AI-action toolbar button and a reactive credits balance badge into EditorToolbar.tsx, with runAiAction mutation handling and CreditsExhaustedDialog mounted for the INSUFFICIENT_CREDITS zero-balance path.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-10T20:36:00Z
- **Completed:** 2026-07-10T20:43:48Z
- **Tasks:** 2 completed
- **Files modified:** 1

## Accomplishments

- Added a new toolbar group (after Link/Image, preceded by a Separator) with a Sparkles `ToolbarButton` and a neutral `Badge variant="secondary"` showing the live credit balance, wrapped in a Tooltip using the `AiCredits.badgeTooltip` ICU-plural copy.
- Wired the button's `onClick` to `runAiAction.mutate({})` via `useConvexMutation(api.aiCredits.runAiAction)` + `useMutation`, with `onError` opening `CreditsExhaustedDialog` when `err instanceof ConvexError && err.data === "INSUFFICIENT_CREDITS"`.
- Mounted `<CreditsExhaustedDialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen} />` inside the toolbar's JSX, alongside the existing Link/Image dialogs.
- Balance badge reads reactively from `api.aiCredits.getMyCredits` via `useQuery(convexQuery(...))`; no manual refetch needed — it decrements automatically once the mutation commits (shared Convex query cache).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add AiActionButton + CreditsBalanceBadge toolbar group** - `f069ace` (feat)
2. **Task 2: Wire runAiAction + mount CreditsExhaustedDialog** - `e07dada` (feat)

_Plan metadata commit intentionally omitted — worktree mode; orchestrator handles shared STATE.md/ROADMAP.md writes after merge._

## Files Created/Modified

- `components/editor/EditorToolbar.tsx` - New Sparkles AI-action `ToolbarButton` + neutral `Badge` balance indicator + `runAiAction` mutation wiring + mounted `CreditsExhaustedDialog`

## Decisions Made

- Followed the plan's exact wiring pattern (mirrored from `hooks/useNoteMutations.ts` createNote's `NOTE_LIMIT_REACHED` handling) for `INSUFFICIENT_CREDITS` — no deviation.
- Kept the AI button and badge always visible/enabled per D-09 and UI-SPEC — no balance-based hiding, disabling, or color-coding was added.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their acceptance criteria on the first implementation pass; `npx tsc --noEmit -p tsconfig.json` passed cleanly after each task with no errors to fix.

## Issues Encountered

None. `npx vitest run` (72 tests, 7 files) passed with no regressions after both commits — no existing tests target `EditorToolbar.tsx`, consistent with the plan's note that UI wiring has no unit tests and is verified manually in Plan 05.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The toolbar's AI button and balance badge are always visible for both Free and Pro users (never hidden), satisfying CRED-02 (SC2) and D-09 ahead of Plan 05's human-verification pass.
- `CreditsExhaustedDialog` is mounted and reachable from the toolbar — Plan 05 can verify the zero-balance blocking flow end-to-end (click → INSUFFICIENT_CREDITS → dialog opens → branching CTA per Free/Pro from Plan 03).
- No blockers. Toolbar group placement (after Link/Image, before the Link/Image Dialogs in JSX) matches the UI-SPEC contract exactly, so Plan 05's manual verification steps should find the button and badge in the expected position.

---

_Phase: 05-ai-credits-system_
_Completed: 2026-07-10_

## Self-Check: PASSED

- FOUND: components/editor/EditorToolbar.tsx
- FOUND: .planning/phases/05-ai-credits-system/05-04-SUMMARY.md
- FOUND commit: f069ace
- FOUND commit: e07dada
- FOUND commit: a6c64a1
