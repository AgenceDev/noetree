---
phase: 06-settings-page
plan: 03
subsystem: ui
tags: [next-intl, i18n, lucide-react, dropdown-menu, navigation]

# Dependency graph
requires: []
provides:
  - "Settings i18n namespace (19 keys) mirrored in en.json and fr.json"
  - "NavUser.settings translation key in both locales"
  - "Distinct 'Settings' item in the NavUser dropdown, navigating to /settings"
affects:
  [
    06-04 Settings page plan,
    which consumes the Settings namespace and relies on this nav entry point,
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat key-value i18n namespace convention (matches Pricing/AiCredits/PlanEnforcement)"
    - "Separate DropdownMenuItem per concern (identity/Account vs billing/Settings), not merged (D-05)"

key-files:
  created: []
  modified:
    - messages/en.json
    - messages/fr.json
    - components/nav-user.tsx

key-decisions:
  - "D-03: en.Settings.cancelsOn locked to exact literal 'Cancels on {date}'"
  - "D-05: Settings dropdown item kept as a separate DropdownMenuItem from Account, which still opens Clerk's profile modal via openUserProfile()"

patterns-established:
  - "Settings namespace covers all copy needed by the future Settings page (Plan 04) per the locked Copywriting Contract"

requirements-completed: [SET-01]

# Metrics
duration: 12min
completed: 2026-07-11
---

# Phase 6 Plan 3: Settings Navigation Entry + i18n Namespace Summary

**Added a distinct "Settings" item to the NavUser dropdown (navigates to /settings) and a complete 19-key Settings i18n namespace mirrored in en.json/fr.json for the upcoming Settings page.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-11T10:14:00Z
- **Completed:** 2026-07-11T10:26:26Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- `Settings` namespace (title, plan/credits card copy, upgrade/cancel/resume CTAs, cancel-confirm dialog copy, credits balance, top-up history copy, generic action error) added to both `messages/en.json` and `messages/fr.json` with identical, sorted key sets
- `NavUser.settings` key added to both locale files ("Settings" / "Paramètres")
- `components/nav-user.tsx` gained a new `DropdownMenuItem` using the already-imported `router` from `@/i18n/routing` (`router.push("/settings")`), labelled via `t("settings")`, with the `Settings` lucide icon
- Existing "Account" item left untouched — still calls `openUserProfile()` (D-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Settings i18n namespace + NavUser.settings to en.json and fr.json** - `42a067d` (feat)
2. **Task 2: Add the Settings dropdown item to components/nav-user.tsx** - `6bed2ff` (feat)

_Note: prettier pre-commit hook reformatted staged JSON/TSX on both commits (no manual formatting deviation)._

## Files Created/Modified

- `messages/en.json` - Added `Settings` namespace (19 keys) and `NavUser.settings: "Settings"`
- `messages/fr.json` - Added `Settings` namespace (19 keys, French) and `NavUser.settings: "Paramètres"`
- `components/nav-user.tsx` - Added `Settings` lucide import and a new `DropdownMenuItem` navigating to `/settings`, inserted above the existing "Account" item

## Decisions Made

- D-03 (locked): `en.Settings.cancelsOn` reads exactly `"Cancels on {date}"`. The French mirror uses a faithful translation (`"Se termine le {date}"`) since D-03 only locks the English literal.
- D-05: kept Settings and Account as two separate `DropdownMenuItem`s in the same `DropdownMenuGroup`, per the plan's explicit instruction not to merge identity/security (Account) with billing/credits (Settings) concerns.
- French translation register for `NavUser.settings` matched the existing "Compte"/"account" convention style, using "Paramètres" (standard French term, consistent with app's existing "Thème"/"Langue" register in the same namespace).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 (Settings page) can now consume `t("Settings.*")` calls against real, mirrored copy in both locales, with `cancelsOn` matching the D-03 locked literal.
- The navigation entry point (`/settings`) is live in the NavUser dropdown for signed-in users; the route itself does not yet exist (created in Plan 04) — clicking the item before Plan 04 lands will 404, which is expected and does not block this plan's scope.
- No blockers for Plan 04.

---

_Phase: 06-settings-page_
_Completed: 2026-07-11_
