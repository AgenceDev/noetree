# Phase 2: Webhook Handler + Convex Internal Mutations - Research

**Researched:** 2026-07-08
**Domain:** Stripe webhook signature verification (Next.js App Router) + Convex action/internalMutation transactional dispatch
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `internalMutation`s (`upsertSubscription`, `deductCredit`, etc. from Phase 1) cannot be called from the public Convex client SDK directly. The Next.js webhook route calls a new **public Convex dispatcher `action`** instead, using the existing `NEXT_PUBLIC_CONVEX_URL` client — no admin/deploy key required.
- **D-02:** The dispatcher action is protected by a **shared secret argument**: a new server-only env var (e.g. `INTERNAL_WEBHOOK_SECRET`), set identically in the Next.js environment and the Convex environment (`npx convex env set`). The Next.js route passes it as an action argument after Stripe signature verification succeeds; the action rejects the call if it doesn't match. This is a **new required env var not covered in Phase 1's env var list** — planner must add it to `.env.example` and the 3-environment (local/staging/production) propagation.
- **D-03:** **One dispatcher action** handles all 5 event types via an internal switch/dispatch, rather than 5 separate public actions. Single auth check, single entry point — matches the phase goal's "single writer" framing.
- **D-04:** New file `convex/stripeWebhooks.ts` holds the dispatcher action. `convex/subscriptions.ts` and `convex/aiCredits.ts` (Phase 1 stubs) stay pure data-access modules — this phase fills in their real `internalMutation`/`query` bodies but does not add the dispatch/routing logic to them.
- **D-05 (rejected alternatives, for planner awareness):** Do NOT expose the Phase 1 internal mutations as public `mutation`s — this would reverse Phase 1's D-01/D-02/D-08/D-09 lock ("blocks direct client writes"). Do NOT re-verify the Stripe signature a second time inside Convex — redundant, and would require the Stripe secret key inside Convex's env too.
- **D-06:** `checkout.session.completed` resolves `clerkUserId` from `session.metadata.clerkUserId` (locked in Phase 1) — creates the initial `subscriptions` row.
- **D-07:** `customer.subscription.updated` / `customer.subscription.deleted` resolve `clerkUserId` from **`subscription.metadata.clerkUserId`** directly — no extra lookup. This works because Phase 1 already locked `clerkUserId` into `subscription_data.metadata` at checkout time, so every subsequent Subscription object echoes it back.
- **D-08:** `invoice.paid` / `invoice.payment_failed` do NOT carry `clerkUserId` in their own metadata. They resolve the target row by **looking up the existing `subscriptions` row via `stripeSubscriptionId`** (extracted from `invoice.subscription` / `invoice.parent.subscription_details.subscription`). This requires a **new Convex index**: add `by_stripeSubscriptionId` to the `subscriptions` table (schema addition on top of Phase 1's schema — planner must add this index in `convex/schema.ts`). Do not call the Stripe API to re-fetch the subscription (avoids an extra network round-trip and new failure mode).
- **D-09:** Once `clerkUserId` is resolved (via D-06/D-07/D-08), it is reused directly for all `aiCredits`/`creditTransactions` writes via the existing `by_clerkUserId` index (Phase 1). No new index needed on `aiCredits`.
- **D-10:** Bad Stripe signature → `400`, never `500` (locked by ROADMAP SC5, unchanged).
- **D-11:** Genuine processing failures (Convex unreachable, unhandled exception, malformed event body) → **`500`**. Stripe auto-retries on 5xx with exponential backoff for up to ~3 days, so transient failures self-heal without manual replay.
- **D-12:** When `clerkUserId`/subscription row cannot be resolved (stale metadata, no matching `stripeSubscriptionId`) → **log the anomaly server-side, return `200`**. Retrying won't fix missing/stale data, so returning 500 here would just cause Stripe to retry a request that can never succeed.
- **D-13:** Stripe event types outside the 5 handled ones → **acknowledge with `200`, no-op**. Standard webhook practice — avoids infinite Stripe retries for event types this endpoint was never going to handle.
- **D-14:** The `processedStripeEvents` check-and-mark happens in the **same atomic Convex mutation** as the state write (check by `stripeEventId` → if exists, return early → else write state change AND insert the `processedStripeEvents` row, all in one Convex transaction). Convex mutations are transactional by default, closing the race window between near-simultaneous duplicate deliveries. Do not split this into a separate read-then-write across two round-trips.
- **D-15:** If an event ID is already marked processed, the dispatcher **no-ops and returns `200`** (not an error) — this is Stripe's expected outcome for a replayed/retried event it already delivered successfully.

### Claude's Discretion

- Exact `resetCredits`/`deductCredit`/`addCredits` internalMutation argument shapes beyond `clerkUserId` (Phase 1 named the functions but not their full arg lists).
- Shared-secret comparison strictness (simple `!==` vs. constant-time compare) for `INTERNAL_WEBHOOK_SECRET` — no CONTEXT.md decision either way.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                              | Research Support                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PAY-03  | Stripe webhooks update subscription status in Convex in real time        | Pattern 1 (signature verification), Pattern 3 (action→mutation dispatch with atomic idempotency), Pattern 2 (invoice→subscription ID resolution), Validation Architecture test map rows 1-4 |
| CRED-01 | Pro user's monthly AI credits quota resets automatically on billing date | Pattern 2 (subscription ID resolution off `invoice.paid`), `billing_reason` verification (Summary), Validation Architecture test map row 5, Open Question 2 (`resetCredits` signature)      |

</phase_requirements>

## Summary

This phase wires a Next.js App Router route handler (`app/api/webhooks/stripe/route.ts`) to a single public Convex `action` (`convex/stripeWebhooks.ts`) that dispatches to `internalMutation`s in `convex/subscriptions.ts`/`convex/aiCredits.ts`. All three of CONTEXT.md's flagged open questions were resolved by inspecting the **installed** `stripe@22.3.0` package (pinned to Stripe API version `2026-06-24.dahlia`, confirmed in `node_modules/stripe/cjs/apiVersion.d.ts`) and official Convex docs fetched live in this session: (1) raw-body handling uses `await req.text()` directly — no Buffer conversion needed, `constructEvent`'s payload type is `string | Uint8Array`; (2) `billing_reason: 'subscription_cycle'` **is still valid** in the installed SDK's `BillingReason` union — the CONTEXT.md blocker is resolved, no rename occurred; (3) the installed SDK's `Invoice` interface has **no top-level `subscription` field at all** — only `invoice.parent.subscription_details.subscription` exists (confirmed by grepping the actual `.d.ts`, not training data) — CONTEXT.md's dual-form concern was correct to raise, and the answer is: use the `parent` form exclusively, the old top-level form does not exist in this codebase's installed version; (4) Convex actions are **not** transactional — only a single mutation call is. This means the `processedStripeEvents` check-and-write (D-14) **must** happen inside the same `internalMutation` that performs the state write, not as a separate `ctx.runQuery` check followed by a `ctx.runMutation` write from the action. This is a load-bearing architectural clarification not explicit in CONTEXT.md's D-03/D-04 split and is the single most important thing the planner must get right.

No new npm packages are required to ship the webhook feature itself (`stripe` 22.3.0 and Convex 1.40+ are already installed from Phase 1). A genuine gap exists in the test infrastructure: `jest` is installed as a devDependency but has zero config and the `test` npm script doesn't invoke it; Convex's official testing harness (`convex-test`) requires **Vitest**, not Jest. Wave 0 must add `vitest`, `convex-test`, and `@edge-runtime/vm`.

**Primary recommendation:** Build the idempotency check-and-write into each individual `internalMutation` (parameterized with `stripeEventId`/`eventType`), call exactly one `internalMutation` per dispatcher-action invocation via `ctx.runMutation`, and use `req.text()` + `stripe.webhooks.constructEvent()` unmodified in the route handler with `invoice.parent.subscription_details.subscription` for invoice-based subscription ID lookups.

## Architectural Responsibility Map

| Capability                                        | Primary Tier                                                 | Secondary Tier           | Rationale                                                                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe signature verification                     | API / Backend (Next.js Route Handler)                        | —                        | Requires raw body + `STRIPE_SECRET_KEY`/webhook secret; must happen before any Convex call. Locked by PROJECT.md constraint (Next.js route, not Convex HTTP action).                        |
| Shared-secret gate (`INTERNAL_WEBHOOK_SECRET`)    | API / Backend (Convex public action)                         | Next.js route (sends it) | Action is the trust boundary between the public internet-facing Next.js client SDK path and internal mutations; the secret proves the caller is the webhook route, not an arbitrary client. |
| Event dispatch / routing (switch on `event.type`) | API / Backend (Convex action)                                | —                        | D-03 locks this to one action; keeps `subscriptions.ts`/`aiCredits.ts` as pure data modules (D-04).                                                                                         |
| Idempotency check-and-mark                        | Database / Storage (Convex internalMutation)                 | —                        | Must be inside the same transaction as the state write (D-14) — only mutations are transactional in Convex, not actions.                                                                    |
| Subscription/credit state writes                  | Database / Storage (Convex internalMutation)                 | —                        | `internalMutation`s are the sole writers per phase goal; not reachable from public client SDK directly (D-01).                                                                              |
| Retry/failure semantics (200/400/500)             | API / Backend (Next.js route, reading action's return/throw) | —                        | HTTP status codes are an HTTP-layer concern; the route decides what to return based on whether signature verification, the shared-secret check, or the action threw.                        |

## Standard Stack

### Core

| Library  | Version                                            | Purpose                                                                                                   | Why Standard                                                                                                                            |
| -------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe` | 22.3.0 (installed, pinned API `2026-06-24.dahlia`) | Server-side Stripe SDK — `stripe.webhooks.constructEvent`, typed `Event`/`Invoice`/`Subscription` objects | Already installed Phase 1; official SDK, only supported way to verify Stripe webhook signatures [VERIFIED: package.json + node_modules] |
| `convex` | ^1.40.0 (installed; CLI 1.41.0 present)            | `action`/`internalMutation`/`internalQuery` builders, `ctx.runMutation`                                   | Already installed Phase 1; only backend in this project [VERIFIED: package.json + node_modules]                                         |

No new runtime packages are required for the webhook + mutation feature itself — both SDKs needed are already dependencies from Phase 1.

### Supporting (test infrastructure — Wave 0 gap, see Validation Architecture)

| Library            | Version                       | Purpose                                                 | When to Use                                                                                            |
| ------------------ | ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `vitest`           | 4.1.10 (latest, npm registry) | Test runner required by `convex-test`                   | Testing `internalMutation`/`action` logic (idempotency, credit reset, dispatch routing)                |
| `convex-test`      | 0.0.54 (latest, npm registry) | Official Convex mock-backend testing harness            | Simulating `ctx.db`/`ctx.runMutation` without a live deployment                                        |
| `@edge-runtime/vm` | 5.0.0 (latest, npm registry)  | Vitest environment matching Convex's V8-isolate runtime | Required peer for `convex-test`'s recommended `vitest.config.ts` `environment: "edge-runtime"` setting |

### Alternatives Considered

| Instead of                                                        | Could Use                                                          | Tradeoff                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest for Convex tests                                           | Jest (already installed, unconfigured)                             | Convex's official `convex-test` docs exclusively document Vitest + `@edge-runtime/vm`; Jest compatibility is undocumented and unverified — do not gamble phase-critical idempotency tests on an unsupported combination [CITED: docs.convex.dev/testing/convex-test] |
| Single combined internalMutation per event type doing check+write | Action calls `ctx.runQuery` (check) then `ctx.runMutation` (write) | Convex docs explicitly warn: "Multiple runQuery/runMutations execute in separate transactions and aren't guaranteed to be consistent with each other" — this reopens the exact race D-14 is designed to close [CITED: docs.convex.dev/functions/actions]             |
| `req.text()` raw body in Route Handler                            | `req.arrayBuffer()` → `Buffer.from(...)`                           | Both work (`WebhookPayload = string \| Uint8Array`); `req.text()` is simpler and is what current Next.js App Router tutorials use. Buffer conversion is a holdover from Pages Router `req` (Node.js `IncomingMessage`) patterns and is unnecessary here.             |

**Installation (Wave 0 only, if test gap is addressed):**

```bash
npm install --save-dev vitest convex-test @edge-runtime/vm
```

**Version verification:** All three versions above were confirmed live via `npm view <pkg> version` against the npm registry during this research session (2026-07-08), not from training data.

## Package Legitimacy Audit

> No new packages are required for the webhook/mutation feature itself. The audit below covers the 3 candidate **test-infrastructure** packages recommended in Validation Architecture (Wave 0), since they are new to this repo.

| Package            | Registry | Age/Popularity                                                          | Source Repo                       | slopcheck                                                               | Disposition                                                                                                                                                                                                                        |
| ------------------ | -------- | ----------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest`           | npm      | Extremely well-established (vitest-dev org, Vite ecosystem test runner) | github.com/vitest-dev/vitest      | `[SUS]` — flagged "suspiciously close to 'vite' — could be a typosquat" | **Approved, flagged as false positive** — `vitest` is a distinct, extremely widely-used package (not a typosquat of `vite`); slopcheck's name-similarity heuristic misfires here. Planner should still note the flag per protocol. |
| `convex-test`      | npm      | Official Convex org package                                             | github.com/get-convex/convex-test | `[OK]`                                                                  | Approved                                                                                                                                                                                                                           |
| `@edge-runtime/vm` | npm      | Vercel org package                                                      | github.com/vercel/edge-runtime    | `[OK]`                                                                  | Approved                                                                                                                                                                                                                           |

**Packages removed due to slopcheck `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** `vitest` — `` `vitest` [WARNING: slopcheck flagged as suspicious — name-similarity false positive against 'vite'; verified against npm registry (v4.1.10) and github.com/vitest-dev/vitest before recommending. Planner should still insert a lightweight `checkpoint:human-verify` before install per protocol, but this is a known, benign flag.] ``

slopcheck (v0.6.1) was successfully installed and run in this session — packages are NOT blanket-tagged `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
Stripe (test mode)
   │  POST with body + Stripe-Signature header
   ▼
Next.js Route Handler  app/api/webhooks/stripe/route.ts   (Node.js runtime, outside [locale], excluded from Clerk auth)
   │  1. rawBody = await req.text()
   │  2. signature = req.headers.get("stripe-signature")
   │  3. stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
   │       │
   │       ├─ throws (bad sig / bad env secret) ──────────────► return 400
   │       └─ event: Stripe.Event
   ▼
Convex client (NEXT_PUBLIC_CONVEX_URL, existing browser-facing client reused server-side)
   │  convex.action(api.stripeWebhooks.processWebhookEvent, { event, secret: INTERNAL_WEBHOOK_SECRET })
   ▼
convex/stripeWebhooks.ts — public `action` "processWebhookEvent"      (Convex V8 isolate runtime)
   │  1. if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) throw   → route catches → 400
   │  2. switch (args.event.type):
   │       checkout.session.completed        → ctx.runMutation(internal.subscriptions.upsertSubscription, {...})
   │       customer.subscription.updated     → ctx.runMutation(internal.subscriptions.upsertSubscription, {...})
   │       customer.subscription.deleted     → ctx.runMutation(internal.subscriptions.deleteSubscription, {...})
   │       invoice.paid (subscription_cycle) → ctx.runMutation(internal.aiCredits.resetCredits, {...})
   │       invoice.payment_failed            → ctx.runMutation(internal.subscriptions.markPastDue, {...}) (or upsert w/ status)
   │       else                              → no-op, fall through
   │  3. catches unresolvable clerkUserId anomalies from mutation → logs, returns normally (200 path, D-12)
   ▼
internalMutation (subscriptions.ts / aiCredits.ts)             ← SINGLE TRANSACTION, this is the atomicity boundary
   │  1. existing = ctx.db.query("processedStripeEvents").withIndex("by_stripeEventId", q => q.eq("stripeEventId", args.stripeEventId)).unique()
   │  2. if (existing) return { alreadyProcessed: true }     ← D-15 no-op
   │  3. else: ctx.db.insert/patch(<subscriptions|aiCredits|creditTransactions>, ...)
   │  4. ctx.db.insert("processedStripeEvents", { stripeEventId, processedAt: Date.now(), eventType })
   ▼
route.ts receives action's resolved value / catches thrown error
   │  success or D-12/D-13 no-op  → return 200
   │  genuine failure (Convex unreachable, unhandled exception) → return 500 (Stripe auto-retries)
   ▼
Response to Stripe
```

### Recommended Project Structure

```
app/
└── api/
    └── webhooks/
        └── stripe/
            └── route.ts        # NEW — raw-body read, signature verify, calls Convex action
convex/
├── schema.ts                   # MODIFY — add by_stripeSubscriptionId index to subscriptions
├── stripeWebhooks.ts           # NEW — public dispatcher `action`, D-02/D-03 shared-secret + switch
├── subscriptions.ts            # MODIFY (fill stubs) — upsertSubscription/deleteSubscription internalMutations
│                                #   now also own the processedStripeEvents check-and-insert (D-14)
└── aiCredits.ts                # MODIFY (fill stubs) — resetCredits/deductCredit/addCredits internalMutations
```

### Pattern 1: Raw body + signature verification in an App Router Route Handler

**What:** Read the body as text (not JSON) before any parsing, verify with the Stripe SDK, return 400 on any thrown error.
**When to use:** Always, for this exact route — App Router Route Handlers do not auto-parse bodies the way Pages Router API routes did, so no `bodyParser: false` config object is needed (that's a Pages-Router-only concept and does not apply here).
**Example:**

```typescript
// Source: pattern verified against installed stripe@22.3.0 Webhooks.d.ts
// (WebhookPayload = string | Uint8Array — req.text() output is directly compatible)
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    return new Response("Invalid signature", { status: 400 });
  }

  // ... hand off event to Convex action, see Pattern 3
}
```

### Pattern 2: Resolving the subscription ID off an `invoice.paid`/`invoice.payment_failed` event

**What:** The installed SDK's `Invoice` interface has **no top-level `subscription` field** — only `invoice.parent.subscription_details.subscription` exists (confirmed by direct inspection of `node_modules/stripe/cjs/resources/Invoices.d.ts`, not training data).
**When to use:** Any code touching `invoice.paid` / `invoice.payment_failed` in this codebase, given the pinned API version `2026-06-24.dahlia`.
**Example:**

```typescript
// Source: node_modules/stripe/cjs/resources/Invoices.d.ts lines 643-863 (installed, verified)
// Invoice.parent is `Parent | null`; Parent.subscription_details is `SubscriptionDetails | null`
// SubscriptionDetails.subscription is `string | Subscription`
const stripeSubscriptionId =
  typeof invoice.parent?.subscription_details?.subscription === "string"
    ? invoice.parent.subscription_details.subscription
    : invoice.parent?.subscription_details?.subscription?.id;

if (!stripeSubscriptionId) {
  // D-12: log anomaly, still return 200 upstream — no retry can fix missing data
}
```

**Do NOT** write `invoice.subscription` anywhere — that field does not exist on this SDK version's `Invoice` type and will be a silent `undefined` at runtime (TypeScript will also reject it at compile time, which is a useful guardrail).

### Pattern 3: Action → internalMutation with the idempotency check INSIDE the mutation

**What:** The check for `processedStripeEvents` and the state write happen in one `internalMutation` call, not split across the action.
**When to use:** Every one of the 5 handled event types — this is the concrete shape D-14 requires.
**Example:**

```typescript
// Source: pattern derived from docs.convex.dev/functions/actions (verified live, 2026-07-08):
// "Multiple runQuery / runMutations execute in separate transactions and aren't
//  guaranteed to be consistent with each other" — recommended fix is a single
//  internal mutation performing both the check and the write.

// convex/stripeWebhooks.ts
export const processWebhookEvent = action({
  args: { event: v.any(), secret: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
      throw new Error("Unauthorized"); // route.ts maps this to 400
    }
    switch (args.event.type) {
      case "checkout.session.completed":
        return await ctx.runMutation(
          internal.subscriptions.upsertSubscription,
          {
            stripeEventId: args.event.id,
            eventType: args.event.type,
            clerkUserId: args.event.data.object.metadata?.clerkUserId,
            // ...rest of subscription fields
          },
        );
      // ...other 4 event types
      default:
        return { skipped: true }; // D-13
    }
  },
});

// convex/subscriptions.ts — the mutation owns check+write atomically (D-14)
export const upsertSubscription = internalMutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    clerkUserId: v.optional(v.string()) /* ... */,
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_stripeEventId", q =>
        q.eq("stripeEventId", args.stripeEventId),
      )
      .unique();
    if (already) return { alreadyProcessed: true }; // D-15

    if (!args.clerkUserId) {
      // D-12: log, do NOT throw (throwing would surface as 500 upstream)
      return { anomaly: "missing clerkUserId" };
    }

    // ...ctx.db.insert / ctx.db.patch on "subscriptions" here...

    await ctx.db.insert("processedStripeEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});
```

### Anti-Patterns to Avoid

- **Checking idempotency via `ctx.runQuery` then writing via a separate `ctx.runMutation` from the action:** Reopens the exact race D-14 exists to close (Convex docs explicitly warn against this cross-call consistency assumption).
- **Re-verifying the Stripe signature inside Convex:** Rejected explicitly by D-05 — redundant and requires `STRIPE_SECRET_KEY` inside Convex's env too.
- **Using `invoice.subscription` (top-level field):** Does not exist on the installed SDK's `Invoice` type for this pinned API version — use `invoice.parent.subscription_details.subscription`.
- **Throwing inside a mutation for D-12 "unresolvable" cases:** A thrown error from a Convex mutation propagates back through the action and should map to a 500 at the route layer per D-11's genuine-failure semantics — but D-12 wants exactly these anomaly cases to return 200. Return a sentinel value (e.g. `{ anomaly: true }`) instead of throwing, and have `route.ts`/the action treat it as success.
- **Setting `export const runtime = "edge"` on the route handler:** Not required and adds risk — Node.js is the default Route Handler runtime and works fine with `stripe.webhooks.constructEvent`; only switch to edge if there's a separate reason, and if so use `constructEventAsync` (Web Crypto-based) instead of the sync `constructEvent`.

## Don't Hand-Roll

| Problem                        | Don't Build                                                                        | Use Instead                                                                                                                                                                                                                                       | Why                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook signature verification | Manual HMAC-SHA256 comparison of `Stripe-Signature` header                         | `stripe.webhooks.constructEvent()` / `constructEventAsync()`                                                                                                                                                                                      | Handles timestamp tolerance, multiple signature schemes, and replay-window logic already; hand-rolling this is a well-known source of security bugs.                                  |
| Idempotency ledger             | A custom in-memory or Redis-based dedup cache                                      | `processedStripeEvents` Convex table + `by_stripeEventId` index (already in schema from Phase 1)                                                                                                                                                  | Convex's transactional mutation guarantee gives exact-once semantics for free when check+write share one mutation call — no external dependency needed.                               |
| Shared-secret comparison       | Nothing needs building — but avoid naive early-exit `!==` if paranoid about timing | Simple `!==` string check is ASSUMED-acceptable here (see Assumptions Log A1) given HTTPS transport + short network round-trip; `crypto.timingSafeEqual` requires `"use node"` directive, which is unnecessary overhead for this internal secret. | Full constant-time comparison is a legitimate hardening step but not the standard/only correct approach here — this is genuinely Claude's/planner's discretion, not a hand-roll trap. |

**Key insight:** Every piece of "hard" cryptographic/idempotency logic in this phase is already provided by the Stripe SDK (signature verification) or Convex's transaction model (idempotency) — the only code to write is business logic (event → mutation mapping, ID resolution).

## Common Pitfalls

### Pitfall 1: Splitting the idempotency check from the state write across two Convex calls

**What goes wrong:** Dispatcher action calls `ctx.runQuery` to check `processedStripeEvents`, then separately calls `ctx.runMutation` to write state — a race window reopens between two near-simultaneous Stripe redeliveries.
**Why it happens:** D-03's "single dispatcher action" framing reads naturally as "the action does the checking," but actions cannot provide transactional guarantees across multiple calls.
**How to avoid:** Push the idempotency check-and-mark into the same `internalMutation` that performs the state write (see Pattern 3). The action only routes to the correct mutation; it does not itself check or write.
**Warning signs:** Any `ctx.runQuery(...)` inside `stripeWebhooks.ts` before a `ctx.runMutation(...)` call for the same event.

### Pitfall 2: Using `invoice.subscription` instead of `invoice.parent.subscription_details.subscription`

**What goes wrong:** TypeScript compile error (field doesn't exist) or, if using `any`/loosely-typed access, silent `undefined` at runtime, breaking `invoice.paid`/`invoice.payment_failed` handling entirely.
**Why it happens:** Many Stripe blog posts/tutorials (including some 2025-dated ones) still show the pre-API-rework `invoice.subscription` top-level field, since it existed on older Stripe API versions.
**How to avoid:** Use the installed SDK's own types as ground truth (`node_modules/stripe/cjs/resources/Invoices.d.ts`) rather than tutorials; TypeScript will catch this immediately if not using `any`.
**Warning signs:** `invoice.subscription` anywhere in code, or an `as any` cast suppressing a TS error on that access.

### Pitfall 3: Throwing on D-12 anomalies (unresolvable clerkUserId)

**What goes wrong:** A thrown error inside the `internalMutation` propagates up through `ctx.runMutation` in the action, which (if unhandled) surfaces as an uncaught action error → route.ts sees a rejected action call → returns 500 → Stripe retries a request that can never succeed (data is genuinely missing/stale, retrying doesn't fix it), violating D-12.
**Why it happens:** Bare-throw is the established codebase convention (Phase 1 `01-PATTERNS.md`) for "real" errors, which can bleed into anomaly-handling code by habit.
**How to avoid:** Distinguish "genuine infra failure" (throw → 500, correct) from "data anomaly, nothing to retry" (return a sentinel/log, don't throw → 200, per D-12). Keep this distinction explicit in code comments since the codebase's only precedent (bare-throw) doesn't itself encode this distinction.
**Warning signs:** A `throw` statement inside the "clerkUserId not found" branch of any mutation.

### Pitfall 4: Forgetting the `metadata` nullability difference between Checkout Session and Subscription

**What goes wrong:** `session.metadata` is typed `Metadata | null` (installed SDK), while `subscription.metadata` is typed non-nullable `Metadata`. Code that assumes both are equally safe to dot into (`session.metadata.clerkUserId` without a null check) will fail a TypeScript strict-null check on the session path only, and can NPE at runtime if `strict` is off.
**Why it happens:** Easy to copy-paste the same access pattern for both object types since they look symmetric in D-06/D-07.
**How to avoid:** Null-check `session.metadata` explicitly before reading `.clerkUserId`; `subscription.metadata` does not need the same guard per the installed type.
**Warning signs:** `session.metadata.clerkUserId` with no `?.` or prior null check.

### Pitfall 5: Testing Convex functions with Jest instead of Vitest

**What goes wrong:** `convex-test`'s documented setup (edge-runtime Vitest environment, `import.meta.glob`) does not translate directly to Jest, which has no built-in equivalent to `import.meta.glob` and a different module-mocking model.
**Why it happens:** Jest is already an installed devDependency (from an earlier, unrelated setup) with `jest-environment-jsdom`, making it the "obvious" choice to reach for.
**How to avoid:** Add Vitest fresh for Convex-side tests per official `convex-test` docs; don't force-fit onto the pre-existing (and currently unwired — no config, no working `test` script) Jest install.
**Warning signs:** Attempting `require("convex-test")` inside a `*.test.ts` run via `jest`.

## Code Examples

### `.env.example` addition (D-02)

```bash
# Source: pattern matches existing STRIPE_WEBHOOK_SECRET entry structure (Phase 1 .env.example)
# ── Internal shared secret: Next.js route → Convex dispatcher action authentication ──
# SECRET, server-only. Set identically in both environments:
#   Next.js:  add to .env.local / hosting provider env vars
#   Convex:   `npx convex env set INTERNAL_WEBHOOK_SECRET <value>`
# Generate with: openssl rand -hex 32
INTERNAL_WEBHOOK_SECRET=
```

### `convex/schema.ts` index addition (D-08)

```typescript
// Source: existing convex/schema.ts (read this session) — additive patch only
subscriptions: defineTable({
  clerkUserId: v.string(),
  stripeCustomerId: v.string(),
  stripeSubscriptionId: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("canceled"),
    v.literal("past_due"),
  ),
  currentPeriodEnd: v.number(),
  cancelAtPeriodEnd: v.boolean(),
})
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]), // NEW — D-08
```

## State of the Art

| Old Approach                                                       | Current Approach                                               | When Changed                                                                                                                     | Impact                                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invoice.subscription` (top-level string field)                    | `invoice.parent.subscription_details.subscription`             | Stripe's "Invoice with lines"/API rework — already fully in effect on the installed SDK's pinned API version `2026-06-24.dahlia` | All `invoice.paid`/`invoice.payment_failed` handling must use the nested `parent` path; the old field is entirely absent from this codebase's types, not just deprecated. |
| Pages Router `req`/`res` + `bodyParser: false` config for raw body | App Router Route Handler `Request` object + `await req.text()` | Next.js App Router (13+)                                                                                                         | No special config object needed; this project (Next 16.2.7) uses App Router exclusively — `bodyParser` config does not apply and should not be added.                     |

**Deprecated/outdated:** None specific to this phase beyond the invoice-shape change above; Stripe SDK 22.x and Convex 1.40.x are both current, actively maintained major versions.

## Assumptions Log

| #   | Claim                                                                                                                                                                                                  | Section                      | Risk if Wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | A simple `!==` string comparison is an acceptable way to check `INTERNAL_WEBHOOK_SECRET` in the Convex action (no constant-time comparison needed)                                                     | Don't Hand-Roll              | Low — this is a defense-in-depth secondary check behind Stripe's own signature verification and HTTPS transport; a timing side-channel here would still require an attacker able to make many precisely-timed network requests to a serverless/edge-distributed backend, which is a low-practicality attack. If the planner/user wants stricter guarantees, use `"use node"` + `crypto.timingSafeEqual` in `stripeWebhooks.ts` instead — no official Convex guidance exists either way. |
| A2  | `resetCredits`/`deductCredit`/`addCredits` internalMutation args beyond `clerkUserId` (e.g., whether `resetCredits` takes an explicit `amount: 100` or hardcodes it) are Claude's/planner's discretion | Code Examples / Architecture | Low — CONTEXT.md and Phase 1 stubs don't fully specify this; any reasonable choice satisfies ROADMAP SC3 ("resets ... to 100") as long as the value 100 appears somewhere traceable (env var, constant, or arg).                                                                                                                                                                                                                                                                        |

## Open Questions

1. **Does `customer.subscription.updated` need to change `aiCredits` state at all, or only `subscriptions`?**
   - What we know: D-07 covers `clerkUserId` resolution for subscription events; CRED-01 (monthly reset) is explicitly tied to `invoice.paid`/`subscription_cycle` (D-08), not to `subscription.updated`.
   - What's unclear: Whether a `subscription.updated` transition to `status: "canceled"` (e.g., via `customer.subscription.deleted` is the more common path for full cancellation, but `updated` can also carry `cancel_at_period_end: true`) needs any `aiCredits` side-effect.
   - Recommendation: Scope `customer.subscription.updated`/`customer.subscription.deleted` to `subscriptions` table writes only in this phase (matches D-09's "no new index needed on aiCredits" framing, which implies aiCredits writes are driven only by `invoice.paid` and the not-yet-built `CRED-04` deduction path from a later phase). Flag as confirmed scope in planning, not a blocker.

2. **Exact `resetCredits` mutation signature (amount as arg vs. hardcoded 100)**
   - What we know: Phase 1 stub signature is `resetCredits({ clerkUserId })` with no `amount` arg (unlike `deductCredit`/`addCredits`, which do take `amount`).
   - What's unclear: Whether "100" should be a hardcoded literal inside `resetCredits`, sourced from an env var, or passed as an arg by the caller (the dispatcher action) referencing a shared constant.
   - Recommendation: Hardcode `100` as a named constant inside `aiCredits.ts` (e.g., `const MONTHLY_CREDIT_QUOTA = 100`) matching the existing stub signature exactly (no arg-shape change needed) — lowest-risk option, matches Phase 1's locked stub. This is Assumption A2 above.

## Environment Availability

| Dependency                                    | Required By                                                                      | Available         | Version            | Fallback                                                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Node.js                                       | Next.js dev server, Convex CLI                                                   | ✓                 | v26.4.0            | —                                                                                                                                                                                                                                                                                    |
| npm                                           | package installs                                                                 | ✓                 | 11.17.0            | —                                                                                                                                                                                                                                                                                    |
| pnpm                                          | project's actual package manager (`pnpm-workspace.yaml` present)                 | ✓                 | 11.10.0            | —                                                                                                                                                                                                                                                                                    |
| Stripe CLI (`stripe`)                         | ROADMAP SC1/SC2 manual verification (`stripe listen --forward-to`, event replay) | ✓                 | 1.43.6             | —                                                                                                                                                                                                                                                                                    |
| Convex CLI (`npx convex`)                     | `npx convex dev`, `npx convex env set INTERNAL_WEBHOOK_SECRET`                   | ✓                 | 1.41.0             | —                                                                                                                                                                                                                                                                                    |
| `stripe` npm package                          | webhook signature verification, typed Event/Invoice objects                      | ✓                 | 22.3.0 (installed) | —                                                                                                                                                                                                                                                                                    |
| `vitest` / `convex-test` / `@edge-runtime/vm` | Wave 0 test infrastructure gap                                                   | ✗ (not installed) | —                  | Manual verification via `stripe listen`/`stripe trigger` against local dev server substitutes for automated tests if Wave 0 install is descoped, but automated tests are strongly preferred for the idempotency/credit-reset logic given ROADMAP SC2/SC3 are exact-state assertions. |

**Missing dependencies with no fallback:** none — all blocking tools are present.
**Missing dependencies with fallback:** `vitest`/`convex-test`/`@edge-runtime/vm` — manual `stripe trigger`/`stripe listen` verification is a viable (if weaker) fallback per ROADMAP's own success-criteria wording, which already specifies manual CLI verification for SC1.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | None currently wired (Jest installed as devDependency but unconfigured; no `jest.config.*`; `package.json`'s `"test"` script only runs `prettier --write` + `eslint --fix`, not a test runner). Recommend: **Vitest** (new), per `convex-test`'s official requirement. |
| Config file        | none — see Wave 0                                                                                                                                                                                                                                                      |
| Quick run command  | `npx vitest run convex/` (after Wave 0 setup)                                                                                                                                                                                                                          |
| Full suite command | `npx vitest run` (after Wave 0 setup)                                                                                                                                                                                                                                  |

### Phase Requirements → Test Map

| Req ID         | Behavior                                                                                   | Test Type                                            | Automated Command                                                                                                                             | File Exists?                                              |
| -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| PAY-03         | `checkout.session.completed` creates a `subscriptions` row with correct `clerkUserId`      | unit (convex-test)                                   | `npx vitest run convex/subscriptions.test.ts -t "checkout.session.completed"`                                                                 | ❌ Wave 0                                                 |
| PAY-03         | Replaying the same event id produces no duplicate row                                      | unit (convex-test)                                   | `npx vitest run convex/subscriptions.test.ts -t "idempotent replay"`                                                                          | ❌ Wave 0                                                 |
| PAY-03         | Webhook route returns 400 on invalid signature / wrong secret, never 500                   | integration (route handler, mocked Stripe signature) | `npx vitest run app/api/webhooks/stripe/route.test.ts`                                                                                        | ❌ Wave 0                                                 |
| PAY-03         | All 5 event types + unhandled types return 200                                             | integration                                          | `npx vitest run app/api/webhooks/stripe/route.test.ts -t "event type dispatch"`                                                               | ❌ Wave 0                                                 |
| CRED-01        | `invoice.paid` with `billing_reason: subscription_cycle` resets `aiCredits.balance` to 100 | unit (convex-test)                                   | `npx vitest run convex/aiCredits.test.ts -t "subscription_cycle reset"`                                                                       | ❌ Wave 0                                                 |
| PAY-03/CRED-01 | Manual end-to-end smoke test                                                               | manual-only                                          | `stripe listen --forward-to localhost:3000/api/webhooks/stripe` + `stripe trigger checkout.session.completed` / `stripe trigger invoice.paid` | n/a — ROADMAP SC1/SC3 explicitly specify this manual path |

### Sampling Rate

- **Per task commit:** `npx vitest run convex/` (after Wave 0)
- **Per wave merge:** `npx vitest run` (full suite) + one manual `stripe listen`/`stripe trigger` pass per ROADMAP SC1
- **Phase gate:** Full suite green + manual Stripe CLI verification of all 5 event types before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `vitest.config.ts` — `environment: "edge-runtime"` per `convex-test` docs, install `vitest` + `convex-test` + `@edge-runtime/vm`
- [ ] `convex/subscriptions.test.ts` — covers PAY-03 (row creation, idempotent replay, D-12 anomaly no-throw)
- [ ] `convex/aiCredits.test.ts` — covers CRED-01 (subscription_cycle reset to 100)
- [ ] `app/api/webhooks/stripe/route.test.ts` — covers PAY-03 signature verification (400 on bad sig, 400 on wrong shared secret, 200 across all 5 + unhandled event types)
- [ ] Framework install: `npm install --save-dev vitest convex-test @edge-runtime/vm`

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies                               | Standard Control                                                                                                                                                                                  |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes (webhook-specific, not user auth) | Stripe signature verification (`constructEvent`) is the authentication mechanism for this endpoint, not Clerk — `middleware.ts` already excludes this route from Clerk (Phase 1 D-06).            |
| V3 Session Management | no                                    | No session state involved; each webhook delivery is independent.                                                                                                                                  |
| V4 Access Control     | yes                                   | Shared-secret gate (`INTERNAL_WEBHOOK_SECRET`) on the Convex action prevents arbitrary clients from invoking the public action directly, even though it's reachable via `NEXT_PUBLIC_CONVEX_URL`. |
| V5 Input Validation   | yes                                   | Convex `v.*` argument validators on every `internalMutation`/`action` (established Phase 1 pattern) enforce shape server-side automatically.                                                      |
| V6 Cryptography       | yes                                   | Signature verification delegated entirely to `stripe.webhooks.constructEvent` — never hand-roll HMAC comparison (see Don't Hand-Roll).                                                            |

### Known Threat Patterns for this stack

| Pattern                                                                             | STRIDE                                                 | Standard Mitigation                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Forged webhook payload (no real Stripe origin)                                      | Spoofing                                               | `stripe.webhooks.constructEvent` signature check → 400 on failure (D-10)                                                                                               |
| Replayed legitimate webhook (duplicate delivery)                                    | — (integrity/idempotency, not classic STRIDE spoofing) | `processedStripeEvents` check-and-mark inside the same mutation as the write (D-14/D-15)                                                                               |
| Direct client call to the public Convex action bypassing the Next.js route entirely | Elevation of Privilege                                 | `INTERNAL_WEBHOOK_SECRET` shared-secret check inside the action (D-02) — action is reachable via `NEXT_PUBLIC_CONVEX_URL` from any client, so this is the only barrier |
| Timing attack against the shared-secret comparison                                  | Information Disclosure                                 | Accepted risk per Assumption A1 (simple `!==`); use `crypto.timingSafeEqual` under `"use node"` if stricter guarantee desired                                          |

## Sources

### Primary (HIGH confidence)

- `node_modules/stripe/cjs/apiVersion.d.ts` — installed API version pin `2026-06-24.dahlia`
- `node_modules/stripe/cjs/resources/Invoices.d.ts` — `Invoice`/`Parent`/`SubscriptionDetails`/`BillingReason` type definitions (verified `subscription_cycle` present, verified `invoice.subscription` absent, verified `invoice.parent.subscription_details.subscription` path)
- `node_modules/stripe/cjs/resources/Events.d.ts` — verified all 5 handled event type literals exist
- `node_modules/stripe/cjs/resources/Subscriptions.d.ts` — verified `metadata: Metadata` (non-nullable)
- `node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts` — verified `metadata: Metadata | null` (nullable)
- `node_modules/stripe/cjs/Webhooks.d.ts` — `WebhookPayload = string | Uint8Array`, `constructEvent`/`constructEventAsync` signatures
- `node_modules/convex/dist/esm-types/server/registration.d.ts` — `runMutation`/`runQuery` on `ActionCtx`
- `convex/schema.ts`, `convex/subscriptions.ts`, `convex/aiCredits.ts`, `middleware.ts`, `.env.example` — current repo state (read this session)
- https://docs.convex.dev/functions/actions (fetched live, 2026-07-08) — actions not transactional, `runMutation`/`runQuery` separate transactions, recommended single-mutation check+write pattern
- https://docs.convex.dev/functions/mutation-functions (fetched live, 2026-07-08) — mutations are transactional, all-or-nothing writes
- https://docs.convex.dev/testing/convex-test (fetched live, 2026-07-08) — Vitest + `@edge-runtime/vm` requirement, no Jest support documented
- https://docs.stripe.com/webhooks (fetched live, 2026-07-08) — idempotency-by-event-id recommendation, always-return-2xx guidance, retry semantics
- npm registry (`npm view`) — `vitest@4.1.10`, `convex-test@0.0.54`, `@edge-runtime/vm@5.0.0` versions confirmed live

### Secondary (MEDIUM confidence)

- WebSearch results on Next.js App Router `req.text()` pattern (cross-referenced across multiple 2025-2026-dated tutorials, consistent with the installed SDK's `WebhookPayload` type)

### Tertiary (LOW confidence)

- None used as a basis for any recommendation in this document.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — both core libraries already installed and version-confirmed directly from `node_modules`/`package.json`, no training-data guessing involved
- Architecture: HIGH — the action/mutation transactionality boundary was verified against live official Convex docs fetched in this session, not asserted from training data
- Pitfalls: HIGH — every pitfall traces to either an installed type definition or a live-fetched doc quote

**Research date:** 2026-07-08
**Valid until:** 30 days (stable SDKs; re-verify `stripe`'s pinned `ApiVersion` constant if `package.json`'s `stripe` version bumps before implementation, since Stripe API versions change field shapes)
