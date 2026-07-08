# Phase 2: Webhook Handler + Convex Internal Mutations - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the Next.js API route webhook handler at `/api/webhooks/stripe` that verifies Stripe signatures, and a new Convex dispatcher module that writes subscription and credit state atomically for 5 event types (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`). This handler is the SOLE writer of `subscriptions`, `aiCredits`, `creditTransactions`, and `processedStripeEvents` state — no other code path writes to these tables in this milestone.

This phase delivers no user-facing UI. Success is defined entirely by the 5 ROADMAP.md success criteria: correct row creation, idempotent replay protection, correct credit reset on `subscription_cycle` invoices, correct 200/400 status codes across all 5 event types plus invalid signatures, and no 500s on bad-signature requests.

</domain>

<decisions>
## Implementation Decisions

### Convex Auth Mechanism (webhook route → internal mutations)

- **D-01:** `internalMutation`s (`upsertSubscription`, `deductCredit`, etc. from Phase 1) cannot be called from the public Convex client SDK directly. The Next.js webhook route calls a new **public Convex dispatcher `action`** instead, using the existing `NEXT_PUBLIC_CONVEX_URL` client — no admin/deploy key required.
- **D-02:** The dispatcher action is protected by a **shared secret argument**: a new server-only env var (e.g. `INTERNAL_WEBHOOK_SECRET`), set identically in the Next.js environment and the Convex environment (`npx convex env set`). The Next.js route passes it as an action argument after Stripe signature verification succeeds; the action rejects the call if it doesn't match. This is a **new required env var not covered in Phase 1's env var list** — planner must add it to `.env.example` and the 3-environment (local/staging/production) propagation.
- **D-03:** **One dispatcher action** handles all 5 event types via an internal switch/dispatch, rather than 5 separate public actions. Single auth check, single entry point — matches the phase goal's "single writer" framing.
- **D-04:** New file `convex/stripeWebhooks.ts` holds the dispatcher action. `convex/subscriptions.ts` and `convex/aiCredits.ts` (Phase 1 stubs) stay pure data-access modules — this phase fills in their real `internalMutation`/`query` bodies but does not add the dispatch/routing logic to them.
- **D-05 (rejected alternatives, for planner awareness):** Do NOT expose the Phase 1 internal mutations as public `mutation`s — this would reverse Phase 1's D-01/D-02/D-08/D-09 lock ("blocks direct client writes"). Do NOT re-verify the Stripe signature a second time inside Convex — redundant, and would require the Stripe secret key inside Convex's env too.

### clerkUserId Resolution Per Event Type

- **D-06:** `checkout.session.completed` resolves `clerkUserId` from `session.metadata.clerkUserId` (locked in Phase 1) — creates the initial `subscriptions` row.
- **D-07:** `customer.subscription.updated` / `customer.subscription.deleted` resolve `clerkUserId` from **`subscription.metadata.clerkUserId`** directly — no extra lookup. This works because Phase 1 already locked `clerkUserId` into `subscription_data.metadata` at checkout time, so every subsequent Subscription object echoes it back.
- **D-08:** `invoice.paid` / `invoice.payment_failed` do NOT carry `clerkUserId` in their own metadata. They resolve the target row by **looking up the existing `subscriptions` row via `stripeSubscriptionId`** (extracted from `invoice.subscription` / `invoice.parent.subscription_details.subscription`). This requires a **new Convex index**: add `by_stripeSubscriptionId` to the `subscriptions` table (schema addition on top of Phase 1's schema — planner must add this index in `convex/schema.ts`). Do not call the Stripe API to re-fetch the subscription (avoids an extra network round-trip and new failure mode).
- **D-09:** Once `clerkUserId` is resolved (via D-06/D-07/D-08), it is reused directly for all `aiCredits`/`creditTransactions` writes via the existing `by_clerkUserId` index (Phase 1). No new index needed on `aiCredits`.

### Failure / Retry Semantics

- **D-10:** Bad Stripe signature → `400`, never `500` (locked by ROADMAP SC5, unchanged).
- **D-11:** Genuine processing failures (Convex unreachable, unhandled exception, malformed event body) → **`500`**. Stripe auto-retries on 5xx with exponential backoff for up to ~3 days, so transient failures self-heal without manual replay.
- **D-12:** When `clerkUserId`/subscription row cannot be resolved (stale metadata, no matching `stripeSubscriptionId`) → **log the anomaly server-side, return `200`**. Retrying won't fix missing/stale data, so returning 500 here would just cause Stripe to retry a request that can never succeed.
- **D-13:** Stripe event types outside the 5 handled ones → **acknowledge with `200`, no-op**. Standard webhook practice — avoids infinite Stripe retries for event types this endpoint was never going to handle.

### Idempotency Mechanics

- **D-14:** The `processedStripeEvents` check-and-mark happens in the **same atomic Convex mutation** as the state write (check by `stripeEventId` → if exists, return early → else write state change AND insert the `processedStripeEvents` row, all in one Convex transaction). Convex mutations are transactional by default, closing the race window between near-simultaneous duplicate deliveries. Do not split this into a separate read-then-write across two round-trips.
- **D-15:** If an event ID is already marked processed, the dispatcher **no-ops and returns `200`** (not an error) — this is Stripe's expected outcome for a replayed/retried event it already delivered successfully.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap

- `.planning/ROADMAP.md` §"Phase 2: Webhook Handler + Convex Internal Mutations" — 5 success criteria, 5 handled event types, dependency on Phase 1
- `.planning/REQUIREMENTS.md` — PAY-03 (webhooks update subscription status in real time), CRED-01 (monthly credit reset on billing date) map to this phase
- `.planning/PROJECT.md` §Constraints — "webhooks Stripe doivent être des routes API Next.js" (locks webhook entry point to Next.js, not Convex HTTP action); "Sécurité : Webhook signature verification obligatoire"

### Phase 1 Context (prerequisite decisions this phase builds on)

- `.planning/phases/01-schema-infrastructure-foundation/01-CONTEXT.md` — D-01/D-02 (clerkUserId as bare string + `by_clerkUserId` index), D-05 (env var list), D-07/D-08/D-09 (stub function signatures for `subscriptions.ts`/`aiCredits.ts`, all writes are `internalMutation`)
- `.planning/phases/01-schema-infrastructure-foundation/01-PATTERNS.md` — Convex validator style (`v.*`), indexed-query pattern (`withIndex`, not `.filter()`), bare-throw error convention, `internalMutation` usage precedent

### Existing Codebase

- `convex/schema.ts` — current schema with `subscriptions`, `aiCredits`, `creditTransactions`, `processedStripeEvents` tables already deployed (Phase 1); this phase adds a `by_stripeSubscriptionId` index to `subscriptions` (D-08)
- `convex/subscriptions.ts` / `convex/aiCredits.ts` — Phase 1 stub files (`throw new Error("Not implemented — Phase 2")`) to be filled in with real implementations this phase
- `middleware.ts` — already excludes `/api/webhooks/(.*)` from Clerk auth (Phase 1 D-06) — no changes needed
- `.env.example` — Phase 1 documents `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TOPUP_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; this phase adds `INTERNAL_WEBHOOK_SECRET` (D-02, new)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/_generated/server.d.ts` — `internalMutation`, `internalQuery`, `action` builders already available, no codegen changes needed
- Phase 1 stub function signatures in `convex/subscriptions.ts`/`convex/aiCredits.ts` — argument shapes already match the `withIndex`-based lookup this phase implements; only handler bodies need filling in

### Established Patterns

- Convex validator style: `v.*` from `"convex/values"`, `v.union(v.literal(...))` for enums (no prior codebase precedent before Phase 1, sourced from Convex docs)
- Indexed-query lookup: `ctx.db.query(table).withIndex(indexName, q => q.eq(field, value)).unique()` — established in `convex/users.ts`, applies to all new lookups this phase adds (including the new `by_stripeSubscriptionId` lookup)
- Bare-throw error convention: no try/catch wrapping, errors propagate directly (matches `convex/notes.ts`/`convex/users.ts`)
- No `app/api/` directory exists yet in this Next.js App Router project — the webhook route (`app/api/webhooks/stripe/route.ts`) is entirely new, with no existing API route to pattern-match against. Note the app uses `app/[locale]/...` for pages (next-intl) but API routes are NOT localized — `app/api/webhooks/stripe/route.ts` sits outside `[locale]`.

### Integration Points

- `middleware.ts` matcher already covers `/api` broadly and excludes `/api/webhooks/(.*)` from auth — webhook route needs no middleware changes
- New `convex/stripeWebhooks.ts` dispatcher action is the single integration point between the Next.js route and all 4 Phase-1-created tables

</code_context>

<specifics>
## Specific Ideas

- Env var propagation for `INTERNAL_WEBHOOK_SECRET` (D-02) follows the same 3-environment pattern Phase 1 established for `STRIPE_WEBHOOK_SECRET` (distinct local/staging/production handling documented in `.env.example`)
- STATE.md blocker carried forward: verify `billing_reason === "subscription_cycle"` is still the correct field/value name on the `invoice.paid` event at implementation time (Stripe has renamed fields before)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 2-Webhook Handler + Convex Internal Mutations_
_Context gathered: 2026-07-08_
