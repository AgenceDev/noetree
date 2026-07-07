# Technology Stack: Stripe Integration (v1.0 Monetisation)

**Project:** Noetree — Stripe subscription + AI credits system
**Researched:** 2026-07-07
**Scope:** Additions only — existing stack (Next.js 15, Convex 1.19.5, Clerk 6.x, Shadcn) is NOT re-evaluated.

---

## New Libraries to Add

### Core Payment

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `stripe` | `^17.x` (latest ~17.x on npm as of research; ctx7 shows v19.1.0 for stripe-node) | Server-side Stripe API calls: create Checkout sessions, retrieve subscriptions, manage customers | Official Stripe Node SDK. Runs in Convex actions (`"use node"` pragma) and Next.js Route Handlers. Only option — no viable alternative. |
| `@stripe/stripe-js` | `^4.x` (latest ~4.x) | Client-side redirect to Stripe Checkout | Needed only for the `loadStripe()` call that redirects the browser to Stripe Checkout. Tiny — loaded lazily. |

**Confidence:** HIGH — verified via Context7 (`/stripe/stripe-node`) and npm search.

**Version note:** The Context7 docs show stripe-node at v19.1.0 in their snapshot, but npm search found v22.3.0 as latest. Install with `^` and pin at project start. Do NOT install `@stripe/react-stripe-js` — Checkout redirect requires no Stripe Elements UI in this project.

---

### Convex Infrastructure (new files, not new npm packages)

No new npm packages beyond `stripe` are needed on the Convex side. The integration uses existing Convex primitives:

| New File | Type | Purpose |
|----------|------|---------|
| `convex/http.ts` | Convex HTTP Router | Registers the Stripe webhook endpoint as a Convex HTTP action. This file does not exist yet. |
| `convex/subscriptions.ts` | Convex actions + mutations | Stripe API calls (create Checkout session, cancel subscription) and DB writes for subscription state. |
| `convex/credits.ts` | Convex mutations + queries | Deduct/reset/top-up AI credits. |

**Why Convex HTTP action for webhooks, not a Next.js API route:**
The webhook handler must write to Convex DB. A Next.js API route would need to call Convex as an HTTP client (adding latency and auth complexity). A Convex HTTP action runs inside Convex, calls `ctx.runMutation()` directly, and gets atomicity guarantees. The `stack.convex.dev` article on Stripe explicitly uses this pattern. The endpoint URL becomes `https://<convex-deployment>.convex.site/stripe/webhook`.

**Why NOT `@convex-dev/stripe` component:**
The official `@convex-dev/stripe` component (v0.1.3) is new and requires adding `convex/convex.config.ts` (the Convex Components system). This project has no `convex.config.ts` — adding it now introduces a migration surface. More critically, the component's fixed schema (5 auto-created tables) does not map cleanly to the existing `users` + `roles` table structure where subscription state belongs on the user record. There is an open GitHub issue (`get-convex/stripe#7`) showing `customer.subscription.updated` not updating `priceId` — a known reliability gap. Manual implementation with ~150 lines of code gives full control over the schema and avoids this dependency. **Confidence: MEDIUM** (based on component README + GitHub issue + schema mismatch reasoning).

---

## Schema Additions (Convex)

The existing `users` table needs new fields. Do NOT create a separate `subscriptions` table — subscription state is 1:1 with user and needs to be readable in the same query that checks the user, keeping the real-time reactivity simple.

**Add to `users` table in `convex/schema.ts`:**

```typescript
stripeCustomerId: v.optional(v.string()),        // links Clerk user → Stripe Customer
stripeSubscriptionId: v.optional(v.string()),    // active subscription ID
subscriptionStatus: v.optional(v.string()),      // "active" | "canceled" | "past_due" | "trialing"
subscriptionPeriodEnd: v.optional(v.number()),   // Unix timestamp — for renewal display
planTier: v.optional(v.string()),                // "free" | "pro" — derived from subscriptionStatus, stored for fast gating
aiCreditsBalance: v.optional(v.number()),        // current credits remaining
aiCreditsResetAt: v.optional(v.number()),        // Unix timestamp of next monthly reset
```

**Add index on `users` table:**
```typescript
.index("by_stripeCustomerId", ["stripeCustomerId"])
```
This is required because the Stripe webhook arrives with a `customer` ID, not a Clerk user ID. Without this index, finding the user on webhook receipt requires a full table scan.

**Confidence:** HIGH — pattern is validated by Convex docs, `stack.convex.dev` Stripe article, and the get-convex/stripe component schema (which uses equivalent fields in its `customers` + `subscriptions` tables, just separated).

---

## Stripe Configuration (no new libs)

| What | Where | Notes |
|------|-------|-------|
| `STRIPE_SECRET_KEY` | Convex env vars (Dashboard) | Used in Convex actions. Never in Next.js env. |
| `STRIPE_WEBHOOK_SECRET` | Convex env vars (Dashboard) | Needed for `stripe.webhooks.constructEvent()` in the HTTP action. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Next.js `.env.local` + Vercel | Used client-side for `loadStripe()`. Safe to expose. |
| Stripe Product/Price IDs | Convex env vars | `STRIPE_PRO_PRICE_ID`, `STRIPE_CREDITS_PRICE_ID` — configured in Stripe Dashboard, referenced in checkout session creation. |

---

## Next.js Changes (minimal)

One new Next.js Route Handler is needed — but only for **initiating** Checkout, not for receiving webhooks.

| New File | Purpose | Why API route (not Server Action) |
|----------|---------|-----------------------------------|
| `app/api/stripe/create-checkout/route.ts` | Creates a Stripe Checkout Session and returns the URL | Stripe checkout requires returning a URL that Next.js redirects to. Server Actions can redirect but the checkout session creation involves sensitive Stripe API key and needs explicit error handling with HTTP status codes. Route Handler is clearer. |

**No** `app/api/stripe/webhook/route.ts` — webhook goes to Convex HTTP action directly.

**Confidence:** MEDIUM — the Next.js + Stripe community uses both Server Actions and Route Handlers for checkout creation. Route Handler is the safer, more explicit choice here.

---

## What NOT to Add

| Library | Why Not |
|---------|---------|
| `@stripe/react-stripe-js` | Only needed for Stripe Elements (embedding card inputs). This project uses Stripe Checkout (redirect) — no Elements needed. |
| `@convex-dev/stripe` | Component is v0.1.3, requires Convex Components migration, schema conflicts with existing `users` table, known webhook reliability issue. Manual implementation is ~150 lines and gives full control. |
| `micro` / `raw-body` | Legacy Pages Router raw body hack. App Router uses `await request.text()` natively — no extra library needed. |
| `stripe-js` (old package) | Deprecated. Use `@stripe/stripe-js` instead. |
| Any Stripe metering/usage libs | Out of scope — the credits model is a simple integer counter in Convex, not Stripe usage-based billing. |
| Customer Portal (`stripe.billingPortal`) | Explicitly out of scope per PROJECT.md ("UI custom dans l'app"). Do not add portal redirect logic. |

---

## Installation

```bash
# Production dependencies
npm install stripe @stripe/stripe-js

# No dev dependencies needed — stripe types are bundled with the stripe package
```

**Peer dependency note:** The `stripe` package v17+ requires Node.js 18+. Vercel's default runtime satisfies this. Convex actions with `"use node"` also run Node 18+.

---

## Convex Webhook Endpoint Pattern

The Stripe webhook URL registered in the Stripe Dashboard will be:
```
https://<convex-deployment-name>.convex.site/stripe/webhook
```

Not a Vercel/Next.js URL. This is important for Vercel deployment config — no changes to `vercel.json` needed for the webhook.

---

## Sources

- [Stripe Node SDK docs (Context7)](https://github.com/stripe/stripe-node) — HIGH confidence
- [Stripe + Convex (official Convex blog)](https://stack.convex.dev/stripe-with-convex) — HIGH confidence
- [Convex HTTP Actions docs](https://docs.convex.dev/functions/http-actions) — HIGH confidence
- [@convex-dev/stripe component README](https://github.com/get-convex/stripe/blob/master/README.md) — HIGH confidence
- [Convex Stripe component issue: subscription.updated not updating priceId](https://github.com/get-convex/stripe/issues/7) — MEDIUM confidence
- [Next.js 15 App Router webhook raw body pattern](https://kitson-broadhurst.medium.com/next-js-app-router-stripe-webhook-signature-verification-ea9d59f3593f) — MEDIUM confidence
- [Stripe Checkout in Next.js 15 (2025)](https://medium.com/@gragson.john/stripe-checkout-and-webhook-in-a-next-js-15-2025-925d7529855e) — MEDIUM confidence
- [Stripe subscriptions design guide](https://docs.stripe.com/billing/subscriptions/design-an-integration) — HIGH confidence
