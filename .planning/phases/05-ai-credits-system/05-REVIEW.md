---
phase: 05-ai-credits-system
reviewed: 2026-07-10T00:00:00Z
fixed: 2026-07-11T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - app/[locale]/(app)/notes/actions.ts
  - components/CreditsExhaustedDialog.tsx
  - components/editor/EditorToolbar.tsx
  - convex/aiCredits.test.ts
  - convex/aiCredits.ts
  - convex/schema.ts
  - convex/stripeWebhooks.test.ts
  - convex/stripeWebhooks.ts
  - messages/en.json
  - messages/fr.json
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
findings_fixed:
  critical: 1
  warning: 4
status: fixed
---

## Disposition (2026-07-11)

Fixed before phase closeout: **CR-01** (converted `getCredits` to `internalQuery`,
updated 19 test call sites across `aiCredits.test.ts`/`stripeWebhooks.test.ts`),
**WR-01** (positive-integer `amount` validation in `applyDeduction` and
`addCredits`), **WR-02** (`invoice.paid` undefined-`stripeSubscriptionId`
guard, mirroring `invoice.payment_failed`), **WR-03** (`cancel_at_period_end`
`?? false` fallback), **WR-04** (explicit `checkout.session.completed` mode
check, `undefined` treated as `subscription` for backward compatibility with
pre-existing test fixtures).

Left as documented follow-ups (UX polish / non-blocking, not correctness or
security bugs): **WR-05** (generic error toast for unhandled `runAiAction`
failures), **WR-06** (disable AI button while `runAiAction` is pending), and
all five **Info** items (magic-number extraction, dead refund-path coverage,
`identity.subject` vs `tokenIdentifier` consistency, etc.).

Re-verified after fixes: `npx tsc --noEmit` 0 errors, `npm run test:unit`
79/79 passing, `npm run build` succeeds.

# Phase 05: Code Review Report

**Reviewed:** 2026-07-10T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the AI credits system: the credit ledger/deduction logic in
`convex/aiCredits.ts`, the Stripe webhook dispatch additions in
`convex/stripeWebhooks.ts`, the top-up Server Action, the credits-exhausted
dialog, the editor toolbar's AI action + balance badge, and both locale
message files. The transactional deduction logic (`applyDeduction`) and its
TOCTOU-safety are sound, and idempotency handling for both `resetCredits`
and `addCredits` is correctly tested and implemented. However, `getCredits`
was implemented in this phase as a fully public query that accepts an
arbitrary client-supplied `clerkUserId` with **no authentication check at
all** — this is a real, currently-exploitable IDOR / broken-access-control
bug that lets any caller (authenticated or not) read any other user's AI
credit balance. This directly contradicts the security pattern this same
file follows correctly in `runAiAction` and `getMyCredits`, and the pattern
already fixed in `subscriptions.ts` (referenced by this file's own
comments as "03-REVIEW.md CR-01"). Several secondary robustness gaps in the
Stripe webhook dispatcher (missing guards for undefined/malformed fields
that are guarded elsewhere in the same file) and a couple of client-side
error-handling gaps round out the findings below.

## Critical Issues

### CR-01: `getCredits` is a public query with no auth check — any caller can read any user's credit balance by clerkUserId (IDOR)

**File:** `convex/aiCredits.ts:53-61`
**Issue:**

```ts
export const getCredits = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
```

`getCredits` is registered with `query` (not `internalQuery`), so it is part
of the public Convex API surface (`api.aiCredits.getCredits`). Its handler
never calls `ctx.auth.getUserIdentity()` and trusts the client-supplied
`clerkUserId` argument directly. Any caller — authenticated as any user, or
entirely unauthenticated — can invoke this function with an arbitrary
`clerkUserId` string and receive that user's AI credit balance
(`{ balance, lastResetAt }`). This is a textbook IDOR / broken access
control finding, and it directly violates:

- This codebase's own established rule, stated in this very file's comment
  above `runAiAction` ("clerkUserId is derived exclusively from the
  caller's authenticated Convex identity... mirrors subscriptions.ts
  getSubscription and 03-REVIEW.md CR-01") — that exact fix was never
  applied to `getCredits`.
- The Convex guidelines this project is bound to
  (`convex/_generated/ai/guidelines.md:182`): "NEVER accept a `userId` or
  any user identifier as a function argument for authorization purposes.
  Always derive the user identity server-side via
  `ctx.auth.getUserIdentity()`."

This is a live handler with real logic (not a stub) — it was fully
implemented in this phase (previously it threw `"Not implemented — Phase
2"`). `getMyCredits` already exists as the correct authenticated
self-lookup and is what the client (`EditorToolbar.tsx`) actually uses, so
`getCredits` is unused by any first-party client code — but it remains
reachable by any external Convex client against this deployment.

**Fix:** Either remove client reachability by converting this to an
`internalQuery`, or add an authorization check that only allows a caller to
read their own balance:

```ts
export const getCredits = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
```

(Note: converting to `internalQuery` will require updating the test files,
which currently call it via `api.aiCredits.getCredits` — update those
calls to `internal.aiCredits.getCredits` accordingly, or run them via
`t.run`.)

## Warnings

### WR-01: `applyDeduction` / `deductCredit` / `addCredits` never validate that `amount` is positive

**File:** `convex/aiCredits.ts:18-51, 63-69, 192-244`
**Issue:** `applyDeduction`'s balance check is `if (balance < amount) throw
...`. If `amount` is `0` or negative, this check passes even when it
shouldn't, and the "insert" branch's comment ("Defensive-only branch:
unreachable when balance < amount already threw above ... amount is always

> = 1") is false in general — it's only true because the sole current
> caller (`runAiAction`) hardcodes `amount: 1`. Nothing in the type system or
> validator (`v.number()`, no `v.number()` positivity constraint) enforces
> this. If a future internal caller passes `amount <= 0` to `deductCredit`
> (e.g. `-5`), the check `balance < amount` is false, and
> `balance - amount` **increases** the balance — turning a "deduction" call
> into an uncontrolled credit grant. The same absence of validation applies
> to `addCredits`' `amount` argument.
> **Fix:** Validate the amount is a positive integer at the top of
> `applyDeduction` and `addCredits`:

```ts
if (!Number.isInteger(amount) || amount <= 0) {
  throw new ConvexError("INVALID_AMOUNT");
}
```

### WR-02: `invoice.paid` doesn't guard against an undefined `stripeSubscriptionId`, unlike the symmetric `invoice.payment_failed` handler

**File:** `convex/stripeWebhooks.ts:141-157`
**Issue:** `resetCredits`'s `stripeSubscriptionId` arg is a required
`v.string()` (see `convex/aiCredits.ts:129-134`). In the `invoice.paid`
case, `stripeSubscriptionId` is derived the same way as in
`invoice.payment_failed` (from `invoice.parent?.subscription_details?...`)
and can be `undefined` for standalone/malformed invoices. The
`invoice.payment_failed` handler explicitly guards this
(`if (!stripeSubscriptionId) return { skipped: true };`, with a comment
explaining exactly why: an unguarded call would throw an uncaught
`ArgumentValidationError`, surfacing as a 500 to Stripe and triggering
endless retries. `invoice.paid` has no equivalent guard — it only checks
`billing_reason !== "subscription_cycle"` before calling `resetCredits`
unconditionally with a possibly-`undefined` `stripeSubscriptionId`.
**Fix:**

```ts
if (invoice.billing_reason !== "subscription_cycle") {
  return { skipped: true };
}
if (!stripeSubscriptionId) {
  return { skipped: true };
}
return await ctx.runMutation(internal.aiCredits.resetCredits, { ... });
```

### WR-03: `customer.subscription.updated` passes `cancel_at_period_end` through with no fallback, inconsistent with the sibling checkout-session branch

**File:** `convex/stripeWebhooks.ts:101-125`
**Issue:** `upsertSubscription`'s `cancelAtPeriodEnd` arg is a required
`v.boolean()`. In the `checkout.session.completed` (subscription) branch,
this value is defaulted: `session.subscriptionSnapshot?.cancelAtPeriodEnd
?? false`. In `customer.subscription.updated`, it's passed straight
through: `cancelAtPeriodEnd: subscription.cancel_at_period_end` with no
`??` fallback. If this field is ever missing/undefined on the incoming
payload, the call throws an uncaught `ArgumentValidationError` (500 to
Stripe), the same failure mode the codebase's own comments call out as a
problem to avoid elsewhere in this file.
**Fix:**

```ts
cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
```

### WR-04: `checkout.session.completed` routes non-"payment" modes to the subscription path by negation instead of explicit check

**File:** `convex/stripeWebhooks.ts:46-99`
**Issue:** The handler branches with `if (session.mode === "payment") {
... }` and treats everything else as a subscription checkout. Stripe
Checkout Sessions also support `mode: "setup"` (and potentially future
modes). A `setup`-mode session would fall through to the subscription
branch, attempt to resolve `session.subscription`/`session.subscriptionSnapshot`
(which won't exist for a setup session), and call `upsertSubscription`
with `stripeSubscriptionId: undefined` — hitting the same
`ArgumentValidationError`-to-500 failure mode described in WR-02/WR-03,
just via implicit mode-inference rather than a missing null check.
**Fix:**

```ts
if (session.mode === "payment") {
  /* ...top-up... */
}
if (session.mode !== "subscription") {
  console.error(
    `checkout.session.completed anomaly: unexpected mode ${session.mode}`,
  );
  return { anomaly: "unexpected checkout mode" };
}
/* ...subscription path... */
```

### WR-05: `runAiAction`'s `onError` only handles `INSUFFICIENT_CREDITS`; every other failure is silently swallowed

**File:** `components/editor/EditorToolbar.tsx:67-75`
**Issue:**

```ts
const runAiAction = useMutation({
  mutationFn: runAiActionMutate,
  onError: err => {
    if (err instanceof ConvexError && err.data === "INSUFFICIENT_CREDITS") {
      setCreditsDialogOpen(true);
    }
  },
});
```

If `runAiAction` throws for any other reason — `UNAUTHENTICATED` (thrown
by the mutation when there's no identity), a network failure, or an
unexpected server error — the user clicks the AI action button and gets no
feedback whatsoever: no dialog, no toast, no error state. The failure is
silently discarded.
**Fix:** Add a fallback branch (e.g. a generic toast) for the `else` case
so unhandled errors are surfaced to the user instead of disappearing.

### WR-06: AI-action toolbar button has no pending/disabled state while the mutation is in flight

**File:** `components/editor/EditorToolbar.tsx:191-195`
**Issue:** `ToolbarButton` supports a `disabled` prop, but it isn't wired
to `runAiAction.isPending` for the AI action button. A user can click the
button repeatedly before the balance badge re-renders, firing multiple
concurrent `runAiAction` mutations. Server-side balance enforcement
(`applyDeduction`) prevents this from over-spending credits, but it's a
missed UX affordance and can produce redundant errors/dialog flashes for
the user.
**Fix:**

```tsx
<ToolbarButton
  onClick={handleAiAction}
  disabled={runAiAction.isPending}
  tooltip={t("tooltips.aiAction")}
  icon={<Sparkles className="h-4 w-4" />}
/>
```

## Info

### IN-01: Misleading "unreachable" comment on `applyDeduction`'s insert branch

**File:** `convex/aiCredits.ts:36-37`
**Issue:** The comment asserts the insert branch is unreachable because
"amount is always >= 1," but nothing enforces that invariant (see WR-01).
The comment documents an assumption, not a guarantee.
**Fix:** Either add the validation from WR-01 (making the comment true) or
soften the comment to note it's only true for the current caller.

### IN-02: Top-up amount (50 credits) is a magic number duplicated across backend and UI copy with no shared source of truth

**File:** `convex/stripeWebhooks.ts:65`, `messages/en.json:161`, `messages/fr.json:161`
**Issue:** `amount: 50` in `stripeWebhooks.ts` and the "Buy 50 credits" /
"Acheter 50 crédits" copy in both locale files must stay manually in sync.
Unlike `MONTHLY_CREDIT_QUOTA` (a named constant in `aiCredits.ts`), the
top-up amount has no equivalent named constant, so a future price/quantity
change is easy to apply inconsistently.
**Fix:** Extract a `TOPUP_CREDIT_AMOUNT` constant near `MONTHLY_CREDIT_QUOTA`
in `aiCredits.ts` and reference it from `stripeWebhooks.ts`.

### IN-03: `createTopupCheckoutSession` silently no-ops if `session.url` is falsy

**File:** `app/[locale]/(app)/notes/actions.ts:80-82`
**Issue:**

```ts
if (session.url) {
  redirect(session.url);
}
```

If `session.url` is missing (Stripe returns a session without a URL — rare
but possible for certain configurations), the function just returns. The
caller (a `<form action={...}>` submit) sees the action "succeed" with no
navigation and no error, giving no signal that checkout failed to start.
**Fix:** `throw new Error("checkoutSessionMissingUrl")` in the `else`
branch so the failure is at least observable/loggable.

### IN-04: `runAiAction`'s refund branch is dead code, currently untested

**File:** `convex/aiCredits.ts:94-110`
**Issue:** `actionSucceeded` is hardcoded `true`, so the refund branch
(`if (!actionSucceeded) { ... }`) never executes. This is documented as
intentional scaffolding for a future real AI action (D-01/D-04/D-06), but
as written it is unreachable and has no test coverage exercising the
refund path — if it does have a latent bug, nothing will catch it until a
future phase wires up a real failure path.
**Fix:** No action required now, but flag for coverage when the real AI
action is implemented in a future phase.

### IN-05: `identity.subject` used as the canonical user key instead of `identity.tokenIdentifier`

**File:** `convex/aiCredits.ts:81, 124`
**Issue:** The project's own Convex guidelines
(`convex/_generated/ai/guidelines.md:181`) state: "prefer
`identity.tokenIdentifier` over `identity.subject` ... Do NOT use
`identity.subject` alone as a global identity key." `runAiAction` and
`getMyCredits` both key off `identity.subject`. This matches the
pre-existing pattern already used in `subscriptions.ts`
(`getSubscription`), so it's a consistency note rather than a new defect
introduced by this phase — but it's a real deviation from the project's
documented guideline and worth a follow-up decision (fix everywhere, or
formally accept `subject` as the app's identity key).

---

_Reviewed: 2026-07-10T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
