# Domain Pitfalls: Stripe + Convex + Clerk Integration

**Domain:** Stripe subscriptions + AI credits on Next.js 15 / Convex / Clerk
**Researched:** 2026-07-07
**Confidence:** HIGH — based on official Stripe docs, Convex OCC docs, and multiple production post-mortems

---

## Critical Pitfalls

Mistakes that cause silent billing failures, security holes, or rewrites.

---

### Pitfall 1: Raw Body Destroyed Before Signature Verification

**What goes wrong:**
`stripe.webhooks.constructEvent()` requires the exact raw bytes Stripe sent. Any framework that parses the body first (JSON.parse, body-parser middleware, `req.json()`) mutates the string, causing every signature check to throw `WebhookSignatureVerificationError` — silently in production because the payment succeeds on Stripe's side but your app never processes the webhook.

**Why it happens:**
Next.js App Router's `request.json()` parses and re-serializes the body. The Pages Router used to require `export const config = { api: { bodyParser: false } }` — that config is now ignored in App Router and causes false confidence.

**Consequences:**
All subscription activations, cancellations, and credit top-ups are silently dropped. Users pay but never get access. Discovered hours or days later after customer complaints.

**Prevention:**
In the webhook route handler (`app/api/webhooks/stripe/route.ts`), always use:

```ts
const body = await request.text(); // NOT request.json()
const sig = request.headers.get("stripe-signature")!;
const event = stripe.webhooks.constructEvent(
  body,
  sig,
  process.env.STRIPE_WEBHOOK_SECRET!
);
```

Never pass the body through any JSON middleware before this line.

**Detection:**
`WebhookSignatureVerificationError` in logs. Test locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and verify events reach your handler before deploying.

**Phase:** Webhook infrastructure setup (before any subscription logic).

---

### Pitfall 2: Test Webhook Secret Used in Production (or Vice Versa)

**What goes wrong:**
Stripe issues separate signing secrets for each registered endpoint (and a separate CLI secret for local dev). Copying the test-mode secret into Vercel's production environment variables causes every production webhook to fail signature verification — silently.

**Why it happens:**
Developers copy the CLI listener secret (`whsec_...` from `stripe listen`) into `.env.local` and then accidentally use it for the Vercel production environment, not realizing that each Dashboard endpoint has its own unique secret.

**Consequences:**
Production webhooks all return 400, Stripe retries for 72 hours and gives up, subscription state never syncs.

**Prevention:**

- `.env.local`: CLI listener secret (for `stripe listen` only, never deployed)
- Vercel staging env: test-mode endpoint secret from Stripe Dashboard test environment
- Vercel production env: live-mode endpoint secret from Stripe Dashboard live environment

Store all three separately. Never reuse. Stripe Dashboard → Developers → Webhooks → select endpoint → "Reveal signing secret".

**Detection:**
All webhooks log 400 or "No signatures found matching the expected signature for payload". Check Stripe Dashboard webhook logs under "Attempts".

**Phase:** Webhook infrastructure setup; must be rechecked at production deploy.

---

### Pitfall 3: Two-Writer Race Condition on Checkout Return

**What goes wrong:**
Developer adds "eager sync" logic: when the user returns from Stripe Checkout (success URL), the frontend or a server action immediately upgrades the user before the webhook arrives — to avoid a delay. Now two code paths write subscription state simultaneously. Both check "is this already processed?" before either commits, both see "not processed", and both apply the upgrade. User gets double credits, double quota, or corrupted subscription state.

**Why it happens:**
Webhooks sometimes arrive 1-5 seconds after checkout completes. Developers add eager sync to avoid showing users a "pending" state. This creates a distributed write conflict.

**Consequences:**
Double credit grants for top-ups (critical financial bug). Corrupted `subscriptionStatus` field. Difficult to reproduce in dev because dev latency is lower.

**Prevention:**
Make the success URL handler **read-only**. It should only poll Convex until the webhook has updated the state — never write subscription state itself. Only the webhook handler is the single writer.

Polling pattern:

```ts
// success page: poll up to 5 times, 1s apart
for (let i = 0; i < 5; i++) {
  const user = await fetchQuery(api.users.getSubscription, { userId });
  if (user.subscriptionStatus === "active") break;
  await new Promise(r => setTimeout(r, 1000));
}
```

**Detection:**
Users reporting double credit grants. Credits table showing two `top_up` events for one Stripe payment. Monitor `processedStripeEventIds` for missing deduplication.

**Phase:** Checkout flow implementation; post-checkout success page implementation.

---

### Pitfall 4: Missing Idempotency Guard on Webhook Handler

**What goes wrong:**
Stripe retries webhooks for 72 hours on any non-200 response. If your Convex mutation throws (e.g., temporary DB issue), Stripe retries, and without an idempotency check the mutation runs twice: user gets credited twice for one payment, or subscription is activated twice.

**Why it happens:**
Developers forget that Stripe's "at-least-once delivery" is a guarantee, not an edge case. Works fine in dev because dev errors are rare.

**Consequences:**
Double credit grants on payment retries or network blips. Duplicate `subscription_activated` records in Convex.

**Prevention:**
Store the Stripe event ID in Convex before processing. Check it on every webhook call:

```ts
// In Convex mutation
const existing = await ctx.db
  .query("processedStripeEvents")
  .withIndex("by_stripe_event_id", q => q.eq("stripeEventId", event.id))
  .first();
if (existing) return; // idempotent exit

// ... process event ...

await ctx.db.insert("processedStripeEvents", {
  stripeEventId: event.id,
  processedAt: Date.now()
});
```

Keep this table for at least 72 hours (Stripe's retry window).

**Detection:**
Duplicate entries in credits or subscription history tables. Add a unique index on `stripeEventId` as a safety net — Convex will throw on duplicate insert rather than silently double-credit.

**Phase:** Webhook handler implementation (same phase as initial webhook setup).

---

### Pitfall 5: Vercel Deployment Protection Blocks Stripe Webhooks

**What goes wrong:**
Vercel's "Deployment Protection" (password protection or Vercel authentication) is enabled by default on preview deployments and sometimes on production. Stripe webhook POST requests have no authentication header, so Vercel returns 401/403. Stripe logs show successful delivery attempts but your app never sees them.

**Why it happens:**
Developers test webhooks locally (no protection), then deploy to Vercel staging where protection is on. Everything looks fine in test (Stripe CLI bypasses this), breaks in staging/production silently.

**Consequences:**
All webhooks to staging are blocked. Easy to miss because Stripe shows "delivered" (it got a 401, which counts as a delivery attempt) while the app never processed anything.

**Prevention:**
Either disable Deployment Protection for the `/api/webhooks/stripe` path specifically, or use Vercel's "Protection Bypass for Automation" (`VERCEL_AUTOMATION_BYPASS_SECRET`). Add the bypass secret as a query param in the Stripe webhook URL: `https://your-app.vercel.app/api/webhooks/stripe?x-vercel-protection-bypass=YOUR_SECRET`.

For production: verify Deployment Protection is not blocking the webhook path — check Vercel project settings → Deployment Protection.

**Detection:**
Stripe Dashboard webhook logs show HTTP 401 or 403 response codes. Your Convex DB shows no subscription updates after test payments.

**Phase:** Deployment/infrastructure phase; must be verified on every environment (staging and production).

---

### Pitfall 6: Credits Deduction Not Atomic (TOCTOU Vulnerability)

**What goes wrong:**
AI credit deduction uses a check-then-act pattern across two separate operations: (1) read current balance, (2) if balance >= cost, deduct. With concurrent requests (user fires two AI requests simultaneously), both reads happen before either write commits, both see sufficient balance, and both deduct — allowing the user to spend more credits than they have.

**Why it happens:**
Natural to write: `if (user.credits >= cost) { updateCredits(user.credits - cost) }`. This is a classic TOCTOU (Time of Check to Time of Use) flaw.

**Consequences:**
Users can over-spend credits. Negative credit balances in production. Financial exposure if credits are tied to paid usage.

**Prevention:**
Convex mutations are serializable with OCC (Optimistic Concurrency Control). A single mutation that reads and writes the same document will automatically retry on conflict — meaning the check-then-deduct pattern IS safe inside a single Convex mutation. The key rule: the read AND write must happen inside the same mutation.

```ts
// Safe: single mutation, OCC handles concurrent conflicts
export const deductCredits = mutation({
  args: { userId: v.string(), cost: v.number() },
  handler: async (ctx, { userId, cost }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", q => q.eq("clerkId", userId))
      .unique();
    if (!user || user.aiCredits < cost) {
      throw new Error("Insufficient credits");
    }
    await ctx.db.patch(user._id, { aiCredits: user.aiCredits - cost });
  }
});
```

Never split the check into a separate query and the deduction into a separate mutation.

**Detection:**
Negative credit balances in the `users` table. Two concurrent AI requests completing when only one credit remained.

**Phase:** Credits deduction implementation.

---

### Pitfall 7: Subscription State Enforced Only Client-Side

**What goes wrong:**
Free tier note limit (20 notes) is enforced only in the UI — a disabled button or a client-side check. Users who understand the API (or use browser devtools) can call Convex mutations directly, bypassing the UI entirely and creating unlimited notes.

**Why it happens:**
Enforcement in the UI is easy and visible. Backend enforcement requires an extra query in every mutation.

**Consequences:**
Free tier limits are trivially bypassed. Revenue model is broken — users never need to upgrade.

**Prevention:**
Enforce limits in Convex mutations, not in the UI. The UI enforcement is for UX only (to show upgrade prompts). The backend is the authority.

```ts
// In Convex createNote mutation
const noteCount = await ctx.db
  .query("notes")
  .withIndex("by_owner", q => q.eq("ownerId", userId))
  .collect();
if (user.plan === "free" && noteCount.length >= 20) {
  throw new ConvexError("Free tier limit reached. Upgrade to Pro.");
}
```

**Detection:**
Check if creating notes via direct API call (Convex dashboard or custom client) bypasses limits.

**Phase:** Free tier enforcement implementation.

---

### Pitfall 8: Orphaned Stripe Customer on User Re-registration

**What goes wrong:**
Clerk user ID is the link between your Convex user record and the Stripe customer. If a user deletes their account and re-registers with the same email, a new Clerk user ID is created. If a Stripe customer was already created for the old Clerk ID, you now have an orphaned Stripe customer and a new user with no customer ID. If you create a new customer automatically, you may also end up with duplicate Stripe customers for the same email.

**Why it happens:**
Customer creation typically happens lazily (on first checkout). No guard checks for existing Stripe customers by email before creating a new one.

**Consequences:**
Duplicate Stripe customers. If the old customer had a payment method, it's lost. Subscription history attached to the orphaned customer, not the new one.

**Prevention:**
Before creating a new Stripe customer, search by email:

```ts
const existing = await stripe.customers.list({ email: user.email, limit: 1 });
const customer =
  existing.data[0] ?? (await stripe.customers.create({ email: user.email }));
```

Store the Stripe customer ID in Convex (not only in Clerk metadata) so it persists through account changes. Store `clerkId` and `stripeCustomerId` in the Convex `users` table as the source of truth.

**Detection:**
Multiple Stripe customers with the same email in the Stripe Dashboard.

**Phase:** Stripe customer creation / Clerk webhook sync.

---

### Pitfall 9: Webhook Event Out-of-Order Processing

**What goes wrong:**
Stripe does not guarantee webhook delivery order. For a new subscription, you may receive `customer.subscription.updated` before `customer.subscription.created`, or `invoice.paid` before `checkout.session.completed`. If your handler assumes `created` always arrives before `updated`, it will skip the update because the subscription record doesn't exist yet.

**Why it happens:**
Developers test the happy path locally where events arrive in order. In production under load, network conditions cause arbitrary ordering.

**Consequences:**
Subscription state stuck as "pending" because an `updated` event arrived before the record was created, then the `created` event sets state back to default.

**Prevention:**
Make each handler upsert (create if not exists, update if exists) rather than expecting a specific prior state. For Convex, use a pattern where `subscription.updated` creates the record if missing.

Also: for the specific `checkout.session.completed` + subscription sync, prefer handling `checkout.session.completed` to extract the `subscription` ID and immediately query the Stripe API for the full subscription object rather than waiting for a separate subscription event.

**Detection:**
Users completing checkout but subscription remaining in "pending" state. Check Stripe event delivery timestamps in the Dashboard.

**Phase:** Webhook handler implementation.

---

### Pitfall 10: Monthly Credits Reset Not Tied to Billing Cycle

**What goes wrong:**
Monthly AI credits are reset with a cron job running on the 1st of every month (or every 30 days from signup), not tied to the actual Stripe billing cycle anchor. A user who subscribes on the 15th gets credits reset on the 1st — only 16 days after subscribing.

**Why it happens:**
Calendar-based cron is simpler to implement than billing-event-driven resets.

**Consequences:**
Users on mid-month billing cycles get fewer credits in their first and last partial periods. Support complaints. Potential for credits resetting before payment is actually collected (subscription is `past_due`).

**Prevention:**
Drive credit resets from the `invoice.paid` webhook event for the subscription invoice (not from cron). When `invoice.paid` fires for a recurring subscription invoice, reset credits for that user.

```ts
case 'invoice.paid': {
  const invoice = event.data.object as Stripe.Invoice;
  if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
    // reset monthly credits for this subscriber
  }
}
```

**Detection:**
Users complaining credits reset too early or too late. Compare credit reset timestamps in Convex against Stripe invoice dates.

**Phase:** Credits quota implementation (same phase as subscription webhook handling).

---

### Pitfall 11: Stripe Secret Key Exposed via NEXT*PUBLIC* Prefix

**What goes wrong:**
`NEXT_PUBLIC_STRIPE_SECRET_KEY` or any secret imported in a client component gets bundled into the client-side JavaScript and is visible to anyone who inspects the page source or the `.next/static/` bundle.

**Why it happens:**
Copy-paste error from tutorial code. Some tutorials use `process.env.NEXT_PUBLIC_` for everything.

**Consequences:**
Full Stripe account compromise. Attacker can create refunds, read customer data, modify subscriptions.

**Prevention:**
Only `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (the `pk_...` key) belongs in NEXT*PUBLIC*. The `sk_...` secret key and `whsec_...` webhook secret must never have the `NEXT_PUBLIC_` prefix. Use them only in Server Actions, Route Handlers, and Convex HTTP actions.

Run `grep -r "NEXT_PUBLIC_.*sk_" .` before every deploy.

**Detection:**
Search the compiled Next.js bundle: `grep -r "sk_live_" .next/static/`. Any match is a breach.

**Phase:** Project setup / first Stripe integration; must be enforced in code review.

---

## Moderate Pitfalls

---

### Pitfall 12: Checking `checkout.session.completed` Alone for Subscription Status

**What goes wrong:**
`checkout.session.completed` fires when the user completes the Checkout flow, but the subscription may still be `incomplete` (e.g., the first invoice has not yet been paid for bank redirect payment methods). Treating `completed` as "subscription is active" grants Pro access to users whose payment is still pending.

**Prevention:**
Check `session.subscription` and look up the subscription object to confirm `status === 'active'`. Alternatively, listen to `customer.subscription.updated` with `status: active` as the definitive activation signal.

**Phase:** Webhook handler for subscription activation.

---

### Pitfall 13: Convex HTTP Action URL Not Configured in Stripe Dashboard

**What goes wrong:**
Stripe webhooks must be registered to a specific URL in the Dashboard. The Convex HTTP action URL is `https://<your-convex-deployment>.convex.site/stripe` (not the Next.js app URL). Developers sometimes register the Next.js route `/api/webhooks/stripe` but implement the handler as a Convex HTTP action, so the webhook hits the wrong endpoint.

**Prevention:**
Decide upfront: webhook handler lives in Next.js Route Handler OR Convex HTTP action — not both. For this stack, a Next.js Route Handler that calls a Convex mutation via `fetchMutation` is the simpler approach (keeps the handler in Next.js, writes to Convex). A Convex HTTP action is also valid but requires registering the Convex deployment URL in Stripe.

**Phase:** Webhook infrastructure setup.

---

### Pitfall 14: `customer.subscription.deleted` Not Handled

**What goes wrong:**
Subscription cancellations at period end fire `customer.subscription.updated` with `cancel_at_period_end: true`, but the actual termination fires `customer.subscription.deleted`. If only `updated` is handled, the subscription record in Convex stays `active` forever after the period ends.

**Prevention:**
Handle both `customer.subscription.updated` (to show cancellation warning in UI) and `customer.subscription.deleted` (to downgrade to Free tier).

**Phase:** Cancellation flow implementation.

---

### Pitfall 15: Stripe Metadata Not Set on Checkout Session

**What goes wrong:**
Stripe does not know your internal Clerk user ID. Without passing `metadata: { clerkUserId: userId }` on the Checkout session, the `checkout.session.completed` webhook has no way to identify which user just paid — you can only look up by Stripe customer ID, which may not exist yet for new users.

**Prevention:**
Always set `metadata` on both the Checkout session and the Stripe customer object:

```ts
await stripe.checkout.sessions.create({
  metadata: { clerkUserId: userId },
  customer_email: userEmail
  // ...
});
```

In the webhook handler, read `session.metadata.clerkUserId` to find the Convex user.

**Phase:** Checkout session creation.

---

## Minor Pitfalls

---

### Pitfall 16: Stripe CLI Local Secret Used in Deployed Environment

Local `stripe listen` generates a temporary `whsec_` secret valid only for that CLI session. Committing it or using it in staging/production breaks webhooks silently.

**Prevention:** Keep the CLI secret only in `.env.local`. Never commit `.env.local`.

---

### Pitfall 17: Not Returning 200 Immediately on Webhook Receipt

Stripe times out webhook handlers at 30 seconds. If your Convex mutation is slow (cold start, complex query), Stripe marks it as failed and retries. With idempotency in place retries are safe, but unnecessary.

**Prevention:** Return 200 as fast as possible. The Convex mutation can be awaited inline for simplicity given Convex's typical sub-100ms response, but monitor webhook execution time in Stripe Dashboard.

---

### Pitfall 18: Top-Up Credits Added Before Payment Confirmed

Using `checkout.session.completed` for top-up credits is correct. Using `payment_intent.created` or any pre-payment event would grant credits before money is received.

**Prevention:** For one-time top-up purchases, use `checkout.session.completed` with `payment_status: 'paid'` check, not `payment_intent.succeeded` (which fires at a lower level and can fire for incomplete flows).

---

### Pitfall 19: Subscription Status Not Checked on Note Creation After Cancellation

If a Pro user cancels and their `cancel_at_period_end` is true, they keep Pro access until period end. After `customer.subscription.deleted` fires, Convex should reflect Free plan. If the webhook is missed (due to any of the above pitfalls), the user retains unlimited note creation permanently.

**Prevention:** Implement a fallback: on note creation, if Convex shows Pro but the note count > 20 and the user has no valid subscription ID in Stripe (double-check via Stripe API call), downgrade proactively. This is an optional safety net, not primary enforcement.

---

## Phase-Specific Warnings

| Phase Topic              | Likely Pitfall                                                           | Mitigation                                                                 |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Webhook route setup      | Raw body destroyed (#1), wrong env secret (#2)                           | Use `request.text()`, separate secrets per env                             |
| Stripe customer creation | Orphaned customers (#8), missing metadata (#15)                          | Search by email before create, always set `metadata.clerkUserId`           |
| Checkout session         | Two-writer race (#3), session metadata missing (#15)                     | Success URL is read-only poller, always pass `metadata`                    |
| Webhook handler logic    | No idempotency (#4), out-of-order events (#9), deleted not handled (#14) | `processedStripeEvents` table, upsert pattern, handle all lifecycle events |
| Vercel deployment        | Protection blocking webhooks (#5), wrong secret (#2)                     | Disable protection on webhook path, verify with Stripe Dashboard logs      |
| Credits deduction        | TOCTOU in separate mutations (#6), client-side only (#7)                 | Single atomic mutation for check + deduct                                  |
| Credits reset            | Calendar-based not billing-cycle-based (#10)                             | Drive from `invoice.paid` webhook                                          |
| Free tier enforcement    | Client-side only bypass (#7)                                             | Backend enforcement in Convex mutation                                     |
| Secret management        | NEXT*PUBLIC* exposure (#11)                                              | Never use NEXT*PUBLIC* for secret/webhook keys                             |
| Top-up purchase          | Wrong event for fulfillment (#18)                                        | Use `checkout.session.completed` with `payment_status: 'paid'`             |

---

## Sources

- [Stripe webhook signature verification errors](https://docs.stripe.com/webhooks/signature) — official, HIGH confidence
- [Using webhooks with subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks) — official, HIGH confidence
- [The Race Condition You're Probably Shipping Right Now With Stripe Webhooks](https://dev.to/belazy/the-race-condition-youre-probably-shipping-right-now-with-stripe-webhooks-mj4) — production post-mortem, MEDIUM confidence
- [Convex OCC and Atomicity](https://docs.convex.dev/database/advanced/occ) — official, HIGH confidence
- [Wake up, you need to make money! (Add Stripe to your product) — Convex Stack](https://stack.convex.dev/stripe-with-convex) — official Convex, HIGH confidence
- [Stripe webhook raw body — Next.js GitHub Discussion #48885](https://github.com/vercel/next.js/discussions/48885) — community verified, MEDIUM confidence
- [Bypass Deployment Protection — Vercel Docs](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection) — official, HIGH confidence
- [Exploring Clerk Metadata with Stripe Webhooks](https://clerk.com/blog/exploring-clerk-metadata-stripe-webhooks) — official Clerk, HIGH confidence
- [How I Handle Stripe Webhooks in Production (The Right Way)](https://dev.to/whoffagents/how-i-handle-stripe-webhooks-in-production-the-right-way-32jd) — MEDIUM confidence
- [Stripe billing cycle anchor](https://docs.stripe.com/billing/subscriptions/billing-cycle) — official, HIGH confidence
- [Convex-Stripe Demo — GitHub](https://github.com/get-convex/convex-stripe-demo) — official Convex, HIGH confidence
