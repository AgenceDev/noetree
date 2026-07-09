# Phase 3: Checkout Flow + Pricing Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-09
**Phase:** 3-Checkout Flow + Pricing Page
**Areas discussed:** Pricing page access & shell, Checkout session creation & customer reuse, Post-checkout success confirmation UX, Free plan CTA & already-subscribed visits

---

## Pricing page access & shell

| Option                            | Description                                                                                                                       | Selected |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Public, no app shell              | New route outside app/[locale]/layout.tsx's sidebar/Header wrapper — matches "a visitor can view the pricing page" in ROADMAP SC1 | ✓        |
| Inside app shell (sidebar/Header) | Reuse app/[locale]/layout.tsx as-is — simpler, but forces sign-in before viewing pricing                                          |          |

**User's choice:** Public, no app shell
**Notes:** —

| Option                          | Description                                                                                        | Selected |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Redirect to Clerk sign-in first | Send to Clerk sign-in/sign-up with a redirect back to checkout-initiation once authenticated       | ✓        |
| Open Clerk sign-in modal inline | Modal overlay on the pricing page itself, then continue to checkout without a full page navigation |          |

**User's choice:** Redirect to Clerk sign-in first
**Notes:** —

| Option                                    | Description                                                  | Selected |
| ----------------------------------------- | ------------------------------------------------------------ | -------- |
| Yes, /[locale]/pricing                    | Consistent with app/[locale]/page.tsx and app/[locale]/notes | ✓        |
| No, plain /pricing outside locale routing | English-only copy, simpler but inconsistent                  |          |

**User's choice:** Yes, /[locale]/pricing
**Notes:** —

| Option                                   | Description                                                                          | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Direct link/prompt only, no nav item yet | Phase 4 (Plan Enforcement) builds the upgrade-prompt-on-limit flow                   | ✓        |
| Add a persistent nav item now            | More visible but touches shared nav components outside this phase's core deliverable |          |

**User's choice:** Direct link/prompt only, no nav item yet
**Notes:** —

---

## Checkout session creation & customer reuse

| Option                             | Description                                                                        | Selected |
| ---------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| Next.js Server Action              | No new API route needed, gets Clerk auth() server-side for free                    | ✓        |
| New API route (e.g. /api/checkout) | Mirrors app/api/webhooks/stripe/route.ts pattern — more boilerplate for no benefit |          |

**User's choice:** Next.js Server Action
**Notes:** —

| Option                                                    | Description                                                                                | Selected |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------- |
| Query Convex subscriptions by clerkUserId first           | Reuse stripeCustomerId from existing row if present; Stripe creates new customer otherwise | ✓        |
| Call Stripe customer search API by email at checkout time | Adds a Stripe API round-trip, doesn't use state Phase 1/2 already built                    |          |

**User's choice:** Query Convex subscriptions by clerkUserId first
**Notes:** —

| Option                                       | Description                                                                  | Selected |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| clerkUserId in both metadata fields (locked) | session.metadata + subscription_data.metadata, per Phase 1 D-01/Phase 2 D-06 | ✓        |
| Something else / add other params            | No additional params requested                                               |          |

**User's choice:** clerkUserId in both metadata fields (locked)
**Notes:** No promo codes, coupons, or other params in scope.

| Option                                                             | Description                                                                   | Selected |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------- |
| Server Action checks Convex first, no-ops/redirects if already Pro | Prevents duplicate/overlapping subscriptions from stale tabs or double-clicks | ✓        |
| Let Stripe handle it, no pre-check                                 | Simpler, but risks two active subscriptions on one Stripe customer            |          |

**User's choice:** Server Action checks Convex first, no-ops/redirects if already Pro
**Notes:** —

---

## Post-checkout success confirmation UX

| Option                           | Description                                                             | Selected |
| -------------------------------- | ----------------------------------------------------------------------- | -------- |
| Convex reactive query (useQuery) | Auto re-renders the instant the webhook writes the row, no polling loop | ✓        |
| Manual polling with setInterval  | Reinvents Convex's reactivity                                           |          |

**User's choice:** Convex reactive query (useQuery)
**Notes:** —

| Option                                       | Description                                           | Selected |
| -------------------------------------------- | ----------------------------------------------------- | -------- |
| Spinner + "Confirming your subscription…"    | Uses existing Skeleton component                      | ✓        |
| Optimistic "Subscription active" immediately | Risks misleading the user if webhook is delayed/fails |          |

**User's choice:** Spinner + "Confirming your subscription…"
**Notes:** —

| Option                                                  | Description                                                                | Selected |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| After ~15-20s, show "still processing" + manual refresh | Avoids infinite spinner if webhook is slow                                 | ✓        |
| No timeout, spinner indefinitely                        | Simpler, but leaves user staring at infinite spinner in rare delayed cases |          |

**User's choice:** After ~15-20s, show "still processing" + manual refresh
**Notes:** Exact timeout value (15 vs 20s) left to planner/executor discretion.

| Option                                                        | Description                                                             | Selected |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| session_id only, used just to read clerkUserId via Clerk auth | Convex is canonical source, no Stripe API call needed on success page   | ✓        |
| Fetch the Stripe session server-side to display order details | Adds Stripe API call + secret-key usage in a page component, not needed |          |

**User's choice:** session_id only, used just to read clerkUserId via Clerk auth
**Notes:** —

---

## Free plan CTA & already-subscribed visits

| Option                                          | Description                                                                     | Selected |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| No button, just "Current plan" badge or nothing | Free is the default for everyone; nothing to click into                         | ✓        |
| Button linking to sign-up                       | Symmetric with Pro's "Upgrade" button, but adds a post-sign-up landing decision |          |

**User's choice:** No button, just "Current plan" badge or nothing
**Notes:** —

| Option                                            | Description                                                            | Selected |
| ------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Pro card shows "Current plan", no Upgrade button  | Reads subscription status, prevents confusion/double-checkout attempts | ✓        |
| Same page for everyone, no status-aware rendering | Relies entirely on Server Action's redirect-if-already-Pro guard       |          |

**User's choice:** Pro card shows "Current plan", no Upgrade button
**Notes:** —

| Option                                                                          | Description                                                                                          | Selected |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| Treat identically — same page, Upgrade always starts sign-in-then-checkout flow | One rendering path for "not Pro," sign-in redirect naturally no-ops for already-signed-in Free users | ✓        |
| Different copy for signed-out vs signed-in Free                                 | More tailored, more conditional branches to build and translate                                      |          |

**User's choice:** Treat identically — same page, Upgrade always starts sign-in-then-checkout flow
**Notes:** —

---

## Claude's Discretion

- Exact file location/name for the Checkout Session Server Action (e.g. `app/[locale]/pricing/actions.ts`) — left to planner.
- Exact success-page timeout value within the "~15-20 seconds" window.

## Deferred Ideas

None raised outside phase scope. Contextual upgrade prompts (Phase 4), persistent nav "Upgrade" link, and Stripe Customer Portal / in-app subscription management (Phase 6) were confirmed as already-scoped-elsewhere rather than new deferred ideas.
