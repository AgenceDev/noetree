# Phase 3: Checkout Flow + Pricing Page - Research

**Researched:** 2026-07-09
**Domain:** Next.js Server Actions + Stripe Checkout Sessions + Clerk server-side auth + Convex reactive queries (via TanStack Query adapter)
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Claude's Discretion

- Exact file/route-group structure for the lightweight marketing shell (UI-SPEC.md: "achieved via a route-group layout (planner's call on exact file structure)").
- Exact timeout value for the success page within the "~15-20 seconds" guideline (CONTEXT.md: "a UX guideline... not a hard requirement — planner/executor can pick an exact value in that range").
- Exact Server Action file location (CONTEXT.md: "likely co-located as `app/[locale]/pricing/actions.ts` or similar — exact file left to planner").

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (Contextual upgrade prompts on hitting note limits, persistent nav "Upgrade" link, and Stripe Customer Portal / in-app subscription management were explicitly identified as belonging to Phase 4 and Phase 6 respectively, not deferred as new ideas but confirmed as already-scoped-elsewhere.)
</user_constraints>

## Summary

This phase wires together three already-installed, already-configured systems — Stripe (`stripe@22.3.0`, server SDK), Clerk (`@clerk/nextjs@7.5.1`, server-side `auth()`), and Convex (`convex@1.40.0` consumed through the codebase's established `@convex-dev/react-query` adapter, not raw `convex/react`) — into a public pricing page, a Next.js Server Action that creates a Stripe Checkout Session, and a client success page that reactively confirms Pro status once Phase 2's webhook has written the Convex `subscriptions` row. No new npm packages are required: everything needed (`stripe`, `@clerk/nextjs`, `convex`, `@convex-dev/react-query`, `@tanstack/react-query`) is already a dependency. The only new UI primitive is the shadcn `badge` component, added via the shadcn CLI (not an npm install) for the "Current plan" label.

Three things in this phase have **no precedent anywhere in the current codebase** and were verified directly against installed package type definitions rather than assumed from training data: (1) this is the **first Server Action** (`"use server"`) in the repo, (2) this is the **first use of Clerk's server-side `auth()`** anywhere in the app (all existing auth is client-side via `ConvexProviderWithClerk`/`useAuth`), and (3) there is **no existing absolute-base-URL env var** — Stripe's `success_url`/`cancel_url` require a fully-qualified URL, and nothing in `.env.example`/`.env.local` currently provides one. This last point is a genuine new env var this phase must introduce (parallel to how Phase 2 added `INTERNAL_WEBHOOK_SECRET` beyond Phase 1's original list) — flagged as an assumption needing confirmation.

**Primary recommendation:** Build the Server Action using `stripe.checkout.sessions.create()` with `mode: "subscription"`, `customer` (conditionally, from the existing Convex row), `metadata.clerkUserId` **and** `subscription_data.metadata.clerkUserId` (both verified fields on the installed `stripe@22.3.0` types), then `redirect(session.url!)` from **`next/navigation`** (not the locale-aware wrapper from `@/i18n/routing`, which is for internal routes only). Build the pricing/success pages as client components using the codebase's established `useQuery(convexQuery(api.subscriptions.getSubscription, args))` pattern (from `@convex-dev/react-query`), passing `"skip"` as `args` when the visitor is signed out — this is genuinely reactive (server pushes over websocket), satisfying D-09/D-10 without polling.

## Architectural Responsibility Map

| Capability                                     | Primary Tier                                                         | Secondary Tier                                                        | Rationale                                                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pricing page comparison UI (Free vs Pro cards) | Browser/Client                                                       | Frontend Server (SSR shell, next-intl messages)                       | Interactive rendering + reactive "Current plan" state needs client component; initial locale/messages resolved server-side by the existing `app/[locale]/layout.tsx` |
| Checkout Session creation (Stripe API call)    | API/Backend (Next.js Server Action)                                  | —                                                                     | Server Action runs exclusively server-side; owns the Stripe secret key, Clerk `auth()`, and the customer-reuse/status-precheck business logic (D-05–D-08)            |
| Customer/subscription lookup before Checkout   | API/Backend (Server Action reads Convex)                             | Database/Storage (Convex `subscriptions` table)                       | Server Action queries Convex via `getSubscription`; Convex is the tier that actually owns/persists the data                                                          |
| Subscription state persistence                 | Database/Storage (Convex)                                            | —                                                                     | Owned entirely by Phase 2's webhook dispatcher — this phase is read-only against `subscriptions`                                                                     |
| Post-checkout hosted payment UI                | External Service (Stripe-hosted Checkout page)                       | —                                                                     | Outside this app's tiers entirely; user leaves the app, Stripe owns the page, returns via `success_url`/`cancel_url`                                                 |
| Success-page reactive confirmation             | Browser/Client (reactive `useQuery`)                                 | —                                                                     | Must re-render the instant Convex's row changes; only the client tier has a live websocket subscription (D-09)                                                       |
| Auth identity resolution                       | Frontend Server (Clerk `auth()` in Server Action / Server Component) | Browser/Client (Clerk `useUser()`/`useAuth()` for client-side gating) | Server Action and any RSC boundary use server-side `auth()` (D-05/D-12); client components that need `isSignedIn` for skip-logic use Clerk's client hooks            |

## Phase Requirements

| ID      | Description                                                                 | Research Support                                                                                                                                                         |
| ------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PLAN-01 | User can view a pricing page showing Free and Pro plans with their features | UI-SPEC.md (approved) defines exact copy/layout; "Standard Stack"/"Architecture Patterns" below cover the client-component + `useTranslations` + reactive-status pattern |
| PAY-01  | User can subscribe to Pro plan via Stripe Checkout                          | "Code Examples" Pattern 1 (Server Action) covers session creation, metadata, customer reuse, and redirect verified against installed `stripe@22.3.0` types               |
| PAY-02  | User receives in-app confirmation after successful subscription activation  | "Code Examples" Pattern 2 (success page) covers the `useQuery(convexQuery(...))` reactive pattern + timeout/refresh UX per D-10/D-11                                     |

## Standard Stack

### Core

| Library                                                        | Version (installed, verified)                                                              | Purpose                                                   | Why Standard                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe`                                                       | 22.3.0 `[VERIFIED: node_modules types + npm view]`                                         | Server-side Checkout Session creation                     | Already installed Phase 1; official SDK; `Checkout.SessionCreateParams` type confirmed to include `customer`, `metadata`, `subscription_data.metadata`, `success_url`                                     |
| `@clerk/nextjs`                                                | 7.5.1 installed (package.json range `^7.4.3`) `[VERIFIED: node_modules types]`             | Server-side `auth()` for Server Action + any RSC boundary | Already installed Phase 1 (CVE-2026-41248 pre-mitigated per STATE.md); this phase is the first to use its `server` export (`auth()`, `redirectToSignIn()`) — client-only usage (`useAuth`) existed before |
| `convex` + `@convex-dev/react-query` + `@tanstack/react-query` | 1.40.0 / installed / installed `[VERIFIED: codebase usage in app/[locale]/notes/page.tsx]` | Reactive subscription-status queries                      | Established codebase pattern (`useQuery(convexQuery(api.fn, args))`) — confirmed via WebSearch that this genuinely receives server-pushed real-time updates over websocket, not polling                   |

### Supporting

| Library                             | Version                                              | Purpose                                                          | When to Use                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shadcn `badge` (CLI-added, not npm) | matches `components.json` preset (`style: new-york`) | "Current plan" label on Free/Pro cards                           | Add via `npx shadcn@latest add badge` — not yet in `components/ui/` (confirmed via `ls`), everything else needed (`card`, `button`, `skeleton`) already exists |
| `next-intl`                         | 4.13.0 (installed)                                   | Locale routing + messages for `/pricing` and `/checkout/success` | Follow exact convention already used by every route (`app/[locale]/...`, `messages/{en,fr}.json`)                                                              |

### Alternatives Considered

| Instead of                                                       | Could Use                                                          | Tradeoff                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server Action calling `stripe.checkout.sessions.create` directly | New `app/api/checkout/route.ts` API route                          | CONTEXT.md D-05 explicitly locks Server Action — rejected to keep API-route surface minimal (only the webhook has one)                                                                                                                                                |
| `useQuery(convexQuery(...))` (TanStack adapter)                  | Raw `convex/react` `useQuery`                                      | Raw `convex/react` would also be reactive, but is NOT the pattern this codebase uses anywhere (`notes/page.tsx` uses the TanStack adapter exclusively) — using raw `convex/react` here would introduce a second, inconsistent data-fetching convention for no benefit |
| Deriving success/cancel URL host from a new `APP_URL` env var    | Deriving from `headers()` (`host` header) inside the Server Action | Header-derivation avoids a new env var but is less deterministic across proxies/deployments and has no precedent in this codebase (which manages all environment-specific values through `.env.example`) — env var is recommended, see Open Questions                 |

**Installation:**

```bash
npx shadcn@latest add badge
```

No `npm install` / `pnpm add` needed — all other libraries are already dependencies.

**Version verification:**

```bash
npm view stripe version          # 22.3.0 — matches installed exactly
npm view @clerk/nextjs version    # 7.5.15 latest; 7.5.1 installed (Phase 1 already handled the CVE bump, no action needed this phase)
```

## Package Legitimacy Audit

**No new external packages are installed in this phase.** All required libraries (`stripe`, `@clerk/nextjs`, `convex`, `@convex-dev/react-query`, `@tanstack/react-query`) are already dependencies from Phase 1/2. The only addition is the shadcn `badge` component, added via the shadcn CLI (`npx shadcn@latest add badge`), which copies component source from the official shadcn/ui registry into `components/ui/badge.tsx` — this is not an npm registry package and carries no supply-chain install risk (no `postinstall`, no new `node_modules` entry).

_Package Legitimacy Gate skipped — condition for requiring it ("phase installs external packages") is not met._

## Architecture Patterns

### System Architecture Diagram

```
Visitor/User (browser)
      |
      v
[/pricing page]  <-- client component, next-intl messages, Clerk useUser()/useAuth() for isSignedIn
      |  (reads) useQuery(convexQuery(subscriptions.getSubscription, signedIn ? {clerkUserId} : "skip"))
      |------------------------------------------------------------------> [Convex: subscriptions table] (read-only this phase)
      |
      | click "Upgrade to Pro"
      v
  signed out? --[D-02]--> Clerk hosted sign-in (redirectToSignIn({returnBackUrl})) --> back to pricing/action
      |
      v (signed in)
[Server Action: createCheckoutSession()]  "use server"
      |  1. auth() -> clerkUserId                         (Clerk server-side, D-05)
      |  2. ctx.runQuery: subscriptions.getSubscription    (Convex read, D-06/D-08)
      |  3. if status === "active" -> redirect(/checkout/success) directly, no Stripe call (D-08)
      |  4. else stripe.checkout.sessions.create({
      |        customer: existing?.stripeCustomerId,       (D-06 — reuse, avoid duplicate)
      |        mode: "subscription",
      |        line_items: [{ price: STRIPE_PRO_PRICE_ID }],
      |        metadata: { clerkUserId },                  (D-07, locked Phase 1)
      |        subscription_data: { metadata: { clerkUserId } }, (D-07, locked Phase 1)
      |        success_url: `${APP_URL}/${locale}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      |        cancel_url: `${APP_URL}/${locale}/pricing`,
      |      })
      |  5. redirect(session.url!)   -- next/navigation redirect, NOT next-intl's locale redirect (external URL)
      v
[Stripe-hosted Checkout page]  (external, outside app tiers)
      |  user pays with test card
      v
   Stripe --webhook--> [Phase 2: /api/webhooks/stripe -> convex/stripeWebhooks.ts]  (already built, out of scope)
      |  writes/patches Convex `subscriptions` row (status: "active", ...)
      v
[/checkout/success page]  <-- client component
      |  auth() server-side in the page's RSC boundary supplies clerkUserId to the client child (D-12)
      |  useQuery(convexQuery(subscriptions.getSubscription, {clerkUserId}))  -- reactive, websocket-pushed
      |
      |-- data undefined/pending --> loading skeleton, "Confirming your subscription..." (D-10)
      |-- data === null or status !== "active" after ~15-20s --> timeout copy + manual "Refresh" (D-11)
      |-- data.status === "active" --> "Subscription active" confirmed UI (D-09)
```

### Recommended Project Structure

```
app/[locale]/
├── (marketing)/                    # optional route group for the lightweight shell (planner's call, per UI-SPEC.md)
│   ├── layout.tsx                  # NEW — no AppSidebar/Header, centered max-w column, still wrapped by root providers
│   ├── pricing/
│   │   ├── page.tsx                # NEW — client component, plan comparison, Upgrade button
│   │   └── actions.ts               # NEW — "use server" createCheckoutSession()
│   └── checkout/
│       └── success/
│           └── page.tsx            # NEW — server boundary (auth()) + client child (reactive useQuery)
messages/
├── en.json                         # MODIFY — add `Pricing`, `CheckoutSuccess` namespaces
└── fr.json                         # MODIFY — same
components/ui/
└── badge.tsx                       # NEW — via shadcn CLI
```

The exact route-group name/file split is explicitly left to the planner (UI-SPEC.md line 29: "achieved via a route-group layout (planner's call on exact file structure)").

### Pattern 1: Server Action — Checkout Session creation with customer reuse + short-circuit

**What:** A `"use server"` function invoked from the pricing page's Upgrade button that resolves the Clerk user, checks Convex for an existing subscription, and either short-circuits to the success page (already active) or creates a Stripe Checkout Session and redirects to it.
**When to use:** Any interactive action needing Stripe secret-key access that shouldn't be a public API route (D-05).
**Example:**

```typescript
// app/[locale]/(marketing)/pricing/actions.ts
"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation"; // NOT "@/i18n/routing" redirect — external/absolute URLs
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCheckoutSession(locale: string) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    // D-02: full navigation redirect to Clerk's hosted sign-in, returning to this action's caller
    redirectToSignIn({ returnBackUrl: `/${locale}/pricing` });
    return;
  }

  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const existing = await convex.query(api.subscriptions.getSubscription, {
    clerkUserId: userId,
  });

  // D-08: short-circuit, no Stripe call, if already active
  if (existing?.status === "active") {
    redirect(`/${locale}/checkout/success`);
  }

  const baseUrl = process.env.APP_URL!; // see Open Questions — new env var this phase introduces
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: existing?.stripeCustomerId, // D-06: reuse if present, else Stripe creates a new Customer
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    metadata: { clerkUserId: userId }, // D-07, locked Phase 1 — session.metadata
    subscription_data: {
      metadata: { clerkUserId: userId }, // D-07, locked Phase 1 — echoed onto every Subscription object
    },
    success_url: `${baseUrl}/${locale}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/${locale}/pricing`,
  });

  if (session.url) redirect(session.url); // next/navigation redirect — throws, code after never runs
}
```

Source: field names/types verified directly against `node_modules/.pnpm/stripe@22.3.0.../types/Checkout/Sessions.d.ts` (`customer?: string`, `metadata?: MetadataParam`, `subscription_data?: SessionCreateParams.SubscriptionData` with its own `metadata?: MetadataParam`, `success_url?: string`) — this is a **verified, not assumed**, API surface for the exact installed version. Clerk `auth()`/`redirectToSignIn` shape verified against `@clerk/nextjs@7.5.1`'s `dist/types/app-router/server/auth.d.ts`.

### Pattern 2: Success page — RSC auth boundary + reactive client child

**What:** Server Component resolves `clerkUserId` via `auth()`, passes it to a client component that runs the reactive Convex query and drives the loading/confirmed/timeout UI.
**When to use:** Whenever a page needs both a server-only identity check (D-12) and a live-updating client query.
**Example:**

```tsx
// app/[locale]/(marketing)/checkout/success/page.tsx  (Server Component)
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SuccessStatus } from "./SuccessStatus"; // client component

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { userId } = await auth();
  if (!userId) redirect(`/${locale}/pricing`); // shouldn't happen post-checkout, but guard anyway

  return <SuccessStatus clerkUserId={userId} />;
}
```

```tsx
// app/[locale]/(marketing)/checkout/success/SuccessStatus.tsx  "use client"
"use client";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";

export function SuccessStatus({ clerkUserId }: { clerkUserId: string }) {
  const { data, isPending } = useQuery(
    convexQuery(api.subscriptions.getSubscription, { clerkUserId }),
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 18000); // D-11: ~15-20s window
    return () => clearTimeout(t);
  }, []);

  if (data?.status === "active") return <ConfirmedView />;
  if (timedOut) return <TimeoutView />; // D-11: reassurance copy + manual "Refresh"
  return <LoadingView />; // D-10: spinner + "Confirming your subscription..."
}
```

Source: `useQuery(convexQuery(...))` pattern confirmed live in this repo at `app/[locale]/notes/page.tsx:452-453`; genuinely reactive/websocket-pushed per official Convex TanStack Query docs (`docs.convex.dev/client/tanstack/tanstack-query/`).

### Pattern 3: Pricing page conditional query with `"skip"`

**What:** Skip the Convex query entirely for signed-out visitors instead of calling it with an empty/invalid `clerkUserId`.
**When to use:** Any `convexQuery` call gated on optional auth state.
**Example:**

```tsx
"use client";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";

function usePlanStatus() {
  const { isSignedIn, user } = useUser();
  const { data } = useQuery(
    convexQuery(
      api.subscriptions.getSubscription,
      isSignedIn ? { clerkUserId: user.id } : "skip",
    ),
  );
  return data; // undefined while pending/skipped, null if no row, doc if found
}
```

Source: `"skip"` sentinel confirmed via `@convex-dev/react-query` community docs/Discord — the adapter's `enabled` TanStack option is **not** reliably supported (per docs, "still in development" as of the version installed); `"skip"` is the correct mechanism, not `enabled: false`.

### Anti-Patterns to Avoid

- **Using `next-intl`'s `redirect` (`@/i18n/routing`) for the Stripe redirect or sign-in redirect:** that wrapper is for internal, locale-prefixed app routes only. `redirect(session.url)` targets an external Stripe-hosted URL and must use plain `redirect` from `next/navigation`.
- **Fetching the Stripe Checkout Session server-side on the success page to render order details:** explicitly rejected by D-12. The `session_id` query param is a debugging reference only — Convex's `subscriptions` row (written by the webhook) is the sole source of truth for "is this user Pro."
- **Re-verifying Stripe signatures or calling the Stripe API from the success page to grant access:** this phase's success page never grants access itself — it only _displays_ a status that Phase 2's webhook already wrote. This is actually a safety feature, not a gap: a user who reaches `/checkout/success` without having paid just sees an endless "still confirming" state, never "active," because nothing here writes to Convex.
- **Calling `getSubscription` with a placeholder/`""` `clerkUserId` for signed-out visitors:** use the `"skip"` sentinel (Pattern 3) instead of gating in the render body after the hook already ran with a garbage argument.

## Don't Hand-Roll

| Problem                                   | Don't Build                                                           | Use Instead                                                             | Why                                                                                                                                                                                                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real-time "has the webhook landed yet" UI | Manual polling / `setInterval` + refetch                              | `useQuery(convexQuery(...))` (Pattern 2)                                | Convex pushes the new row over the existing websocket the instant Phase 2's webhook writes it — polling would be strictly worse (latency + wasted requests) and contradicts D-09's explicit "NOT manual polling"                                           |
| Duplicate-customer prevention             | Custom email-based Stripe Customer search before every checkout       | Convex's already-indexed `subscriptions.stripeCustomerId` (D-06)        | The customer ID is already durably stored from the first checkout; querying Convex (already indexed by `clerkUserId`) is one read, versus a Stripe Customer List/search API call with its own edge cases (multiple customers sharing an email, pagination) |
| Sign-in redirect-back flow                | Custom `?returnTo=` query param plumbing + manual redirect after auth | Clerk's `redirectToSignIn({ returnBackUrl })` (verified in `auth.d.ts`) | Built into the SDK already installed; no custom session/cookie state needed                                                                                                                                                                                |

**Key insight:** Every "hard" part of this phase (real-time confirmation, customer dedup, auth redirect-back) is already solved by a library already in the dependency tree — the phase's actual work is wiring, not building.

## Common Pitfalls

### Pitfall 1: Confusing `clerkUserId` with the Convex `users` table's `tokenIdentifier`

**What goes wrong:** Passing `identity.tokenIdentifier` (format `https://clerk.dev|user_xxx`, used internally by `convex/helpers/helper.ts`'s `getUser`) where a bare `clerkUserId` (format `user_xxx`, from Clerk's `auth().userId`) is expected.
**Why it happens:** The `subscriptions` table was deliberately decoupled from the `users` table (Phase 1 D-01) and stores the bare Clerk user ID directly — this is a different identifier shape than the rest of the app's `users`/`tokenIdentifier` convention (confirmed by reading `convex/helpers/helper.ts` and `convex/schema.ts` side by side).
**How to avoid:** Always source `clerkUserId` from `(await auth()).userId` (server) or `useUser().user.id` / `useAuth().userId` (client) — never from `ctx.auth.getUserIdentity()`'s `tokenIdentifier` field.
**Warning signs:** `getSubscription` returning `null` for a user who should have an active subscription; the string contains a `|` character or `https://` prefix.

### Pitfall 2: Missing absolute base URL for `success_url`/`cancel_url`

**What goes wrong:** Stripe rejects relative URLs — `success_url`/`cancel_url` must be fully-qualified (`https://...`). Nothing in `.env.example`/`.env.local` currently provides an app base URL (confirmed via grep — no `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, or `VERCEL_URL` reference anywhere in the repo).
**Why it happens:** Every prior phase's env vars were Stripe/Convex/Clerk secrets, never the app's own origin — this is the first phase that needs to construct an absolute URL server-side.
**How to avoid:** Add a new `APP_URL` env var (see Open Questions) documented in `.env.example` alongside the existing Stripe vars, following the same per-environment-value convention already established for `STRIPE_WEBHOOK_SECRET`.
**Warning signs:** Stripe API error `"success_url must be a valid URL"` at Checkout Session creation time.

### Pitfall 3: Stripe webhook event delivery order is not guaranteed

**What goes wrong:** Immediately after `checkout.session.completed` fires, `customer.subscription.updated` can arrive in quick succession (or even appear to race). The success page might transiently see a `subscriptions` row with a not-yet-`"active"` status.
**Why it happens:** Stripe does not guarantee webhook delivery ordering across event types for the same object graph.
**How to avoid:** This is exactly why D-11's timeout/refresh UX exists — treat any non-`"active"` status within the timeout window as "still confirming," not as an error state.
**Warning signs:** Flaky success-page test results if a test asserts "active" immediately after the first webhook POST resolves, without allowing for a brief window.

### Pitfall 4: `redirect()` inside a `try/catch` swallowing the redirect

**What goes wrong:** Next.js `redirect()` (both `next/navigation` and `next-intl`'s wrapper) works by throwing a special internal error that the framework catches. Wrapping the Server Action's Stripe call + redirect in a broad `try { ... } catch { showGenericError() }` will catch and suppress the redirect itself, breaking navigation.
**Why it happens:** Common defensive-coding instinct to wrap external API calls in try/catch — correct for the Stripe API call, wrong if `redirect()` is inside the same block.
**How to avoid:** Only wrap the `stripe.checkout.sessions.create(...)` call in try/catch (for the D-08/error-state copy in UI-SPEC's "Error state" row); call `redirect(session.url)` outside/after that block, not nested inside its `try`.
**Warning signs:** Clicking "Upgrade to Pro" appears to do nothing, or shows the generic error message even when Stripe successfully returned a session.

### Pitfall 5: `enabled: false` does not skip a `convexQuery` the way it does for normal TanStack queries

**What goes wrong:** Passing the standard TanStack `{ enabled: false }` option to gate the pricing-page query (e.g., for signed-out visitors) does not reliably prevent execution with this specific adapter.
**Why it happens:** Per Convex community docs, `@convex-dev/react-query`'s support for the `enabled` option is still in development as of the installed version.
**How to avoid:** Use the `"skip"` sentinel as the query's _args_ parameter instead (Pattern 3), which is the adapter's documented mechanism for conditional queries.
**Warning signs:** A network/websocket query firing for signed-out visitors despite an `enabled: false` guard.

## Code Examples

See "Architecture Patterns" Patterns 1-3 above for the three load-bearing code shapes this phase needs (Server Action, RSC+client success page split, skip-gated pricing query).

## State of the Art

| Old Approach                                                              | Current Approach                                                                            | When Changed                                                                                                                       | Impact                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe.js `redirectToCheckout()` (client-side, using `@stripe/stripe-js`) | Server creates the Session and returns `session.url`; server (or client) navigates directly | Stripe deprecated the client-side `redirectToCheckout` redirect method years ago in favor of returning `url` from session creation | `@stripe/stripe-js` (already installed) is not needed for this phase's redirect flow at all — it would only be relevant for embedded/Elements-based Checkout, which is explicitly out of scope (hosted Checkout is the locked approach, per PROJECT.md "UI custom (pas Stripe Portal)" which is about the _Customer Portal_, not Checkout itself — hosted Checkout remains in use) |

**Deprecated/outdated:**

- Client-side `stripe.redirectToCheckout({ sessionId })`: superseded by using the `url` field directly from the created Session object.

## Assumptions Log

| #   | Claim                                                                                                                                                                                                                                                             | Section                                     | Risk if Wrong                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | A new `APP_URL` (server-only, no `NEXT_PUBLIC_` prefix needed since only used inside the Server Action) env var should be introduced for constructing `success_url`/`cancel_url`, rather than deriving the origin from request headers                            | Standard Stack / Pitfall 2 / Open Questions | If wrong (e.g., team prefers header-derivation for multi-region/preview-deployment flexibility), the planner would need a different task shape (no new env var, but header-parsing logic + Host-header trust considerations instead) |
| A2  | The exact port/path for local dev's `https://localhost:3000` (from `next dev --experimental-https`) is assumed for local `APP_URL` value                                                                                                                          | Pitfall 2                                   | Low risk — trivially confirmed by running `npm run dev` once; would only affect the `.env.local` placeholder value, not any code                                                                                                     |
| A3  | Clerk's hosted Account Portal (no custom `/sign-in` route exists in this repo) is assumed to be the current sign-in destination `redirectToSignIn()` falls back to, since no `NEXT_PUBLIC_CLERK_SIGN_IN_URL` is set anywhere and no `app/**/sign-in` route exists | Pattern 1 / Architecture Diagram            | If wrong (e.g., a custom sign-in page is expected but not yet built), D-02's "redirect to Clerk sign-in" step would 404 or misbehave — should be smoke-tested early in implementation                                                |

## Open Questions

1. **What is the exact env var name and value for the app's absolute base URL?**
   - What we know: Stripe's `success_url`/`cancel_url` require a fully-qualified URL; nothing in this codebase currently provides one (confirmed via grep across `.env.example`, `.env.local`, and all `.ts`/`.tsx` files).
   - What's unclear: Whether the team wants `APP_URL`, `NEXT_PUBLIC_APP_URL`, or `NEXT_PUBLIC_SITE_URL` as the name, and whether it should vary per environment (local `https://localhost:3000` per the `--experimental-https` dev script vs. real staging/production domains) or be derived dynamically.
   - Recommendation: Add `APP_URL` (server-only, no public exposure needed — only read inside the Server Action) to `.env.example`, following the exact same per-environment-value documentation convention already used for `STRIPE_WEBHOOK_SECRET`. Flag as a `checkpoint:human-verify` task before first use in each environment.

2. **Does `redirectToSignIn()` correctly return the visitor to the _action_ of clicking Upgrade, or just to `/pricing`?**
   - What we know: `redirectToSignIn({ returnBackUrl })` redirects back to a given URL after sign-in (confirmed via type defs) — it does not re-trigger a Server Action automatically.
   - What's unclear: Whether landing back on `/pricing` after sign-in is sufficient (user clicks Upgrade again, now signed in) or whether product intent expects the checkout call to fire automatically post-sign-in.
   - Recommendation: Per CONTEXT.md D-02/D-15, landing back on `/pricing` and letting the user click Upgrade again (now signed in, collapsing straight to checkout) is explicitly the intended UX — no auto-retrigger needed. Documenting here only because it's easy to over-engineer.

3. **Exact timeout value for the success page (15s, 18s, or 20s)?**
   - What we know: CONTEXT.md explicitly calls this "a UX guideline... not a hard requirement — planner/executor can pick an exact value in that range."
   - What's unclear: Nothing — this is intentionally left open.
   - Recommendation: Pick 18 seconds (a round middle value) unless the planner has a stronger reason to choose otherwise.

## Environment Availability

| Dependency                                                                                                                   | Required By                                                                             | Available                             | Version | Fallback                                                     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- | ------- | ------------------------------------------------------------ |
| Node.js                                                                                                                      | Next.js runtime                                                                         | Yes                                   | v26.4.0 | —                                                            |
| pnpm                                                                                                                         | Package management                                                                      | Yes                                   | 11.10.0 | —                                                            |
| npm                                                                                                                          | `npm view` verification, npx for shadcn CLI                                             | Yes                                   | 11.17.0 | —                                                            |
| Stripe CLI                                                                                                                   | Local webhook testing (Phase 2 concern, useful for E2E smoke-testing this phase's flow) | Yes                                   | 1.43.6  | —                                                            |
| `.env.local` with `STRIPE_SECRET_KEY`, `STRIPE_PRO_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CONVEX_URL` | Server Action + Checkout Session creation                                               | Yes (all present, confirmed via grep) | —       | —                                                            |
| Absolute app base URL env var                                                                                                | `success_url`/`cancel_url` construction                                                 | **No** — does not exist yet           | —       | New env var must be added this phase (see Open Questions #1) |
| shadcn `badge` component                                                                                                     | "Current plan" label                                                                    | No (not yet added)                    | —       | `npx shadcn@latest add badge` — trivial, no fallback needed  |

**Missing dependencies with no fallback:**

- Absolute base URL env var (`APP_URL` or equivalent) — blocks Checkout Session creation entirely without it; must be added as part of this phase's implementation, not deferred.

**Missing dependencies with fallback:**

- shadcn `badge` component — one CLI command away, zero risk.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework          | Vitest 4.1.10 (`vitest.config.ts`, `environment: "edge-runtime"`, `convex-test` inlined) + Cypress 15.16.0 (`cypress.config.ts`, `@clerk/testing/cypress` already wired via `clerkSetup`) |
| Config file        | `vitest.config.ts` (repo root), `cypress.config.ts` (repo root)                                                                                                                           |
| Quick run command  | `npm run test:unit` (vitest)                                                                                                                                                              |
| Full suite command | `npm run test:unit && npm run test-cypress`                                                                                                                                               |

**Wave 0 gap — environment mismatch for component tests:** the existing `vitest.config.ts` sets a single global `environment: "edge-runtime"`, which has no DOM. Any Vitest test that renders the pricing/success **React components** (as opposed to just unit-testing the Server Action's logic against a mocked Stripe client) needs a `// @vitest-environment jsdom` docblock override at the top of that specific test file — `jsdom` is not currently a devDependency for Vitest (only `@edge-runtime/vm` is installed; `jest-environment-jsdom` exists but is wired to the unused `jest` runner, not Vitest). If component-level Vitest tests are wanted, `jsdom` must be added as a devDependency; otherwise, defer component-rendering coverage entirely to Cypress (which already runs in a real browser via `@clerk/testing`).

### Phase Requirements → Test Map

| Req ID  | Behavior                                                                                                                   | Test Type                                                                                                                                                                     | Automated Command                                                                                    | File Exists? |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| PLAN-01 | `/pricing` renders Free + Pro plan comparison with correct copy                                                            | Cypress e2e (renders in real browser, no Stripe interaction needed)                                                                                                           | `npx cypress run --spec cypress/integration/pricing.spec.ts`                                         | ❌ Wave 0    |
| PAY-01  | Server Action creates a Checkout Session with correct metadata/customer-reuse/short-circuit logic                          | Vitest unit (mock `stripe.checkout.sessions.create`, mock Convex client)                                                                                                      | `vitest run app/[locale]/(marketing)/pricing/actions.test.ts`                                        | ❌ Wave 0    |
| PAY-01  | Clicking "Upgrade to Pro" as a signed-in Clerk test user redirects toward Stripe's hosted domain                           | Cypress e2e (assert final `cy.url()` matches `checkout.stripe.com`, does not complete real payment)                                                                           | `npx cypress run --spec cypress/integration/checkout-redirect.spec.ts`                               | ❌ Wave 0    |
| PAY-02  | Success page shows loading, then "Subscription active" once a Convex `subscriptions` row is seeded with `status: "active"` | Vitest + `convex-test` (seed the row directly, bypassing the real webhook, to test the reactive-UI contract in isolation) OR Cypress with a pre-seeded test-mode subscription | `vitest run app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx` (needs jsdom override) | ❌ Wave 0    |

**Note on true end-to-end payment testing:** actually completing a real Stripe test-mode card entry inside Cypress (crossing into Stripe's hosted, cross-origin domain) is high-effort and flake-prone; the pragmatic split recommended above is (a) unit-test the Server Action's decision logic with a mocked Stripe SDK, (b) Cypress-test that the redirect _reaches_ Stripe's domain with correct query params, and (c) test the success page's reactive behavior against a directly-seeded Convex row rather than a real webhook round-trip. This mirrors ROADMAP.md's Phase 2 already having its own dedicated webhook tests — this phase doesn't need to re-test the webhook, only the UI's reaction to its output.

### Sampling Rate

- **Per task commit:** `npm run test:unit` (fast, no browser)
- **Per wave merge:** `npm run test:unit && npm run test-cypress`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `cypress/integration/pricing.spec.ts` — covers PLAN-01
- [ ] `cypress/integration/checkout-redirect.spec.ts` — covers PAY-01 (redirect-reaches-Stripe assertion)
- [ ] `app/[locale]/(marketing)/pricing/actions.test.ts` — covers PAY-01 (Server Action logic, mocked Stripe)
- [ ] `app/[locale]/(marketing)/checkout/success/SuccessStatus.test.tsx` — covers PAY-02 (needs `jsdom` environment override; `jsdom` devDependency install if not already resolvable via `jest-environment-jsdom`)
- [ ] Decide: add `jsdom` as a Vitest-usable environment (currently only wired for the unused `jest` runner) if any component-level Vitest coverage is desired, or defer all component rendering assertions to Cypress

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                                                                                     |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | Yes     | Clerk-managed (`auth()`, hosted Account Portal) — no custom auth logic introduced this phase                                                                                                                                                                                                         |
| V3 Session Management | No      | Delegated entirely to Clerk; this phase adds no session handling                                                                                                                                                                                                                                     |
| V4 Access Control     | Yes     | Server Action re-checks `auth()` itself server-side (never trusts a client-supplied `clerkUserId`) before any Stripe/Convex call — the metadata written to Stripe always comes from the server-resolved session, never from a client-passed argument                                                 |
| V5 Input Validation   | Partial | The only "input" this phase's Server Action takes from the client is `locale` (used to build redirect URLs) — should be validated against `routing.locales` (`["en", "fr"]`) before interpolating into `success_url`/`cancel_url` to avoid building malformed redirect URLs from an unexpected value |
| V6 Cryptography       | No      | No new crypto/secrets handling this phase — reuses existing `STRIPE_SECRET_KEY`                                                                                                                                                                                                                      |

### Known Threat Patterns for this stack

| Pattern                                                                                                                                   | STRIDE                             | Standard Mitigation                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client trying to grant itself "Pro" by controlling the success page's displayed state                                                     | Tampering / Elevation of Privilege | Not exploitable by design: the success page only _reads_ Convex's `subscriptions` row; it never writes to it. Actual entitlement enforcement is Phase 4's job (server-side Convex mutation checks), which is unaffected by anything rendered on `/checkout/success`. |
| Passing a client-controlled `clerkUserId` into the Checkout Session's metadata, letting a user attribute a payment to a different account | Spoofing                           | The Server Action must always source `clerkUserId` from `(await auth()).userId` server-side — never accept it as a function argument from the client.                                                                                                                |
| Open-redirect via an unvalidated `locale` param used to build `success_url`/`cancel_url`                                                  | Tampering                          | Validate `locale` against `routing.locales` before interpolating; reject/default otherwise.                                                                                                                                                                          |

## Sources

### Primary (HIGH confidence)

- `node_modules/.pnpm/stripe@22.3.0.../node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts` — exact `SessionCreateParams` shape (`customer`, `customer_email`, `metadata`, `subscription_data.metadata`, `success_url`, `cancel_url`), read directly from the installed package
- `node_modules/.pnpm/@clerk+nextjs@7.5.1.../node_modules/@clerk/nextjs/dist/types/app-router/server/auth.d.ts` — `auth()`/`redirectToSignIn`/`redirectToSignUp` shape, read directly from the installed package
- This repo's own code: `convex/schema.ts`, `convex/subscriptions.ts`, `app/[locale]/notes/page.tsx` (established `useQuery(convexQuery(...))` pattern), `providers/ConvexClientProvider.tsx`, `proxy.ts`, `i18n/routing.ts`, `.env.example`/`.env.local`, `components.json`, `cypress.config.ts`, `vitest.config.ts`
- `.planning/phases/01-schema-infrastructure-foundation/01-CONTEXT.md`, `.planning/phases/02-webhook-handler-convex-internal-mutations/02-CONTEXT.md` + `02-PATTERNS.md` — locked decisions this phase must satisfy (D-07 metadata contract, `by_clerkUserId`/`by_stripeSubscriptionId` indexes)
- `.planning/phases/03-checkout-flow-pricing-page/03-UI-SPEC.md` — approved visual/copy contract

### Secondary (MEDIUM confidence)

- `docs.convex.dev/client/tanstack/tanstack-query/` (via WebSearch) — confirms `useQuery(convexQuery(...))` is genuinely reactive (websocket-pushed), not polling
- Convex community Discord (via WebSearch) — `"skip"` sentinel for conditional `convexQuery` calls; `enabled` option "still in development"
- `docs.stripe.com/payments/checkout/custom-success-page`, `docs.stripe.com/payments/checkout/save-and-reuse` (via WebSearch) — `{CHECKOUT_SESSION_ID}` template variable behavior, customer-reuse semantics (cross-referenced against the installed types, which agree)
- Clerk docs (`clerk.com/docs/reference/nextjs/app-router/auth`, via WebSearch) — general `auth()`/Server Action usage patterns, cross-referenced against installed type defs

### Tertiary (LOW confidence)

- None — every claim above was either read directly from installed source/types or cross-verified against a second source.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all versions confirmed installed via `node_modules` inspection and `npm view`; no new packages
- Architecture: HIGH — Server Action/Stripe/Clerk API shapes read directly from installed `.d.ts` files, not recalled from training data; Convex reactive-query pattern confirmed against live in-repo usage
- Pitfalls: MEDIUM-HIGH — most pitfalls verified directly against code/types (Pitfall 1, 2, 5); Pitfall 3 (webhook ordering) and Pitfall 4 (redirect/try-catch) are well-established Next.js/Stripe community knowledge, cross-verified via WebSearch but not project-specific

**Research date:** 2026-07-09
**Valid until:** 30 days (stable stack; re-verify if `stripe` or `@clerk/nextjs` receive a major version bump before implementation starts)
