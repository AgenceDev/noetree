# Phase 1: Schema + Infrastructure Foundation - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy 4 new Convex tables to the live schema, install Stripe packages, configure all required environment variables (including real Stripe Price IDs from Dashboard test mode) across local/staging/production, patch Clerk middleware to exclude webhook routes from auth, and write typed-but-unimplemented stub files for `convex/subscriptions.ts` and `convex/aiCredits.ts`.

This phase delivers NO user-facing features. Its sole success condition is that `convex dev` compiles cleanly and all 5 required env vars are present in all 3 environments.

</domain>

<decisions>
## Implementation Decisions

### User-Subscription Linkage
- **D-01:** The `subscriptions` table stores `clerkUserId: v.string()` directly — no reference to `v.id("users")`. Webhook processing writes `clerkUserId` straight from Stripe metadata without a cross-table lookup. All subsequent phases query subscriptions by `clerkUserId` index.
- **D-02:** Add a Convex index `by_clerkUserId` on the `subscriptions` table so lookups in Phase 2–6 are O(log n) without a full table scan.

### Environment Variables
- **D-03:** Phase 1 execution includes creating the two Stripe products in Stripe Dashboard **test mode** and capturing the real Price IDs (not placeholders). Both `STRIPE_PRO_PRICE_ID` and `STRIPE_TOPUP_PRICE_ID` must be real test-mode `price_xxx` values before Phase 1 is considered complete.
- **D-04:** Create `.env.example` in the repo root listing all required vars with inline comments explaining which are secret vs. public and which vary per environment. CONTEXT.md documents the 3-webhook-secret pattern (local CLI secret, staging secret, production secret).
- **D-05:** Required env vars:
  - `STRIPE_SECRET_KEY` — secret, server-only, per environment
  - `STRIPE_WEBHOOK_SECRET` — secret, server-only, **one per environment** (local CLI / staging / production = 3 distinct values)
  - `STRIPE_PRO_PRICE_ID` — can be shared across envs (test mode value) or per-env
  - `STRIPE_TOPUP_PRICE_ID` — same as above
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public, safe to expose in client code

### Clerk Middleware Exclusion
- **D-06:** Use the `isPublicRoute` pattern with `createRouteMatcher`. The middleware body becomes:
  ```ts
  const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
  const isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"]);

  export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req) && isProtectedRoute(req)) {
      await auth.protect();
    }
  });
  ```
  This is additive — existing `/dashboard` protection unchanged; webhook routes bypass Clerk auth entirely.

### Stub File Depth
- **D-07:** Stubs export named query/mutation/internalMutation functions with correct argument types and return type annotations, but throw a descriptive error in the body (e.g., `throw new Error("Not implemented — Phase 2")`). This ensures:
  - `convex dev` compiles cleanly (Phase 1 success criterion)
  - Phase 2 fills in implementations without schema surprises
  - Type contracts between phases are established in Phase 1
- **D-08:** `convex/subscriptions.ts` stubs to include: `getSubscription` (query by clerkUserId), `upsertSubscription` (internalMutation), `deleteSubscription` (internalMutation).
- **D-09:** `convex/aiCredits.ts` stubs to include: `getCredits` (query by clerkUserId), `deductCredit` (internalMutation, atomic), `resetCredits` (internalMutation), `addCredits` (internalMutation for top-up).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap
- `.planning/ROADMAP.md` — Phase 1 success criteria (5 items), table names, env var names
- `.planning/REQUIREMENTS.md` — Full traceability of which requirements belong to which phase; PLAN-05 (monthly quota value = 100) baked into aiCredits schema
- `.planning/PROJECT.md` — Key decisions table, constraints (Stripe webhook must be Next.js API route, not Convex HTTP action)

### Existing Codebase
- `convex/schema.ts` — Current schema to extend (users, roles, notes tables; naming conventions)
- `middleware.ts` — Existing Clerk middleware to patch (current: protects /dashboard only)
- `package.json` — Current dependencies; `stripe` and `@stripe/stripe-js` not yet installed

### Architecture Decisions (locked in STATE.md / PROJECT.md)
- clerkUserId in BOTH `session.metadata` AND `subscription_data.metadata` in Stripe Checkout session
- Webhook handler: Next.js API route at `/api/webhooks/stripe` (NOT a Convex HTTP action)
- Credits reset driven by `invoice.paid` webhook with `billing_reason === "subscription_cycle"` (NOT calendar cron)
- Credit deduction: single atomic Convex internalMutation (TOCTOU-safe)
- Free tier enforcement: server-side in Convex mutations (not client-side)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `convex/schema.ts` pattern: use `defineTable` + `defineSchema`, import `v` from `"convex/values"` — follow exact same pattern for 4 new tables
- `convex/notes.ts` mutation pattern: `mutation({ args: {...}, handler: async (ctx, args) => {...} })` — follow for stub function signatures

### Established Patterns
- Field naming: **camelCase** for table names (`aiCredits`, `creditTransactions`, `processedStripeEvents`), field names also camelCase (existing `childNotes`, `parentNote`, `tokenIdentifier`)
- Index naming: `by_token` pattern in users table → follow `by_clerkUserId`, `by_stripeEventId` pattern
- Auth: `tokenIdentifier` in users table is Clerk's JWT subject (format: `https://clerk.dev|user_xxx`) — distinct from `clerkUserId` (format: `user_xxx`)

### Integration Points
- New `subscriptions` table: referenced by Phase 2 webhook handler (writes), Phase 3 checkout (reads), Phase 4 enforcement (reads), Phase 6 settings (reads)
- New `aiCredits` table: referenced by Phase 2 reset logic, Phase 5 deduction/top-up, Phase 6 display
- Clerk middleware: must remain backward-compatible — `/dashboard` protection stays unchanged

### New Tables (4 total)
1. **subscriptions** — `clerkUserId`, `stripeCustomerId`, `stripeSubscriptionId`, `status` (`"active"|"canceled"|"past_due"`), `currentPeriodEnd`, `cancelAtPeriodEnd`; index: `by_clerkUserId`
2. **aiCredits** — `clerkUserId`, `balance` (number), `lastResetAt`; index: `by_clerkUserId`
3. **creditTransactions** — `clerkUserId`, `type` (`"deduction"|"topup"|"reset"`), `amount`, `createdAt`, `stripePaymentIntentId?`; index: `by_clerkUserId`
4. **processedStripeEvents** — `stripeEventId`, `processedAt`, `eventType`; index: `by_stripeEventId`

</code_context>

<specifics>
## Specific Ideas

- Pro quota value is **100 credits/month** — this is the `balance` initial value set when `aiCredits` row is created or reset
- Top-up amount is **50 credits** — hardcoded constant, not a table field
- The `processedStripeEvents` table stores `eventType` and `processedAt` in addition to `stripeEventId` to aid debugging (more than just an idempotency key)
- STATE.md blocker note: verify `billing_reason === "subscription_cycle"` field name at implementation time (Stripe has renamed fields before)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1 — Schema + Infrastructure Foundation*
*Context gathered: 2026-07-07*
