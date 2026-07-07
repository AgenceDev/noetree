# Architecture: Stripe Integration with Next.js 15 App Router + Convex

**Domain:** Stripe billing integration on existing Next.js 15 App Router + Convex + Clerk stack
**Researched:** 2026-07-07
**Overall confidence:** HIGH (verified against official docs, Convex docs, stripe-node, and Clerk docs)

---

## 1. Integration Overview

Noetree already has:
- **Clerk** — authentication, `userId` = `identity.tokenIdentifier` stored in `convex/users`
- **Convex** — real-time DB, all mutations/queries, HTTP actions available
- **Next.js 15 App Router** — no `app/api/` routes exist yet (greenfield)
- **Vercel** — deployment target, Node.js runtime required for Stripe

Stripe integration adds three new subsystems:
1. **Checkout flow** — Next.js Server Action or API route creates a Stripe Checkout Session
2. **Webhook handler** — Next.js API route at `app/api/webhooks/stripe/route.ts` receives Stripe events and calls Convex internal mutations
3. **Enforcement layer** — Convex mutations gate note creation and AI credit consumption

Architecture decision: **Stripe webhooks go to Next.js API routes, not Convex HTTP actions.**

Rationale: The project constraint in PROJECT.md states explicitly "les webhooks Stripe doivent être des routes API Next.js." Additionally, Convex HTTP actions cannot use Node.js APIs directly — the `stripe` npm package requires Node.js crypto for `stripe.webhooks.constructEvent()`, which means an HTTP action would need to shell out to a Convex action, adding latency and complexity. The Next.js route is simpler and directly supported. Confidence: HIGH.

---

## 2. Clerk userId → Stripe customerId Link

### The Problem

Stripe webhooks arrive without a Clerk session. The webhook handler receives a Stripe event but has no access to Clerk auth. This means the `clerkUserId` must be embedded in Stripe metadata at checkout creation time, so the webhook can recover it later.

### The Pattern (HIGH confidence)

**Step 1 — Checkout Session creation (Server Action or API route):**

```typescript
// Read clerkUserId from Clerk auth()
const { userId } = await auth()

// Embed clerkUserId in Stripe metadata so webhooks can recover it
const session = await stripe.checkout.sessions.create({
  metadata: { clerkUserId: userId },
  subscription_data: {
    metadata: { clerkUserId: userId }  // IMPORTANT: also on subscription object
  },
  // ... mode, price, etc.
})
```

The `metadata` on the session AND on `subscription_data` is required. `checkout.session.completed` only carries `session.metadata`, but `customer.subscription.updated` carries `subscription.metadata`. If you only set it on the session, renewal webhooks lose the user link.

**Step 2 — Webhook recovers clerkUserId:**

```typescript
const clerkUserId = event.data.object.metadata?.clerkUserId
// or for subscription events:
const clerkUserId = event.data.object.metadata?.clerkUserId
```

**Step 3 — Convex stores the mapping:**

In the Convex `subscriptions` table (see §4), both `clerkUserId` and `stripeCustomerId` are stored. After the first `checkout.session.completed`, subsequent events can also be looked up by `stripeCustomerId` → `clerkUserId` if metadata is missing.

### Alternative: Clerk Private Metadata

An alternative is to store `stripeCustomerId` in Clerk's `privateMetadata` via `clerkClient.users.updateUserMetadata()`. This is simpler but couples billing state to Clerk, making it harder to query from Convex. **Do not use this pattern** — Convex is the source of truth per PROJECT.md constraints.

---

## 3. Webhook Handler Architecture

### File Location

```
app/
└── api/
    ├── webhooks/
    │   └── stripe/
    │       └── route.ts          ← Stripe webhook receiver
    └── checkout/
        └── route.ts              ← Checkout Session creator
```

### Critical: Raw Body + Node.js Runtime

The `stripe.webhooks.constructEvent()` function hashes the raw request bytes. If the body is parsed (via `.json()`) before signature verification, the hash changes and verification fails. The body must be read as raw text FIRST.

Next.js App Router also runs routes in the Edge runtime by default in some configurations. Stripe SDK requires Node.js crypto. Always force Node.js runtime.

```typescript
// app/api/webhooks/stripe/route.ts
export const runtime = "nodejs"  // REQUIRED — Stripe SDK needs Node.js crypto

import { headers } from "next/headers"
import Stripe from "stripe"
import { ConvexHttpClient } from "convex/browser"
import { api, internal } from "@/convex/_generated/api"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export async function POST(request: Request) {
  const body = await request.text()             // RAW body — must come first
  const sig = (await headers()).get("stripe-signature")!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object)
      break
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object)
      break
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object)
      break
    case "invoice.paid":
      await handleInvoicePaid(event.data.object)
      break
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
}
```

### Clerk Middleware Must Exclude Webhook Route

The existing `middleware.ts` uses `clerkMiddleware` with a `createRouteMatcher`. Webhook routes have no Clerk session and will get 401 unless excluded.

```typescript
// middleware.ts — MODIFY existing file
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"])
const isWebhookRoute = createRouteMatcher(["/api/webhooks(.*)"])

export default clerkMiddleware(async (auth, req) => {
  if (isWebhookRoute(req)) return  // Skip auth for webhooks
  if (isProtectedRoute(req)) await auth.protect()
})
```

### Webhook → Convex Communication

The webhook handler calls Convex via `ConvexHttpClient` (server-to-server, no browser session). This client does not need Clerk auth — it uses the Convex deployment URL and can call internal mutations (which are not exposed to clients).

```typescript
// convex/subscriptions.ts — internal mutation (not callable from client)
export const upsertSubscription = internalMutation({
  args: {
    clerkUserId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.string(),
    currentPeriodEnd: v.number(),
    planType: v.union(v.literal("free"), v.literal("pro")),
  },
  handler: async (ctx, args) => {
    // ...
  }
})
```

The webhook handler calls:
```typescript
await convex.mutation(internal.subscriptions.upsertSubscription, { ... })
```

---

## 4. New Convex Schema Tables

### Existing Tables (DO NOT MODIFY)
- `users` — has `tokenIdentifier` (Clerk's subject), `role`, etc.
- `roles` — existing role system
- `notes` — `owner: v.id("users")`

### New Tables to Add to `convex/schema.ts`

#### `subscriptions` table

Stores the active subscription state for each user. This is the source of truth for plan gating.

```typescript
subscriptions: defineTable({
  // Link to existing users table
  userId: v.id("users"),                     // FK → users._id
  clerkUserId: v.string(),                   // Clerk's tokenIdentifier, for webhook lookup

  // Stripe identifiers
  stripeCustomerId: v.string(),
  stripeSubscriptionId: v.optional(v.string()),

  // Subscription state
  planType: v.union(v.literal("free"), v.literal("pro")),
  status: v.string(),                        // "active" | "canceled" | "past_due" | "trialing"
  currentPeriodStart: v.optional(v.number()), // Unix timestamp
  currentPeriodEnd: v.optional(v.number()),   // Unix timestamp — used for display + expiry check

  // Timestamps
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])         // Webhook lookup by Clerk ID
  .index("by_stripeCustomerId", ["stripeCustomerId"]) // Webhook lookup by Stripe customer
  .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),
```

**Indexes rationale:**
- `by_userId` — queried by Convex functions that receive a Convex `users._id`
- `by_clerkUserId` — queried by webhook handler which only has the Clerk string ID
- `by_stripeCustomerId` — fallback lookup if metadata is missing
- `by_stripeSubscriptionId` — for `customer.subscription.updated/deleted` event handling

#### `aiCredits` table

Tracks the AI credit balance and billing-period bookkeeping for Pro users.

```typescript
aiCredits: defineTable({
  userId: v.id("users"),                     // FK → users._id
  clerkUserId: v.string(),                   // Redundant but useful for webhook path

  // Balance
  balance: v.number(),                       // Current spendable credits
  monthlyQuota: v.number(),                  // Credits granted per billing period (e.g. 100)

  // Billing period tracking (for reset logic)
  billingPeriodStart: v.number(),            // Unix timestamp of period start
  billingPeriodEnd: v.number(),              // Unix timestamp of period end — reset when exceeded

  // Timestamps
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"]),
```

#### `creditTransactions` table

Append-only ledger for credit top-ups and consumptions. Required for SET-05 (top-up history). Also provides audit trail for debugging.

```typescript
creditTransactions: defineTable({
  userId: v.id("users"),
  type: v.union(
    v.literal("monthly_grant"),    // Auto-reset on billing renewal
    v.literal("topup_purchase"),   // One-time Stripe payment
    v.literal("ai_consumption"),   // AI feature usage
  ),
  amount: v.number(),              // Positive = credit added, negative = debit
  stripePaymentIntentId: v.optional(v.string()), // For topup_purchase rows
  description: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_type", ["userId", "type"]),
```

### Schema Modification Summary

| Table | Status | Changes |
|-------|--------|---------|
| `users` | EXISTING — no change | No modifications needed |
| `roles` | EXISTING — no change | No modifications needed |
| `notes` | EXISTING — no change | Enforcement is in mutation, not schema |
| `subscriptions` | NEW | Full table |
| `aiCredits` | NEW | Full table |
| `creditTransactions` | NEW | Full table |

---

## 5. Data Flow Diagrams

### 5a. Subscription Checkout Flow

```
[User clicks "Upgrade to Pro"]
       ↓
[Next.js Server Action: /api/checkout/route.ts]
  - auth() → get clerkUserId
  - stripe.checkout.sessions.create({
      metadata: { clerkUserId },
      subscription_data: { metadata: { clerkUserId } },
      mode: "subscription",
      price: STRIPE_PRO_PRICE_ID,
      success_url: "/dashboard?upgrade=success",
      cancel_url: "/pricing",
    })
  - return { url: session.url }
       ↓
[Browser redirected to Stripe Checkout]
       ↓
[User pays → Stripe fires checkout.session.completed]
       ↓
[POST app/api/webhooks/stripe/route.ts]
  - request.text() → raw body
  - stripe.webhooks.constructEvent(body, sig, secret)
  - event.type = "checkout.session.completed"
  - clerkUserId = event.data.object.metadata.clerkUserId
  - stripeCustomerId = event.data.object.customer
  - stripeSubscriptionId = event.data.object.subscription
       ↓
[convex.mutation(internal.subscriptions.upsertSubscription)]
  - Find users row by clerkUserId (by_clerkUserId index)
  - Upsert subscriptions row: planType="pro", status="active"
  - Upsert aiCredits row: balance=100, monthlyQuota=100
  - Insert creditTransactions: type="monthly_grant", amount=100
       ↓
[Convex real-time → all subscribed clients update instantly]
[User sees "Pro" badge without page reload]
```

### 5b. Subscription Renewal (Monthly Credit Reset)

```
[Stripe billing date → invoice.paid webhook]
       ↓
[POST app/api/webhooks/stripe/route.ts]
  - event.type = "invoice.paid"
  - subscriptionId = event.data.object.subscription
       ↓
[internal.subscriptions.handleInvoicePaid]
  - Lookup subscriptions row by stripeSubscriptionId
  - Update currentPeriodStart / currentPeriodEnd
  - Reset aiCredits.balance = monthlyQuota (e.g. 100)
  - Update aiCredits.billingPeriodStart / billingPeriodEnd
  - Insert creditTransactions: type="monthly_grant", amount=100
```

### 5c. AI Credits Consumption (CRED-04)

```
[User triggers AI feature in app]
       ↓
[Convex mutation: aiCredits.consumeCredits]
  args: { userId, amount: 10, description: "AI summary" }
       ↓
  1. ctx.db.query("aiCredits").withIndex("by_userId") → get current balance
  2. if (balance < amount) throw new ConvexError("Insufficient credits")
  3. ctx.db.patch(creditRow._id, { balance: balance - amount, updatedAt: now })
  4. ctx.db.insert("creditTransactions", { type: "ai_consumption", amount: -amount })
  ↓ [Convex atomic transaction — steps 3+4 succeed together or not at all]
       ↓
[Client useQuery("aiCredits.getBalance") → live update]
```

**Enforcement is server-side only.** The mutation throws before any AI work is triggered. The client UI can show a low-balance warning (CRED-02) but the hard block is in the mutation.

### 5d. AI Credits Top-Up (PAY-05, CRED-03)

```
[User clicks "Buy 100 more credits"]
       ↓
[Server Action creates Stripe Checkout Session]
  - mode: "payment" (one-time, not subscription)
  - line_items: [{ price: STRIPE_TOPUP_PRICE_ID, quantity: 1 }]
  - metadata: { clerkUserId, topupCredits: "100" }
       ↓
[checkout.session.completed webhook]
  - event.data.object.metadata.topupCredits = "100"
  - clerkUserId from metadata
       ↓
[internal.aiCredits.addTopupCredits]
  - Lookup aiCredits by clerkUserId
  - balance += parseInt(topupCredits)
  - Insert creditTransaction: type="topup_purchase", amount=100, stripePaymentIntentId
```

### 5e. Note Creation Enforcement (PLAN-02)

```
[User creates a note]
       ↓
[Convex mutation: notes.createNote — MODIFY existing]
  1. Lookup subscriptions row by userId
  2. if planType !== "pro":
       noteCount = count notes WHERE owner = userId
       if (noteCount >= 20) throw new ConvexError("Note limit reached")
  3. ctx.db.insert("notes", { ... })
```

The note-limit enforcement lives in the existing `createNote` mutation — no schema change, just a guard added to the handler.

---

## 6. Stripe Webhook Events to Handle

| Event | When | Action in Convex |
|-------|------|-----------------|
| `checkout.session.completed` | User completes payment | Upsert subscription, grant initial credits |
| `customer.subscription.updated` | Plan changes, renewal info updates | Update subscription status, period dates |
| `customer.subscription.deleted` | Cancellation takes effect | Set planType="free", status="canceled" |
| `invoice.paid` | Monthly renewal succeeds | Reset credit balance to monthlyQuota |
| `invoice.payment_failed` | Renewal payment fails | Set status="past_due" (access can be revoked at threshold) |

Events NOT needed for v1.0 (out of scope per REQUIREMENTS.md):
- `invoice.payment_action_required` (Stripe handles retry notifications by email)
- `customer.updated` (no customer portal)

---

## 7. Environment Variables Required

```bash
# .env.local additions
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...           # Monthly subscription price
STRIPE_TOPUP_PRICE_ID=price_...         # One-time credits top-up price
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_... # For client-side Stripe.js if needed
```

---

## 8. Build Order: Auth → Subscription → Credits Dependency Chain

The dependency chain is strict. Each phase unlocks the next.

### Phase 1: Schema + Stub Infrastructure (no UI)
**Goal:** Lay the Convex schema and env wiring before any feature work.

- Add `subscriptions`, `aiCredits`, `creditTransactions` tables to `convex/schema.ts`
- Add Stripe env vars to `.env.local` and Vercel project
- Add `stripe` npm package
- Add stub `convex/subscriptions.ts` with `internalMutation` stubs
- Add stub `convex/aiCredits.ts`

**Why first:** Convex schema changes require a `convex dev` redeploy. If feature code references tables that don't exist yet, the deployment breaks. Schema must be first.

### Phase 2: Webhook Handler
**Goal:** Stripe events land in Convex correctly before any UI depends on subscription state.

- Create `app/api/webhooks/stripe/route.ts` with signature verification
- Modify `middleware.ts` to exclude `/api/webhooks/**` from Clerk protection
- Implement internal mutations for each webhook event type
- Test locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

**Why second:** The webhook handler writes the subscription state that all UI reads. UI without webhook = always shows "free" regardless of payment.

**Dependency:** Phase 1 schema must exist. Clerk middleware config must not break.

### Phase 3: Checkout Session + Pricing UI
**Goal:** User can pay and become Pro.

- Create `app/api/checkout/route.ts` (POST, creates Stripe Checkout Session)
- Build `/pricing` page (PLAN-01) reading from Convex subscription state
- Wire "Upgrade" CTA to the checkout route
- Handle `?upgrade=success` on return from Stripe (PAY-02 in-app confirmation)

**Why third:** Checkout creates the Stripe customer/subscription that webhooks then process. Testing order: start `stripe listen`, click upgrade, verify webhook fires, verify Convex subscription row created.

**Dependency:** Phase 2 webhook must be working so checkout completion actually updates state.

### Phase 4: Plan Enforcement
**Goal:** Free tier is actually limited.

- Modify `convex/notes.ts` `createNote` mutation — add 20-note guard
- Add upgrade prompt UI when limit is hit (PLAN-04)
- Read `subscriptions` in dashboard to show plan badge

**Why fourth:** Enforcement requires subscription state (Phase 2+3) to be readable. A user must exist in `subscriptions` table (even as free) to gate correctly.

**Note:** Free users who existed before this milestone won't have a `subscriptions` row. The guard must handle `null` subscription → treat as free.

### Phase 5: AI Credits UI + Consumption
**Goal:** Credits balance is visible and deducted on use.

- Implement `consumeCredits` mutation in `convex/aiCredits.ts`
- Expose `getBalance` query
- Add credits display to Settings page (CRED-02, SET-05)
- Wire `consumeCredits` to actual AI feature calls (CRED-04)
- Build top-up checkout flow (PAY-05, CRED-03)

**Dependency:** Phase 3+4 must be complete — credits only exist for Pro users who went through checkout.

### Phase 6: Settings Page
**Goal:** User can self-serve subscription management.

- Build `/dashboard/settings` or similar (SET-01 through SET-05)
- Cancel subscription via Stripe API call (PAY-04, SET-04)
- Show renewal date from `subscriptions.currentPeriodEnd` (SET-02)
- Show credits balance + transaction history from `aiCredits` + `creditTransactions` (SET-05)

**Dependency:** All previous phases. This is read-only aggregation of already-correct data.

---

## 9. Component Boundaries (New vs Modified Code)

### NEW files

| File | Type | Purpose |
|------|------|---------|
| `app/api/webhooks/stripe/route.ts` | Next.js Route Handler | Stripe webhook receiver |
| `app/api/checkout/route.ts` | Next.js Route Handler | Create Checkout Session |
| `convex/subscriptions.ts` | Convex module | Subscription queries + internal mutations |
| `convex/aiCredits.ts` | Convex module | Credits balance queries + mutations |

### MODIFIED files

| File | What Changes | Why |
|------|-------------|-----|
| `convex/schema.ts` | Add 3 new tables | subscriptions, aiCredits, creditTransactions |
| `convex/notes.ts` | Add plan guard to `createNote` | PLAN-02 enforcement |
| `middleware.ts` | Exclude `/api/webhooks/**` from Clerk | Webhooks have no Clerk session |
| `package.json` | Add `stripe` dependency | Stripe Node.js SDK |

---

## 10. Pitfalls Specific to This Stack

### subscription_data.metadata vs session.metadata
Set `clerkUserId` in BOTH `metadata` (on session) and `subscription_data.metadata` (on subscription). The session metadata is only on `checkout.session.completed`. The subscription metadata persists on all subsequent `customer.subscription.*` events. Missing this means renewals lose the user link. Confidence: HIGH (verified via Stripe docs + Clerk blog).

### Convex `internalMutation` vs `mutation` for webhooks
Use `internalMutation` (not `mutation`) for anything called from the webhook handler. Regular mutations are callable from clients; internal mutations are only callable from other Convex functions and server-side. This prevents clients from fabricating subscription upgrades. Confidence: HIGH.

### `ConvexHttpClient` authentication in webhook handler
The webhook route uses `ConvexHttpClient` (not the React client). This client cannot use Clerk auth tokens. Call only `internal.*` functions from it — those do not require auth. If you try to call a regular mutation that requires `ctx.auth`, it will fail. Confidence: HIGH (Convex docs).

### Existing `users` without a `subscriptions` row
All users created before this milestone have no `subscriptions` row. Any query for `subscriptions.by_userId` returns `null`. The enforcement code (`createNote`) must treat `null` as free tier, not as an error. Create a "ensure subscription row exists" function that runs at first login post-migration. Confidence: HIGH.

### Stripe test vs production webhook secrets
`STRIPE_WEBHOOK_SECRET` is different for `stripe listen` (local dev) vs Stripe Dashboard (production). Use separate env vars per environment. The Vercel preview/staging deployment needs its own registered endpoint and secret. Confidence: HIGH.

---

## Sources

- Stripe Node.js SDK — `stripe.webhooks.constructEvent`: https://github.com/stripe/stripe-node
- Stripe Subscription Webhooks official docs: https://docs.stripe.com/billing/subscriptions/webhooks
- Convex HTTP Actions: https://docs.convex.dev/functions/http-actions
- Convex OCC and Atomicity (credits deduction): https://docs.convex.dev/database/advanced/occ
- Clerk + Stripe metadata pattern: https://clerk.com/blog/exploring-clerk-metadata-stripe-webhooks
- Next.js App Router webhook raw body: https://kitson-broadhurst.medium.com/next-js-app-router-stripe-webhook-signature-verification-ea9d59f3593f
- Stripe + Convex integration guide: https://stack.convex.dev/stripe-with-convex
- Convex Stripe component: https://github.com/get-convex/stripe
