---
phase: 01-schema-infrastructure-foundation
reviewed: 2026-07-08T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - convex/subscriptions.ts
  - convex/aiCredits.ts
  - convex/schema.ts
  - package.json
  - proxy.ts
  - .env.example
  - .gitignore
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-07-08T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This phase lays down billing/credit infrastructure: Convex schema tables (`subscriptions`, `aiCredits`, `creditTransactions`, `processedStripeEvents`), stubbed query/mutation handlers that intentionally throw `"Not implemented — Phase 2"`, Stripe env-var scaffolding, and a migration of the husky pre-commit config to a `lint-staged` block.

I verified several things that could have been defects but are correct:

- `proxy.ts` is the correct Next.js 16 middleware filename (middleware was renamed from `middleware.ts` to `proxy.ts`), and `next.config.ts` is present — the middleware will be picked up.
- The husky migration is properly wired: `.husky/pre-commit` exists and runs `npx lint-staged`.
- `.env.example` contains only placeholder values — no leaked secrets — and correctly separates the public `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from server-only secrets. `.gitignore` ignores `.env*` while allowing `.env.example`.
- The stub handlers throw, but no client/server code references them yet, so nothing crashes at this stage.

No BLOCKER-level correctness or security defects were found in the submitted code. One WARNING concerns a foundational schema decision that will cause runtime failures once Stripe webhooks are wired in Phase 2; it is cheap to fix now.

## Warnings

### WR-01: `subscriptions.status` union is narrower than Stripe's actual status set

**File:** `convex/schema.ts:44-48`, `convex/subscriptions.ts:16-20`
**Issue:** The `status` validator only allows `"active"`, `"canceled"`, `"past_due"`. Stripe subscriptions can also arrive in `trialing`, `incomplete`, `incomplete_expired`, `unpaid`, and `paused` states via `customer.subscription.*` webhooks. Because the same three-value union is duplicated in the `upsertSubscription` mutation args, a webhook delivering any other status will fail Convex argument validation and throw at write time — the subscription row will silently fail to persist. This is a latent foundation bug: it cannot fire today (handler is a stub) but will bite as soon as Phase 2 wires the webhook. Cheap to correct while the schema is being defined.
**Fix:** Expand the union to cover the full Stripe set you intend to persist, in both the schema and the mutation validator, e.g.:

```ts
status: v.union(
  v.literal("active"),
  v.literal("trialing"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("unpaid"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("paused"),
),
```

Alternatively, map/normalize incoming Stripe statuses down to the three business states at the webhook boundary before calling `upsertSubscription` — but that decision should be explicit, not an accidental consequence of a narrow validator.

## Info

### IN-01: Redundant `!isPublicRoute` guard in middleware

**File:** `proxy.ts:14`
**Issue:** `isPublicRoute` matches `/api/webhooks/(.*)` while `isProtectedRoute` matches only `/notes(.*)` and `/:locale/notes(.*)`. These path sets cannot overlap, so `!isPublicRoute(req) && isProtectedRoute(req)` is equivalent to `isProtectedRoute(req)` — the public check never changes the outcome. Harmless today, but it reads as if webhooks are being deliberately excluded from protection when they were never in scope, which can mislead future readers into thinking `/api/webhooks` is covered by the protect matcher.
**Fix:** Either drop the `isPublicRoute` guard until a protected route actually overlaps the public set, or broaden `isProtectedRoute` (e.g. protect more `/api` routes) so the exclusion is meaningful.

### IN-02: `prepare` script uses deprecated `husky install`

**File:** `package.json:13`
**Issue:** With `"husky": "^9.1.7"`, `husky install` is deprecated and prints a deprecation warning; it is removed in husky v10. Left as-is, `npm install`/`prepare` will emit noise now and break on the next major husky bump.
**Fix:** Change the script to `"prepare": "husky"`.

### IN-03: `lint-staged` eslint glob excludes newly added `convex/` files

**File:** `package.json:98-105`
**Issue:** The eslint entry is scoped to `app/**/*.{js,jsx,ts,tsx}`. The Convex source added in this phase (`convex/subscriptions.ts`, `convex/aiCredits.ts`, `convex/schema.ts`) is therefore only prettier-formatted on commit, never eslint-checked. Lint regressions in `convex/` will pass the pre-commit hook silently.
**Fix:** Broaden the eslint glob to include `convex/`, e.g. `"{app,convex}/**/*.{js,jsx,ts,tsx}": ["eslint --fix"]`, and confirm the eslint config lints `convex/`.

### IN-04: Billing tables key on `clerkUserId` while `users` keys on `tokenIdentifier`

**File:** `convex/schema.ts:5-20`, `40-69`
**Issue:** `subscriptions`, `aiCredits`, and `creditTransactions` all reference a user by `clerkUserId: v.string()`, but the `users` table has no `clerkUserId` field — it identifies users via `tokenIdentifier` (Convex's `${issuer}|${subject}` form). There is no field or index that lets you join a `users` row to its billing rows without deriving the Clerk id from `tokenIdentifier`. This may be intentional (billing looked up directly by `auth().userId` from Clerk rather than through `users`), but the mismatch is easy to get wrong in Phase 2 and worth making explicit.
**Fix:** Either add a `clerkUserId` field (plus index) to `users` to make the linkage first-class, or document that billing tables are intentionally keyed by the Clerk user id resolved from auth context and never joined through `users`.

---

_Reviewed: 2026-07-08T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
