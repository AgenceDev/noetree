---
phase: 06-settings-page
plan: 02
subsystem: payments
tags: [stripe, server-actions, nextjs, clerk, convex, tdd]

# Dependency graph
requires:
  - phase: 06-settings-page (plan 01)
    provides: convex/aiCredits.ts listMyTopups query (backend groundwork, unrelated to this plan's files but same wave)
provides:
  - "app/[locale]/(app)/settings/actions.ts — cancelSubscription and resumeSubscription Server Actions"
  - "app/[locale]/(app)/settings/actions.test.ts — guard + Stripe-call coverage for both actions"
affects:
  [
    06-settings-page (plan for Settings page UI that binds these actions to the Plan Card's cancel/resume buttons),
  ]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server Action cancel/resume pair mirroring notes/actions.ts's Clerk auth() -> identity-forwarded Convex getSubscription -> narrow try/catch around single stripe.subscriptions.update() call, with zero redirect()"

key-files:
  created:
    - "app/[locale]/(app)/settings/actions.ts"
    - "app/[locale]/(app)/settings/actions.test.ts"
  modified: []

key-decisions:
  - "Guard error strings CANCEL_REQUIRES_ACTIVE_SUBSCRIPTION and RESUME_REQUIRES_PENDING_CANCELLATION chosen per plan Task 2 instruction, matched exactly in test assertions"
  - "Avoided the literal word 'redirect' in code comments so the plan's grep-based no-redirect verification (grep -Eq \"redirect|internal\\.subscriptions\") passes cleanly against comment text, not just code"

patterns-established:
  - "Zero-argument Server Action guard pattern: re-derive subscription via identity-forwarded getSubscription inside the action itself, never trust a client-supplied id or UI-only conditional rendering (T-06-01/T-06-02 mitigation)"

requirements-completed: [SET-04, PAY-04]

# Metrics
duration: 13min
completed: 2026-07-11
---

# Phase 6 Plan 02: Cancel/Resume Subscription Server Actions Summary

**cancelSubscription and resumeSubscription Server Actions in app/[locale]/(app)/settings/actions.ts, each server-verifying subscription state before a single guarded stripe.subscriptions.update() call, with full TDD RED/GREEN coverage.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-11T10:14:55Z
- **Completed:** 2026-07-11T10:27:17Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments

- `cancelSubscription()` re-verifies `status === "active"` server-side before calling `stripe.subscriptions.update(id, { cancel_at_period_end: true })`
- `resumeSubscription()` re-verifies `cancelAtPeriodEnd === true` server-side before calling `stripe.subscriptions.update(id, { cancel_at_period_end: false })`
- Both actions are zero-argument (IDOR-safe — subscription id always derived from the caller's own identity-scoped `getSubscription`, never a parameter)
- 10 passing tests covering unauthenticated, guard-rejection, happy-path, and Convex lookup-failure cases for both actions

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Create app/[locale]/(app)/settings/actions.test.ts** - `72867f0` (test)
2. **Task 2 (GREEN): Implement app/[locale]/(app)/settings/actions.ts** - `4f03517` (feat)

_TDD plan: RED confirmed (`Cannot find module './actions'`) before GREEN implementation was written._

## Files Created/Modified

- `app/[locale]/(app)/settings/actions.ts` - `cancelSubscription` and `resumeSubscription` Server Actions
- `app/[locale]/(app)/settings/actions.test.ts` - Vitest coverage for both actions' guards and Stripe-call arguments

## Decisions Made

- Reused `pricing/actions.test.ts`'s exact mock scaffolding for `stripe`, `convex/browser`, `@clerk/nextjs/server`, renaming `mockSessionsCreate` to `mockSubscriptionsUpdate` and omitting the `next/navigation` mock (these actions never redirect), per plan instruction.
- Chose the guard error strings `CANCEL_REQUIRES_ACTIVE_SUBSCRIPTION` / `RESUME_REQUIRES_PENDING_CANCELLATION` as specified in Task 2's action text, and wrote Task 1's tests against those exact strings first.

## Deviations from Plan

None - plan executed exactly as written. One minor wording adjustment during Task 2 (see below) was needed to satisfy the plan's own automated verification command, not a functional deviation.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Comment wording collided with the plan's own no-redirect grep check**

- **Found during:** Task 2 (GREEN implementation), verification step
- **Issue:** The plan's acceptance criteria required `grep -Eq "redirect|internal\.subscriptions" actions.ts` to return NO match. Initial code comments explaining "no redirect() call here" (correctly describing the absence of a `redirect()` call) contained the literal word "redirect", causing a false-positive match against the plan's own verification regex.
- **Fix:** Reworded the explanatory comments to say "no navigation" instead of "no redirect()" — same meaning, no functional code change, satisfies the literal grep check the plan itself specifies as an acceptance criterion.
- **Files modified:** `app/[locale]/(app)/settings/actions.ts`
- **Verification:** `grep -Eq "redirect|internal\.subscriptions" actions.ts` now returns no match; `npx vitest run actions.test.ts` still green (10/10) after the wording change.
- **Committed in:** `4f03517` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Comment-only change to satisfy the plan's literal acceptance-criteria grep; no functional or behavioral difference. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. No new environment variables; reuses `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_CONVEX_URL` already configured in prior phases.

## Next Phase Readiness

`cancelSubscription` and `resumeSubscription` are ready to be imported and bound to the Settings page's Plan Card cancel/resume buttons (the sibling `06-XX` plan building `app/[locale]/(app)/settings/page.tsx`). No blockers. The existing `customer.subscription.updated` webhook (Phase 2, unchanged) is confirmed as the sole Convex writer for the resulting state — no new webhook branch was needed or added this plan.

---

_Phase: 06-settings-page_
_Completed: 2026-07-11_
