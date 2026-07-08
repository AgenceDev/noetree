---
phase: 02-webhook-handler-convex-internal-mutations
reviewed: 2026-07-08T22:58:14Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - app/api/webhooks/stripe/route.ts
  - app/api/webhooks/stripe/route.test.ts
  - convex/stripeWebhooks.ts
  - convex/stripeWebhooks.test.ts
  - convex/subscriptions.ts
  - convex/subscriptions.test.ts
  - convex/aiCredits.ts
  - convex/aiCredits.test.ts
  - convex/schema.ts
  - convex/tsconfig.json
  - convex/_generated/api.d.ts
  - vitest.config.ts
  - .env.example
  - package.json
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-07-08T22:58:14Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the Stripe webhook route, the Convex `processWebhookEvent` dispatcher, and the `subscriptions`/`aiCredits` internal mutations they call. The idempotency design (`processedStripeEvents` keyed by `stripeEventId`, checked first in every mutation) is sound and well tested, and the team already caught and fixed one "uncaught exception surfaces as 500" bug during live Stripe CLI verification (commit `e49a18d`, `invoice.payment_failed` with no subscription reference).

However, the exact same bug class recurs, unfixed, in two sibling code paths (`customer.subscription.updated` / `customer.subscription.deleted`), and there is a more serious cross-boundary issue: the auth-failure control flow between `convex/stripeWebhooks.ts` and `app/api/webhooks/stripe/route.ts` depends on an error _message string_ surviving a Convex action boundary — and Convex's documented production behavior only guarantees message/data survival for `ConvexError`, not plain `Error`. If that redaction applies here (it does per Convex's documented application-error semantics), the D-02/D-10 "auth failure must map to 400, never 500" requirement silently breaks in production, and the test suite cannot catch it because it mocks the Convex client entirely rather than exercising real action-boundary serialization.

## Critical Issues

### CR-01: Auth-failure 400-vs-500 mapping likely breaks in production because a plain `Error` is thrown across the Convex action boundary

**File:** `convex/stripeWebhooks.ts:33-35`, consumed by `app/api/webhooks/stripe/route.ts:63-69`

**Issue:** `processWebhookEvent` throws a plain `Error`:

```ts
if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
  throw new Error("Unauthorized: invalid INTERNAL_WEBHOOK_SECRET");
}
```

`route.ts` then relies on the _exact text_ of that message surviving the trip through `ConvexHttpClient.action()`:

```ts
const message = err instanceof Error ? err.message : String(err);
if (message.startsWith("Unauthorized")) {
  return new Response("Unauthorized", { status: 400 });
}
return new Response("Webhook processing failed", { status: 500 });
```

Convex's documented application-error contract (function error handling / "application errors") only guarantees that thrown data survives to the caller for `ConvexError` — for a plain `Error`, production deployments redact the message to a generic one to avoid leaking internal details. Confirmed in `node_modules/convex/src/browser/http_client.ts:316-338`: the client only reconstructs a `ConvexError` (preserving `data`) when the backend's JSON response includes `errorData`; otherwise it throws `new Error(respJSON.errorMessage)` with whatever (possibly redacted) string the backend chose to send. The backend redaction logic itself is closed-source and not visible from this repo, but it is documented platform behavior, and the whole point of `ConvexError` existing is to opt specific errors out of that redaction.

If this redaction applies in the deployed environment (the standard, documented case), `message.startsWith("Unauthorized")` will never match in production. Every genuine secret mismatch — e.g., a rotated/misconfigured `INTERNAL_WEBHOOK_SECRET` — will then map to a 500 instead of the required 400, causing Stripe to retry indefinitely instead of surfacing a clear, permanent auth failure. This is exactly the D-02/D-10 behavior the route's own comments say must never happen.

The existing test suite cannot catch this: `convex/stripeWebhooks.test.ts` calls `t.action(...)` via `convex-test`, which does not perform real network/HTTP serialization, and `route.test.ts` mocks `ConvexHttpClient` entirely (`mockAction.mockRejectedValue(new Error("Unauthorized: ..."))`), constructing the exact error text by hand rather than exercising a real Convex action boundary. Both suites pass regardless of whether this bug is present.

**Fix:** Throw a `ConvexError` (or better, avoid throwing for this expected, structured condition entirely — return a discriminated result like `{ ok: false, reason: "unauthorized" }` from the action and branch on that field in `route.ts`, reserving actual `throw` for truly unexpected failures):

```ts
// convex/stripeWebhooks.ts
import { ConvexError } from "convex/values";
...
if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
  throw new ConvexError("Unauthorized: invalid INTERNAL_WEBHOOK_SECRET");
}
```

Then verify against a real (not `convex-test`) staging deployment that the 400 path still triggers, since this class of bug is invisible to the current test doubles.

### CR-02: Missing optional chaining on `metadata` reintroduces the exact "uncaught exception → 500" bug already fixed once this phase

**File:** `convex/stripeWebhooks.ts:71`, `convex/stripeWebhooks.ts:97`

**Issue:** In `checkout.session.completed`, `clerkUserId` is read defensively:

```ts
const clerkUserId = session.metadata?.clerkUserId; // line 40 — optional chaining
```

and downstream, `upsertSubscription`/`deleteSubscription` treat a missing `clerkUserId` as a graceful, logged anomaly (`{ anomaly: "missing clerkUserId" }`) rather than a thrown error — a design explicitly tested in `convex/stripeWebhooks.test.ts:75-99`.

But `customer.subscription.updated` and `customer.subscription.deleted` skip the optional chaining:

```ts
// line 71
const clerkUserId = subscription.metadata.clerkUserId;
...
// line 97
const clerkUserId = subscription.metadata.clerkUserId;
```

If `subscription.metadata` is ever `null`/`undefined` (malformed payload, replay with a hand-crafted event, or a future Stripe API shape change), this throws a `TypeError` _before_ the anomaly-handling mutation is ever called, so the "graceful no-op" path documented and tested for the sibling event type is unreachable here. The resulting uncaught exception propagates up through `processWebhookEvent`, doesn't match `message.startsWith("Unauthorized")` in `route.ts`, and surfaces as a 500 — reproducing, in a sibling code path, precisely the bug class the team already found and fixed once this phase (commit `e49a18d`, "invoice.payment_failed found during live verification"). There is no regression test guarding either of these two event types against missing metadata, unlike the equivalent `checkout.session.completed` case.

**Fix:**

```ts
// line 71
const clerkUserId = subscription.metadata?.clerkUserId;

// line 97
const clerkUserId = subscription.metadata?.clerkUserId;
```

Add regression tests mirroring `convex/stripeWebhooks.test.ts:75-99` for both `customer.subscription.updated` and `customer.subscription.deleted` with `metadata: null`.

## Warnings

### WR-01: Non-constant-time secret comparison on a publicly-callable Convex action

**File:** `convex/stripeWebhooks.ts:29-35`
**Issue:** `processWebhookEvent` is declared with `action(...)` (public), not `internalAction`, so its function reference is reachable by any client that knows the deployment's `NEXT_PUBLIC_CONVEX_URL` (which is, by design, embedded in the public client bundle) — not only via the Next.js route. The only gate protecting it is a plain string comparison:

```ts
if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
```

`!==` is not constant-time; on a shared-secret check for a publicly reachable, database-mutating entry point, this leaves a (admittedly narrow, given secret entropy) timing side-channel. This is a standard "constant-time compare for secrets" finding.
**Fix:** Compare with `crypto.timingSafeEqual` after a length pre-check (to avoid throwing on length mismatch), e.g.:

```ts
import { timingSafeEqual } from "node:crypto";
function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
...
if (!safeEqual(args.secret, process.env.INTERNAL_WEBHOOK_SECRET ?? "")) {
  throw new ConvexError("Unauthorized: invalid INTERNAL_WEBHOOK_SECRET");
}
```

### WR-02: Stripe subscription-enrichment call in the route handler is not wrapped in error handling

**File:** `app/api/webhooks/stripe/route.ts:30-52`
**Issue:** The `checkout.session.completed` enrichment block (`stripe.subscriptions.retrieve(...)`) sits between the signature-verification `try/catch` and the Convex-dispatch `try/catch`, covered by neither. If this network call throws (Stripe rate limiting, transient network failure, invalid/stale subscription id), the exception propagates unhandled out of the route handler instead of going through the deliberate, documented status-code mapping used everywhere else in this file (explicit 400 for auth, explicit 500 with a stable `"Webhook processing failed"` body for genuine failures, with no logging). The resulting behavior is whatever Next.js's default unhandled-route-error handling produces, which is inconsistent with, and unlogged compared to, the rest of this handler's carefully-reasoned error taxonomy (see the D-02/D-10/D-11 comments in the same file).
**Fix:** Wrap the enrichment block in its own try/catch (or extend the existing second `try` to start earlier) and return the same `"Webhook processing failed"` 500 on failure, with a `console.error` for observability, e.g.:

```ts
try {
  if (typeof session.subscription === "string") {
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    ...
  }
} catch (err) {
  console.error("Failed to enrich checkout.session.completed", err);
  return new Response("Webhook processing failed", { status: 500 });
}
```

### WR-03: Auth-failure detection via error-message prefix matching is a brittle, uncompiled contract

**File:** `app/api/webhooks/stripe/route.ts:64-69`
**Issue:** Independent of CR-01's serialization concern, using `message.startsWith("Unauthorized")` as the sole signal to distinguish a 400 from a 500 is a string-matching contract between two files with no shared constant, type, or compiler-enforced link. A future refactor of the message text in `convex/stripeWebhooks.ts` (e.g., a typo fix, i18n, or wording cleanup) silently breaks the 400/500 split with no type error and no obviously-failing test (the mocked test in `route.test.ts` would keep passing since it hardcodes matching text on both sides).
**Fix:** Once CR-01 is addressed with a `ConvexError`/structured-result approach, prefer checking a structured discriminator (e.g., `error instanceof ConvexError && error.data?.code === "unauthorized"`, or a `{ok:false, reason}` return value) instead of a message substring.

### WR-04: `resetCredits` has no explicit success return, inconsistent with every sibling internal mutation

**File:** `convex/aiCredits.ts:23-84`
**Issue:** `upsertSubscription`, `deleteSubscription`, and `markPastDue` (all in `convex/subscriptions.ts`) each explicitly `return { success: true }` on their happy path. `resetCredits` falls off the end of its handler after the final `ctx.db.insert("processedStripeEvents", ...)` (line 82) with no return statement, so it implicitly returns `undefined` on success — the only one of the four sibling mutations with this shape. `stripeWebhooks.ts`'s `invoice.paid` case does `return await ctx.runMutation(internal.aiCredits.resetCredits, {...})`, so this inconsistent shape propagates all the way to the action's return value. Nothing currently consumes that value, so it's not user-visible today, but it's a latent inconsistency waiting to surprise a future caller that pattern-matches on `{ success: true }` the way the codebase does everywhere else.
**Fix:**

```ts
await ctx.db.insert("processedStripeEvents", {
  stripeEventId: args.stripeEventId,
  eventType: args.eventType,
  processedAt: Date.now(),
});

return { success: true };
```

## Info

### IN-01: `event`/`returns` typed as `v.any()` on the primary dispatcher action

**File:** `convex/stripeWebhooks.ts:30-31`
**Issue:** `args: { event: v.any(), secret: v.string() }` and `returns: v.any()` opt the most important argument of this action entirely out of Convex's runtime validation. This is understandable given `Stripe.Event`'s size, but it means every field access inside the `switch` (`session.metadata`, `subscription.items`, `invoice.parent`, etc.) is trusting untyped, unvalidated input — which is exactly the shape of bug CR-02 above.
**Fix:** Not blocking, but consider at least a minimal shape validator (`v.object({ id: v.string(), type: v.string(), data: v.object({ object: v.any() }) })`) so malformed top-level shapes fail fast with a clear Convex validation error instead of a deep, hard-to-trace `TypeError`.

### IN-02: Inconsistent optional-chaining depth for `items.data[0]` between route.ts and stripeWebhooks.ts

**File:** `app/api/webhooks/stripe/route.ts:48`, `convex/stripeWebhooks.ts:78`
**Issue:** `route.ts` reads `subscription.items.data[0]?.current_period_end` (no guard on `items` itself), while `stripeWebhooks.ts`'s `customer.subscription.updated` handler reads the more defensive `subscription.items?.data?.[0]?.current_period_end`. Low real-world risk (Stripe always populates `items` on a retrieved `Subscription`), but the inconsistency suggests the defensive pattern wasn't applied uniformly.
**Fix:** Align `route.ts:48` to `subscription.items?.data?.[0]?.current_period_end ?? 0` for consistency.

### IN-03: Non-null assertions on required env vars with no startup-time validation

**File:** `app/api/webhooks/stripe/route.ts:10, 21, 55, 58`
**Issue:** `STRIPE_SECRET_KEY!`, `STRIPE_WEBHOOK_SECRET!`, `NEXT_PUBLIC_CONVEX_URL!`, and `INTERNAL_WEBHOOK_SECRET!` are all asserted non-null with `!` rather than validated. A missing `STRIPE_SECRET_KEY` (line 10) throws at module load time (breaking every route in the same lambda/bundle if colocated); a missing `INTERNAL_WEBHOOK_SECRET` (line 58) is sent as `undefined` to a `v.string()`-validated Convex arg, producing an `ArgumentValidationError` that reads confusingly compared to a clear "missing required environment variable" message.
**Fix:** Not blocking for a payments webhook route with documented `.env.example` entries, but consider a small `assertEnv(name)` helper that throws a clear, named error at the top of the handler.

---

_Reviewed: 2026-07-08T22:58:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
