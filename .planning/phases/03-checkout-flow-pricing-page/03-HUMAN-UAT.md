---
status: partial
phase: 03-checkout-flow-pricing-page
source: [03-04-PLAN.md]
started: 2026-07-09T20:55:00Z
updated: 2026-07-09T20:55:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Real Stripe test-mode payment completes and redirects to success page

expected: Signed-in user visits `/en/pricing`, clicks "Upgrade to Pro", lands on a `checkout.stripe.com` hosted page (SC2), pays with test card `4242 4242 4242 4242`, and is redirected back to `/en/checkout/success`.
result: [pending]

### 2. Success page reflects webhook-confirmed activation, not optimistic state

expected: `/en/checkout/success` shows a loading state ("Confirming your subscription…") immediately after redirect, then transitions to "Subscription active" only once the Phase 2 webhook (`checkout.session.completed`) has written the Convex `subscriptions` row (SC3). It must never show "active" before the webhook lands.
result: [pending]

### 3. Repeat checkout short-circuits and reuses the existing Stripe customer (no duplicates)

expected: Triggering "Upgrade to Pro" again as the same signed-in (now-active) user redirects straight to the success page with no new Stripe Checkout Session (D-08). In the Stripe Dashboard (test mode) → Customers, only ONE Customer object exists for this user's email — no duplicate was created (SC4 / D-06).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
