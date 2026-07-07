# Roadmap: Noetree

## Overview

Milestone v1.0 adds a Free/Pro subscription model and an AI credits metering system to Noetree. The build follows a strict dependency chain: schema and infrastructure first, webhook handler second (sole writer of subscription state), checkout and pricing third (triggers the webhook), plan enforcement fourth (reads the state phases 1-3 establish), AI credits fifth (builds on the webhook's credit rows), and a settings page last (read-only aggregation of all prior state). Each phase is independently verifiable before the next begins.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3, ...): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Schema + Infrastructure Foundation** - Convex tables deployed, env vars configured, packages installed
- [ ] **Phase 2: Webhook Handler + Convex Internal Mutations** - Stripe events processed, subscription state written atomically
- [ ] **Phase 3: Checkout Flow + Pricing Page** - Users can view plans and subscribe via Stripe Checkout
- [ ] **Phase 4: Plan Enforcement** - Free tier note limit enforced server-side, upgrade prompts shown
- [ ] **Phase 5: AI Credits System** - Credits deducted atomically, top-up available, balance visible
- [ ] **Phase 6: Settings Page** - Users can manage subscription and credits from a single in-app page

## Phase Details

### Phase 1: Schema + Infrastructure Foundation

**Goal**: All infrastructure prerequisites are in place — Convex tables deployed, secrets configured for all environments, and stub modules compiling — so subsequent phases build on a stable foundation without schema-deploy failures.
**Depends on**: Nothing (first phase)
**Requirements**: (prerequisite for all 19 — no direct requirement ownership; PLAN-05 monthly quota value baked into schema)
**Success Criteria** (what must be TRUE):

1. `convex dev` compiles without errors after schema additions (4 new tables: subscriptions, aiCredits, creditTransactions, processedStripeEvents)
2. All required env vars (STRIPE*SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRO_PRICE_ID, STRIPE_TOPUP_PRICE_ID, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) are present in local, staging, and production environments with no NEXT_PUBLIC* prefix on secrets
3. `stripe` and `@stripe/stripe-js` packages are installed and importable
4. Clerk middleware excludes `/api/webhooks/**` from authentication protection
5. Stub files for `convex/subscriptions.ts` and `convex/aiCredits.ts` compile and deploy cleanly
   **Plans**: 4 plans

Plans:

**Wave 1**

- [ ] 01-01-PLAN.md — Convex schema (4 new tables + indexes) + typed stub files (convex/subscriptions.ts, convex/aiCredits.ts)
- [ ] 01-02-PLAN.md — Install stripe/@stripe/stripe-js, bump @clerk/nextjs (CVE-2026-41248 fix), patch middleware.ts to exclude webhook routes
- [ ] 01-03-PLAN.md — Document .env.example (D-04/D-05), create Stripe test-mode products/prices via API, capture real Price IDs (D-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-04-PLAN.md — Propagate env vars to Vercel (local/staging/production) + create staging/production webhook secrets (SC-2 sign-off)

  **UI hint**: no

### Phase 2: Webhook Handler + Convex Internal Mutations

**Goal**: Stripe lifecycle events reliably update subscription state in Convex — the webhook handler is the single writer of all subscription and credit state, with idempotency protection and correct raw-body handling.
**Depends on**: Phase 1
**Requirements**: PAY-03, CRED-01
**Success Criteria** (what must be TRUE):

1. `stripe listen --forward-to localhost:3000/api/webhooks/stripe` processes a test `checkout.session.completed` event and creates a subscriptions row in Convex with correct clerkUserId
2. Replaying the same Stripe event a second time produces no duplicate rows (processedStripeEvents idempotency guard active)
3. A test `invoice.paid` event with `billing_reason: subscription_cycle` resets the aiCredits balance to 100 in Convex
4. Webhook returns 200 for all 5 handled event types (checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.paid, invoice.payment_failed) and 400 for invalid signatures
5. Wrong webhook secret (simulated by changing env var) returns 400, never 500
   **Plans**: TBD
   **UI hint**: no

### Phase 3: Checkout Flow + Pricing Page

**Goal**: A visitor can view the pricing page showing Free and Pro plans, click Upgrade, complete payment via Stripe Checkout, and receive in-app confirmation that their Pro subscription is active.
**Depends on**: Phase 2
**Requirements**: PLAN-01, PAY-01, PAY-02
**Success Criteria** (what must be TRUE):

1. User can navigate to `/pricing` and see Free (free, max 20 notes) and Pro (9€/month, unlimited notes + 100 AI credits/month) plan comparison
2. Clicking "Upgrade to Pro" redirects to Stripe Checkout with the correct Pro price and clerkUserId in both `session.metadata` and `subscription_data.metadata`
3. After completing payment in Stripe test mode, user lands on a success page that shows "Subscription active" once the Phase 2 webhook has confirmed the Convex subscriptions row
4. Completing checkout twice with the same email reuses the existing Stripe customer (no duplicate customer records)
   **Plans**: TBD
   **UI hint**: yes

### Phase 4: Plan Enforcement

**Goal**: The Free tier note limit is enforced server-side in Convex mutations — Free users cannot exceed 20 notes regardless of client-side state, and they are shown a clear upgrade prompt when they hit the limit or try to access Pro features.
**Depends on**: Phase 3
**Requirements**: PLAN-02, PLAN-03, PLAN-04
**Success Criteria** (what must be TRUE):

1. A Free tier user's 21st `createNote` mutation is rejected by Convex with an error — the note is not created even if the client bypasses UI checks
2. A Pro tier user can create note 21, 50, and 200 without any rejection
3. A user with no subscriptions row (pre-existing user) is treated as Free tier — the 20-note limit applies
4. When a Free user hits the note limit, an upgrade prompt appears in the UI with a clear CTA to the pricing page
   **Plans**: TBD
   **UI hint**: yes

### Phase 5: AI Credits System

**Goal**: Pro users have a visible AI credits balance that is atomically deducted when AI features are used, can be topped up via a one-time Stripe purchase, and automatically resets each billing cycle.
**Depends on**: Phase 4
**Requirements**: CRED-02, CRED-03, CRED-04, PAY-05
**Success Criteria** (what must be TRUE):

1. Using an AI feature (summary, suggestion, or generation) deducts exactly 1 credit from the user's balance — two concurrent AI calls do not both succeed when only 1 credit remains (atomic TOCTOU protection)
2. The remaining AI credits balance is visible near AI feature entry points in the app (not only in Settings)
3. A user with 0 credits cannot trigger an AI action — the action is blocked and a top-up prompt is shown
4. Clicking "Buy 50 credits for 2€" opens a Stripe Checkout in `payment` mode; after completion the balance increases by 50 and the purchase appears in credit transaction history
5. Credits reset to 100 automatically when the Phase 2 `invoice.paid` webhook fires for a billing cycle renewal
   **Plans**: TBD
   **UI hint**: yes

### Phase 6: Settings Page

**Goal**: Users can view and manage their entire subscription and credits state from a single in-app settings page — current plan, renewal date, upgrade or cancel actions, credit balance, and top-up history.
**Depends on**: Phase 5
**Requirements**: SET-01, SET-02, SET-03, SET-04, SET-05, PAY-04
**Success Criteria** (what must be TRUE):

1. Settings page shows current plan (Free or Pro), and if Pro, the subscription renewal date and status (active / cancelling at period end)
2. A Free user sees an "Upgrade to Pro" CTA in settings that initiates the checkout flow from Phase 3
3. A Pro user can click "Cancel subscription" and confirm in a dialog — after Stripe API call the status shows "cancels on [date]" without immediate loss of Pro access
4. Cancelled subscription correctly downgrades to Free after `customer.subscription.deleted` webhook fires at period end (Convex state reflects new plan)
5. User can view current AI credits balance and a history of top-up purchases with dates and amounts
   **Plans**: TBD
   **UI hint**: yes

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6

| Phase                                          | Plans Complete | Status      | Completed |
| ---------------------------------------------- | -------------- | ----------- | --------- |
| 1. Schema + Infrastructure Foundation          | 0/4            | Planned     | -         |
| 2. Webhook Handler + Convex Internal Mutations | 0/?            | Not started | -         |
| 3. Checkout Flow + Pricing Page                | 0/?            | Not started | -         |
| 4. Plan Enforcement                            | 0/?            | Not started | -         |
| 5. AI Credits System                           | 0/?            | Not started | -         |
| 6. Settings Page                               | 0/?            | Not started | -         |
