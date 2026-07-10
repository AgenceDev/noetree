# Phase 5: AI Credits System - Pattern Map

**Mapped:** 2026-07-10
**Files analyzed:** 10 (7 modified, 3 new; i18n files counted separately below)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File                                                                                                                                    | Role                          | Data Flow                                            | Closest Analog                                                                                                        | Match Quality |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------- |
| `convex/schema.ts` (add `"refund"` literal)                                                                                                          | model                         | CRUD                                                 | `convex/schema.ts` (existing `creditTransactions.type` union, same file)                                              | exact         |
| `convex/aiCredits.ts` `deductCredit` (fill body)                                                                                                     | service/model                 | CRUD (atomic counter)                                | `convex/aiCredits.ts` `resetCredits` (same file, already implemented)                                                 | exact         |
| `convex/aiCredits.ts` `addCredits` (fill body)                                                                                                       | service/model                 | CRUD (atomic counter, idempotent)                    | `convex/subscriptions.ts` `upsertSubscription` + `aiCredits.ts` `resetCredits`                                        | exact         |
| `convex/aiCredits.ts` new public wrapper mutation (e.g. `useCredit`)                                                                                 | controller (Convex mutation)  | request-response                                     | `convex/notes.ts` `createNote` (identity-derived arg, ConvexError on cap)                                             | role-match    |
| `convex/stripeWebhooks.ts` (extend `checkout.session.completed`)                                                                                     | controller (event dispatcher) | event-driven                                         | `convex/stripeWebhooks.ts` (same file, `invoice.paid` branch calling `internal.aiCredits.resetCredits`)               | exact         |
| New Server Action `createTopupCheckoutSession` (location: Claude's discretion, e.g. `app/[locale]/(app)/notes/actions.ts` or co-located near editor) | service (Server Action)       | request-response                                     | `app/[locale]/(marketing)/pricing/actions.ts` `createCheckoutSession`                                                 | exact         |
| `components/editor/EditorToolbar.tsx` / `toolbarItems.tsx` (new `AiActionButton` + `CreditsBalanceBadge`)                                            | component                     | request-response (mutation trigger + reactive query) | `components/editor/EditorToolbar.tsx` (same file, existing `ToolbarButton` for Link/Image)                            | exact         |
| `components/CreditsExhaustedDialog.tsx` (new)                                                                                                        | component                     | request-response                                     | `components/UpgradeModal.tsx`                                                                                         | exact         |
| `hooks/` — new hook or inline logic wiring toolbar click → mutation → dialog open                                                                    | hook                          | request-response                                     | `hooks/useNoteMutations.ts` (`createNote`'s `onError` → `ConvexError.data` check → `upgradeModal.open()`)             | exact         |
| `convex/aiCredits.test.ts` (extend)                                                                                                                  | test                          | CRUD / concurrency                                   | `convex/aiCredits.test.ts` (same file, existing `resetCredits` describe block)                                        | exact         |
| `convex/stripeWebhooks.test.ts` (extend)                                                                                                             | test                          | event-driven                                         | `convex/stripeWebhooks.test.ts` (same file, `seedCheckoutEvent` helper + existing `checkout.session.completed` tests) | exact         |
| `messages/en.json` / `messages/fr.json` (new `AiCredits` namespace)                                                                                  | config (i18n)                 | —                                                    | `messages/en.json` `PlanEnforcement` / `Editor.tooltips` namespaces                                                   | exact         |

## Pattern Assignments

### `convex/schema.ts` (model, CRUD)

**Analog:** same file, `creditTransactions` table definition (lines 61-71)

**Current state to edit:**

```typescript
creditTransactions: defineTable({
  clerkUserId: v.string(),
  type: v.union(
    v.literal("deduction"),
    v.literal("topup"),
    v.literal("reset"),
  ),
  amount: v.number(),
  createdAt: v.number(),
  stripePaymentIntentId: v.optional(v.string()),
}).index("by_clerkUserId", ["clerkUserId"]),
```

**Change (D-07):** add `v.literal("refund")` inside the `v.union(...)` — no index change needed.

---

### `convex/aiCredits.ts` — `deductCredit` (service/model, CRUD atomic-counter)

**Analog:** same file, `resetCredits` (lines 23-84) — already fully implemented, deployed, and proven correct in this exact codebase. This is the strongest possible analog: same file, same table (`aiCredits`), same idempotency/patch-or-insert shape.

**Imports** (file header, lines 1-2):

```typescript
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
```

**Core CRUD pattern to mirror** (`resetCredits`, lines 38-69 — patch-or-insert branch):

```typescript
const existingCredits = await ctx.db
  .query("aiCredits")
  .withIndex("by_clerkUserId", q => q.eq("clerkUserId", clerkUserId))
  .unique();

if (existingCredits) {
  await ctx.db.patch(existingCredits._id, {
    balance: MONTHLY_CREDIT_QUOTA,
    lastResetAt: Date.now(),
  });
} else {
  await ctx.db.insert("aiCredits", {
    clerkUserId,
    balance: MONTHLY_CREDIT_QUOTA,
    lastResetAt: Date.now(),
  });
}

await ctx.db.insert("creditTransactions", {
  clerkUserId,
  type: "reset",
  amount: MONTHLY_CREDIT_QUOTA,
  createdAt: Date.now(),
});
```

`deductCredit` follows the identical read→branch→patch→insert-transaction-row shape, but reads `balance ?? 0` (D-09: no row = 0), throws `Error("INSUFFICIENT_CREDITS")` bare (not `ConvexError`) if `balance < amount` — **note the convention split**: `resetCredits`/`upsertSubscription` use bare `console.error` + anomaly-return for system-level anomalies (webhook-triggered, no client waiting on a specific error), while `notes.ts createNote` uses `throw new ConvexError("NOTE_LIMIT_REACHED")` for a _client-triggered_ mutation whose failure the UI must distinguish. `deductCredit` is client-triggered (via the new public wrapper) and must be distinguishable client-side, so it should follow the `ConvexError` convention from `createNote`, not the bare-`Error`/anomaly-return convention from `resetCredits`. (05-UI-SPEC.md's Copywriting Contract section explicitly names `throw new Error("INSUFFICIENT_CREDITS")` as the illustrative example, but the _actual codebase precedent_ for a client-distinguishable throw in this repo is `ConvexError`, not plain `Error` — see `notes.ts` line 559 excerpt below. Executor/planner should resolve this in favor of the proven `ConvexError` pattern for consistency with `NOTE_LIMIT_REACHED`.)

**Distinguishable-error precedent** (`convex/notes.ts`, lines 553-560):

```typescript
if (ownedNotes.length >= FREE_NOTE_LIMIT) {
  // ConvexError (not a plain Error) is required here: a plain Error's
  // message gets redacted before reaching the client, but
  // ConvexError.data survives the client boundary (see
  // convex/stripeWebhooks.ts and app/api/webhooks/stripe/route.ts for
  // the same pattern already established in this codebase).
  throw new ConvexError("NOTE_LIMIT_REACHED");
}
```

**Idempotency table insert pattern** (identical for `addCredits`, `resetCredits`, `upsertSubscription`):

```typescript
await ctx.db.insert("processedStripeEvents", {
  stripeEventId: args.stripeEventId,
  eventType: args.eventType,
  processedAt: Date.now(),
});
```

---

### `convex/aiCredits.ts` — `addCredits` (service/model, CRUD atomic-counter, idempotent)

**Analog:** `convex/subscriptions.ts` `upsertSubscription` (lines 21-88) for the idempotency-check-first shape, combined with `aiCredits.ts` `resetCredits`'s patch-or-insert body.

**Idempotency check pattern** (`subscriptions.ts`, lines 37-45):

```typescript
const alreadyProcessed = await ctx.db
  .query("processedStripeEvents")
  .withIndex("by_stripeEventId", q => q.eq("stripeEventId", args.stripeEventId))
  .unique();
if (alreadyProcessed) {
  return { alreadyProcessed: true };
}
```

**Required signature extension** (per RESEARCH.md Pitfall 2 — current stub is too narrow):

```typescript
// Current stub (convex/aiCredits.ts, lines 86-91):
export const addCredits = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async () => {
    throw new Error("Not implemented — Phase 2");
  },
});
// Must extend args to: clerkUserId, amount, stripeEventId, eventType,
// stripePaymentIntentId (optional) — mirrors resetCredits' args shape
// (stripeEventId, eventType, ...) plus the schema's optional
// stripePaymentIntentId field on creditTransactions.
```

---

### `convex/aiCredits.ts` — new public wrapper mutation (controller, request-response)

**Analog:** `convex/notes.ts` `createNote` (lines 524-561) for identity derivation + distinguishable-throw shape; `convex/subscriptions.ts` `getSubscription` (lines 4-19) for the identity-derivation pattern itself.

**Identity-derivation pattern** (`subscriptions.ts`, lines 6-17 — IDOR-safe, no client-supplied clerkUserId):

```typescript
export const getSubscription = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});
```

The new wrapper mutation must take `args: {}` (no `clerkUserId` argument — CLAUDE.md/guidelines.md: "NEVER accept a `userId` or any user identifier as a function argument for authorization purposes") and derive `clerkUserId` from `ctx.auth.getUserIdentity()` internally, then call the deduct/act/refund logic as **direct internal helper function calls within the same handler** (not `ctx.runMutation` to `internal.aiCredits.deductCredit`) — per `convex/_generated/ai/guidelines.md` "Function calling" section and RESEARCH.md Pitfall 1: splitting deduct/act/refund across multiple `ctx.runMutation` calls reopens the TOCTOU race D-05 exists to close.

**Anti-pattern warning (from `guidelines.md`, quoted directly):**

> "Try to use as few calls from actions to queries and mutations as possible. Queries and mutations are transactions, so splitting logic up into multiple calls introduces the risk of race conditions."

---

### `convex/stripeWebhooks.ts` (controller/event-dispatcher, event-driven)

**Analog:** same file, `invoice.paid` case (lines 113-129) for the pattern of branching to `internal.aiCredits.*` from inside `processWebhookEvent`; and the `checkout.session.completed` case itself (lines 42-71) which is the exact block to extend.

**Current `checkout.session.completed` case to extend** (lines 42-71):

```typescript
case "checkout.session.completed": {
  const session = args.event.data.object;
  const clerkUserId = session.metadata?.clerkUserId;
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const stripeSubscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

  return await ctx.runMutation(
    internal.subscriptions.upsertSubscription,
    { stripeEventId: args.event.id, eventType: args.event.type, clerkUserId,
      stripeCustomerId, stripeSubscriptionId,
      status: mapStripeSubscriptionStatus(session.subscriptionSnapshot?.status ?? "active"),
      currentPeriodEnd: session.subscriptionSnapshot?.currentPeriodEnd ?? 0,
      cancelAtPeriodEnd: session.subscriptionSnapshot?.cancelAtPeriodEnd ?? false,
    },
  );
}
```

D-14 requires inserting a `session.mode === "payment"` branch (exact match, not inverted — RESEARCH.md Pitfall 4) at the **top** of this case, before the existing subscription logic, routing to `internal.aiCredits.addCredits` with `amount: 50` hardcoded (RESEARCH.md anti-pattern warning: never derive credit amount from Stripe's `amount_total`/line items).

**Sibling branch precedent** (`invoice.paid`, lines 113-129 — same-file example of calling into `internal.aiCredits.*`):

```typescript
case "invoice.paid": {
  const invoice = args.event.data.object;
  const stripeSubscriptionId = /* ... */;

  if (invoice.billing_reason !== "subscription_cycle") {
    return { skipped: true };
  }

  return await ctx.runMutation(internal.aiCredits.resetCredits, {
    stripeEventId: args.event.id,
    eventType: args.event.type,
    stripeSubscriptionId,
  });
}
```

**ConvexError precedent for the auth-guard at the top of `processWebhookEvent`** (lines 33-39, unchanged, shown for context):

```typescript
if (args.secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
  throw new ConvexError("Unauthorized: invalid INTERNAL_WEBHOOK_SECRET");
}
```

---

### New Server Action `createTopupCheckoutSession` (service, request-response)

**Analog:** `app/[locale]/(marketing)/pricing/actions.ts` `createCheckoutSession` (full file, 92 lines) — this is a near 1:1 structural template; D-12 explicitly calls for reusing this pattern with `mode: "payment"` instead of `"subscription"`.

**Full existing analog** (`app/[locale]/(marketing)/pricing/actions.ts`, lines 1-92):

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { redirect as localeRedirect, routing } from "@/i18n/routing";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(locale: string): Promise<void> {
  const safeLocale = (routing.locales as readonly string[]).includes(locale)
    ? locale
    : routing.defaultLocale;

  const { userId, redirectToSignIn, getToken } = await auth();
  if (!userId) {
    redirectToSignIn({ returnBackUrl: `/${safeLocale}/pricing` });
    return;
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  let existing;
  try {
    const convexToken = await getToken({ template: "convex" });
    if (convexToken) convex.setAuth(convexToken);
    existing = await convex.query(api.subscriptions.getSubscription, {});
  } catch (err) {
    console.error(
      "createCheckoutSession: subscription lookup/auth handshake failed",
      err,
    );
    throw new Error("subscriptionLookupFailed");
  }

  if (existing?.status === "active") {
    localeRedirect({ href: "/checkout/success", locale: safeLocale });
    return;
  }

  const baseUrl = process.env.APP_URL!;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(existing?.stripeCustomerId
        ? { customer: existing.stripeCustomerId }
        : {}),
      line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
      metadata: { clerkUserId: userId },
      subscription_data: { metadata: { clerkUserId: userId } },
      success_url: `${baseUrl}/${safeLocale}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/${safeLocale}/pricing`,
    });
  } catch (err) {
    console.error(
      "createCheckoutSession: stripe.checkout.sessions.create failed",
      err,
    );
    throw new Error("checkoutSessionCreationFailed");
  }

  if (session.url) {
    redirect(session.url);
  }
}
```

**Deltas for `createTopupCheckoutSession` (D-12/D-13/D-15):**

- `mode: "payment"` instead of `"subscription"`.
- No `subscription_data` key (payment mode has none).
- `line_items: [{ price: process.env.STRIPE_TOPUP_PRICE_ID!, quantity: 1 }]` (env var already present in `.env.example` line 19, confirmed this session).
- **D-10 defense-in-depth:** if `existing?.status !== "active"`, throw (Free users must not reach Stripe at all) — inverse of the subscription flow's "already active → skip Stripe" short-circuit.
- **D-13:** `success_url`/`cancel_url` both redirect back into the app (e.g. `/notes`), no `/checkout/success` equivalent, no `session_id` query param needed since there's no success page to read it.
- Same `try/catch` narrow-scoping discipline around the Stripe API call only (never wrap `redirect()` in the try, per this file's own inline comment on "Pitfall 4").

---

### `components/editor/EditorToolbar.tsx` / `toolbarItems.tsx` (component, request-response)

**Analog:** same file, existing `ToolbarButton` usage for Link/Image (lines 143-153) and its definition (lines 247-277).

**Toolbar button usage pattern** (`EditorToolbar.tsx`, lines 142-153):

```tsx
{/* Extra features */}
<ToolbarButton
  onClick={openLinkDialog}
  active={editor?.isActive("link")}
  tooltip={t("tooltips.link")}
  icon={<LinkIcon className="h-4 w-4" />}
/>
<ToolbarButton
  onClick={openImageDialog}
  tooltip={t("tooltips.image")}
  icon={<ImageIcon className="h-4 w-4" />}
/>
```

**`ToolbarButton` component definition to reuse as-is** (lines 247-277):

```tsx
interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltip: string;
  icon: React.ReactNode;
}

const ToolbarButton = ({
  onClick,
  active,
  disabled,
  tooltip,
  icon,
}: ToolbarButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant={active ? "secondary" : "ghost"}
        onClick={onClick}
        disabled={disabled}
        className="h-8 w-8"
      >
        {icon}
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{tooltip}</TooltipContent>
  </Tooltip>
);
```

Per 05-UI-SPEC.md: new `AiActionButton` uses `Sparkles` icon (lucide-react), appended as a new group after Link/Image, separated by the existing `<Separator orientation="vertical" className="h-auto!" />` convention (lines 123, 127, 131, 135, 140 show the repeated separator pattern). `disabled={disabled}` prop already exists on `ToolbarButtonProps` — reuse it to grey out (or the button stays enabled but the click opens `CreditsExhaustedDialog`, per D-09 "never hidden" — UI-SPEC leaves exact disabled-vs-blocked-click behavior to planner, but the `disabled` prop is available if that approach is chosen).

**Editor availability guard** (line 44, top of component — apply the same pattern, do not render toolbar contents outside it):

```tsx
if (!editor || !editor.isEditable) return null;
```

**`CreditsBalanceBadge` — no exact analog in this codebase (Badge+Tooltip composition is new)**, but both primitives exist and are used elsewhere (`Tooltip`/`TooltipTrigger`/`TooltipContent` already imported in this same file, lines 6-11). `Badge` is not yet imported here — new import needed: `import { Badge } from "../ui/badge"`.

---

### `components/CreditsExhaustedDialog.tsx` (component, request-response)

**Analog:** `components/UpgradeModal.tsx` (full file, 46 lines) — D-08 explicitly mandates cloning this structure.

**Full existing analog:**

```tsx
"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "@/i18n/routing";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function UpgradeModal({
  open,
  onOpenChange,
}: UpgradeModalProps) {
  const t = useTranslations("PlanEnforcement");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{t("dismiss")}</Button>
          </DialogClose>
          <Button asChild>
            <Link href="/pricing">{t("upgradeCta")}</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Delta for `CreditsExhaustedDialog` (D-11 branching CTA):** the single hardcoded `<Link href="/pricing">` primary button must branch on `subscriptions.status === "active"` (via `api.subscriptions.getSubscription` `useQuery`, same as `isProUser`'s server-side check but client-side here): Free → identical `<Link href="/pricing">{t("upgradeCta")}</Link>`; Pro-at-zero → a `<Button onClick={() => createTopupCheckoutSession()}>` (or `<form action={createTopupCheckoutSession}>`) invoking the new Server Action, both still using the `default` Button variant per 05-UI-SPEC.md Color section. Translation namespace is new: `AiCredits` (not `PlanEnforcement`), per 05-UI-SPEC.md Copywriting Contract.

**Provider wiring analog** (`providers/UpgradeModalProvider.tsx`, full file) — if `CreditsExhaustedDialog` is wired via its own context provider (mirroring `UpgradeModalProvider`) rather than local `useState` in the toolbar, this is the exact pattern to clone:

```tsx
"use client";
import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import UpgradeModal from "@/components/UpgradeModal";

interface UpgradeModalContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}
const UpgradeModalContext = createContext<UpgradeModalContextType | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [isOpen],
  );
  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal open={isOpen} onOpenChange={setIsOpen} />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context)
    throw new Error(
      "useUpgradeModal must be used within an UpgradeModalProvider",
    );
  return context;
}
```

Note: `UpgradeModalProvider` is already mounted in `app/[locale]/(app)/layout.tsx` (confirmed this session), so the editor tree already has access to `useUpgradeModal()`; a parallel `CreditsExhaustedDialogProvider` would need the same layout-level mounting, OR simpler: manage `open`/`onOpenChange` state locally in `EditorToolbar.tsx` (also a valid, lower-risk choice — no new provider file needed) since the dialog only needs to be triggered from one place (the toolbar), unlike `UpgradeModal` which is triggered from multiple mutation call sites (`createNote`, potentially others).

---

### Client-side mutation wiring (hook, request-response)

**Analog:** `hooks/useNoteMutations.ts` `createNote` mutation (lines 55-91) — the exact precedent for "Convex mutation + TanStack Query wrapper + `ConvexError.data` check in `onError` → open a blocking dialog."

**Full pattern to mirror:**

```typescript
import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { useUpgradeModal } from "@/providers/UpgradeModalProvider"; // or new dialog's hook

const createNoteMutate = useConvexMutation(api.notes.createNote);
const createNote = useMutation<
  Id<"notes">,
  Error,
  Parameters<typeof createNoteMutate>[0],
  { previousTree: NoteTree | undefined }
>({
  mutationFn: createNoteMutate,
  onError: (err, variables, context) => {
    if (err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED") {
      upgradeModal.open();
    }
  },
  // ...
});
```

For the AI toolbar action, the equivalent shape is: `useConvexMutation(api.aiCredits.<newWrapperMutation>)` wrapped in `useMutation`, with `onError` checking `err instanceof ConvexError && err.data === "INSUFFICIENT_CREDITS"` → open `CreditsExhaustedDialog`. No optimistic-update (`onMutate`) needed here (unlike `createNote`'s tree-patching) since there's no local list state to predict — the balance badge updates reactively via its own separate `useQuery(api.aiCredits.getCredits)` subscription once the mutation commits server-side.

---

### `convex/aiCredits.test.ts` (test, CRUD/concurrency)

**Analog:** same file, existing `describe("aiCredits.resetCredits / getCredits")` block (full file, 154 lines) — exact structural template for new `describe("aiCredits.deductCredit")` / `describe("aiCredits.addCredits")` blocks.

**Module map + convexTest setup** (lines 1-10, reuse verbatim):

```typescript
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = (
  import.meta as unknown as {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("./**/*.ts");
```

**Idempotency test pattern to mirror for `addCredits`** (lines 69-99):

```typescript
it("is idempotent by stripeEventId — replay returns alreadyProcessed and does not duplicate the creditTransactions row", async () => {
  const t = convexTest(schema, modules);
  // ... seed ...
  const first = await t.mutation(internal.aiCredits.resetCredits, {
    /* ... */
  });
  expect(first).not.toEqual({ alreadyProcessed: true });
  const second = await t.mutation(internal.aiCredits.resetCredits, {
    /* same args */
  });
  expect(second).toEqual({ alreadyProcessed: true });
  // assert balance unchanged, transaction count still 1
});
```

**Concurrency test construction note (RESEARCH.md Validation Architecture, Wave 0 gap):** `convex-test`'s `t.mutation` calls are sequential/awaited by default — a true TOCTOU-race test must use `Promise.all([t.mutation(...), t.mutation(...)])` against the same `t` instance to actually exercise concurrent execution, not two sequential calls.

---

### `convex/stripeWebhooks.test.ts` (test, event-driven)

**Analog:** same file, `seedCheckoutEvent` helper (lines 14-34) and existing `checkout.session.completed` tests (lines 56-73).

**Fixture helper to extend or sibling-add** (lines 14-34 — note: no `mode` field currently set, per RESEARCH.md Pitfall 4):

```typescript
const seedCheckoutEvent = (
  id: string,
  clerkUserId: string,
  stripeCustomerId: string,
  stripeSubscriptionId: string,
) => ({
  id,
  type: "checkout.session.completed",
  data: {
    object: {
      metadata: { clerkUserId },
      customer: stripeCustomerId,
      subscription: stripeSubscriptionId,
      subscriptionSnapshot: {
        status: "active",
        currentPeriodEnd: 555,
        cancelAtPeriodEnd: false,
      },
    },
  },
});
```

A new `seedTopupCheckoutEvent` fixture (or a `mode` param added to this one) must explicitly set `mode: "payment"` and omit `subscription`/`subscriptionSnapshot`, while the existing fixture's implicit `mode: undefined` must continue to route to the subscription branch unmodified (regression requirement — existing tests at lines 56-73 must keep passing).

**Auth-guard test pattern** (lines 41-54, reuse verbatim shape for any new test needing the secret):

```typescript
await expect(
  t.action(api.stripeWebhooks.processWebhookEvent, {
    secret: "wrong-secret",
    event: {
      id: "evt_bad",
      type: "checkout.session.completed",
      data: { object: {} },
    },
  }),
).rejects.toThrow(/^Unauthorized/);
```

---

### `messages/en.json` / `messages/fr.json` (config/i18n)

**Analog:** `messages/en.json` `PlanEnforcement` namespace (lines 150-155) and `Editor.tooltips` namespace (lines 158-179).

**Namespace shape to mirror:**

```json
"PlanEnforcement": {
  "title": "You've reached the Free plan limit",
  "body": "Free plans include up to 20 notes. Upgrade to Pro for unlimited notes and 100 AI credits a month.",
  "upgradeCta": "Upgrade to Pro",
  "dismiss": "Maybe later"
},
```

New `AiCredits` namespace follows this same flat structure (per 05-UI-SPEC.md Copywriting Contract table — `dialogTitle`, `dialogBodyFree`, `dialogBodyPro`, `upgradeCta`, `topupCta`, `dismiss`, `toolbarTooltip`, `badgeTooltip` — exact key names at planner's discretion, values locked in UI-SPEC). `Editor.tooltips` namespace (line 158) is where the new toolbar button's tooltip key belongs, following the existing flat `"link": "..."`, `"image": "..."` sibling-key convention (lines 177-178).

---

## Shared Patterns

### Identity derivation (never client-supplied clerkUserId)

**Source:** `convex/subscriptions.ts` `getSubscription` (lines 6-17), `convex/helpers/helper.ts` `isProUser` (lines 27-41)
**Apply to:** the new public wrapper mutation in `convex/aiCredits.ts`, and defense-in-depth inside the new Server Action

```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) return null; // or throw, depending on context
// use identity.subject / identity.tokenIdentifier — never accept clerkUserId as an arg
```

### Distinguishable client-visible errors (ConvexError, not bare Error)

**Source:** `convex/notes.ts` line 559 (`NOTE_LIMIT_REACHED`)
**Apply to:** `deductCredit` / the new public wrapper mutation (`INSUFFICIENT_CREDITS`)

```typescript
throw new ConvexError("INSUFFICIENT_CREDITS");
```

Client catches via `err instanceof ConvexError && err.data === "INSUFFICIENT_CREDITS"` (see `hooks/useNoteMutations.ts` lines 82-84).

### Stripe webhook idempotency (`processedStripeEvents` table)

**Source:** `convex/subscriptions.ts` `upsertSubscription` (lines 37-45), `convex/aiCredits.ts` `resetCredits` (lines 30-36)
**Apply to:** `addCredits`

```typescript
const already = await ctx.db
  .query("processedStripeEvents")
  .withIndex("by_stripeEventId", q => q.eq("stripeEventId", args.stripeEventId))
  .unique();
if (already) return { alreadyProcessed: true };
// ... at the end, after all writes:
await ctx.db.insert("processedStripeEvents", {
  stripeEventId: args.stripeEventId,
  eventType: args.eventType,
  processedAt: Date.now(),
});
```

### Patch-or-insert on a possibly-nonexistent row

**Source:** `convex/aiCredits.ts` `resetCredits` (lines 53-69)
**Apply to:** `deductCredit`, `addCredits`

```typescript
if (existingRow) {
  await ctx.db.patch(existingRow._id, {
    /* updated fields */
  });
} else {
  await ctx.db.insert("aiCredits", {
    /* full new row */
  });
}
```

`ctx.db.patch` throws if the document doesn't exist (guidelines.md, Mutation guidelines) — this branch is mandatory, not optional.

### Server Action Stripe Checkout Session creation

**Source:** `app/[locale]/(marketing)/pricing/actions.ts` (full file)
**Apply to:** new `createTopupCheckoutSession`
See full excerpt in the "New Server Action" section above — `"use server"`, `auth()` for identity, `ConvexHttpClient` + `getToken({ template: "convex" })` for authenticated Convex query, narrow `try/catch` around only the Stripe API call, `redirect(session.url)` outside any try block.

### Toolbar button + Dialog + Tooltip composition

**Source:** `components/editor/EditorToolbar.tsx` (`ToolbarButton`, lines 247-277) + `components/UpgradeModal.tsx` (full file)
**Apply to:** `AiActionButton`, `CreditsBalanceBadge`, `CreditsExhaustedDialog`
All reuse existing installed shadcn primitives (`Dialog`, `Badge`, `Tooltip`, `Button`, `Separator`) — no new component installs required (confirmed in 05-UI-SPEC.md Registry Safety section).

## No Analog Found

| File                                                           | Role      | Data Flow                              | Reason                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CreditsBalanceBadge` (Badge+Tooltip composition specifically) | component | request-response (reactive `useQuery`) | No existing component in this codebase combines `Badge variant="secondary"` wrapped in `Tooltip` — both primitives exist and are used separately (Tooltip in `EditorToolbar.tsx`, Badge unused in this file so far) but never composed together. Low risk: both primitives are simple, already-installed shadcn components; composition is straightforward per 05-UI-SPEC.md's explicit instruction. |

## Metadata

**Analog search scope:** `convex/` (all `.ts` function files + `.test.ts` files), `components/` (editor/, UpgradeModal.tsx, ui/), `providers/`, `hooks/`, `app/[locale]/(marketing)/pricing/`, `app/[locale]/(app)/`, `messages/en.json`
**Files scanned:** 17 (convex/aiCredits.ts, convex/schema.ts, convex/stripeWebhooks.ts, convex/subscriptions.ts, convex/notes.ts, convex/helpers/helper.ts, convex/aiCredits.test.ts, convex/stripeWebhooks.test.ts, components/UpgradeModal.tsx, components/editor/EditorToolbar.tsx, components/editor/toolbarItems.tsx, providers/UpgradeModalProvider.tsx, hooks/useNoteMutations.ts, app/[locale]/(marketing)/pricing/actions.ts, app/[locale]/(app)/notes/page.tsx, messages/en.json, convex/\_generated/ai/guidelines.md)
**Pattern extraction date:** 2026-07-10
