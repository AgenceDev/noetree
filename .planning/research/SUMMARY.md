# Project Research Summary

**Project:** Noetree v1.0 Monetisation and Paiements
**Domain:** Freemium SaaS subscription billing + AI credits metering (Stripe + Convex + Clerk)
**Researched:** 2026-07-07
**Confidence:** HIGH

## Executive Summary

Noetree v1.0 adds a Free/Pro subscription model and an AI credits top-up system on top of an already-functional Next.js 15 / Convex / Clerk stack. The integration follows a well-established pattern: Stripe handles money and lifecycle events, Convex is the real-time source of truth for subscription state, and Clerk userId is the link between the two systems. The critical non-obvious requirement is that the Clerk userId must be embedded in Stripe metadata at checkout time because webhooks arrive without a Clerk session. All subscription enforcement must live server-side in Convex mutations, never in UI alone.

The recommended build approach is schema-first: add new Convex tables before writing any feature code, then wire the webhook handler, then build checkout, and only then build UI that reads from subscription state. This order is dictated by hard dependencies: the webhook populates state that all UI reads, and Convex schema changes require redeployment before any code referencing new tables can compile.

The highest-risk pitfalls are infrastructure failures that cause silent billing breakage in production: raw body destruction before Stripe signature verification, mismatched webhook secrets across environments, Vercel Deployment Protection blocking webhook POSTs, and missing idempotency on webhook event processing. All four must be handled in the first two phases. Credits deduction atomicity (TOCTOU) and the Clerk-Stripe metadata linkage are the two other places where a small error causes a hard-to-diagnose production bug.

---

## Key Findings

### Stack Additions

Two npm packages needed. The existing stack (Next.js 15, Convex 1.19.5, Clerk 6.x, Shadcn) is not re-evaluated.

- `stripe` (^17.x, latest ~22.x on npm) — server-side Stripe API calls in Route Handlers; only viable option
- `@stripe/stripe-js` (^4.x) — client-side loadStripe() for Checkout redirect; loaded lazily, tiny footprint

Rejected: `@convex-dev/stripe` (v0.1.3) requires Convex Components migration (convex.config.ts does not exist), conflicts with existing users/roles tables, and has a known bug where customer.subscription.updated does not update priceId (GitHub issue #7). Manual implementation is ~150 lines and gives full schema control.

New infrastructure files (no additional packages):

- `app/api/webhooks/stripe/route.ts` — Stripe webhook receiver, Node.js runtime forced with `export const runtime = "nodejs"`
- `app/api/checkout/route.ts` — creates Stripe Checkout Session
- `convex/subscriptions.ts` — subscription queries + internalMutations
- `convex/aiCredits.ts` — credits balance queries + deduction mutations

Env var discipline: STRIPE*SECRET_KEY, STRIPE_WEBHOOK_SECRET, and Price IDs are server-only and must never have the NEXT_PUBLIC* prefix. Only NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is safe to expose to the client.

---

### Table Stakes vs Differentiators

**Must have (table stakes — missing = product feels untrustworthy):**

- Pricing page showing Free vs Pro plans
- Hard note limit enforcement at 20 for Free tier, enforced in Convex createNote mutation (never client-side only)
- Upgrade prompt when hitting the limit (industry standard: Notion, Evernote pattern)
- In-app subscription confirmation after payment (PAY-02) — critical trust signal
- Cancel subscription from within the app (PAY-04, SET-04) — users who cannot cancel dispute charges
- Settings page with plan and renewal date — reduces unexpected charge support tickets
- Webhook idempotency — Stripe retries 72h; double credit grants are a real financial bug
- Real-time plan reflection after webhook fires — Convex reactive queries eliminate page reload

**Should have (differentiators for Noetree):**

- AI credits balance visible near the AI feature entry point, not only in Settings
- Credits top-up via Stripe Checkout (PAY-05) — secondary revenue stream on top of subscription
- Monthly credits auto-reset tied to invoice.paid billing cycle, not calendar cron
- Top-up purchase history (SET-05) — trust signal, reduces support tickets
- Low-credits nudge before reaching zero — prevents frustration mid-session

**Defer to v2+:**

- Stripe Customer Portal — explicitly out of scope per PROJECT.md; custom Settings UI chosen for UX cohesion
- Credit expiry with short windows — creates resentment and support burden
- Pause subscription, prorated downgrade enforcement, teams/seats, marketplace

---

### Architecture Approach

Three subsystems: (1) a Next.js Route Handler creates Checkout Sessions and receives webhooks, (2) Convex internalMutations are the single writer of subscription state called from the webhook via ConvexHttpClient, (3) Convex reactive queries provide real-time plan enforcement and UI state. The Clerk userId is embedded in both session.metadata and subscription_data.metadata at checkout time, allowing all subsequent webhook events including monthly renewal to recover the user identity.

**Major components:**

1. `app/api/webhooks/stripe/route.ts` — event ingestion; validates signature with request.text() before any parsing; `export const runtime = "nodejs"` required; route excluded from Clerk middleware protection
2. `convex/subscriptions.ts` — internalMutation upsertSubscription; handles all 5 lifecycle events with upsert pattern for out-of-order delivery safety
3. `convex/aiCredits.ts` — mutation consumeCredits (atomic check+deduct in one OCC-protected handler); internalMutation resetCredits; query getBalance
4. `convex/schema.ts` additions — 4 new tables

**New tables:**

- `subscriptions`: userId, clerkUserId, stripeCustomerId, stripeSubscriptionId, planType, status, currentPeriodStart, currentPeriodEnd, createdAt, updatedAt — indexes: by_userId, by_clerkUserId, by_stripeCustomerId, by_stripeSubscriptionId
- `aiCredits`: userId, clerkUserId, balance, monthlyQuota, billingPeriodStart, billingPeriodEnd, updatedAt — indexes: by_userId, by_clerkUserId
- `creditTransactions`: userId, type (monthly_grant|topup_purchase|ai_consumption), amount, stripePaymentIntentId, description, createdAt — indexes: by_userId, by_userId_and_type
- `processedStripeEvents`: stripeEventId, processedAt — unique index by_stripe_event_id (idempotency guard)

**Modified files:** convex/schema.ts (4 new tables), convex/notes.ts (20-note guard in createNote treating null subscription as Free), middleware.ts (exclude /api/webhooks/\*\* from Clerk protection).

**Stripe events handled:** checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed

---

### Top 5 Critical Pitfalls

1. **Raw body destroyed before signature verification** — Use `request.text()` as the very first line of the webhook handler before any other body access. Any call to `request.json()` or middleware body parsing before `stripe.webhooks.constructEvent()` invalidates the signature and silently drops all webhooks. Also declare `export const runtime = "nodejs"` to prevent Edge runtime.

2. **Wrong webhook secret per environment** — The stripe listen CLI secret, the Stripe Dashboard test-endpoint secret, and the live-endpoint secret are three different values. Copying the CLI secret into Vercel production means all production webhooks return 400 silently for 72 hours then stop retrying. Maintain three separate env vars, verify against Stripe Dashboard Webhook Attempts logs at each environment.

3. **Vercel Deployment Protection blocks Stripe webhook POSTs** — Stripe POSTs have no auth header. Vercel Deployment Protection (enabled by default on preview deployments) returns 401. Stripe logs show "delivered" but the app never processes anything. Fix: add VERCEL_AUTOMATION_BYPASS_SECRET to the webhook URL query string, or disable protection for the webhook path.

4. **No idempotency guard on webhook processing** — Stripe retries for 72 hours on any non-200 response. Without a processedStripeEvents deduplication table, a transient Convex error causes double credit grants on retry. Check-and-insert must wrap every event handler. Add a unique index on stripeEventId as a hard safety net.

5. **Credits deduction TOCTOU across separate Convex calls** — Reading balance in one query then writing in a separate mutation allows two concurrent requests to both pass the balance check. Convex OCC only protects a single mutation transaction. The balance check AND the deduction must be in the same mutation handler — never split across query + mutation.

**Additional high-severity pitfalls to prevent:**

- Set clerkUserId in BOTH session.metadata AND subscription_data.metadata — renewal events carry only subscription metadata, not session metadata
- Treat null subscription row as Free tier (not error) — all pre-existing users have no subscriptions row
- Drive credits reset from invoice.paid with billing_reason === "subscription_cycle", not calendar cron
- Never use NEXT*PUBLIC* prefix for secret key or webhook secret

---

## Implications for Roadmap

Strict 6-phase dependency chain. Each phase must complete before the next is testable.

### Phase 1: Schema + Infrastructure Foundation

**Rationale:** Convex schema changes require redeployment before any referencing code compiles. This phase has no UI — it is the foundation everything else builds on.
**Delivers:** 4 new Convex tables deployed; stripe and @stripe/stripe-js installed; all env vars in place across all environments; middleware.ts updated to exclude webhook path; stub Convex modules that compile.
**Addresses:** Pre-requisite for all 19 REQUIREMENTS.md items.
**Avoids:** Schema-not-found deploy failures; NEXT*PUBLIC* secret exposure established correctly from day one.
**Research flag:** Standard — Convex schema and env var patterns are well-documented.

### Phase 2: Webhook Handler + Convex Internal Mutations

**Rationale:** Webhook is the single writer of subscription state. Without a working webhook, checkout and settings UI cannot be tested — everything shows Free regardless of payment. Must be verified end-to-end with stripe listen before Phase 3 begins.
**Delivers:** Working webhook at app/api/webhooks/stripe/route.ts; all 5 event types handled; idempotency via processedStripeEvents; upsert pattern for out-of-order event safety; credits reset from invoice.paid with billing_reason check.
**Addresses:** PAY-03, CRED-01 (foundational for PAY-01, PAY-02, PAY-04, PAY-05).
**Avoids:** Pitfalls 1, 2, 4 (raw body, wrong env secret, idempotency); Pitfalls 9, 10, 14 (out-of-order events, billing-cycle reset, subscription.deleted handled).
**Research flag:** Needs careful implementation — verify raw body, idempotency table, and upsert with `stripe listen` before merging.

### Phase 3: Checkout Flow + Pricing Page

**Rationale:** Can only be built after webhook is working because checkout triggers the webhook. Testing: start stripe listen, click upgrade, verify webhook fires, verify Convex subscriptions row created.
**Delivers:** /pricing page (PLAN-01); app/api/checkout/route.ts with clerkUserId in BOTH metadata locations; post-checkout success page that polls Convex read-only until webhook confirms activation (PAY-02); Stripe customer dedup by email.
**Addresses:** PLAN-01, PAY-01, PAY-02.
**Avoids:** Pitfall 3 (success URL polls only, never writes subscription state); Pitfall 8 (orphaned customers); Pitfall 15 (metadata on both session and subscription_data).
**Research flag:** Standard — double-check metadata placement on both objects is the one detail requiring care.

### Phase 4: Plan Enforcement

**Rationale:** Enforcement reads the subscriptions table which Phases 1-3 establish. Pre-existing users have no subscriptions row — guard must handle null as Free tier.
**Delivers:** 20-note hard limit in convex/notes.ts createNote mutation (PLAN-02); upgrade prompt component on limit hit (PLAN-04); plan badge in dashboard (PLAN-03).
**Addresses:** PLAN-02, PLAN-03, PLAN-04.
**Avoids:** Pitfall 7 (client-side-only enforcement bypass — Convex mutation is the authority).
**Research flag:** Standard — straightforward Convex mutation guard pattern.

### Phase 5: AI Credits System

**Rationale:** Credits exist only for Pro users who went through checkout (Phase 3). The aiCredits row is created by the Phase 2 webhook handler. This phase adds the deduction layer and top-up flow.
**Delivers:** Atomic consumeCredits mutation in single handler (CRED-04); getBalance query; credits display near AI features (CRED-02); credits top-up checkout reusing Phase 3 pattern with mode: payment (PAY-05, CRED-03); top-up history from creditTransactions (SET-05 partial).
**Addresses:** CRED-02, CRED-03, CRED-04, PAY-05 (CRED-01 was handled in Phase 2 webhook).
**Avoids:** Pitfall 6 (TOCTOU — single atomic mutation); Pitfall 18 (use checkout.session.completed with payment_status: paid for top-up, not pre-payment events).
**Research flag:** Standard — Convex OCC mutation pattern is well-documented.

### Phase 6: Settings Page

**Rationale:** Read-only aggregation of state all previous phases have established. Building last avoids building settings UI for features not yet stable.
**Delivers:** /dashboard/settings showing plan (SET-01), renewal date (SET-02), upgrade CTA (SET-03), cancel with confirmation dialog + Stripe API + Convex sync (SET-04), credits balance and top-up history (SET-05, PAY-04).
**Addresses:** SET-01, SET-02, SET-03, SET-04, SET-05, PAY-04.
**Avoids:** Cancel flow must display cancel_at_period_end state — actual downgrade fires only on customer.subscription.deleted (handled in Phase 2).
**Research flag:** Standard — UI assembly of Convex reactive queries.

### Phase Ordering Rationale

- Schema first: Convex deploy order is strict; tables must exist before referencing code compiles
- Webhook second: sole writer of subscription state; cannot test anything without it
- Checkout third: triggers the webhook; both must be running to test end-to-end
- Enforcement fourth: reads subscription state that only exists after Phases 2-3
- Credits fifth: Pro-user aiCredits rows created by Phase 2 webhook; deduction layer builds on top
- Settings last: aggregates all state from all prior phases; no new data shapes

### Research Flags

Phases needing careful implementation attention:

- **Phase 2 (Webhook):** Three specific checks before merge — request.text() raw body, processedStripeEvents idempotency table present, upsert not insert. Verify all 5 event types with stripe listen.
- **Phase 3 (Checkout):** Verify clerkUserId is set on BOTH session.metadata AND subscription_data.metadata.
- **Phase 5 (Credits deduction):** Verify consumeCredits is one mutation with read+write in same handler.

Phases with standard well-documented patterns:

- **Phase 1:** Convex schema addition, env var setup
- **Phase 4:** Mutation guard with note count check
- **Phase 6:** Settings page UI assembly

---

## Open Questions Requiring Product Decisions Before Coding

| Question                                                         | Blocks                                                   | Owner         |
| ---------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| What is the Pro plan monthly price?                              | Phase 3: Stripe Price creation, pricing page copy        | Product owner |
| What is the monthly AI credits quota for Pro (e.g. 100 credits)? | Phase 2: monthlyQuota value in webhook handler           | Product owner |
| What does 1 AI credit correspond to in usage?                    | Phase 5: cost parameter per AI action in consumeCredits  | Product owner |
| What is the top-up pack size and price?                          | Phase 3: Stripe one-time Price; Phase 5: top-up checkout | Product owner |
| What is the upgrade prompt copy framing?                         | Phase 4: upgrade prompt component text and CTA           | Product owner |

---

## Confidence Assessment

| Area         | Confidence | Notes                                                                                                                                                                             |
| ------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH       | Verified via Context7 stripe-node, official Convex blog, npm. @convex-dev/stripe rejection is MEDIUM due to schema mismatch and GitHub issue #7.                                  |
| Features     | HIGH       | Corroborated across Stripe docs, Stigg/Appcues/Lago SaaS research, competitor analysis.                                                                                           |
| Architecture | HIGH       | Verified against official Convex docs, Stripe subscription webhook docs, and Clerk blog on Stripe metadata pattern. Webhook-in-Next.js is the project constraint from PROJECT.md. |
| Pitfalls     | HIGH       | Multiple production post-mortems plus official Stripe/Convex/Vercel docs. Detection methods documented for each.                                                                  |

**Overall confidence:** HIGH

### Gaps to Address During Planning

- **Stripe Price IDs**: Must be created in Stripe Dashboard (test mode first, then live mode) before Phase 3 coding begins. Blocked on product pricing decisions above.
- **Existing user migration**: No data migration needed. A ensure-subscription-row-exists function on first login is advisable so Settings page shows meaningful state for existing Free users. Address during Phase 4.
- **Vercel environment setup**: Three webhook secrets (CLI, staging, production) must be documented and kept separate. Staging needs its own Stripe test-mode endpoint registered in the Stripe Dashboard. Ops task for Phase 1.
- **invoice.paid field validation**: Verify billing_reason === "subscription_cycle" is the correct current field name at implementation time — Stripe has renamed event fields before.

---

## Sources

### Primary (HIGH confidence)

- Stripe Node.js SDK (Context7 / stripe-node) — checkout session creation, webhook signature verification, subscription lifecycle
- Stripe Subscription Webhooks official docs — event types, delivery guarantees, 72h retry behavior
- Stripe Billing Cycle Anchor docs — rationale for invoice.paid-driven credits reset
- Convex OCC and Atomicity docs — credits deduction safety pattern
- Convex + Stripe official blog (stack.convex.dev) — end-to-end integration pattern
- Clerk + Stripe metadata blog (clerk.com) — clerkUserId embedding in Stripe metadata pattern
- Vercel Deployment Protection docs — bypass for automation webhook paths

### Secondary (MEDIUM confidence)

- @convex-dev/stripe component README + GitHub issue #7 — basis for component rejection decision
- Next.js App Router webhook raw body pattern (community articles, verified against Next.js docs)
- Production post-mortem: The Race Condition You Are Probably Shipping With Stripe Webhooks — two-writer race pitfall
- Stigg AI credits implementation blog — credits expiry anti-patterns, top-up UX research
- Appcues freemium upgrade prompt research — upgrade prompt framing best practices
- Note-taking app pricing comparison (stackscored.com) — competitive context

### Tertiary (LOW confidence — validate at implementation)

- invoice.paid billing_reason field name — verify against current Stripe API event catalog at implementation time

---

_Research completed: 2026-07-07_
_Ready for roadmap: yes_
