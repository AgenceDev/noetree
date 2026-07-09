---
phase: 03-checkout-flow-pricing-page
reviewed: 2026-07-09T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .env.example
  - .gitignore
  - app/[locale]/(app)/layout.tsx
  - app/[locale]/(app)/notes/[id]/page.tsx
  - app/[locale]/(app)/notes/page.tsx
  - app/[locale]/(app)/page.tsx
  - app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx
  - app/[locale]/(marketing)/checkout/success/SuccessStatus.tsx
  - app/[locale]/(marketing)/checkout/success/page.tsx
  - app/[locale]/(marketing)/layout.tsx
  - app/[locale]/(marketing)/pricing/actions.test.ts
  - app/[locale]/(marketing)/pricing/actions.ts
  - app/[locale]/(marketing)/pricing/page.tsx
  - app/[locale]/layout.tsx
  - components/ui/badge.tsx
  - cypress/integration/checkout-redirect.spec.ts
  - cypress/integration/pricing.spec.ts
  - cypress/support/commands.ts
  - messages/en.json
  - messages/fr.json
  - package.json
  - vitest.config.ts
findings:
  critical: 1
  warning: 4
  info: 4
  total: 9
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-07-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the checkout flow / pricing page phase: the new marketing route group (`(marketing)`), the `(app)` route-group extraction (mechanical file moves — `notes/page.tsx`, `notes/[id]/page.tsx`, dashboard `page.tsx` were relocated with 0 content diff and were not re-audited for pre-existing logic), the Stripe checkout server action, the checkout-success reactive status component, the pricing page, associated Vitest/Cypress tests, translation strings, and supporting config (`.env.example`, `.gitignore`, `vitest.config.ts`, `package.json`).

Locale-redirect handling is done carefully and correctly (`safeLocale` allowlist checks before every redirect URL construction, in both `actions.ts` and `checkout/success/page.tsx`), the Stripe API call is narrowly wrapped per the documented "redirect() must never be inside try/catch" pitfall, and no secrets are hardcoded in the diff.

The most significant issue found is **not in the reviewed diff itself but is directly and newly exposed by it**: `pricing/page.tsx`, `SuccessStatus.tsx`, and `pricing/actions.ts` all call `api.subscriptions.getSubscription` — a Convex query (defined in `convex/subscriptions.ts`, phase 02) that accepts an arbitrary `clerkUserId` string argument with **no verification that it matches the caller's own identity**. Because this phase is what wires that query into client-reachable code paths (the pricing page calls it directly from the browser), it is now practically exploitable: any client can call the same Convex function directly with someone else's `clerkUserId` and read their subscription status, Stripe customer ID, and Stripe subscription ID. This is flagged as Critical because it is a real, currently-reachable authorization gap in the feature this phase ships, even though the vulnerable function's source file is outside the diff.

Remaining findings are Warning/Info-level robustness, defensive-coding, and consistency issues in the new files.

## Critical Issues

### CR-01: Cross-user subscription data leak (IDOR) via `api.subscriptions.getSubscription`, reachable from this phase's client code

**Resolution (2026-07-09, commit `e5793d5`):** Fixed. `getSubscription` no longer accepts a `clerkUserId` argument — it derives the caller's id exclusively from `ctx.auth.getUserIdentity().subject`, returning `null` for unauthenticated callers. All three call sites (`pricing/page.tsx`, `SuccessStatus.tsx`, `actions.ts`) updated to stop passing the argument; the Server Action's `ConvexHttpClient` now authenticates itself via `getToken({ template: "convex" })` so its own identity check resolves. Existing Phase 1/2 Convex tests updated to use `t.withIdentity({ subject })` instead of passing `clerkUserId` directly. Verified via full regression: `npx tsc --noEmit` clean, 52/52 unit tests passing, 4/4 Cypress e2e specs passing (including a real signed-in checkout-redirect run against the live Convex dev deployment after `npx convex dev --once`).

**File:** `app/[locale]/(marketing)/pricing/page.tsx:28-33` (client-side call), `app/[locale]/(marketing)/checkout/success/SuccessStatus.tsx:35-37` (client-side call), `app/[locale]/(marketing)/pricing/actions.ts:26-28` (server-side call) — root cause in `convex/subscriptions.ts:4-12` (out of diff, phase 02)

**Issue:** `getSubscription` is a public Convex `query` that takes `clerkUserId` as a plain string argument and returns the matching subscription row (`status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodEnd`, `cancelAtPeriodEnd`) with **no check that the caller's authenticated identity matches the requested `clerkUserId`**:

```ts
export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
```

This phase is what makes the query reachable from the browser bundle: `pricing/page.tsx` calls `convexQuery(api.subscriptions.getSubscription, { clerkUserId: user.id })` directly from client code, and `SuccessStatus.tsx` does the same with a server-supplied `clerkUserId`. Since the Convex client/API surface is exposed to the browser, any signed-in user (or anyone who obtains the deployment URL) can call the identical function directly against the Convex deployment with a different, guessed/enumerated `clerkUserId` and read that user's billing/subscription data. This is a billing-data IDOR, not a hypothetical — the reviewed diff is what turns it into a shipped, client-triggerable code path.

**Fix:** Enforce identity inside the query (or derive the id from auth entirely, removing the argument):

```ts
export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || identity.subject !== args.clerkUserId) {
      throw new Error("Unauthorized");
    }
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
```

For the server-side call in `actions.ts` (which uses `ConvexHttpClient` with no auth token attached), either forward the Clerk session token via `convex.setAuth(...)` so the same identity check applies, or keep a distinct internal-only variant for trusted server callers.

## Warnings

### WR-01: Silent dead-end when Stripe Checkout Session has no `url`

**File:** `app/[locale]/(marketing)/pricing/actions.ts:63-65`
**Issue:**

```ts
if (session.url) {
  redirect(session.url);
}
```

If `session.url` is falsy (e.g. Stripe API behavior change, embedded/`ui_mode` misconfiguration, or a partial response), the function simply returns. The client (`handleUpgrade` in `pricing/page.tsx`) then falls through its `try` block without an exception, `finally` resets `isPending` to `false`, and the user is left on the pricing page with no error message and no redirect — a silent no-op with no diagnostic signal.
**Fix:** Treat a missing `url` as a failure so the existing error UI (`checkoutError` copy) fires:

```ts
if (!session.url) {
  throw new Error("checkoutSessionCreationFailed");
}
redirect(session.url);
```

(Move this check inside/adjacent to the existing try/catch so it produces the same user-facing error path.)

### WR-02: `SuccessStatus.tsx` hardcodes the locale-prefixed path instead of using the app's i18n-aware `Link`

**File:** `app/[locale]/(marketing)/checkout/success/SuccessStatus.tsx:9, 66`
**Issue:** The component imports `Link` from `"next/link"` and builds the href manually:

```tsx
import Link from "next/link";
...
<Link href={`/${locale}/notes`}>{t("goToNotes")}</Link>
```

Every other navigational link in the reviewed/adjacent code (`Dashboard`, `Notes` page) uses the project's locale-aware `Link` from `@/i18n/routing`, which resolves the correct prefix/pathname through `getPathname()`/`routing` config. Hardcoding the segment bypasses that logic — if `routing.localePrefix` is ever changed from its current default (e.g. to `"as-needed"`), or if a `pathnames` map is introduced for localized routes, this link silently breaks while every other link in the app updates automatically.
**Fix:** Use the shared `Link`:

```tsx
import { Link } from "@/i18n/routing";
...
<Link href="/notes" locale={locale}>{t("goToNotes")}</Link>
```

### WR-03: Required env vars accessed via non-null assertion with no startup validation

**File:** `app/[locale]/(marketing)/pricing/actions.ts:10, 25, 36, 47`
**Issue:** `STRIPE_SECRET_KEY!`, `NEXT_PUBLIC_CONVEX_URL!`, `APP_URL!`, and `STRIPE_PRO_PRICE_ID!` are all read with the TypeScript non-null assertion and no runtime guard. If any is unset/misconfigured in an environment (easy to do given `.env.example` lists 6 separate required values), the failure surfaces as an opaque low-level error (e.g. a Stripe SDK auth error or `new URL()`/fetch failure deep in `ConvexHttpClient`) rather than a clear "missing configuration" message, making misconfiguration hard to diagnose in staging/production.
**Fix:** Validate once at module load and fail with an actionable message, e.g.:

```ts
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
const stripe = new Stripe(STRIPE_SECRET_KEY);
```

### WR-04: `success_url`/`cancel_url` built without normalizing a trailing slash on `APP_URL`

**File:** `app/[locale]/(marketing)/pricing/actions.ts:54-55`
**Issue:**

```ts
success_url: `${baseUrl}/${safeLocale}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${baseUrl}/${safeLocale}/pricing`,
```

`baseUrl` comes straight from `process.env.APP_URL` with no trimming. `.env.example` documents `APP_URL=https://localhost:3000` (no trailing slash), but nothing prevents an operator from setting it with a trailing slash in a real deployment, which would produce a malformed double-slash URL (`https://example.com//en/checkout/success...`) passed to Stripe.
**Fix:** Normalize once: `const baseUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");`

## Info

### IN-01: Locale-validation allowlist logic duplicated three times

**File:** `app/[locale]/layout.tsx:40`, `app/[locale]/(marketing)/checkout/success/page.tsx:11-13`, `app/[locale]/(marketing)/pricing/actions.ts:14-16`
**Issue:** The same `(routing.locales as readonly string[]).includes(x) ? x : routing.defaultLocale` (or the `notFound()` variant) pattern is repeated independently in three files. This works today but risks silent divergence if the check is ever updated in only one location.
**Fix:** Extract a single helper, e.g. `isSupportedLocale(locale: string): locale is (typeof routing.locales)[number]` in `i18n/routing.ts`, and reuse it in all three call sites.

### IN-02: Pricing page can flash "Free = current plan" for an active subscriber while data is loading

**File:** `app/[locale]/(marketing)/pricing/page.tsx:35, 64-66`
**Issue:** `isActive` is computed as `data?.status === "active"`, which is `false` for the entire span before the Convex query resolves (`data === undefined`). For an already-active subscriber, this means the Free card's "Current plan" badge (`!isActive && isSignedIn`) briefly renders before flipping to the Pro card once `data` arrives — a momentary incorrect state.
**Fix:** Gate the badges on an explicit loading flag (`isPending`/`isLoading` from `useQuery`) so neither badge renders until the subscription status is known, e.g. `!isPending && !isActive && isSignedIn`.

### IN-03: `actions.test.ts` does not cover the Stripe-session-creation-failure or invalid-locale-fallback branches

**File:** `app/[locale]/(marketing)/pricing/actions.test.ts`
**Issue:** The suite covers signed-out redirect, active-subscription short-circuit, and new/existing-customer session creation, but never exercises: (a) `mockSessionsCreate` rejecting/throwing (the `catch { throw new Error("checkoutSessionCreationFailed") }` path), or (b) calling `createCheckoutSession` with a locale not in `routing.locales` to confirm the `safeLocale` fallback. Both are meaningful branches introduced by this phase's `T-03-01` safety requirement.
**Fix:** Add two cases: one where `mockSessionsCreate.mockRejectedValue(...)` and assert the thrown error, and one calling `createCheckoutSession("de")` (unsupported) asserting the redirect/session URLs fall back to `en`.

### IN-04: `SuccessStatus.test.tsx` does not test the "active arrives after timeout" precedence case

**File:** `app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx`
**Issue:** The component's own comment states the precedence contract: "active confirmation wins whenever it arrives (even after timeout)". The test suite covers loading, active, and timeout independently, but never advances the fake timer past the timeout and _then_ flips the mocked query result to `{status: "active"}` to confirm the confirmed view still supersedes the timeout view — the exact precedence rule the code claims to implement.
**Fix:** Add a test that advances timers past `CONFIRMATION_TIMEOUT_MS` with a non-active status, then re-renders/updates the mock to `active` and asserts the confirmed heading (not the timeout heading) is shown.

---

_Reviewed: 2026-07-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
