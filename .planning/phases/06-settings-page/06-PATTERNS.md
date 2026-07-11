# Phase 6: Settings Page - Pattern Map

**Mapped:** 2026-07-11
**Files analyzed:** 8 (2 new, 1 modified Convex file, 1 modified component, 2 new i18n additions, 2 new test files)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File                                                                                                            | Role                      | Data Flow                                      | Closest Analog                                                              | Match Quality                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/(app)/settings/page.tsx`                                                                                       | component (route/page)    | request-response + streaming (reactive read)   | `app/[locale]/(marketing)/pricing/page.tsx`                                 | exact (same reactive `useQuery(convexQuery(...))` shell over `subscriptions.getSubscription`, same Card composition)              |
| `app/[locale]/(app)/settings/actions.ts`                                                                                     | service (Server Action)   | request-response (single outbound Stripe call) | `app/[locale]/(app)/notes/actions.ts` (`createTopupCheckoutSession`)        | exact (Clerk `auth()` → identity-forwarded Convex query → guarded Stripe call → narrow try/catch)                                 |
| `app/[locale]/(app)/settings/actions.test.ts`                                                                                | test                      | request-response                               | `app/[locale]/(marketing)/pricing/actions.test.ts`                          | exact (same vi.mock shape for `stripe`, `convex/browser`, `@clerk/nextjs/server`, `next/navigation`)                              |
| `convex/aiCredits.ts` — new `listMyTopups` query                                                                             | service (Convex query)    | CRUD (read)                                    | `convex/aiCredits.ts` `getMyCredits` (same file)                            | exact (identical identity-derivation pattern, same file)                                                                          |
| `convex/aiCredits.test.ts` — appended tests for `listMyTopups`                                                               | test                      | CRUD (read)                                    | `convex/aiCredits.test.ts` `describe("aiCredits.getMyCredits")` block       | exact (same `convexTest` + `withIdentity` harness, same file)                                                                     |
| `components/nav-user.tsx` (modified)                                                                                         | component (dropdown menu) | event-driven (click → navigate)                | `components/nav-user.tsx` existing "Account" `DropdownMenuItem` (same file) | exact                                                                                                                             |
| `messages/en.json` / `messages/fr.json` — new `Settings` namespace                                                           | config (i18n)             | —                                              | `messages/en.json` `Pricing`/`AiCredits`/`PlanEnforcement` namespaces       | exact (flat key-value namespace convention)                                                                                       |
| Optional: `components/SettingsPlanCard.tsx` / `components/SettingsCreditsCard.tsx` (if extracted per RESEARCH.md discretion) | component                 | request-response + streaming (reactive read)   | `components/CreditsExhaustedDialog.tsx`                                     | role-match (client component reading `getSubscription`/`getMyCredits` via `useQuery(convexQuery(...))`, branching UI on `status`) |

## Pattern Assignments

### `app/[locale]/(app)/settings/page.tsx` (component, request-response/streaming)

**Analog:** `app/[locale]/(marketing)/pricing/page.tsx` (full file read, 108 lines) + `app/[locale]/(app)/notes/page.tsx` for `useHeaderConfig` shell

**Imports pattern** (`pricing/page.tsx` lines 1-18):

```typescript
"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useTranslations, useLocale } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createCheckoutSession } from "./actions";
```

**Reactive read pattern** (`pricing/page.tsx` lines 27-34, use for all three reads: `getSubscription`, `getMyCredits`, `listMyTopups`):

```typescript
// Pattern 3 / Pitfall 5: "skip" sentinel, never `enabled: false`.
// Security: no clerkUserId arg — the query derives the caller's identity
// from Convex auth itself (IDOR fix, 03-REVIEW.md CR-01).
const { data } = useQuery(
  convexQuery(api.subscriptions.getSubscription, isSignedIn ? {} : "skip"),
);

const isActive = data?.status === "active";
```

**Page-title shell pattern** (`app/[locale]/(app)/notes/page.tsx` line 693-695 — call inside the client component to set the app shell's header title; Settings page needs the equivalent call, e.g. `useHeaderConfig({ title: t("title") })`):

```typescript
useHeaderConfig({
  title: t("title"),
  search: /* ... conditionally rendered search input, omit for Settings — no search needed */
});
```

Import: `import { useHeaderConfig } from "@/providers/HeaderProvider";`

**Currency/date pitfall (MUST apply)** — `currentPeriodEnd` is Unix **seconds**, not ms (verified `convex/stripeWebhooks.ts` line 126):

```typescript
const renewalDate = subscription?.currentPeriodEnd
  ? new Date(subscription.currentPeriodEnd * 1000)
  : null;
```

**Card composition pattern** (`pricing/page.tsx` lines 62-104 — two stacked `Card`s, `CardHeader`/`CardTitle`/`CardContent`/`CardFooter`):

```typescript
<Card>
  <CardHeader>
    <CardTitle className="text-xl">{t("proName")}</CardTitle>
    {isActive && <Badge variant="default">{t("currentPlanBadge")}</Badge>}
  </CardHeader>
  <CardContent className="space-y-4">
    <p className="text-base font-semibold">{t("proPrice")}</p>
  </CardContent>
  {!isActive && (
    <CardFooter className="flex-col items-stretch gap-2">
      <Button className="h-11" onClick={handleUpgrade} disabled={isPending}>
        {t("upgradeCta")}
      </Button>
    </CardFooter>
  )}
</Card>
```

For Settings D-11 (Free CTA): replace `handleUpgrade`/Server-Action call with a plain `<Link href="/pricing">` (see `UpgradeModal.tsx` lines 39-41 for the `Button asChild` + `Link` idiom):

```typescript
<Button asChild>
  <Link href="/pricing">{t("upgradeCta")}</Link>
</Button>
```

**Cancel confirmation AlertDialog pattern** (`app/[locale]/(app)/notes/page.tsx` lines 927-965 — this is the real, already-deployed `AlertDialog` consumer in this codebase; CONTEXT.md's claim that AlertDialog is "unused" is inaccurate — this file already uses it for delete/leave confirmation, making it the direct structural template, not just the empty primitive):

```typescript
<AlertDialog
  open={deleteAlertDialogOpen}
  onOpenChange={setDeleteAlertDialogOpen}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{t("deleteConfirmDesc")}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setDeleteAlertDialogOpen(false)}>
        {t("cancel")}
      </AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        onClick={() => { /* call cancelSubscription Server Action */ }}
      >
        {t("delete")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Imports (`notes/page.tsx` lines 76-85):

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

**Error handling pattern** (`pricing/page.tsx` lines 36-53 — `isPending`/`error` local state around a Server Action call, no redirect expected for cancel/resume so no throw-catch confusion per Pitfall 4):

```typescript
async function handleUpgrade() {
  setError(false);
  setIsPending(true);
  try {
    await createCheckoutSession(locale);
  } catch (err) {
    console.error("Checkout upgrade failed", err);
    setError(true);
  } finally {
    setIsPending(false);
  }
}
```

---

### `app/[locale]/(app)/settings/actions.ts` (service/Server Action, request-response)

**Analog:** `app/[locale]/(app)/notes/actions.ts` (`createTopupCheckoutSession`, full file, 84 lines) — this is the RESEARCH.md-locked Pattern 1 template, already read in full above.

**Full structural template to mirror twice** (once for `cancelSubscription`, once for `resumeSubscription` — only the boolean value and the guard condition differ):

```typescript
"use server";

import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function cancelSubscription(): Promise<void> {
  const { userId, getToken } = await auth();
  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  let existing;
  try {
    const convexToken = await getToken({ template: "convex" });
    if (convexToken) convex.setAuth(convexToken);
    existing = await convex.query(api.subscriptions.getSubscription, {});
  } catch (err) {
    console.error(
      "cancelSubscription: subscription lookup/auth handshake failed",
      err,
    );
    throw new Error("subscriptionLookupFailed");
  }

  // Defense-in-depth: never trust the UI only shows this button to an active
  // Pro user — re-verify server-side before any Stripe call (mirrors
  // notes/actions.ts's TOPUP_REQUIRES_PRO guard).
  if (existing?.status !== "active" || !existing.stripeSubscriptionId) {
    throw new Error("CANCEL_REQUIRES_ACTIVE_SUBSCRIPTION");
  }

  try {
    await stripe.subscriptions.update(existing.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  } catch (err) {
    console.error(
      "cancelSubscription: stripe.subscriptions.update failed",
      err,
    );
    throw new Error("cancelFailed");
  }

  // No redirect() and no direct Convex write here — the webhook dispatcher
  // updates Convex asynchronously; the client's useQuery re-renders
  // reactively once the customer.subscription.updated event lands.
}
```

`resumeSubscription` mirrors this exactly except: guard is `existing?.cancelAtPeriodEnd !== true` (instead of `status !== "active"`), and the Stripe call is `cancel_at_period_end: false`.

**Anti-pattern warning (Pitfall 4, from `pricing/actions.ts` line 89-91 vs. this phase's actions):** the checkout Server Actions call `redirect(session.url)` strictly OUTSIDE their try/catch. Cancel/resume actions in this phase need **no `redirect()` at all** — do not copy the `redirect()` call from `createCheckoutSession`/`createTopupCheckoutSession`, only the try/catch shape around the Stripe call.

---

### `app/[locale]/(app)/settings/actions.test.ts` (test, request-response)

**Analog:** `app/[locale]/(marketing)/pricing/actions.test.ts` (full file, 155 lines, already read above)

**Mock shape to replicate exactly** (lines 1-50):

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockSessionsCreate = vi.fn(); // → rename to mockSubscriptionsUpdate for stripe.subscriptions.update
const mockConvexQuery = vi.fn();
const mockAuth = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      subscriptions: { update: mockSubscriptionsUpdate }, // note: subscriptions.update, not checkout.sessions.create
    };
  }),
}));

const mockSetAuth = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(function ConvexHttpClientMock() {
    return {
      query: mockConvexQuery,
      setAuth: mockSetAuth,
    };
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));
```

Note: this phase's actions do not call `redirect()`, so the `next/navigation` mock block (lines 33-39 in the analog) is NOT needed — omit it.

**Guard-rejection test pattern to mirror** (analog lines 140-154, "a thrown Convex auth-handshake/query failure surfaces as ... never reaching Stripe"): assert `cancelSubscription` rejects with `CANCEL_REQUIRES_ACTIVE_SUBSCRIPTION` for a Free/canceled caller and that `mockSubscriptionsUpdate` is never called — same shape as `notes/actions.ts`'s existing `TOPUP_REQUIRES_PRO` test coverage (see `Sources` in RESEARCH.md; the equivalent `notes/actions.test.ts` file was searched for but not found in this codebase at the time of this pattern map — use `pricing/actions.test.ts`'s guard-test shape, e.g. the "already-active subscription short-circuits" test at lines 77-94, as the structural template instead).

---

### `convex/aiCredits.ts` — new `listMyTopups` query (service, CRUD read)

**Analog:** `convex/aiCredits.ts` `getMyCredits` (same file, lines 126-137, already read above)

**Pattern to mirror exactly, plus the `type` filter**:

```typescript
export const getMyCredits = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("aiCredits")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .unique();
  },
});
```

New `listMyTopups` (per RESEARCH.md Pattern 3, D-08/D-09 locked):

```typescript
export const listMyTopups = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // D-09: no pagination — explicit instruction to return the full, small
    // result set. Accepted in-handler filter (see Pitfall 3 in RESEARCH.md)
    // because creditTransactions has no by_clerkUserId_and_type index yet.
    const rows = await ctx.db
      .query("creditTransactions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .order("desc")
      .collect();

    return rows.filter(r => r.type === "topup");
  },
});
```

**Schema reference** (`convex/schema.ts` lines 61-72, no changes needed — existing table/index already sufficient):

```typescript
creditTransactions: defineTable({
  clerkUserId: v.string(),
  type: v.union(
    v.literal("deduction"),
    v.literal("topup"),
    v.literal("reset"),
    v.literal("refund"),
  ),
  amount: v.number(),
  createdAt: v.number(),
  stripePaymentIntentId: v.optional(v.string()),
}).index("by_clerkUserId", ["clerkUserId"]),
```

---

### `convex/aiCredits.test.ts` — appended tests for `listMyTopups` (test, CRUD read)

**Analog:** `convex/aiCredits.test.ts` `describe("aiCredits.getMyCredits")` block (same file, lines 511-550, already read above)

**Harness pattern to mirror**:

```typescript
const IDENTITY = {
  subject: "user_x",
  tokenIdentifier: "https://clerk.dev|user_x",
};

describe("aiCredits.getMyCredits", () => {
  it("returns the authenticated identity's aiCredits row", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      await ctx.db.insert("aiCredits", {
        clerkUserId: "user_x",
        balance: 7,
        lastResetAt: Date.now(),
      });
    });

    const credits = await t
      .withIdentity(IDENTITY)
      .query(api.aiCredits.getMyCredits, {});
    expect(credits?.balance).toBe(7);
  });

  it("returns null when there is no authenticated identity", async () => {
    const t = convexTest(schema, modules);
    const credits = await t.query(api.aiCredits.getMyCredits, {});
    expect(credits).toBeNull();
  });
});
```

For `listMyTopups`, add cases per RESEARCH.md's Wave 0 Gaps: (1) unauthenticated returns `[]` (not `null` — different return type than `getMyCredits`), (2) mixed deduction/topup/reset/refund rows returns only topups, (3) cross-user isolation (seed a second `clerkUserId`'s topup row, assert it never appears in the first identity's result — mirrors the `by_clerkUserId` index-scoping already exercised by `deductCredit`'s tests).

---

### `components/nav-user.tsx` (modified, event-driven)

**Analog:** same file, existing "Account" `DropdownMenuItem` (lines 103-108, already read above)

**Pattern to insert alongside** (D-05 — separate item, not merged):

```typescript
<DropdownMenuGroup>
  <DropdownMenuItem onClick={() => router.push("/settings")}>
    <Settings />
    {t("settings")}
  </DropdownMenuItem>
  <DropdownMenuItem onClick={() => openUserProfile()}>
    <User />
    {t("account")}
  </DropdownMenuItem>
</DropdownMenuGroup>
```

`router`/`usePathname` already imported from `@/i18n/routing` (lines 34, 43-44 of `nav-user.tsx`) — reuse `router.push`. Add `Settings` to the existing `lucide-react` import block (line 3-11).

---

### `messages/en.json` / `messages/fr.json` — new `Settings` namespace (config, i18n)

**Analog:** `messages/en.json` `Pricing`/`AiCredits` namespaces (lines 26-38, 156-164, already read above) — flat key-value convention, no nesting beyond one level except for pluralization objects (`Notes.nestedNotes`-style `{count, plural, ...}` ICU syntax, not needed here).

**Also add one key to the existing `NavUser` namespace** (line 12-20) for the new dropdown item label:

```json
"NavUser": {
  "account": "Account",
  "settings": "Settings",
  ...
}
```

## Shared Patterns

### Identity-derived Convex query (IDOR-safe)

**Source:** `convex/subscriptions.ts` `getSubscription` (lines 4-19) and `convex/aiCredits.ts` `getMyCredits` (lines 126-137)
**Apply to:** `listMyTopups` (new)

```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) return null; // or [] for list-shaped queries
return await ctx.db
  .query(<table>)
  .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
  .unique(); // or .collect() for list-shaped queries
```

Never accept a `clerkUserId`/`userId` argument on any public query or Server Action this phase adds — this is the single most important security invariant across this codebase (03-REVIEW.md CR-01).

### Server Action → Stripe → webhook write-back (never write Convex state directly)

**Source:** `app/[locale]/(app)/notes/actions.ts` (`createTopupCheckoutSession`), `app/[locale]/(marketing)/pricing/actions.ts` (`createCheckoutSession`)
**Apply to:** `cancelSubscription`, `resumeSubscription`

```typescript
const { userId, getToken } = await auth();
if (!userId) throw new Error("UNAUTHENTICATED");

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
try {
  const convexToken = await getToken({ template: "convex" });
  if (convexToken) convex.setAuth(convexToken);
  existing = await convex.query(api.subscriptions.getSubscription, {});
} catch (err) {
  console.error("<actionName>: subscription lookup/auth handshake failed", err);
  throw new Error("subscriptionLookupFailed");
}
// server-side guard re-verification here (never trust UI-only conditional rendering)
try {
  await stripe.subscriptions.update(existing.stripeSubscriptionId, { cancel_at_period_end: <bool> });
} catch (err) {
  console.error("<actionName>: stripe.subscriptions.update failed", err);
  throw new Error("<actionName>Failed");
}
// No redirect(), no direct Convex write — webhook dispatcher (convex/stripeWebhooks.ts,
// already deployed, zero changes needed) picks up customer.subscription.updated and
// calls internal.subscriptions.upsertSubscription; client useQuery re-renders reactively.
```

### Reactive Convex read on the client (no polling)

**Source:** `app/[locale]/(marketing)/pricing/page.tsx` lines 30-32, `components/CreditsExhaustedDialog.tsx` lines 35-38
**Apply to:** Settings page's Plan and Credits sections (three reads: `getSubscription`, `getMyCredits`, `listMyTopups`)

```typescript
const { data: subscription } = useQuery(
  convexQuery(api.subscriptions.getSubscription, isSignedIn ? {} : "skip"),
);
```

### AlertDialog for destructive/confirm-or-abort actions

**Source:** `app/[locale]/(app)/notes/page.tsx` lines 927-965 (delete/leave confirmation — the actual first deployed consumer, not the untouched primitive CONTEXT.md describes)
**Apply to:** Cancel-subscription confirmation

```typescript
<AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("cancelConfirmTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{t("cancelConfirmDesc")}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        onClick={() => { /* cancelSubscription() */ }}
      >
        {t("confirmCancel")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Card-based content grouping (no Tabs)

**Source:** `components/ui/card.tsx` (full file, 93 lines), used by `app/[locale]/(marketing)/pricing/page.tsx` lines 64-103
**Apply to:** Plan `Card` and Credits `Card`, stacked (D-10)

```typescript
<Card>
  <CardHeader><CardTitle>...</CardTitle></CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>
```

### App shell route placement + header title

**Source:** `app/[locale]/(app)/layout.tsx` (full file, 26 lines — `SidebarProvider`/`AppSidebar`/`Header`/`HeaderProvider`/`UpgradeModalProvider` already wrap every route under `(app)/`, including the new `settings/` route with zero layout changes needed) + `app/[locale]/(app)/notes/page.tsx` line 693-695 (`useHeaderConfig` call sets the page title shown in the shared `Header`)
**Apply to:** `app/[locale]/(app)/settings/page.tsx`

```typescript
useHeaderConfig({ title: t("title") });
```

## No Analog Found

None — every file this phase creates or modifies has a direct or role-matched analog already deployed in this codebase (RESEARCH.md's own Summary states this phase is "almost entirely a UI-composition and Stripe-API-call phase, not a new-infrastructure phase").

One near-miss worth flagging: an `app/[locale]/(app)/notes/actions.test.ts` file (which RESEARCH.md's Wave 0 Gaps section implies exists, describing a `TOPUP_REQUIRES_PRO` guard test) was searched for during this pattern-mapping pass and not found in the current working tree — `app/[locale]/(marketing)/pricing/actions.test.ts` was used as the substitute analog for `settings/actions.test.ts` instead (structurally equivalent: same mock shape, same guard-rejection test pattern). The planner should re-verify this file's existence/name before finalizing the test-file analog citation.

## Metadata

**Analog search scope:** `app/[locale]/(app)/`, `app/[locale]/(marketing)/pricing/`, `convex/`, `components/`, `components/ui/`, `messages/`
**Files scanned:** `convex/subscriptions.ts`, `convex/aiCredits.ts`, `convex/aiCredits.test.ts`, `convex/schema.ts`, `app/[locale]/(app)/notes/actions.ts`, `app/[locale]/(app)/notes/page.tsx`, `app/[locale]/(marketing)/pricing/actions.ts`, `app/[locale]/(marketing)/pricing/actions.test.ts`, `app/[locale]/(marketing)/pricing/page.tsx`, `app/[locale]/(app)/layout.tsx`, `components/nav-user.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/card.tsx`, `components/CreditsExhaustedDialog.tsx`, `components/UpgradeModal.tsx`, `messages/en.json`
**Pattern extraction date:** 2026-07-11
