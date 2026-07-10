# Phase 5: AI Credits System - Research

**Researched:** 2026-07-10
**Domain:** Convex mutation atomicity (TOCTOU-safe credit deduction), Stripe one-time-payment Checkout extending an existing webhook dispatcher, React/Next.js reactive balance UI
**Confidence:** HIGH

## Summary

This phase adds no new libraries and no new architectural layer — it fills in two stubbed Convex `internalMutation`s (`deductCredit`, `addCredits`), adds one schema literal (`"refund"`), extends one existing branch in `convex/stripeWebhooks.ts` (`checkout.session.completed`) to dispatch on `session.mode`, adds one new Server Action (payment-mode Checkout Session, mirroring the existing subscription-mode one), and adds three new UI pieces (toolbar AI button, balance badge, zero-credit dialog) that reuse existing shadcn primitives already installed in this codebase.

The core technical risk in this phase is TOCTOU (time-of-check-time-of-use) safety on the credit deduction. Convex's documented execution model resolves this for free: **mutations execute as serializable ACID transactions** — reads and writes inside a single mutation handler are atomic relative to all other mutations touching the same document, with no explicit locking primitive available or needed (`ctx.db` provides no `SELECT ... FOR UPDATE` equivalent because the whole handler already runs as one transaction). This is the same pattern already proven in this codebase by `resetCredits`'s idempotency check (read `processedStripeEvents`, patch/insert, insert transaction row — all in one handler) and by Phase 4's `createNote` free-tier cap (read count, conditionally throw, insert — all in one handler). `deductCredit` must follow the identical shape: read balance inside the handler, branch, patch inside the same handler, never split the read and the write across two `ctx.runMutation` calls or two separate mutations.

The Stripe side requires only that a `payment`-mode Checkout Session's `checkout.session.completed` event be distinguished from a `subscription`-mode one via `event.data.object.mode` (or absence of `session.subscription`), then routed to `addCredits` instead of `upsertSubscription`. One important discovery: `app/api/webhooks/stripe/route.ts` currently only fetches a subscription snapshot when `session.subscription` is a string (payment-mode sessions have no `subscription` field, so this pre-processing step is already safely skipped for top-ups — no change needed there). The dispatcher (`convex/stripeWebhooks.ts`) is the only file whose `checkout.session.completed` case needs new branching logic.

**Primary recommendation:** Implement `deductCredit` as a single `internalMutation` that reads-then-patches the `aiCredits` row in one handler (insufficient-balance throws a bare `Error("INSUFFICIENT_CREDITS")` per the `NOTE_LIMIT_REACHED`/`ConvexError` convention the UI-SPEC already specifies), implement `addCredits` as a single `internalMutation` that patches/inserts the balance and records a `"topup"` transaction, branch `stripeWebhooks.ts`'s `checkout.session.completed` case on `session.mode`, and reuse every existing UI primitive (Dialog, Badge, Tooltip, ToolbarButton) without introducing new dependencies.

## Architectural Responsibility Map

| Capability                                     | Primary Tier                                                         | Secondary Tier                                        | Rationale                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credit balance storage & atomic deduction      | Database / Storage (Convex `aiCredits` table via `internalMutation`) | API / Backend (Convex function boundary)              | Convex collapses "backend" and "database" into one transactional tier; the mutation handler IS the transaction boundary — no separate app-server layer exists  |
| TOCTOU-safe deduct-then-act flow               | API / Backend (Convex `mutation`)                                    | —                                                     | Must happen inside a single Convex mutation invocation to get serializable-transaction guarantees; splitting read/write across two calls reintroduces the race |
| Balance visibility (badge)                     | Browser / Client (React, `useQuery`)                                 | API / Backend (Convex `query`)                        | Convex's reactive `useQuery` subscribes directly to query results — no manual polling/refetch tier needed                                                      |
| Zero-credit blocking UX                        | Browser / Client (React Dialog)                                      | API / Backend (mutation throws distinguishable error) | Server is authoritative on whether the action is blocked (never trust client-side balance display alone); client only decides which dialog copy to show        |
| Top-up Checkout Session creation               | Frontend Server (Next.js Server Action)                              | API / Backend (Stripe API call happens server-side)   | Server Actions run on the Next.js server, not the browser — matches existing Phase 3 pattern exactly, avoids exposing `STRIPE_SECRET_KEY` to the client        |
| Top-up payment confirmation & credit crediting | API / Backend (Convex `internalMutation` via webhook dispatcher)     | —                                                     | Must be server-authoritative and idempotent (Stripe webhook, not client confirmation) — client never directly credits its own balance                          |
| Billing-cycle credit reset                     | API / Backend (already implemented, Phase 2)                         | —                                                     | Out of scope this phase — do not modify `resetCredits`                                                                                                         |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-01:** No real AI/LLM call happens in this phase. The toolbar action is a placeholder that always succeeds instantly — no external API, no network call, no failure simulation. What must be real and correctly implemented is the credit calculation (deduction) and rate-limiting (concurrency/atomicity) logic around it.
- **D-02:** When the real AI capability is eventually built (future phase/milestone), it should use the **direct Anthropic SDK** (`@anthropic-ai/sdk`), not the Vercel AI Gateway/AI SDK abstraction. This is locked for future work only — nothing this phase depends on it or installs it.
- **D-03:** The AI action lives as a new button in the **editor toolbar** (`components/editor/EditorToolbar.tsx` / `components/editor/toolbarItems.tsx`), alongside existing formatting controls. The credit balance indicator is shown next to it — this satisfies ROADMAP SC2 ("balance visible near AI feature entry points").
- **D-04:** Flow is **deduct-first, then run the action, refund on failure**: the mutation atomically deducts 1 credit, then runs the (placeholder) action; if the action reports failure, a refund transaction restores the credit.
- **D-05:** Concurrency safety (ROADMAP SC1 — two concurrent calls when only 1 credit remains must not both succeed) relies on **Convex's default per-document mutation serialization**: read balance and patch it within the same mutation handler. This mirrors the check-and-mark atomicity pattern already established in Phase 2 (`02-CONTEXT.md` D-14) — no additional locking mechanism needed.
- **D-06:** Because the placeholder action always succeeds, **the refund path is implemented but not exercised** in this phase. It exists so the real AI call (which can genuinely fail/timeout) can plug into the same mutation later without a redesign.
- **D-07:** `convex/schema.ts` `creditTransactions.type` union (`"deduction" | "topup" | "reset"`) gets a **new `v.literal("refund")` case**. Planner must include this schema change.
- **D-08:** Reuse the **Dialog pattern from `components/UpgradeModal.tsx`** (Phase 4) for the "out of credits" block — a dedicated dialog with new copy, not an inline-disabled button or toast.
- **D-09:** The toolbar AI button is **visible for both Free and Pro users**. Free users have no `aiCredits` row at all — treated as 0 balance — and see the same button, same blocked state, as a Pro user who has spent all their credits. It is never hidden.
- **D-10:** Top-up purchases are **Pro-only**. A Free user who clicks the blocked AI button sees the existing "Upgrade to Pro" CTA (Phase 4 pattern, linking to `/pricing`) — not a credit-purchase option.
- **D-11:** The blocking dialog **branches its CTA on subscription status**, using the same `subscriptions.status === "active"` check pattern established in Phase 4's `createNote` enforcement (`04-CONTEXT.md` D-03/D-05): Free → "Upgrade to Pro" CTA; Pro-at-zero-balance → "Buy 50 credits" top-up CTA.
- **D-12:** The "Buy 50 credits for 2€" purchase reuses the **Phase 3 Server Action pattern** (`03-CONTEXT.md` D-05/D-06) — a new Server Action creates a Stripe Checkout Session in **`payment` mode** (one-time), reusing the existing Stripe-customer lookup logic. Invoked from the zero-credit dialog's top-up CTA (D-11).
- **D-13:** **No dedicated success page** (unlike Phase 3's subscription flow, which has `/checkout/success`). `success_url` redirects back into the app; the toolbar balance indicator updates automatically via Convex's reactive `useQuery` once the webhook processes the payment.
- **D-14:** The existing **Phase 2 single-writer webhook dispatcher** (`convex/stripeWebhooks.ts`) is extended, not duplicated — it branches on **`session.mode`** (`"payment"` vs `"subscription"`) inside the existing `checkout.session.completed` handler to decide between calling `addCredits` vs the existing subscription-upsert logic. No new Stripe event type, no new webhook module — preserves Phase 2's "single writer" decision (`02-CONTEXT.md` D-01/D-03).
- **D-15:** The top-up Server Action sets `clerkUserId` in **`session.metadata.clerkUserId`**, exactly like the Phase 1/3 pattern for subscriptions (`02-CONTEXT.md` D-06). The webhook resolves it the same way — no new resolution logic.

### Claude's Discretion

- Exact dialog copy/wording for the zero-credit block and refund messaging (now locked by `05-UI-SPEC.md`'s Copywriting Contract — see below)
- Exact toolbar button icon/placement within `toolbarItems.tsx` (now locked by `05-UI-SPEC.md`: `Sparkles` icon, new toolbar group after Link/Image buttons)
- Exact file location for the new top-up Server Action (mirrors Phase 3's discretion on Server Action location)
- Whether balance indicator is a number, icon+number, or icon+tooltip (now locked by `05-UI-SPEC.md`: `Badge variant="secondary"` wrapped in `Tooltip`)

### Deferred Ideas (OUT OF SCOPE)

- **Real AI capability** (note summarization, content suggestion, or generation via the Anthropic SDK) — explicitly discussed and deferred to a future phase/milestone. This phase builds only the credit deduction/balance/blocking infrastructure wired to a placeholder action.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID      | Description                                                                | Research Support                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRED-02 | User can view remaining AI credits balance in the app                      | `CreditsBalanceBadge` (05-UI-SPEC.md) reads `api.aiCredits.getCredits` via reactive `useQuery`, placed next to the toolbar AI button (D-03)                                                             |
| CRED-03 | User can trigger a top-up purchase when credits are low                    | `CreditsExhaustedDialog`'s Pro-branch CTA (D-11) invokes the new top-up Server Action (D-12)                                                                                                            |
| CRED-04 | AI credits are deducted when AI features are used (consumed server-side)   | `deductCredit` `internalMutation` in `convex/aiCredits.ts`, called from a new public wrapper mutation triggered by the toolbar button; deduction happens inside the mutation handler, never client-side |
| PAY-05  | User can purchase AI credits top-up via Stripe Checkout (one-time payment) | New Server Action creates a `mode: "payment"` Checkout Session (D-12); `convex/stripeWebhooks.ts` branches on `session.mode` to call `addCredits` (D-14)                                                |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- This project uses Convex as its backend. `convex/_generated/ai/guidelines.md` must be read before writing/modifying any Convex code — it contains rules that override training-data assumptions about Convex APIs and patterns. Key rules directly relevant to this phase (verified by reading the file in this session, quoted/paraphrased below under Standard Stack / Code Examples):
  - ALWAYS include argument validators (`v.*`) on every Convex function.
  - Use `internalMutation`/`internalQuery`/`internalAction` for anything not meant to be called directly by clients (both `deductCredit` and `addCredits` are already `internalMutation` — this phase fills their bodies, does not change their registration type).
  - `ctx.db.patch` throws if the document does not exist; `ctx.db.replace` fully replaces (not needed here).
  - Never use `.filter()` in queries — use `withIndex`. `getCredits`/`deductCredit`/`addCredits` all already use `by_clerkUserId`.
  - Never use `.collect().length` to count rows for anything that needs to scale — not applicable here (single-row `.unique()` lookups only).
  - Testing: `convex-test` + `vitest` + `edge-runtime`, module map via `import.meta.glob("./**/*.ts")` — already the established pattern in `aiCredits.test.ts`/`stripeWebhooks.test.ts`.

## Standard Stack

No new libraries are introduced by this phase. Every dependency below is already installed and pinned in `package.json`; this phase only writes new code against them.

### Core

| Library           | Version                                                                | Purpose                                                          | Why Standard                                                                                                       |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| convex            | ^1.40.0 [VERIFIED: package.json]                                       | Backend data layer, transactional mutations                      | Already the project's sole backend — `deductCredit`/`addCredits` are pre-registered stubs in this exact version    |
| stripe (Node SDK) | 22.3.0 [VERIFIED: package.json]                                        | Checkout Session creation (`payment` mode), webhook event typing | Already used for the Pro subscription Checkout flow (Phase 3) — reused unmodified, same SDK instance pattern       |
| next-intl         | (existing, per `messages/en.json` structure) [VERIFIED: codebase grep] | i18n for new `AiCredits` namespace copy                          | Matches `PlanEnforcement`/`Editor.tooltips` namespace conventions already in `messages/en.json`/`messages/fr.json` |
| @clerk/nextjs     | ^7.4.3 [VERIFIED: package.json]                                        | `auth()` in the new top-up Server Action                         | Identical pattern to `app/[locale]/(marketing)/pricing/actions.ts`                                                 |

### Supporting

| Library                                 | Version                                                                           | Purpose                                                 | When to Use                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| lucide-react                            | ^1.17.0 [VERIFIED: package.json / 05-UI-SPEC.md]                                  | `Sparkles` icon for the AI toolbar button               | New icon this phase per UI-SPEC — already an installed icon set, no new package  |
| convex-test / vitest / @edge-runtime/vm | (existing devDependencies) [VERIFIED: vitest.config.ts, existing *.test.ts files] | Unit-testing `deductCredit`/`addCredits`/webhook branch | Matches `aiCredits.test.ts`/`stripeWebhooks.test.ts` established pattern exactly |

### Alternatives Considered

| Instead of                                                           | Could Use                                                  | Tradeoff                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Convex transactional mutation for TOCTOU safety                      | Explicit optimistic-concurrency version field + retry loop | Unnecessary — Convex mutations are already serializable transactions per official docs; adding a version field would be redundant complexity the codebase's existing patterns (Phase 2 D-14, Phase 4 D-01) never use                                                                   |
| Branching one `checkout.session.completed` handler on `session.mode` | New dedicated Stripe event/webhook module for top-ups      | Explicitly rejected by D-14 — violates the locked "single writer" dispatcher decision from Phase 2                                                                                                                                                                                     |
| Cloning `UpgradeModal.tsx` into a new sibling component              | Adding a `variant` prop to the existing `UpgradeModal.tsx` | UI-SPEC leaves this as an open implementation choice ("clones... structure") — either is acceptable; a sibling `CreditsExhaustedDialog` component keeps Phase 4's component untouched and lower-risk, but a variant prop is also valid per D-08's wording ("reuse the Dialog pattern") |

**Installation:** None — no new packages required this phase.

**Version verification:** `convex` ^1.40.0 and `stripe` 22.3.0 confirmed present in `C:\noetree\package.json` (read directly, not registry-queried, since these are pre-existing pinned versions, not new installs). No `npm view` verification needed for existing, already-running dependencies.

## Package Legitimacy Audit

**Not applicable this phase.** No new external packages are installed. `@anthropic-ai/sdk` is named in D-02 as the intended provider for a _future_ phase's real AI capability — CONTEXT.md explicitly states "nothing this phase depends on it or installs it." The Package Legitimacy Gate protocol was not run because there is nothing to audit; if a future phase installs `@anthropic-ai/sdk`, that phase's research must run the gate at that time.

## Architecture Patterns

### System Architecture Diagram

```
[Toolbar AI button click]
        |
        v
[New public `mutation` wrapper, e.g. convex/aiCredits.ts `useAiAction`]
        |
        |--(1)  read aiCredits row for identity-derived clerkUserId
        |--(2)  balance <= 0 ?  --yes-->  throw Error("INSUFFICIENT_CREDITS")
        |                                         |
        |                                         v
        |                          [client onError catches, opens
        |                           CreditsExhaustedDialog, branches CTA
        |                           on subscriptions.status]
        |--(3)  balance > 0: ctx.db.patch(balance - 1), insert
        |        creditTransactions{type:"deduction", amount:-1}
        |        -- all inside this ONE mutation handler (D-05 TOCTOU safety)
        |--(4)  run placeholder action (always succeeds, D-01)
        |--(5)  if action failed (not reachable this phase, D-06):
        |        ctx.db.patch(balance + 1), insert
        |        creditTransactions{type:"refund", amount:+1}
        v
[Convex reactively pushes new balance to every subscribed useQuery]
        |
        v
[CreditsBalanceBadge updates in place, no polling]


[Zero-credit dialog "Buy 50 credits" click, Pro branch only]
        |
        v
[New Server Action, e.g. app/.../actions.ts createTopupCheckoutSession]
        |--auth() -> clerkUserId (never client-supplied)
        |--stripe.checkout.sessions.create({
        |     mode: "payment",
        |     line_items: [{ price: STRIPE_TOPUP_PRICE_ID, quantity: 1 }],
        |     metadata: { clerkUserId },       <- D-15, no subscription_data (payment mode has none)
        |     success_url: back into app (no /checkout/success, D-13),
        |     cancel_url: back into app,
        |   })
        v
[redirect(session.url) -> Stripe-hosted Checkout]
        |
        v  (user completes payment)
[Stripe fires checkout.session.completed, mode:"payment"]
        |
        v
[app/api/webhooks/stripe/route.ts — signature verify, forwards event as-is;
 subscriptionSnapshot enrichment is skipped because session.subscription
 is absent on a payment-mode session — no change needed here]
        |
        v
[convex/stripeWebhooks.ts processWebhookEvent — checkout.session.completed case]
        |
        |-- NEW: branch on event.data.object.mode
        |     "subscription" --> existing internal.subscriptions.upsertSubscription (unchanged)
        |     "payment"      --> internal.aiCredits.addCredits (NEW this phase, D-14)
        v
[addCredits internalMutation: patch/insert aiCredits.balance + 50,
 insert creditTransactions{type:"topup", amount:50, stripePaymentIntentId}]
        |
        v
[Convex reactively pushes new balance -> CreditsBalanceBadge updates,
 no success page needed (D-13)]
```

### Recommended Project Structure

No new directories — this phase only touches existing files plus one new Server Action file:

```
convex/
├── aiCredits.ts          # fill in deductCredit + addCredits bodies; add new public
│                          # mutation wrapper (e.g. `useCredit`) for the toolbar to call
├── schema.ts              # add v.literal("refund") to creditTransactions.type
├── stripeWebhooks.ts       # branch checkout.session.completed on session.mode
└── aiCredits.test.ts       # extend with deductCredit/addCredits/refund test cases

components/
├── editor/
│   ├── toolbarItems.tsx    # (optional) or inline the AI item directly in EditorToolbar
│   └── EditorToolbar.tsx   # new AiActionButton + CreditsBalanceBadge, new toolbar group
└── CreditsExhaustedDialog.tsx  # new — clones UpgradeModal.tsx structure (D-08),
                                 # branches CTA on subscriptions.status (D-11)

app/[locale]/(app)/notes/   # or a new co-located actions.ts near the editor —
└── actions.ts (or similar) # exact location is Claude's discretion (D-12 note);
                             # new Server Action: createTopupCheckoutSession

messages/
├── en.json                 # new "AiCredits" namespace (05-UI-SPEC.md Copywriting Contract)
└── fr.json                 # same namespace, French copy
```

### Pattern 1: Atomic deduct-then-act-then-refund-on-failure mutation

**What:** A single `mutation` (or `internalMutation` called via a thin public wrapper) that reads the balance, checks it, patches it, runs the placeholder action inline, and conditionally reverses the patch — all inside one handler invocation.

**When to use:** Any server-side flow where two concurrent calls must not both succeed against a shared counter (credits, inventory, rate limits).

**Example:**

```typescript
// Source: pattern verified against convex/_generated/ai/guidelines.md
// (Mutation guidelines, Function calling) + existing convex/aiCredits.ts
// resetCredits (already-deployed code in this repo) + convex/notes.ts
// createNote free-tier cap (Phase 4, same codebase).
export const deductCredit = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    // (1) READ — inside this handler, so it's part of the same transaction
    // as the WRITE below. Convex serializes concurrent mutations that touch
    // the same document; two simultaneous calls with balance=1 cannot both
    // read balance=1 and both succeed the patch below.
    const credits = await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();

    const balance = credits?.balance ?? 0; // D-09: no row = 0 balance
    if (balance < args.amount) {
      // Bare-throw Error convention (matches convex/notes.ts, UI-SPEC's
      // explicit guidance to mirror the NOTE_LIMIT_REACHED pattern).
      throw new Error("INSUFFICIENT_CREDITS");
    }

    // (2) WRITE — same handler, same transaction as the read above.
    if (credits) {
      await ctx.db.patch(credits._id, { balance: balance - args.amount });
    } else {
      // Unreachable in practice since balance < amount would have thrown
      // for a Free user with no row and amount >= 1 — defensive only.
      await ctx.db.insert("aiCredits", {
        clerkUserId: args.clerkUserId,
        balance: -args.amount,
        lastResetAt: Date.now(),
      });
    }

    await ctx.db.insert("creditTransactions", {
      clerkUserId: args.clerkUserId,
      type: "deduction",
      amount: -args.amount,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});
```

### Pattern 2: Refund path (D-04/D-06 — implemented, not exercised)

**What:** After the placeholder action "runs" (synchronously, always succeeds per D-01), a conditional branch that would patch the balance back up and record a `"refund"` transaction if the action reported failure.

**When to use:** Wire this into the SAME mutation as Pattern 1 (not a separate mutation call) so the refund is also transactionally consistent with the deduction — do not schedule it via `ctx.scheduler` or split it into a second `ctx.runMutation`, which would reopen a TOCTOU window between deduction and refund.

**Example:**

```typescript
// Source: derived from D-04/D-06's explicit sequencing requirement, applying
// the same single-handler-transaction principle as Pattern 1.
export const useCredit = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    // ... Pattern 1's deduct logic inline here (or via a shared handler fn,
    // NOT via ctx.runMutation to a sibling mutation — guidelines.md: "Try to
    // use as few calls from actions to queries and mutations as possible" /
    // avoid splitting a single logical transaction across multiple calls).

    const actionSucceeded = true; // D-01: placeholder always succeeds

    if (!actionSucceeded) {
      const credits = await ctx.db
        .query("aiCredits")
        .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
        .unique();
      if (credits) {
        await ctx.db.patch(credits._id, { balance: credits.balance + 1 });
      }
      await ctx.db.insert("creditTransactions", {
        clerkUserId: args.clerkUserId,
        type: "refund",
        amount: 1,
        createdAt: Date.now(),
      });
    }

    return { success: actionSucceeded };
  },
});
```

### Pattern 3: Webhook dispatcher branching on `session.mode`

**What:** Extend the existing `checkout.session.completed` case in `convex/stripeWebhooks.ts` to read `session.mode` and route to a different internal mutation, instead of adding a new `case` in the outer `switch`.

**Example:**

```typescript
// Source: convex/stripeWebhooks.ts (existing file, read this session) +
// D-14's explicit requirement to branch inside the existing case.
case "checkout.session.completed": {
  const session = args.event.data.object;
  const clerkUserId = session.metadata?.clerkUserId;

  if (session.mode === "payment") {
    // D-14/D-15: top-up flow — same clerkUserId resolution as subscriptions.
    return await ctx.runMutation(internal.aiCredits.addCredits, {
      stripeEventId: args.event.id,
      eventType: args.event.type,
      clerkUserId,
      amount: 50, // locked value, PROJECT.md — not read from Stripe line items
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id,
    });
  }

  // existing subscription-mode branch, unchanged below
  const stripeCustomerId = /* ... */;
  // ...
}
```

**Note on `addCredits`' signature:** the current stub is `args: { clerkUserId: v.string(), amount: v.number() }` — it will need `stripeEventId`/`eventType` (for `processedStripeEvents` idempotency, mirroring `resetCredits`) and `stripePaymentIntentId` (optional, for the `creditTransactions.stripePaymentIntentId` field) added to its arg validator. This is a required schema/signature change the planner must include — the existing stub signature is insufficient for idempotent webhook processing.

### Anti-Patterns to Avoid

- **Reading balance in a `query`, then patching in a separate `mutation` call:** This reopens the TOCTOU window Convex's transactional guarantee exists specifically to close. Both the read and the write must be in the same mutation handler invocation.
- **Introducing a version/optimistic-lock field on `aiCredits`:** Unnecessary — Convex already serializes concurrent mutations on the same document. Adding manual versioning duplicates a guarantee the platform provides, and the codebase's existing patterns (Phase 2 D-14, Phase 4 D-01) never do this.
- **Creating a second webhook module or a new Stripe event-type case for top-ups:** Explicitly forbidden by D-14 — violates the Phase 2 "single writer" decision. Branch inside the existing `checkout.session.completed` case only.
- **Reading `amount` from the Stripe session's `amount_total` or line items to determine credits granted:** The locked value is "50 credits for 2€" (PROJECT.md) — hardcode `amount: 50` in the webhook branch rather than deriving it from Stripe response data, which would silently misbehave if the Price is ever changed in the Stripe Dashboard without a corresponding code change.

## Don't Hand-Roll

| Problem                             | Don't Build                                                                          | Use Instead                                                                                                                                     | Why                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency-safe counter decrement  | Custom mutex/lock table, Redis-based distributed lock, manual retry-on-conflict loop | Convex's built-in per-document mutation serialization (read+write in one handler)                                                               | Convex mutations are already ACID/serializable transactions — verified in `convex/_generated/ai/guidelines.md` and demonstrated by this codebase's own `resetCredits`/`createNote` — any additional locking layer is redundant complexity with no correctness benefit |
| Idempotent webhook event processing | Custom deduplication cache/queue                                                     | The existing `processedStripeEvents` table + `by_stripeEventId` index pattern already used by `resetCredits`/`upsertSubscription`/`markPastDue` | `addCredits` must adopt this exact same idempotency check — Stripe webhooks are at-least-once delivery and can redeliver the same event                                                                                                                               |
| Payment UI (card form, 3DS, etc.)   | Custom checkout form                                                                 | Stripe Checkout (hosted), `mode: "payment"`                                                                                                     | Already the established pattern for the subscription flow (Phase 3) — PCI scope, 3DS, and localization are all handled by Stripe's hosted page                                                                                                                        |
| Real-time balance updates           | Polling `setInterval` + manual fetch                                                 | Convex reactive `useQuery`                                                                                                                      | Already the established pattern (Phase 3 D-09) — the badge updates automatically the instant the webhook's mutation commits, no polling code needed                                                                                                                   |

**Key insight:** Every "hard" problem in this phase (atomicity, idempotency, real-time UI sync) already has a proven, working precedent elsewhere in this exact codebase from Phases 2–4. The task is pattern-matching to existing code, not inventing new infrastructure.

## Common Pitfalls

### Pitfall 1: Splitting deduction across `ctx.runMutation` calls

**What goes wrong:** If the toolbar's public `mutation` calls `ctx.runMutation(internal.aiCredits.deductCredit, ...)` and then separately calls another mutation to run the "action" and a third to handle refund, each `ctx.runMutation` is its own transaction — the balance can change between calls, reopening the TOCTOU race D-05 exists to close.
**Why it happens:** It looks like clean separation of concerns to split "deduct" / "act" / "refund" into three functions, but `convex/_generated/ai/guidelines.md` explicitly warns: "Try to use as few calls from actions to queries and mutations as possible... splitting logic up into multiple calls introduces the risk of race conditions."
**How to avoid:** Keep deduct + placeholder-action + conditional-refund inside ONE mutation handler (can still be organized as internal helper _functions_ called directly, not via `ctx.runMutation`/`ctx.runQuery`).
**Warning signs:** Any code path where `ctx.runMutation(internal.aiCredits.deductCredit, ...)` is awaited and then a separate `ctx.runMutation` patches the same `aiCredits` row afterward.

### Pitfall 2: `addCredits`' current stub signature is too narrow for idempotent webhook use

**What goes wrong:** The existing stub is `args: { clerkUserId: v.string(), amount: v.number() }` with no `stripeEventId`. If implemented as-is, a Stripe webhook retry (at-least-once delivery) would double-credit the user's balance.
**Why it happens:** The stub was written in Phase 2 before this phase's exact webhook-integration shape was decided; CONTEXT.md marks it `// LEAVE UNCHANGED — Phase 5` referring to leaving the _body_ unimplemented, not the arg signature.
**How to avoid:** Extend `addCredits`' arg validator to include `stripeEventId`, `eventType`, and optional `stripePaymentIntentId`, and check `processedStripeEvents` by `stripeEventId` first (mirroring `resetCredits` exactly), before patching balance.
**Warning signs:** A test that fires the same `checkout.session.completed` payment-mode event twice and asserts the balance only increased once (this test does not yet exist in `aiCredits.test.ts` — Wave 0 gap, see Validation Architecture below).

### Pitfall 3: Free users have no `aiCredits` row — `getCredits` returns `null`, not `{ balance: 0 }`

**What goes wrong:** UI code that does `credits.balance` without a null check will crash for any Free user (or a brand-new Pro user before their first `resetCredits` webhook fires). This is already proven behavior: `aiCredits.test.ts` explicitly asserts `getCredits` returns `null` for a nonexistent row.
**Why it happens:** `getCredits` is a thin `.unique()` query with no fallback row synthesis.
**How to avoid:** The `CreditsBalanceBadge` and any deduction-eligibility check on the client must treat `credits === null` as balance `0` (D-09 requires this explicitly for Free users). Consider whether the badge should render at all for a `null` result (UI-SPEC does not exempt Free users from seeing the badge — D-09 says the button/blocked-state is shown for both tiers, implying the badge shows "0" too).
**Warning signs:** A runtime error `Cannot read properties of null (reading 'balance')` in the browser console when a Free user or a fresh Pro user (pre-first-reset) opens the editor.

### Pitfall 4: `session.mode` may be absent on older/malformed webhook payloads or test fixtures

**What goes wrong:** `stripeWebhooks.test.ts`'s existing `seedCheckoutEvent` helper does not set a `mode` field at all on its fixture object — if the new branch is `if (session.mode === "payment") { ... } else { /* assume subscription */ }`, the existing subscription tests continue to pass by falling into the `else` branch, but a genuinely malformed/unexpected event with `mode` undefined would silently be treated as a subscription. Prefer an explicit `session.mode === "payment"` check that only routes to `addCredits` on an exact match, leaving everything else (including `undefined`) on the existing subscription path — this preserves 100% backward compatibility with the existing test suite's implicit fixture shape.
**Why it happens:** Real Stripe `checkout.session.completed` events always include `mode`, but hand-written test fixtures in this codebase predate this phase and don't set it.
**How to avoid:** Branch as `session.mode === "payment"` (exact match), not `session.mode !== "subscription"` (inverted match) — this is also the direction D-14's wording implies ("branches on session.mode... to decide between calling addCredits vs the existing subscription-upsert logic").
**Warning signs:** Existing subscription-flow tests in `stripeWebhooks.test.ts` failing after this change (their fixtures have `mode: undefined`, which must still resolve to the subscription path).

### Pitfall 5: `addCredits`/`deductCredit` need a `Doc<"aiCredits">` presence check before `ctx.db.patch`

**What goes wrong:** `ctx.db.patch` throws if the target document doesn't exist (guidelines.md, Mutation guidelines section). A top-up webhook firing for a Pro user's very first purchase (no `aiCredits` row yet, e.g. they haven't hit an `invoice.paid` reset cycle) must `insert`, not `patch`.
**Why it happens:** It's tempting to assume every Pro user already has an `aiCredits` row from `resetCredits`, but a user could theoretically purchase a top-up before their first billing-cycle reset fires (edge case, but not impossible given webhook ordering is not guaranteed).
**How to avoid:** Mirror `resetCredits`' existing `if (existingCredits) { patch } else { insert }` branch exactly in both `deductCredit` and `addCredits`.
**Warning signs:** A test seeding a Pro subscription with no pre-existing `aiCredits` row, then firing a payment-mode `checkout.session.completed` event, and asserting a new row is created with `balance: 50` rather than the mutation throwing.

## Code Examples

### Schema change (D-07)

```typescript
// Source: convex/schema.ts (existing file, read this session) — add one literal.
creditTransactions: defineTable({
  clerkUserId: v.string(),
  type: v.union(
    v.literal("deduction"),
    v.literal("topup"),
    v.literal("reset"),
    v.literal("refund"), // NEW — D-07
  ),
  amount: v.number(),
  createdAt: v.number(),
  stripePaymentIntentId: v.optional(v.string()),
}).index("by_clerkUserId", ["clerkUserId"]),
```

### Top-up Server Action (mirrors app/[locale]/(marketing)/pricing/actions.ts)

```typescript
// Source: pattern verified against the existing, already-deployed
// app/[locale]/(marketing)/pricing/actions.ts createCheckoutSession
// (read this session) — swap subscription-mode specifics for payment-mode.
"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createTopupCheckoutSession(): Promise<void> {
  const { userId, redirectToSignIn, getToken } = await auth();
  if (!userId) {
    redirectToSignIn();
    return;
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const convexToken = await getToken({ template: "convex" });
  if (convexToken) convex.setAuth(convexToken);
  const existing = await convex.query(api.subscriptions.getSubscription, {});

  // D-10: top-up is Pro-only — defense in depth even though the UI only
  // shows this CTA to Pro users at zero balance.
  if (existing?.status !== "active") {
    throw new Error("TOPUP_REQUIRES_PRO");
  }

  const baseUrl = process.env.APP_URL!;
  const session = await stripe.checkout.sessions.create({
    mode: "payment", // D-12 — one-time, not "subscription"
    ...(existing?.stripeCustomerId
      ? { customer: existing.stripeCustomerId }
      : {}),
    line_items: [{ price: process.env.STRIPE_TOPUP_PRICE_ID!, quantity: 1 }],
    metadata: { clerkUserId: userId }, // D-15 — same resolution path as subscriptions
    // D-13: no dedicated success page — redirect back into the app; the
    // balance updates reactively once the webhook processes.
    success_url: `${baseUrl}/notes`,
    cancel_url: `${baseUrl}/notes`,
  });

  if (session.url) {
    redirect(session.url);
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact                                                                                                                                                                                                                                                                                   |
| ------------ | ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N/A          | N/A              | N/A          | This phase does not involve a changing external API surface — Convex's mutation transaction model and Stripe's Checkout Session API are both stable, already-integrated dependencies in this codebase with no relevant version-to-version behavioral changes identified during research. |

**Deprecated/outdated:** None identified — `convex/_generated/ai/guidelines.md` explicitly targets `convex ^1.41.0` (the codebase runs `^1.40.0`, effectively the same generation) and contains no deprecation warnings relevant to mutations, schema, or webhooks.

## Assumptions Log

| #   | Claim                                                                                                                                                                                               | Section                           | Risk if Wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | `addCredits`' arg validator must be extended beyond its current stub (`clerkUserId`, `amount`) to include `stripeEventId`/`eventType`/`stripePaymentIntentId` for idempotency                       | Pitfall 2, Pattern 3              | If the planner instead keeps the narrow signature and layers idempotency checking in the caller (`stripeWebhooks.ts`) instead of inside `addCredits` itself, that's also structurally valid — but it diverges from the `resetCredits`/`upsertSubscription` precedent of each mutation owning its own idempotency check. Low risk: either shape is testable and correct, this is a stylistic/consistency recommendation, not a correctness requirement.                           |
| A2  | A payment-mode Stripe Checkout Session's `checkout.session.completed` event object has `session.payment_intent` (string or expanded object) available for `stripePaymentIntentId`                   | Pattern 3, Code Examples          | [ASSUMED from Stripe API training knowledge, not verified via Context7/Stripe docs fetch this session — MEDIUM-LOW confidence]. If `payment_intent` is not present/expanded on the raw webhook event object without an `expand` param, the planner should verify this in Stripe's Checkout Session webhook payload docs or make `stripePaymentIntentId` optional/best-effort (schema already has it as `v.optional`, so a missing value degrades gracefully — no blocking risk). |
| A3  | The new toolbar mutation wrapper (`useCredit`/`useAiAction` or similar) should be a public `mutation` (not `action`) since the "action" being run is a synchronous placeholder with no external I/O | Pattern 1/2, Architecture Diagram | If a future phase's real AI call requires `action` (Node runtime, external HTTP), this phase's `mutation`-based wrapper would need restructuring at that time — acceptable per D-06's explicit statement that the refund path exists so the real call "can plug into the same mutation later," implying continuity is expected, not a guaranteed zero-refactor path. Low risk given CONTEXT.md's own framing.                                                                    |

## Open Questions

1. **Exact naming/location of the new public mutation wrapper that the toolbar button calls**
   - What we know: `deductCredit` and `addCredits` are `internalMutation`s (client cannot call them directly); something public must exist for the toolbar's `onClick` to invoke.
   - What's unclear: CONTEXT.md's Integration Points list `convex/aiCredits.ts` `deductCredit`/`addCredits` as the two functions to fill in, but does not name the new public wrapper mutation explicitly.
   - Recommendation: Add a new public `mutation` in `convex/aiCredits.ts` (e.g. `runAiAction` or `useCredit`) that derives `clerkUserId` from `ctx.auth.getUserIdentity()` (never client-supplied, per the codebase's established IDOR-prevention convention in `subscriptions.ts`/`helper.ts`) and internally performs Pattern 1+2's logic — this keeps `deductCredit` as a pure internal building block callable from both this new wrapper and potentially a future real-AI `action`.

2. **Whether `CreditsBalanceBadge` should render "0" or hide itself entirely for Free users**
   - What we know: D-09 says the toolbar AI _button_ is never hidden for Free users (same blocked state as a zero-balance Pro user). The badge's fate for a `null` `getCredits` result is not explicitly addressed.
   - What's unclear: 05-UI-SPEC.md describes the badge as "placed immediately to the right of the AiActionButton" without carving out a Free-user exception.
   - Recommendation: Render "0" (treat `null` as `0`, consistent with D-09's framing of "no aiCredits row = 0 balance") rather than conditionally hiding the badge — this keeps Free and Pro-at-zero visually identical, matching D-09's intent precisely.

## Environment Availability

Skipped — this phase has no new external tool/runtime/service dependencies beyond what Phases 1–4 already established (Convex dev server, Stripe test-mode account/CLI). STATE.md confirms these are already working end-to-end as of Phase 4 completion (Stripe test-mode Price IDs re-verified 2026-07-10).

## Validation Architecture

### Test Framework

| Property           | Value                                                                               |
| ------------------ | ----------------------------------------------------------------------------------- |
| Framework          | vitest (via `convex-test`, `edge-runtime` environment) [VERIFIED: vitest.config.ts] |
| Config file        | `C:\noetree\vitest.config.ts`                                                       |
| Quick run command  | `npx vitest run convex/aiCredits.test.ts convex/stripeWebhooks.test.ts`             |
| Full suite command | `npm run test:unit` (`vitest run`)                                                  |

### Phase Requirements → Test Map

| Req ID        | Behavior                                                                                                                                                                   | Test Type         | Automated Command                                                                                                                                                                                                                                                                                                                                  | File Exists?                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| CRED-04       | `deductCredit` reduces balance by 1 and records a `"deduction"` transaction                                                                                                | unit              | `npx vitest run convex/aiCredits.test.ts -t "deductCredit"`                                                                                                                                                                                                                                                                                        | ❌ Wave 0 — needs new `describe` block                     |
| CRED-04       | Insufficient balance throws a distinguishable error, does not mutate balance                                                                                               | unit              | `npx vitest run convex/aiCredits.test.ts -t "INSUFFICIENT_CREDITS"`                                                                                                                                                                                                                                                                                | ❌ Wave 0                                                  |
| CRED-04 (SC1) | Two concurrent `deductCredit` calls at balance=1 — only one succeeds                                                                                                       | unit              | `npx vitest run convex/aiCredits.test.ts -t "concurrent"` — note: `convex-test`'s `t.mutation` calls are sequential/awaited by default in tests, so true concurrency (two in-flight promises racing) must be constructed with `Promise.all([...])` against the same `t` instance to actually exercise the race, not just called twice sequentially | ❌ Wave 0                                                  |
| CRED-02       | `getCredits` returns current balance reactively                                                                                                                            | unit (existing)   | `npx vitest run convex/aiCredits.test.ts -t "getCredits"`                                                                                                                                                                                                                                                                                          | ✅ (existing tests already cover the null/populated cases) |
| PAY-05        | `checkout.session.completed` with `mode: "payment"` calls `addCredits`, balance += 50                                                                                      | unit              | `npx vitest run convex/stripeWebhooks.test.ts -t "payment"`                                                                                                                                                                                                                                                                                        | ❌ Wave 0                                                  |
| PAY-05        | Duplicate `checkout.session.completed` payment-mode event (same `stripeEventId`) does not double-credit                                                                    | unit              | `npx vitest run convex/stripeWebhooks.test.ts -t "idempotent"`                                                                                                                                                                                                                                                                                     | ❌ Wave 0                                                  |
| PAY-05        | `checkout.session.completed` with `mode: "subscription"` (or `mode` absent, matching existing fixtures) still routes to `upsertSubscription`, unaffected by the new branch | unit (regression) | `npx vitest run convex/stripeWebhooks.test.ts`                                                                                                                                                                                                                                                                                                     | ✅ existing tests, must continue passing unmodified        |
| D-07          | Schema accepts `type: "refund"` on `creditTransactions`                                                                                                                    | unit              | covered implicitly by any refund-path test inserting this type                                                                                                                                                                                                                                                                                     | ❌ Wave 0                                                  |

### Sampling Rate

- **Per task commit:** `npx vitest run convex/aiCredits.test.ts convex/stripeWebhooks.test.ts`
- **Per wave merge:** `npm run test:unit` (full `vitest run`)
- **Phase gate:** Full suite green before `/gsd:verify-work`. Note: this project has no configured Playwright/e2e coverage for Convex-only logic — Cypress (`cypress/integration/`) exists for browser flows (`checkout-redirect.spec.ts`, `pricing.spec.ts`) but is not wired into `npm run test:unit`; the planner should decide whether a new Cypress spec for the toolbar button + zero-credit dialog is in scope (UI-only, manual-verification acceptable given the placeholder action has no observable network effect to assert against).

### Wave 0 Gaps

- [ ] `convex/aiCredits.test.ts` — new `describe("aiCredits.deductCredit")` block covering: success path (balance decrements, transaction recorded), insufficient-balance throw, no-existing-row-for-Pro-user edge case, and a concurrency test using `Promise.all` against two `t.mutation` calls at balance=1.
- [ ] `convex/aiCredits.test.ts` — new `describe("aiCredits.addCredits")` block covering: success path (balance increments by 50, `"topup"` transaction with `stripePaymentIntentId` recorded), no-existing-row insert path, idempotency by `stripeEventId`.
- [ ] `convex/stripeWebhooks.test.ts` — new test(s) for `checkout.session.completed` with `mode: "payment"`, asserting `addCredits` is invoked and the existing subscription-mode tests (which have no `mode` field on their fixture) are unaffected.
- [ ] No new test-framework install needed — `vitest`/`convex-test`/`edge-runtime` are already configured and working.

## Security Domain

`security_enforcement` is absent from `.planning/config.json` — treated as enabled per protocol default.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Clerk (`auth()` server-side, `ctx.auth.getUserIdentity()` in Convex) — already established, unchanged this phase                                                                                                                                                                                                                                                                                                                                                                                                  |
| V3 Session Management | no      | Delegated entirely to Clerk — no session logic added this phase                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| V4 Access Control     | yes     | `clerkUserId` for deduction/top-up must be derived server-side from `ctx.auth.getUserIdentity()` (mutation) or `auth()` (Server Action) — never accepted as a client-supplied argument, matching the established IDOR-prevention convention in `subscriptions.ts`/`helper.ts`/`notes.ts`. The top-up Server Action must independently re-verify Pro status server-side (D-10) rather than trusting that the client only shows the CTA to Pro users — a Free user could otherwise call the Server Action directly. |
| V5 Input Validation   | yes     | Convex `v.*` argument validators on every new/modified function (`deductCredit`, `addCredits`, the new public wrapper mutation) — already a hard CLAUDE.md-sourced requirement (`convex/_generated/ai/guidelines.md`)                                                                                                                                                                                                                                                                                             |
| V6 Cryptography       | no      | No new cryptographic operations — Stripe webhook signature verification (`stripe.webhooks.constructEvent`) is unchanged, pre-existing code in `route.ts`                                                                                                                                                                                                                                                                                                                                                          |

### Known Threat Patterns for this stack

| Pattern                                                                                      | STRIDE                             | Standard Mitigation                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDOR — client passes an arbitrary `clerkUserId` to trigger deduction/top-up for another user | Elevation of Privilege / Tampering | Derive `clerkUserId` exclusively from `ctx.auth.getUserIdentity()` / `auth()` server-side, never accept it as a mutation/Server Action argument — this is the exact pattern already fixed for an equivalent bug in `03-REVIEW.md` CR-01 and consistently applied since |
| Race condition (TOCTOU) on balance deduction                                                 | Tampering / Repudiation            | Single-mutation-handler transaction (this research's core finding — Convex serializable mutations)                                                                                                                                                                     |
| Stripe webhook replay / duplicate delivery causing double-credit                             | Tampering                          | `processedStripeEvents` idempotency table keyed by `stripeEventId`, checked first inside `addCredits` (mirrors `resetCredits`)                                                                                                                                         |
| Client bypassing server-side Pro-only gate on top-up purchase                                | Elevation of Privilege             | Server Action independently checks `existing?.status === "active"` via Convex query before creating the Stripe Checkout Session — never trust that the UI only shows the button to Pro users                                                                           |
| Forged/unsigned webhook payload                                                              | Spoofing / Tampering               | Already handled, unchanged this phase — `stripe.webhooks.constructEvent` signature verification in `route.ts`, 400 on failure                                                                                                                                          |

## Sources

### Primary (HIGH confidence)

- `C:\noetree\convex\_generated\ai\guidelines.md` — Convex mutation/transaction/testing guidelines, read in full this session (targets `convex ^1.41.0`)
- `C:\noetree\convex\aiCredits.ts` — existing stub functions, `resetCredits`'s fully-implemented reference pattern
- `C:\noetree\convex\aiCredits.test.ts` — existing test conventions and null-balance behavior of `getCredits`
- `C:\noetree\convex\schema.ts` — current `aiCredits`/`creditTransactions` table definitions
- `C:\noetree\convex\stripeWebhooks.ts` — existing single-writer dispatcher, `checkout.session.completed` handler to be extended
- `C:\noetree\convex\stripeWebhooks.test.ts` — existing test fixture shape (`seedCheckoutEvent`, no `mode` field)
- `C:\noetree\app\api\webhooks\stripe\route.ts` — confirms `subscriptionSnapshot` enrichment only fires for `session.subscription` strings (safely skipped for payment-mode)
- `C:\noetree\app\[locale]\(marketing)\pricing\actions.ts` — Server Action template for Checkout Session creation
- `C:\noetree\components\UpgradeModal.tsx`, `C:\noetree\providers\UpgradeModalProvider.tsx` — Dialog pattern to reuse for D-08
- `C:\noetree\components\editor\EditorToolbar.tsx`, `toolbarItems.tsx` — toolbar integration point
- `C:\noetree\convex\notes.ts` (createNote, ~line 524) — bare-throw/`ConvexError` conventions, Phase 4 free-tier cap pattern
- `C:\noetree\convex\helpers\helper.ts` — `isProUser`/`getUser` identity-derivation pattern
- `C:\noetree\convex\subscriptions.ts` — `getSubscription` IDOR-safe query pattern
- `C:\noetree\.planning\phases\05-ai-credits-system\05-CONTEXT.md` — all locked decisions D-01 through D-15
- `C:\noetree\.planning\phases\05-ai-credits-system\05-UI-SPEC.md` — approved UI contract, copy, component names
- `C:\noetree\.planning\phases\04-plan-enforcement\04-CONTEXT.md` — D-03/D-05/D-06/D-07/D-08 precedents reused this phase
- `C:\noetree\.planning\REQUIREMENTS.md`, `C:\noetree\.planning\STATE.md` — requirement IDs, locked project values, Phase 5 status
- `C:\noetree\package.json`, `C:\noetree\vitest.config.ts`, `C:\noetree\.env.example` — verified dependency versions, test config, env var names
- `C:\noetree\messages\en.json` — i18n namespace conventions (`PlanEnforcement`, `Editor.tooltips`)

### Secondary (MEDIUM confidence)

- None — all findings this session were grounded directly in this codebase's own files or the project's bundled Convex guidelines document; no external WebSearch was needed since the phase introduces no new library.

### Tertiary (LOW confidence)

- A2 in the Assumptions Log (`session.payment_intent` field availability on a raw, non-expanded webhook event object) — based on Stripe API training knowledge, not verified via a live Stripe docs fetch this session. Flagged for planner/executor to confirm at implementation time if the field proves unavailable (degrades gracefully since `stripePaymentIntentId` is `v.optional`).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new dependencies; every library/version confirmed by directly reading `package.json`
- Architecture: HIGH — every pattern is a direct precedent from already-deployed code in this same repository (Phase 2/3/4), not inferred from generic best practices
- Pitfalls: HIGH — Pitfalls 1, 3, 4, 5 are grounded in specific, read files (`guidelines.md`, `aiCredits.test.ts`, `stripeWebhooks.test.ts`); Pitfall 2 is grounded in the current stub's literal signature

**Research date:** 2026-07-10
**Valid until:** 2026-08-09 (30 days — stable, internal-codebase-driven research with no fast-moving external dependency)
