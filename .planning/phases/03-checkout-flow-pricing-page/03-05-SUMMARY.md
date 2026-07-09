---
phase: 03-checkout-flow-pricing-page
plan: 05
subsystem: ui
tags: [nextjs, app-router, route-groups, layout, i18n]

# Dependency graph
requires:
  - phase: 03-checkout-flow-pricing-page
    provides: UI-SPEC.md layout note (D-01) mandating a chrome-free marketing shell
provides:
  - Stripped root layout (app/[locale]/layout.tsx) with only global providers (Clerk/Convex/NextIntl/Theme) + html/body/fonts
  - New (app) route group (app/[locale]/(app)/layout.tsx) housing the authenticated app-shell chrome (HeaderProvider/SidebarProvider/AppSidebar/Header/main)
  - Dashboard, notes list, and note detail routes relocated under (app)/ with URLs unchanged
  - New chrome-free (marketing) route group (app/[locale]/(marketing)/layout.tsx) — centered max-w-3xl column, no AppSidebar/Header
affects: [checkout-flow, pricing-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    [
      Next.js App Router sibling route groups to split authenticated app-shell chrome from public marketing pages without duplicating global providers,
    ]

key-files:
  created:
    - app/[locale]/(app)/layout.tsx
    - app/[locale]/(app)/page.tsx
    - app/[locale]/(app)/notes/page.tsx
    - app/[locale]/(app)/notes/[id]/page.tsx
    - app/[locale]/(marketing)/layout.tsx
  modified:
    - app/[locale]/layout.tsx

key-decisions:
  - "App-shell chrome (HeaderProvider/SidebarProvider/AppSidebar/SidebarInset/Header/main) extracted into a new (app) route group instead of trying to conditionally hide it in the root, since a nested layout cannot remove chrome an ancestor already rendered"
  - "(app) layout takes only children (no params/locale) since the root already validates locale and supplies i18n/theme context to both route groups"
  - "(marketing) layout does not re-declare ClerkProvider/ConvexClientProvider/ThemeProvider/NextIntlClientProvider — it relies on the now chrome-free root for those, keeping a single provider chain"

patterns-established:
  - "Pattern 1: Route-group layout split — root layout owns ONLY global providers, html/body, and locale validation; each route group under it (`(app)`, `(marketing)`) owns its own chrome, keeping URL-transparency (route groups don't affect routing) while genuinely differing at runtime in rendered ancestry"

requirements-completed: [PLAN-01, PAY-02]

# Metrics
duration: ~12min
completed: 2026-07-09
---

# Phase 3 Plan 05: Root Layout Decomposition into (app) and (marketing) Route Groups Summary

**Split the root Next.js layout into a chrome-free global root, an `(app)` route group carrying the authenticated sidebar/header shell, and a new chrome-free `(marketing)` route group — a genuine runtime fix (not a false-green grep) for D-01/D-04 so /pricing and /checkout/success will render with no AppSidebar/Header.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-09T14:14:20Z
- **Tasks:** 2 completed
- **Files modified:** 6 (1 modified, 5 created/moved)

## Accomplishments

- Root `app/[locale]/layout.tsx` now renders ONLY global providers (ClerkProvider, ConvexClientProvider, NextIntlClientProvider, ThemeProvider) plus html/body/fonts, generateMetadata, and the locale guard — zero app-shell chrome references.
- New `app/[locale]/(app)/layout.tsx` houses HeaderProvider > SidebarProvider > (AppSidebar + SidebarInset > Header > main) in the exact prior nesting order, wrapping the three authenticated routes at unchanged URLs (`/[locale]`, `/[locale]/notes`, `/[locale]/notes/[id]`).
- New `app/[locale]/(marketing)/layout.tsx` renders a centered `max-w-3xl` column with no AppSidebar/Header/HeaderProvider/SidebarProvider — a real runtime guarantee now that the root is chrome-free, ready for the `/pricing` and `/checkout/success` pages other plans in this phase will build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the app shell into a new (app) route group and strip the root layout** - `21737f2` (feat)
2. **Task 2: Create the chrome-free (marketing) route-group shell** - `041ffa9` (feat)

_Note: no TDD tasks in this plan; both are structural `feat` commits._

## Files Created/Modified

- `app/[locale]/layout.tsx` - Stripped to global providers only (Clerk/Convex/NextIntl/Theme + html/body/fonts/metadata/locale guard); no longer renders AppSidebar/Header/HeaderProvider/SidebarProvider
- `app/[locale]/(app)/layout.tsx` - New: HeaderProvider > SidebarProvider > AppSidebar + SidebarInset > Header > main{children}, the authenticated app shell
- `app/[locale]/(app)/page.tsx` - Moved from `app/[locale]/page.tsx` (content unchanged; URL still `/[locale]`)
- `app/[locale]/(app)/notes/page.tsx` - Moved from `app/[locale]/notes/page.tsx` (content unchanged; URL still `/[locale]/notes`)
- `app/[locale]/(app)/notes/[id]/page.tsx` - Moved from `app/[locale]/notes/[id]/page.tsx` (content unchanged; URL still `/[locale]/notes/[id]`)
- `app/[locale]/(marketing)/layout.tsx` - New: chrome-free centered `max-w-3xl` shell for public marketing routes

## Decisions Made

- Chose sibling route-group extraction (pulling chrome OUT of root into `(app)`) rather than conditionally rendering chrome in the root, because Next.js nested layouts compose inside their ancestor — a `(marketing)` group under an unchanged chrome-rendering root would still show AppSidebar/Header. This is the only architecturally correct fix per the plan's stated rationale.
- Used `git mv` for the three route moves to preserve file history/rename tracking in git.

## Deviations from Plan

None - plan executed exactly as written. Both tasks matched their acceptance criteria and automated verify commands passed on the first attempt; `npx tsc --noEmit` reported zero new errors after the moves.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The chrome-free `(marketing)` shell is now a genuine runtime property, unblocking the `/pricing` and `/checkout/success` pages (other plans in this phase/wave) to render without inheriting AppSidebar/Header.
- The three authenticated routes are verified to resolve at unchanged URLs under `(app)`, so no downstream link/navigation changes are needed elsewhere in the app.
- No blockers for subsequent plans in this phase.

---

_Phase: 03-checkout-flow-pricing-page_
_Completed: 2026-07-09_
