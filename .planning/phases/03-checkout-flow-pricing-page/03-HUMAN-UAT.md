---
status: resolved
phase: 03-checkout-flow-pricing-page
source: [03-04-PLAN.md]
started: 2026-07-09T20:55:00Z
updated: 2026-07-10T13:15:00Z
resolution: "Re-verified via Plan 03-07 after fixing two additional root causes beyond the original hypothesis: (1) `stripe listen --forward-to` defaulting to http:// against an HTTPS-only (--experimental-https) dev origin, and (2) the Stripe test-mode account having zero Products/Prices, so STRIPE_PRO_PRICE_ID/STRIPE_TOPUP_PRICE_ID were stale. See 03-07-SUMMARY.md for full detail. Both Test 2 and Test 3 now pass."
---

## Current Test

[testing complete]

## Tests

### 1. Real Stripe test-mode payment completes and redirects to success page

expected: Signed-in user visits `/en/pricing`, clicks "Upgrade to Pro", lands on a `checkout.stripe.com` hosted page (SC2), pays with test card `4242 4242 4242 4242`, and is redirected back to `/en/checkout/success`.
result: pass

### 2. Success page reflects webhook-confirmed activation, not optimistic state

expected: `/en/checkout/success` shows a loading state ("Confirming your subscription…") immediately after redirect, then transitions to "Subscription active" only once the Phase 2 webhook (`checkout.session.completed`) has written the Convex `subscriptions` row (SC3). It must never show "active" before the webhook lands.
result: issue
reported: "yes but it show \"still coming\" after a while then if i refresh its still show the same not \"active\""
severity: major

### 3. Repeat checkout short-circuits and reuses the existing Stripe customer (no duplicates)

expected: Triggering "Upgrade to Pro" again as the same signed-in (now-active) user redirects straight to the success page with no new Stripe Checkout Session (D-08). In the Stripe Dashboard (test mode) → Customers, only ONE Customer object exists for this user's email — no duplicate was created (SC4 / D-06).
result: issue
reported: "its redirecting to stripe checkout, when i click on the button i see an issue but i cant log it, there is a red text under it, the \"upgrade to pro\" button"
severity: major

## Summary

total: 3
passed: 1
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

```yaml
- truth: '`/en/checkout/success` transitions from loading state to "Subscription active" once the Phase 2 webhook (`checkout.session.completed`) has written the Convex `subscriptions` row.'
  status: failed
  reason: 'User reported: yes but it show "still coming" after a while then if i refresh its still show the same not "active"'
  severity: major
  test: 2
  root_cause: "The Convex `subscriptions` row was never written because the checkout.session.completed webhook never reached (or was rejected by) the local dev server. Environmental/procedural, not a code defect: APP_URL=https://localhost:3000 is unreachable by Stripe's servers directly, so delivery requires `stripe listen --forward-to localhost:3000/api/webhooks/stripe` running with a webhook secret matching .env.local's STRIPE_WEBHOOK_SECRET (documented in 03-04-PLAN.md). If the forwarder wasn't running, or its secret was stale/mismatched, app/api/webhooks/stripe/route.ts silently 400s ('Invalid signature') before ever calling Convex, so no subscriptions row is ever created — explaining why even a hard refresh doesn't fix it. Both the webhook write path and the success page's read path were traced end-to-end with no code defect found."
  artifacts:
    - path: "app/api/webhooks/stripe/route.ts"
      issue: "Silently returns 400 on signature verification failure with no write attempted and no developer-visible logging — a real webhook misconfiguration is indistinguishable from 'nothing happened yet'"
    - path: ".env.local"
      issue: "APP_URL points at a non-publicly-reachable localhost origin; STRIPE_WEBHOOK_SECRET must be kept in sync with whichever stripe listen session is forwarding events, with no automated check that they match"
  missing:
    - "Re-run UAT Test 2 with stripe listen --forward-to localhost:3000/api/webhooks/stripe running in a dedicated terminal for the full test, confirming its printed whsec_... matches .env.local's STRIPE_WEBHOOK_SECRET (restart npm run dev after any change)"
    - "Confirm via Stripe CLI/Dashboard (test mode -> Developers -> Webhooks/Events) that checkout.session.completed shows a successful (200) delivery"
    - "DX improvement (not required to close this gap, but recommended): log webhook 400/500 responses in route.ts so signature/delivery failures are visible to the developer during local dev instead of failing silently"
  debug_session: ".planning/debug/success-page-stuck-loading.md"

- truth: 'Triggering "Upgrade to Pro" again as the same signed-in (now-active) user redirects straight to the success page with no new Stripe Checkout Session; only one Stripe Customer object exists for this user''s email.'
  status: failed
  reason: 'User reported: its redirecting to stripe checkout, when i click on the button i see an issue but i cant log it, there is a red text under it, the "upgrade to pro" button'
  severity: major
  test: 3
  root_cause: 'Two compounding issues in app/[locale]/(marketing)/pricing/actions.ts. PRIMARY (shared with the Test 2 gap above): the short-circuit check `if (existing?.status === "active")` is correctly written, but `existing` (from convex.query(api.subscriptions.getSubscription)) never resolves to an active row for this user for the same reason Test 2 failed — so the short-circuit never triggers and a brand-new Stripe Checkout Session is created every time. SECONDARY (source of the visible red error text): the convex.query() call feeding that check sits OUTSIDE the function''s only try/catch (which narrowly wraps just stripe.checkout.sessions.create()). That query is fed by a brand-new auth handshake introduced in commit e5793d5 (getToken({template:"convex"}) + ConvexHttpClient.setAuth()) that unit tests mock away entirely and had never round-tripped against real Clerk/Convex before this UAT session — if it (or the query itself, e.g. via a .unique() violation on a duplicate subscriptions row) throws, the exception propagates uncaught to page.tsx''s bare `catch { setError(true) }`, which discards the real error and renders only the static, generic checkoutError string.'
  artifacts:
    - path: "app/[locale]/(marketing)/pricing/actions.ts"
      issue: "convex.query(api.subscriptions.getSubscription, {}) call (line ~32) sits outside the try/catch that only wraps stripe.checkout.sessions.create() (lines ~42-65) — any exception from the query or its auth handshake propagates uncaught"
    - path: "app/[locale]/(marketing)/pricing/page.tsx"
      issue: 'handleUpgrade()''s bare catch { setError(true) } discards the actual thrown error with no logging, so the UI can only ever show a static generic i18n string (t("checkoutError")) regardless of the real cause'
    - path: "convex/subscriptions.ts"
      issue: "getSubscription's .unique() call would throw if a duplicate subscriptions row for the same clerkUserId ever existed (by_clerkUserId is a plain, non-unique index in convex/schema.ts) — a lower-confidence secondary hypothesis for the uncaught exception"
  missing:
    - "Fix shared with Test 2 gap: resolving the webhook delivery issue there (or re-verifying with stripe listen running) should make getSubscription return an active row, which may resolve this short-circuit failure as a direct consequence"
    - "Widen actions.ts's try/catch to also cover the convex.query() call (or add a dedicated catch/log around it) so query/auth-handshake failures are distinguishable from Stripe API failures"
    - "Add console.error logging in page.tsx's catch block so future occurrences produce readable diagnostics instead of an opaque generic red string"
  debug_session: ".planning/debug/repeat-checkout-not-short-circuiting.md"
```
