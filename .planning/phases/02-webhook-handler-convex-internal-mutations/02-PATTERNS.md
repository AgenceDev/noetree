# Phase 2: Webhook Handler + Convex Internal Mutations - Pattern Map

**Mapped:** 2026-07-08
**Files analyzed:** 11 (2 new core, 3 modified, 1 modified-elsewhere-confirmed-noop, 4 new test infra, 1 config)
**Analogs found:** 7 / 11 (4 test-infra files have no in-repo analog — greenfield per RESEARCH.md)

## File Classification

| New/Modified File                                          | Role                                        | Data Flow                              | Closest Analog                                                                                       | Match Quality                                             |
| ---------------------------------------------------------- | ------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `app/api/webhooks/stripe/route.ts` (NEW)                   | route (Next.js Route Handler)               | request-response                       | none in repo                                                                                         | no analog — use RESEARCH.md Pattern 1 verbatim            |
| `convex/stripeWebhooks.ts` (NEW)                           | service (Convex `action`, dispatcher)       | event-driven                           | `convex/subscriptions.ts` / `convex/aiCredits.ts` (Phase 1 stub shape) + RESEARCH.md Pattern 3       | role-match, composite                                     |
| `convex/subscriptions.ts` (MODIFY — fill stubs)            | service (Convex `internalMutation`/`query`) | CRUD + event-driven (idempotent write) | `convex/notes.ts` (mutation/query shape), `convex/users.ts` (`withIndex` + upsert-by-lookup pattern) | role-match, strong                                        |
| `convex/aiCredits.ts` (MODIFY — fill stubs)                | service (Convex `internalMutation`/`query`) | CRUD + event-driven (idempotent write) | `convex/notes.ts` (mutation/query shape), `convex/users.ts` (`withIndex` + upsert pattern)           | role-match, strong                                        |
| `convex/schema.ts` (MODIFY — add index)                    | model/config                                | CRUD (table definitions)               | `convex/schema.ts` itself (existing `subscriptions.index("by_clerkUserId", ...)` chain)              | exact — extend in place                                   |
| `.env.example` (MODIFY — add var)                          | config                                      | n/a                                    | `.env.example` itself (existing `STRIPE_WEBHOOK_SECRET` block)                                       | exact — extend in place                                   |
| `proxy.ts` (Phase 1 already excludes `/api/webhooks/(.*)`) | middleware                                  | request-response                       | `proxy.ts` itself                                                                                    | exact — **no change needed this phase**, verify only      |
| `vitest.config.ts` (NEW, Wave 0)                           | config (test)                               | n/a                                    | none in repo                                                                                         | no analog — use RESEARCH.md template + `convex-test` docs |
| `convex/subscriptions.test.ts` (NEW, Wave 0)               | test                                        | CRUD/event-driven                      | none in repo                                                                                         | no analog — greenfield, `convex-test` harness             |
| `convex/aiCredits.test.ts` (NEW, Wave 0)                   | test                                        | CRUD/event-driven                      | none in repo                                                                                         | no analog — greenfield, `convex-test` harness             |
| `app/api/webhooks/stripe/route.test.ts` (NEW, Wave 0)      | test                                        | request-response                       | none in repo                                                                                         | no analog — greenfield                                    |

**Naming/path correction vs. CONTEXT.md prompt:** the Next.js middleware file in this repo is `proxy.ts` at the project root, not `middleware.ts` (renamed in a prior commit, `939846b "replace middleware file with proxy file"`). It **already** contains `isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"])` gating logic (lines 11, 13-14) plus `next-intl` routing that explicitly skips `/api` (lines 16-19, `if (req.nextUrl.pathname.startsWith("/api")) return;`). **No changes to `proxy.ts` are required for this phase** — confirmed by direct read, matches CONTEXT.md's "no changes needed" note (just under the old `middleware.ts` filename).

## Pattern Assignments

### `app/api/webhooks/stripe/route.ts` (route, request-response) — NEW, no analog

**No existing API route in this repo** — `app/` only contains `app/[locale]/...` pages and `app/globals.css`/`app/favicon.ico` (confirmed via `Glob("app/**")`). This is the first file under `app/api/`. Build entirely from RESEARCH.md Pattern 1 (raw-body read) + Pattern 3 (action dispatch), reproduced here as the canonical source since there is nothing else to copy from:

**Imports + signature-verification core pattern** (source: RESEARCH.md Pattern 1, verified against installed `stripe@22.3.0` `Webhooks.d.ts`):

```typescript
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

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
    return new Response("Invalid signature", { status: 400 }); // D-10
  }

  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    await convex.action(api.stripeWebhooks.processWebhookEvent, {
      event,
      secret: process.env.INTERNAL_WEBHOOK_SECRET!,
    });
    return new Response(null, { status: 200 }); // D-11 success / D-12 / D-13 all map to 200
  } catch (err) {
    // Distinguish D-02 auth rejection (map to 400) from genuine failure (map to 500, D-11)
    return new Response("Webhook processing failed", { status: 500 });
  }
}
```

**Convex client instantiation note:** `providers/ConvexClientProvider.tsx` (lines 13-18) shows the existing **client-side** `ConvexReactClient` pattern (`"use client"`, browser-only). This is NOT reusable server-side. The route handler must instead use `ConvexHttpClient` from `convex/browser` (server-safe, no React dependency) — same `NEXT_PUBLIC_CONVEX_URL` env var, different client class. This is a new-but-standard Convex pattern (no in-repo precedent), sourced from Convex docs per RESEARCH.md D-01.

**Runtime note (RESEARCH.md anti-pattern):** do NOT add `export const runtime = "edge"` — Node.js is the App Router default and works fine with `stripe.webhooks.constructEvent` (sync). No existing route in this repo sets a runtime override to contradict this.

**Status-code mapping requirement (D-10/D-11/D-12/D-13):** the action's own internal distinction between "unauthorized" (bad shared secret, should surface as 400-equivalent) vs. "genuine failure" (should surface as 500) is not naturally exposed via `ConvexHttpClient.action()`'s thrown-error shape — planner must design an explicit signal (e.g., a typed error class thrown by the action for the secret-mismatch case, checked via `err.message` or `err instanceof ConvexError` in the route's catch block) since there is no existing error-classification convention in this codebase to reuse.

---

### `convex/stripeWebhooks.ts` (service, event-driven) — NEW

**Analog (shape/imports/validator convention):** `convex/subscriptions.ts` / `convex/aiCredits.ts` (Phase 1 stub files, current full content read this session — reproduced above in `convex/subscriptions.ts` lines 1-34, `convex/aiCredits.ts` lines 1-30)

**Imports pattern to follow** (source: `convex/subscriptions.ts` lines 1-2, adapted for `action` + cross-module `internal.*` calls):

```typescript
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
```

Confirmed available: `convex/_generated/server.d.ts` line 75 (`export declare const action: ActionBuilder<DataModel, "public">`) and `convex/_generated/api.d.ts` line 52 (`export declare const internal: FilterApi<...>`) — both already generated, no codegen changes needed for this phase.

**Core dispatch pattern** (source: RESEARCH.md Pattern 3, this is a wholly new pattern for the codebase — no prior `action` exists anywhere in `convex/*.ts`):

```typescript
export const processWebhookEvent = action({
  args: { event: v.any(), secret: v.string() },
  handler: async (ctx, args) => {
    if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
      throw new Error("Unauthorized"); // D-02 — route.ts must map this to 400
    }
    switch (args.event.type) {
      case "checkout.session.completed":
        return await ctx.runMutation(internal.subscriptions.upsertSubscription, {
          stripeEventId: args.event.id,
          eventType: args.event.type,
          clerkUserId: args.event.data.object.metadata?.clerkUserId, // D-06, nullable per Pitfall 4
          // ...rest of subscription fields off args.event.data.object
        });
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        // D-07: subscription.metadata is non-nullable — no `?.` guard needed here (Pitfall 4)
        return await ctx.runMutation(/* internal.subscriptions.upsertSubscription or deleteSubscription */, {
          clerkUserId: args.event.data.object.metadata.clerkUserId,
          // ...
        });
      case "invoice.paid":
      case "invoice.payment_failed": {
        // D-08 — use the nested parent path exclusively, see Pattern 2 excerpt below
        const invoice = args.event.data.object;
        const stripeSubscriptionId =
          typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
        return await ctx.runMutation(/* internal.aiCredits.resetCredits or internal.subscriptions.markPastDue */, {
          stripeSubscriptionId,
          stripeEventId: args.event.id,
          eventType: args.event.type,
        });
      }
      default:
        return { skipped: true }; // D-13 — unhandled event types, 200 no-op
    }
  },
});
```

**Do NOT copy `.filter()`-based lookups anywhere in this dispatcher or the mutations it calls** — `convex/notes.ts` line 758 (`duplicateNote`'s title-uniqueness check) and `convex/helpers/helper.ts` line 13 (`getUser`'s `.filter(q => q.eq(q.field("tokenIdentifier"), ...))`) both use `.filter()` on non-indexed lookups; these are pre-existing but NOT the pattern to extend — Phase 1's `01-PATTERNS.md` already flagged this and locked `withIndex` as the required approach for all new lookups (D-08's new `by_stripeSubscriptionId` index exists specifically to enable an indexed, not filtered, lookup).

**Error-classification requirement carried from route.ts:** the `throw new Error("Unauthorized")` above must be distinguishable from a genuine infra failure once it crosses the `ConvexHttpClient.action()` boundary back in `route.ts` — no existing convention for this in the codebase (Phase 1's bare-throw convention doesn't itself encode an error-type taxonomy). Planner should pick one lightweight mechanism (e.g., a distinct error message string checked via `.includes("Unauthorized")`, or Convex's built-in `ConvexError` with a structured `data` payload) and apply it consistently.

---

### `convex/subscriptions.ts` (service, CRUD + event-driven) — MODIFY (fill Phase 1 stubs)

**Current full content** (read this session, `convex/subscriptions.ts` lines 1-34 — reproduced in File Classification section context above): 3 stub functions (`getSubscription` query, `upsertSubscription`/`deleteSubscription` internalMutations), each currently `throw new Error("Not implemented — Phase 2")`.

**Analog for the real `withIndex` lookup body:** `convex/users.ts` `store` mutation, lines 18-23 (existing upsert-by-lookup pattern — the closest in-repo precedent for "look up by index, then insert-or-patch"):

```typescript
// convex/users.ts lines 18-23
const user = await ctx.db
  .query("users")
  .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
  .unique();
if (user !== null) {
  await ctx.db.patch(user._id, {
    /* ...fields... */
  });
  return user._id;
}
// else ctx.db.insert(...)
```

Translate directly for `upsertSubscription`: `ctx.db.query("subscriptions").withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId)).unique()` → `patch` if found, `insert` if not (D-06/D-07 both funnel into this same upsert body once `clerkUserId` is resolved).

**New indexed lookup required for `invoice.*` events (D-08)** — no in-repo precedent for a _second_ distinct index lookup key on the same table; follow the identical `withIndex` idiom against the new `by_stripeSubscriptionId` index (added to `convex/schema.ts` this phase):

```typescript
const existing = await ctx.db
  .query("subscriptions")
  .withIndex("by_stripeSubscriptionId", q =>
    q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
  )
  .unique();
```

**Idempotency check-and-mark pattern (D-14/D-15) — NEW, no in-repo precedent.** Source verbatim from RESEARCH.md Pattern 3 (`convex/subscriptions.ts` target shape):

```typescript
export const upsertSubscription = internalMutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    clerkUserId: v.optional(v.string()),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_stripeEventId", q =>
        q.eq("stripeEventId", args.stripeEventId),
      )
      .unique();
    if (already) return { alreadyProcessed: true }; // D-15 — no-op, NOT an error

    if (!args.clerkUserId) {
      console.error(
        "upsertSubscription: unresolvable clerkUserId",
        args.stripeEventId,
      );
      return { anomaly: "missing clerkUserId" }; // D-12 — return, do NOT throw (Pitfall 3)
    }

    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId!))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        /* ...status/currentPeriodEnd/etc... */
      });
    } else {
      await ctx.db.insert("subscriptions", {
        /* ...clerkUserId, stripeCustomerId, etc... */
      });
    }

    await ctx.db.insert("processedStripeEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});
```

**Error handling pattern to preserve:** bare-throw for genuine errors (matches Phase 1's `01-PATTERNS.md` convention, sourced from `convex/notes.ts` lines 151/159/164 `throw new Error(...)` and `convex/helpers/helper.ts` — no try/catch wrapping). **Critically, this convention must NOT be applied to D-12 anomaly cases** — those return a sentinel object instead of throwing (Pitfall 3, explicit deviation from the otherwise-universal bare-throw convention).

---

### `convex/aiCredits.ts` (service, CRUD + event-driven) — MODIFY (fill Phase 1 stubs)

**Current full content** (read this session, `convex/aiCredits.ts` lines 1-30): 4 stub functions (`getCredits` query, `deductCredit`/`resetCredits`/`addCredits` internalMutations).

**Same analog and idempotency pattern as `convex/subscriptions.ts` above** — `resetCredits` is the one called from `invoice.paid`/`subscription_cycle` (CRED-01) and must embed the identical check-and-mark-in-same-mutation shape:

```typescript
const MONTHLY_CREDIT_QUOTA = 100; // RESEARCH.md Open Question 2 recommendation — named constant, no arg-shape change from Phase 1 stub

export const resetCredits = internalMutation({
  args: {
    clerkUserId: v.string(),
    stripeEventId: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const already = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_stripeEventId", q =>
        q.eq("stripeEventId", args.stripeEventId),
      )
      .unique();
    if (already) return { alreadyProcessed: true };

    const credits = await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
    if (credits) {
      await ctx.db.patch(credits._id, {
        balance: MONTHLY_CREDIT_QUOTA,
        lastResetAt: Date.now(),
      });
    } else {
      await ctx.db.insert("aiCredits", {
        clerkUserId: args.clerkUserId,
        balance: MONTHLY_CREDIT_QUOTA,
        lastResetAt: Date.now(),
      });
    }

    await ctx.db.insert("creditTransactions", {
      clerkUserId: args.clerkUserId,
      type: "reset",
      amount: MONTHLY_CREDIT_QUOTA,
      createdAt: Date.now(),
    });

    await ctx.db.insert("processedStripeEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});
```

**`billing_reason` gate note (D-08/STATE.md blocker, now resolved per RESEARCH.md):** the dispatcher (`convex/stripeWebhooks.ts`), not this file, is responsible for checking `event.data.object.billing_reason === "subscription_cycle"` before routing to `resetCredits` — confirmed still valid in installed `stripe@22.3.0`'s `BillingReason` union (RESEARCH.md Summary). No in-repo precedent for this specific field check; treat as a plain equality guard in the dispatcher's `invoice.paid` case.

---

### `convex/schema.ts` (model/config, CRUD) — MODIFY (add index only)

**Analog:** `convex/schema.ts` itself, current `subscriptions` table definition (lines 40-51, read this session):

```typescript
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
}).index("by_clerkUserId", ["clerkUserId"]),
```

**Required patch (D-08)** — add `.index("by_stripeSubscriptionId", ["stripeSubscriptionId"])` as a second chained `.index(...)` call, following the exact multi-index chaining convention already established elsewhere in this same file for the `users` table (lines 18-20: `.index("by_token", [...]).index("by_email", [...])`) and the `shares` table (lines 84-89, 5 chained indexes):

```typescript
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

No other tables in this schema need changes this phase (`aiCredits`, `creditTransactions`, `processedStripeEvents` keep their existing single `by_clerkUserId`/`by_stripeEventId` indexes from Phase 1, per D-09's "no new index needed on aiCredits").

---

### `.env.example` (config, n/a) — MODIFY (add one var)

**Analog:** `.env.example` itself, current `STRIPE_WEBHOOK_SECRET` block (lines 5-8, read this session):

```bash
# Stripe webhook signing secret — SECRET, server-only. DISTINCT value per environment.
# Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
# Staging/production: Stripe Dashboard -> Webhooks -> [endpoint] -> Signing secret.
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

**Patch to add** (D-02), following the exact same 2-3-line-comment-then-`KEY=placeholder` convention used for every existing entry in this file:

```bash
# Internal shared secret — Next.js webhook route to Convex dispatcher action auth.
# SECRET, server-only. Set identically in both places:
#   Next.js:  add to .env.local / hosting provider env vars.
#   Convex:   `npx convex env set INTERNAL_WEBHOOK_SECRET <value>`.
# Generate with: openssl rand -hex 32
INTERNAL_WEBHOOK_SECRET=
```

Insert after the existing `STRIPE_WEBHOOK_SECRET` block (line 8) and before the `STRIPE_PRO_PRICE_ID`/`STRIPE_TOPUP_PRICE_ID` block (lines 10-12) — keeps all Stripe-webhook-adjacent secrets grouped together, matching the file's existing topic-grouping convention (Stripe secret key → webhook secret → price IDs → publishable key).

---

### `proxy.ts` — NO CHANGE THIS PHASE (verification only)

**Full current content** (read this session, all 30 lines) confirms `isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"])` (line 11) already gates the webhook path out of `auth.protect()` (line 13), and the `next-intl` middleware is separately short-circuited for all `/api` paths (lines 16-19). Both requirements from CONTEXT.md's canonical refs ("`middleware.ts` already excludes `/api/webhooks/(.*)`") are satisfied by the current `proxy.ts` — no diff needed. Planner should note the file is named `proxy.ts`, not `middleware.ts`, when referencing it in plans.

---

### Test infrastructure files (Wave 0) — all NEW, no in-repo analog

`vitest.config.ts`, `convex/subscriptions.test.ts`, `convex/aiCredits.test.ts`, `app/api/webhooks/stripe/route.test.ts` — confirmed via `Glob("**/*.test.ts")` (excluding `node_modules`) that **zero test files exist anywhere in this repo currently**; `jest`/`jest-environment-jsdom` are installed devDependencies but have no config file and the `"test"` npm script (`package.json` line 12: `"prettier --write . && eslint app/ --fix"`) never invokes a test runner at all. This is a from-scratch setup, not a pattern-copy situation — follow RESEARCH.md's Wave 0 section and official `convex-test` docs verbatim:

```bash
npm install --save-dev vitest convex-test @edge-runtime/vm
```

```typescript
// vitest.config.ts — source: RESEARCH.md / docs.convex.dev/testing/convex-test (no in-repo precedent)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

**`package.json` note:** the existing `"test"` script (line 12) is a lint/format wrapper, not a test runner — planner must decide whether to add a new script key (e.g., `"test:unit": "vitest run"`) rather than overload the existing `"test"` name, since that name already has an established, unrelated meaning in this repo's CI/husky hooks (`husky`/`lint-staged` config at `package.json` lines 98-105 references `eslint --fix`/`prettier --write`, not tests).

## Shared Patterns

### Convex validator style (`v.*` from `"convex/values"`)

**Source:** `convex/schema.ts` lines 1-2; every `args: {...}` block in `convex/notes.ts`, `convex/subscriptions.ts`, `convex/aiCredits.ts`
**Apply to:** All new/modified Convex files this phase (`stripeWebhooks.ts`, `subscriptions.ts`, `aiCredits.ts`, `schema.ts`)

```typescript
import { v } from "convex/values";
// v.string(), v.number(), v.boolean(), v.optional(v.string()), v.any() (for the raw Stripe event payload),
// v.union(v.literal("a"), v.literal("b")) for enums — established in Phase 1, no change this phase
```

### Indexed-query lookup (`withIndex`, never `.filter()` for new lookups)

**Source:** `convex/users.ts` lines 18-23 (`by_token`), `convex/notes.ts` lines 194-195/276-280/359 (`by_parent`/`by_owner` — many precedents)
**Apply to:** All `by_clerkUserId` and the new `by_stripeSubscriptionId`/`by_stripeEventId` lookups in `subscriptions.ts`/`aiCredits.ts`

```typescript
await ctx.db
  .query("subscriptions")
  .withIndex("by_stripeSubscriptionId", q =>
    q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
  )
  .unique();
```

### Bare-throw for genuine errors; sentinel-return for expected/anomaly outcomes (NEW distinction this phase)

**Source (bare-throw half):** `convex/notes.ts` lines 151, 159, 164, 645, 855, 859 — universal in this codebase
**Source (sentinel-return half):** no in-repo precedent — sourced from RESEARCH.md Pitfall 3 / D-12/D-15
**Apply to:** `upsertSubscription`, `deleteSubscription`, `resetCredits`, and any other event-mutation — genuine infra errors still bare-throw (propagates to action → route → 500 per D-11); D-12 (unresolvable clerkUserId) and D-15 (already-processed replay) must instead `return { ...sentinel }` so the route can still return 200.

### `internalMutation`/`action` builder usage

**Source:** `convex/_generated/server.d.ts` line 75 (`action`), line 83 (`internalAction`), and Phase 1's already-used `internalMutation` (confirmed exported, `convex/subscriptions.ts`/`convex/aiCredits.ts` current stub files)
**Apply to:** `stripeWebhooks.ts` (`action`, public — D-01/D-03), all mutation bodies in `subscriptions.ts`/`aiCredits.ts` stay `internalMutation` (D-04/D-05 — do not convert to public `mutation`)

### Server-side Convex client (`ConvexHttpClient`, distinct from the existing browser client)

**Source (what NOT to copy):** `providers/ConvexClientProvider.tsx` lines 13-18 — `ConvexReactClient` + `"use client"`, browser-only, uses Clerk auth wiring (`ConvexProviderWithClerk`)
**Apply to:** `app/api/webhooks/stripe/route.ts` — must use `ConvexHttpClient` from `convex/browser` instead (server-safe, no Clerk/React dependency), reusing only the `NEXT_PUBLIC_CONVEX_URL` env var value, not the client class or provider pattern.

## No Analog Found

| File                                                                                                                    | Role    | Data Flow        | Reason                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------- | ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/webhooks/stripe/route.ts`                                                                                      | route   | request-response | First file under `app/api/` in this repo; `app/` currently only holds `[locale]` pages. Build from RESEARCH.md Pattern 1 + Pattern 3 verbatim.                                                                                  |
| `convex/stripeWebhooks.ts` (the `action` builder itself, and cross-file `ctx.runMutation(internal.*.*, ...)` dispatch)  | service | event-driven     | No `action` exists anywhere in current `convex/*.ts` — only `query`/`mutation`/(Phase 1) `internalMutation` precedent exists. Composite-sourced from Phase 1 stub shape + RESEARCH.md Pattern 3 (Convex docs-derived).          |
| Idempotency check-and-mark-in-one-mutation body (D-14)                                                                  | service | event-driven     | No prior Convex function in this repo combines a check-and-conditional-write in one transaction against a dedicated "already processed" ledger table. Sourced from RESEARCH.md Pattern 3 (live Convex docs, not training data). |
| `vitest.config.ts`, `convex/subscriptions.test.ts`, `convex/aiCredits.test.ts`, `app/api/webhooks/stripe/route.test.ts` | test    | n/a              | Zero test files exist anywhere in this repo (`jest` installed but unconfigured, `"test"` npm script is a lint/format wrapper). Follow RESEARCH.md Wave 0 + official `convex-test` docs.                                         |

## Metadata

**Analog search scope:** `convex/*.ts` (schema.ts, notes.ts, users.ts, helpers/helper.ts, subscriptions.ts, aiCredits.ts, `_generated/server.d.ts`, `_generated/api.d.ts`), `app/**` (full tree, confirmed no `app/api`), `providers/ConvexClientProvider.tsx`, `proxy.ts` (found via git log after `middleware.ts` lookup failed), `.env.example`, `package.json`, Phase 1's `01-PATTERNS.md`
**Files scanned:** 13
**Pattern extraction date:** 2026-07-08
