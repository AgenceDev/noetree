---
phase: 06-settings-page
plan: 04
subsystem: ui
tags: [nextjs, react, convex, next-intl, shadcn, alert-dialog, stripe]

# Dependency graph
requires:
  - phase: 06-settings-page
    provides: "06-01 (listMyTopups query), 06-02 (cancelSubscription/resumeSubscription Server Actions), 06-03 (Settings i18n namespace)"
provides:
  - "SettingsPlanCard.tsx — Plan Card: status, renewal/cancel date, cancel AlertDialog, resume + upgrade CTAs"
  - "SettingsCreditsCard.tsx — Credits Card: balance + newest-first top-up history / empty state"
  - "app/[locale]/(app)/settings/page.tsx — the in-app Settings route composing both cards under the app shell"
affects: [settings-page-verification, milestone-completion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Reactive Convex read via useQuery(convexQuery(api.X, isSignedIn ? {} : "skip")) — skip sentinel, never enabled:false'
    - "AlertDialog for destructive confirm-or-abort (cancel subscription) vs. no-dialog for reversible action (resume)"
    - "Server Action call wrapped in local isPending/error state, no redirect, rely on Convex reactivity for UI update after webhook write-back"

key-files:
  created:
    - components/SettingsPlanCard.tsx
    - components/SettingsCreditsCard.tsx
    - app/[locale]/(app)/settings/page.tsx
  modified: []

key-decisions:
  - "currentPeriodEnd (subscriptions) is Unix seconds -> * 1000 before Date(); creditTransactions.createdAt is already milliseconds -> no multiplier (Pitfall 1)"
  - "Cancel subscription uses AlertDialog (D-01); Resume subscription has no confirmation dialog (not destructive, D-02)"
  - "Free user's Plan Card shows only plan name + Upgrade CTA, no comparison table (D-11)"
  - "Credits top-up history has no pagination (D-09) — full list rendered from listMyTopups"
  - "Settings page is a thin composition shell — all data reads/interactions live in the two card components"

patterns-established:
  - "Card-per-domain composition (Plan Card, Credits Card) stacked with space-y-8, no Tabs primitive (D-10)"

requirements-completed: [SET-01, SET-02, SET-03, SET-04, SET-05, PAY-04]

# Metrics
duration: 22min
completed: 2026-07-11
---

# Phase 06 Plan 04: Settings Page UI Composition Summary

**Settings route at app/[locale]/(app)/settings/page.tsx composing SettingsPlanCard (status/renewal/cancel-with-AlertDialog/resume/upgrade) and SettingsCreditsCard (balance + newest-first top-up history) via reactive Convex reads.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-11T10:28:00Z
- **Completed:** 2026-07-11T10:50:39Z
- **Tasks:** 3 completed
- **Files modified:** 3 (all new)

## Accomplishments

- SettingsPlanCard renders Free/Pro/Pro-cancelling branches with correctly converted renewal/cancel dates (seconds -> ms), a destructive-styled AlertDialog-gated cancel flow, a non-destructive resume flow, and an Upgrade-to-Pro Link CTA for Free users.
- SettingsCreditsCard renders the credit balance and a newest-first, unpaginated top-up history list (or the locked empty-state copy), using the already-millisecond `createdAt` field without a spurious `* 1000` conversion.
- The Settings route (`app/[locale]/(app)/settings/page.tsx`) sets the shared app-shell header title via `useHeaderConfig` and stacks both cards with `space-y-8` (D-10), with zero data-fetching logic in the page itself.

## Task Commits

Each task was committed atomically:

1. **Task 1: SettingsPlanCard.tsx — plan/status/renewal + cancel AlertDialog + resume + upgrade CTA** - `e3ad10e` (feat)
2. **Task 2: SettingsCreditsCard.tsx — balance + top-up history list + empty state** - `e4b66e6` (feat)
3. **Task 3: settings/page.tsx — route shell composing both cards + header title** - `bbc28b1` (feat)

_No TDD tasks in this plan; each task is a single feat commit._

## Files Created/Modified

- `components/SettingsPlanCard.tsx` - Plan Card: Free/Pro/Pro-cancelling branching, cancel AlertDialog, resume, upgrade CTA
- `components/SettingsCreditsCard.tsx` - Credits Card: balance line + newest-first top-up history / empty state
- `app/[locale]/(app)/settings/page.tsx` - Settings route shell, sets header title, stacks both cards

## Decisions Made

- Followed the plan's locked interfaces and UI-SPEC exactly: reused existing `Settings` i18n namespace keys (all present from Plan 06-03, no new keys needed), reused the `AlertDialog` structural template from `notes/page.tsx`'s delete confirmation, and the `Button asChild` + `Link` idiom from `UpgradeModal.tsx` for the upgrade CTA.
- No new packages, no schema changes, no Convex function changes — this plan is pure UI composition over already-merged Plan 06-01/06-02/06-03 outputs.

## Deviations from Plan

None - plan executed exactly as written. All three files match the plan's `must_haves.artifacts` paths, `min_lines` thresholds, and `key_links` (getSubscription, cancelSubscription/resumeSubscription, listMyTopups) exactly.

## Issues Encountered

None. `npx tsc --noEmit` reported zero errors and the full `npx vitest run` suite (93 tests, 8 files) stayed green after all three tasks, both before and after the pre-commit hook's `prettier --write`/`eslint --fix` auto-formatting.

## User Setup Required

None - no external service configuration required. All Convex queries and Server Actions this plan wires were already deployed by Plans 06-01/06-02.

## Next Phase Readiness

- The Settings page is feature-complete and ready for the phase's deferred manual verification step (Plan 05: sign in as Free and Pro users, confirm both Cards render and dates are real future dates, not 1970).
- No blockers. All grep-based and acceptance-criteria verifications in the plan passed for all three tasks.

---

_Phase: 06-settings-page_
_Completed: 2026-07-11_
