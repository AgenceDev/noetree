# Phase 3: Checkout Flow + Pricing Page - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a public, locale-routed pricing page (`/[locale]/pricing`) showing Free vs Pro plans, a Server Action that creates a Stripe Checkout Session for the Pro plan (reusing an existing Stripe customer when one exists), and a success page (`/[locale]/checkout/success`) that reactively confirms via Convex once the Phase 2 webhook has written the `subscriptions` row. This phase delivers the "start a subscription and see it confirmed" path only — no plan enforcement (Phase 4), no cancellation, no in-app management (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Pricing Page Access & Shell

- **D-01:** `/pricing` is a public page, reachable by signed-out visitors. It does NOT reuse `app/[locale]/layout.tsx`'s authenticated app shell (sidebar/Header from `components/Header`, `components/app-sidebar`) — build a separate, lighter layout/wrapper for it (or a marketing-page shell) so a visitor with no notes/sidebar context can view it.
- **D-02:** Clicking "Upgrade to Pro" while signed out redirects to Clerk sign-in/sign-up first, with a return path back into the checkout-initiation flow once authenticated. Do not use an inline sign-in modal — a full navigation redirect is simpler and matches the fact that Stripe Checkout Session creation (D-05) needs `clerkUserId` from server-side Clerk `auth()`.
- **D-03:** `/pricing` follows the existing next-intl locale routing convention: route is `app/[locale]/pricing/page.tsx`, copy sourced from `messages/en.json` + `messages/fr.json` (new `Pricing` namespace), consistent with every other route in this app (`app/[locale]/page.tsx`, `app/[locale]/notes/page.tsx`).
- **D-04:** No persistent "Upgrade" nav item is added to the sidebar/Header in this phase. `/pricing` is reached via direct link only; contextual upgrade prompts (e.g., on hitting the note limit) are Phase 4's responsibility (Plan Enforcement), not this phase's.

### Checkout Session Creation & Customer Reuse

- **D-05:** The Stripe Checkout Session is created by a Next.js Server Action (`"use server"`), invoked directly from the pricing page's Upgrade control — not a new API route. The action reads the authenticated user via Clerk's server-side `auth()`.
- **D-06:** Before creating a session, the Server Action queries Convex `subscriptions.getSubscription` (existing `by_clerkUserId` index, Phase 1) for the current user. If a row exists, its `stripeCustomerId` is passed into the Checkout Session (`customer: stripeCustomerId`) to avoid creating a duplicate Stripe customer (ROADMAP SC4). If no row exists, no `customer` param is passed and Stripe Checkout creates a new customer from the session's collected email.
- **D-07 (locked, not re-decided):** The Checkout Session sets `clerkUserId` in **both** `session.metadata.clerkUserId` and `subscription_data.metadata.clerkUserId` — this was locked in Phase 1 (D-01) and consumed by Phase 2's webhook dispatcher (D-06/D-07). No deviation. `success_url` points to the new success page (`/[locale]/checkout/success?session_id={CHECKOUT_SESSION_ID}`); `cancel_url` points back to `/[locale]/pricing`.
- **D-08:** Before creating a Checkout Session, the same Server Action checks the Convex subscription row's `status`. If it's already `"active"`, the action short-circuits — no Stripe API call — and redirects straight to the success page instead (prevents duplicate/overlapping subscriptions from stale tabs or double-clicks).

### Post-Checkout Success Confirmation UX

- **D-09:** The success page (`app/[locale]/checkout/success/page.tsx`) is a client component using a Convex reactive `useQuery` on `subscriptions.getSubscription(clerkUserId)` — NOT manual polling. It re-renders automatically the instant the Phase 2 webhook writes/updates the row.
- **D-10:** While the query hasn't yet returned an `"active"` status, show a loading state: spinner + "Confirming your subscription…" copy, built with the existing `components/ui/skeleton.tsx` primitive. Do NOT show "Subscription active" optimistically before Convex confirms it.
- **D-11:** If the query still hasn't returned `"active"` after ~15-20 seconds, swap the copy to reassure the user their payment succeeded and status will update shortly, and offer a manual "Refresh" action. No infinite spinner.
- **D-12:** The success page identifies the current user via server-side Clerk `auth()` (they're signed in at this point) — it does NOT fetch the Stripe Checkout Session server-side to render order details. The `session_id` query param from `success_url` is kept only as an optional debugging/support reference, not as the lookup key. Convex is the canonical source for "is this user Pro now."

### Free Plan CTA & Already-Subscribed Visits

- **D-13:** The Free plan card has no clickable CTA. Signed-in Free users see a "Current plan" label/badge on the Free card instead of a button; signed-out visitors see the Free card as pure informational comparison (no sign-up button here — sign-up naturally happens if/when they click "Upgrade" on Pro, per D-02).
- **D-14:** The pricing page reads the current user's subscription status (same Convex query used by the Server Action's pre-check, D-08) to decide rendering: if `status === "active"`, the Pro card shows "Current plan" with no "Upgrade" button. This is a page-level UX safeguard on top of D-08's server-side guard, not a replacement for it.
- **D-15:** Signed-out visitors and signed-in Free users are treated identically on `/pricing` — one rendering path for "not Pro," one for "Pro." No visitor-specific vs Free-specific copy variants. Clicking "Upgrade to Pro" always routes through sign-in-then-checkout (D-02); for an already-signed-in Free user this collapses to just continuing straight to checkout since they're already authenticated.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap

- `.planning/ROADMAP.md` §"Phase 3: Checkout Flow + Pricing Page" — 4 success criteria (pricing comparison, Checkout redirect with correct metadata, webhook-confirmed success page, no duplicate customers on repeat checkout)
- `.planning/REQUIREMENTS.md` — PLAN-01 (pricing page), PAY-01 (subscribe via Stripe Checkout), PAY-02 (in-app confirmation after activation) map to this phase
- `.planning/PROJECT.md` §Key Decisions — "UI custom (pas Stripe Portal)" confirms Stripe's hosted Checkout page is fine to use (distinct from the Customer Portal, which stays out of scope); §Constraints confirms Convex is the real-time source of truth for subscription status

### Phase 1 & 2 Context (prerequisite decisions this phase builds on)

- `.planning/phases/01-schema-infrastructure-foundation/01-CONTEXT.md` — D-01 (`clerkUserId` as bare string on `subscriptions`, no `v.id("users")` reference), D-02 (`by_clerkUserId` index), D-08 (`subscriptions.getSubscription` query signature)
- `.planning/phases/02-webhook-handler-convex-internal-mutations/02-CONTEXT.md` — D-06/D-07 (how `checkout.session.completed` and `customer.subscription.updated` resolve `clerkUserId` from metadata — this phase is what populates that metadata at session-creation time), D-14/D-15 (idempotent webhook write behavior the success page's reactive query depends on)
- `.planning/phases/01-schema-infrastructure-foundation/01-PATTERNS.md` / `.planning/phases/02-webhook-handler-convex-internal-mutations/02-PATTERNS.md` — Convex validator style, `withIndex` lookup pattern, camelCase naming conventions to follow for any new Convex code touched this phase

### Existing Codebase

- `convex/schema.ts` — `subscriptions` table already has `by_clerkUserId` and `by_stripeSubscriptionId` indexes (Phase 1 + 2); no schema changes expected this phase
- `convex/subscriptions.ts` — `getSubscription` query (by `clerkUserId`) already implemented (Phase 2); this phase is a consumer, not an implementer, of this function
- `app/[locale]/layout.tsx`, `components/Header`, `components/app-sidebar` — existing authenticated app shell; `/pricing` deliberately does NOT use this (D-01)
- `messages/en.json`, `messages/fr.json` — existing next-intl message files; this phase adds a `Pricing` (and likely `CheckoutSuccess`) namespace to both
- `components/ui/skeleton.tsx`, `components/ui/card.tsx`, `components/ui/button.tsx` — existing Shadcn primitives to reuse for pricing cards and the loading state
- `.env.example` — `STRIPE_PRO_PRICE_ID`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` already documented (Phase 1); this phase is the first to actually consume `STRIPE_PRO_PRICE_ID` and `STRIPE_SECRET_KEY` in application code (Phase 1/2 only referenced them for webhook verification, not Checkout Session creation)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/subscriptions.ts` `getSubscription(clerkUserId)` — already implemented, reused for both the Server Action's pre-check (D-06/D-08) and the pricing/success pages' rendering (D-09/D-14)
- `components/ui/card.tsx`, `button.tsx`, `skeleton.tsx` — Shadcn primitives available for pricing cards and success-page loading state
- Clerk server-side `auth()` — already used elsewhere in the app for authenticated routes; this phase's Server Action and success page both rely on it instead of parsing Stripe session data client-side

### Established Patterns

- next-intl locale routing: every existing page lives under `app/[locale]/...` with matching keys in `messages/en.json`/`messages/fr.json` (e.g. `Dashboard` namespace in `app/[locale]/page.tsx`) — `/pricing` and the success page follow the same convention (D-03)
- No `app/api/` route exists for anything other than the Stripe webhook — this phase intentionally does NOT add a new API route for checkout, using a Server Action instead (D-05), keeping the API-route surface area minimal
- Convex reactive `useQuery` is the established real-time pattern in this codebase (per PROJECT.md "Convex est le store de vérité, temps réel") — the success page's confirmation mechanism (D-09) follows this existing project-wide pattern rather than introducing polling

### Integration Points

- New `app/[locale]/pricing/page.tsx` — public page, new route, no existing analog
- New `app/[locale]/checkout/success/page.tsx` — public-shell client page with Convex `useQuery`, no existing analog
- New Server Action (likely co-located as `app/[locale]/pricing/actions.ts` or similar — exact file left to planner) — calls Stripe SDK (`stripe` package, already installed Phase 1) to create the Checkout Session
- `convex/subscriptions.ts` `getSubscription` — read by both the new Server Action and the two new pages; no changes needed to this function itself

</code_context>

<specifics>
## Specific Ideas

- Pro plan pricing/copy already locked in STATE.md/PROJECT.md: 9€/month, unlimited notes, 100 AI credits/month — these are display values only this phase, not new decisions
- Success page timeout window: "~15-20 seconds" is a UX guideline from this discussion, not a hard requirement — planner/executor can pick an exact value in that range

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Contextual upgrade prompts on hitting note limits, persistent nav "Upgrade" link, and Stripe Customer Portal / in-app subscription management were explicitly identified as belonging to Phase 4 and Phase 6 respectively, not deferred as new ideas but confirmed as already-scoped-elsewhere.)

</deferred>

---

_Phase: 3-Checkout Flow + Pricing Page_
_Context gathered: 2026-07-09_
