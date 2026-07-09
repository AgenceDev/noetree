# Phase 3: Checkout Flow + Pricing Page - Pattern Map

**Mapped:** 2026-07-09
**Files analyzed:** 9 (new/modified)
**Analogs found:** 7 / 9 (2 have no true in-repo precedent; nearest analogs + RESEARCH.md patterns given instead)

## File Classification

| New/Modified File                                                                      | Role                         | Data Flow                                   | Closest Analog                                                                                       | Match Quality                               |
| -------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `app/[locale]/(marketing)/layout.tsx`                                                  | provider/layout              | request-response                            | `app/[locale]/layout.tsx`                                                                            | role-match (strips sidebar/header chrome)   |
| `app/[locale]/(marketing)/pricing/page.tsx`                                            | component (client page)      | request-response + reactive read            | `app/[locale]/page.tsx` (structure) + `app/[locale]/notes/page.tsx` (reactive query)                 | role-match, composite                       |
| `app/[locale]/(marketing)/pricing/actions.ts`                                          | service (Server Action)      | request-response, external API call         | `app/api/webhooks/stripe/route.ts` (Stripe SDK usage)                                                | partial (no Server Action precedent exists) |
| `app/[locale]/(marketing)/checkout/success/page.tsx`                                   | component (RSC boundary)     | request-response (auth check + redirect)    | `app/[locale]/layout.tsx` (locale param handling, `notFound`/`redirect` pattern)                     | partial                                     |
| `app/[locale]/(marketing)/checkout/success/SuccessStatus.tsx`                          | component (client, reactive) | streaming/reactive (websocket-pushed query) | `app/[locale]/notes/page.tsx` (`useQuery(convexQuery(...))`)                                         | exact (data-flow pattern)                   |
| `messages/en.json` / `messages/fr.json` (modify)                                       | config (i18n copy)           | static                                      | existing `Dashboard`/`Notes` namespaces in same files                                                | exact                                       |
| `components/ui/badge.tsx`                                                              | component (shadcn primitive) | n/a                                         | `components/ui/skeleton.tsx` (shadcn primitive shape/`cn()` convention)                              | role-match (not yet installed; CLI-added)   |
| `app/[locale]/(marketing)/pricing/actions.test.ts`                                     | test                         | unit, mocked externals                      | `app/api/webhooks/stripe/route.test.ts` (`vi.mock("stripe", ...)`, `vi.mock("convex/browser", ...)`) | exact                                       |
| `cypress/integration/pricing.spec.ts`, `cypress/integration/checkout-redirect.spec.ts` | test (e2e)                   | request-response                            | `cypress/integration/app.spec.ts`                                                                    | role-match                                  |

## Pattern Assignments

> **Relocation note (Plan 03-05):** Plan 03-05 (Wave 1) moves the authenticated analog files
> `app/[locale]/page.tsx` → `app/[locale]/(app)/page.tsx` and `app/[locale]/notes/page.tsx` →
> `app/[locale]/(app)/notes/page.tsx` (URLs unchanged — route-group move). Wave 2 executors run
> after 03-05, so wherever an analog below cites the old `app/[locale]/page.tsx` or
> `app/[locale]/notes/page.tsx` path, read it at the new `app/[locale]/(app)/...` location. The
> pattern content (line ranges, snippets) is unchanged by the move.

### `app/[locale]/(marketing)/layout.tsx` (provider/layout, request-response)

**Analog:** `app/[locale]/layout.tsx`

**Locale validation + messages pattern** (`app/[locale]/layout.tsx` lines 22-48):

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children, params }: ...) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }
  const messages = await getMessages();
  return (
    <ClerkProvider>
      <ConvexClientProvider>
        ...
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider ...>
            {/* After Plan 03-05: HeaderProvider/SidebarProvider/AppSidebar/Header are NO LONGER here —
                they were extracted into app/[locale]/(app)/layout.tsx. The root renders {children} directly. */}
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
        ...
      </ConvexClientProvider>
    </ClerkProvider>
  );
}
```

**What to copy:** locale-param validation (`notFound()` guard), `getMessages()` + `NextIntlClientProvider` wiring.
**What to deliberately NOT copy (D-01):** `HeaderProvider`, `SidebarProvider`, `AppSidebar`, `Header`.

**CRITICAL correction (Plan 03-05):** A route-group layout at `app/[locale]/(marketing)/layout.tsx` **cannot** remove chrome an ancestor layout already rendered — in the App Router a nested layout composes INSIDE its ancestor, and route groups only affect URL grouping, not layout inheritance. Simply omitting the chrome from `(marketing)/layout.tsx` while the root still renders `AppSidebar`/`Header` would leave the sidebar/header around /pricing at runtime. Therefore Plan 03-05 first **decomposes the root**: the global providers (`ClerkProvider`/`ConvexClientProvider`/`ThemeProvider`/`NextIntlClientProvider`) stay in `app/[locale]/layout.tsx`, while the app-shell chrome moves into a new `app/[locale]/(app)/layout.tsx` route group that wraps only the authenticated routes. Once the root is chrome-free, `(marketing)/layout.tsx` only needs to add a lightweight centered wrapper (`max-w-3xl`/`max-w-md` div per UI-SPEC.md) and its children genuinely render with no app shell.

---

### `app/[locale]/(marketing)/pricing/page.tsx` (component, request-response + reactive read)

**Analogs:** `app/[locale]/page.tsx` (simple client page shape) + `app/[locale]/notes/page.tsx` (reactive query) + RESEARCH.md Pattern 3 (`"skip"` sentinel)

**Simple client-page shape** (`app/[locale]/page.tsx` lines 1-27, full file):

```tsx
"use client";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useHeaderConfig } from "@/providers/HeaderProvider"; // DO NOT use this on /pricing (D-01/D-04 — no header chrome)

export default function Dashboard() {
  const t = useTranslations("Dashboard");
  useHeaderConfig({ title: t("title") }); // OMIT for /pricing
  return (
    <div className="flex flex-col justify-center items-center gap-8 p-6 min-h-[50vh]">
      ...
    </div>
  );
}
```

**Reactive query pattern to copy** (`app/[locale]/notes/page.tsx` lines 27-30, 452-454):

```tsx
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
...
const { data, isPending, error } = useQuery(
  convexQuery(api.notes.getTreesByMe, { deep: 10 }),
);
```

For `/pricing`, adapt with the `"skip"` sentinel for signed-out visitors (RESEARCH.md Pattern 3, D-14/D-15):

```tsx
const { isSignedIn, user } = useUser(); // @clerk/nextjs client hook
const { data } = useQuery(
  convexQuery(
    api.subscriptions.getSubscription,
    isSignedIn ? { clerkUserId: user.id } : "skip",
  ),
);
// data === undefined while pending/skipped, null if no row, doc if found
// data?.status === "active" -> Pro card shows "Current plan" badge, no Upgrade button (D-14)
```

**Anti-pattern to avoid here:** do not gate with TanStack's `enabled: false` — per RESEARCH.md Pitfall 5, `@convex-dev/react-query`'s `enabled` support is unreliable; always use the `"skip"` args sentinel.

---

### `app/[locale]/(marketing)/pricing/actions.ts` (service/Server Action, request-response + external API)

**No true in-repo Server Action precedent** — this is the first `"use server"` function in the codebase (confirmed via repo-wide grep). Closest analog for **Stripe SDK usage conventions** is `app/api/webhooks/stripe/route.ts`.

**Stripe client instantiation pattern to copy** (`app/api/webhooks/stripe/route.ts` line 11):

```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

**ConvexHttpClient usage pattern to copy** (`app/api/webhooks/stripe/route.ts` lines 2, 56):

```typescript
import { ConvexHttpClient } from "convex/browser";
...
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
await convex.query(api.subscriptions.getSubscription, { clerkUserId });
```

**Error-handling shape to mirror** (`app/api/webhooks/stripe/route.ts` lines 55-83): wrap only the external-API call in try/catch; never let `redirect()` end up inside that same try block (RESEARCH.md Pitfall 4 — `redirect()` throws internally and a broad catch will swallow it). The webhook route's pattern of "narrow try around the risky external call, explicit status/branch outside it" is the shape to replicate, substituting Stripe Checkout Session creation for the Convex action call and a thrown/caught error surfaced as UI-SPEC's "Error state" copy instead of an HTTP status code.

**Full target shape:** use RESEARCH.md's verified Pattern 1 in full (already checked against installed `stripe@22.3.0` and `@clerk/nextjs@7.5.1` types) — `auth()` → `redirectToSignIn` short-circuit (D-02) → Convex `getSubscription` read (D-06) → active-status short-circuit (D-08) → `stripe.checkout.sessions.create(...)` with `customer`, `metadata.clerkUserId`, `subscription_data.metadata.clerkUserId` (D-07) → `redirect(session.url)` from `next/navigation` (never `@/i18n/routing`'s wrapper — that's for internal routes only, see `i18n/routing.ts` below).

**Locale-aware routing wrapper — for internal redirects only** (`i18n/routing.ts` lines 12-15):

```typescript
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

Use this `redirect` for `redirect(`/${locale}/checkout/success`)` (internal, D-08 short-circuit) but plain `redirect` from `next/navigation` for `redirect(session.url)` (external Stripe URL) — mixing these up is an explicit anti-pattern per RESEARCH.md.

---

### `app/[locale]/(marketing)/checkout/success/page.tsx` (RSC boundary) + `SuccessStatus.tsx` (client, reactive)

**Analog for the RSC/locale-param shape:** `app/[locale]/layout.tsx` lines 22-27, 41-46 (the `params: Promise<{ locale: string }>` await + destructure convention, and the `notFound()`/guard-then-render shape) — reused here as `auth()` guard + `redirect()` instead of `notFound()`.

**Analog for the reactive client child — exact data-flow match:** `app/[locale]/notes/page.tsx` lines 452-454 (`useQuery(convexQuery(api.X, args))`) — this is the load-bearing pattern for D-09; do not substitute polling.

**Concrete target shape** (RESEARCH.md Pattern 2, verified against installed types):

```tsx
// page.tsx (Server Component)
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function CheckoutSuccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const { userId } = await auth();
  if (!userId) redirect(`/${locale}/pricing`);
  return <SuccessStatus clerkUserId={userId} />;
}
```

```tsx
// SuccessStatus.tsx "use client"
"use client";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton"; // D-10 loading state primitive

export function SuccessStatus({ clerkUserId }: { clerkUserId: string }) {
  const { data } = useQuery(
    convexQuery(api.subscriptions.getSubscription, { clerkUserId }),
  );
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 18000); // D-11, pick a value in 15-20s
    return () => clearTimeout(t);
  }, []);
  if (data?.status === "active") return <ConfirmedView />;
  if (timedOut) return <TimeoutView />;
  return <LoadingView />;
}
```

**Skeleton primitive to reuse for the loading view** (`components/ui/skeleton.tsx`, full file, 14 lines):

```tsx
import { cn } from "@/lib/utils";
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}
export { Skeleton };
```

---

### `messages/en.json` / `messages/fr.json` (config, static)

**Analog:** existing `Dashboard` and `Notes` namespaces in the same files.

**Flat-namespace convention to copy** (`messages/en.json` lines 21-25):

```json
"Dashboard": {
  "title": "Dashboard",
  "notesLink": "Notes",
  "welcomeText": "Welcome to your dashboard. Access your note trees to start writing."
},
```

Add new sibling top-level keys `"Pricing": { ... }` and `"CheckoutSuccess": { ... }` following this exact flat-string convention (values are plain strings, ICU plural syntax used elsewhere e.g. `Notes.nestedNotes` line 33 if any pluralization is needed — none expected for this phase's copy per UI-SPEC.md). Mirror every key in `fr.json` with translated values — do not add a key to one file without the other (breaks `next-intl` for the missing locale).

---

### `components/ui/badge.tsx` (shadcn primitive — CLI-added, not hand-written)

**Analog for the primitive's shape/conventions:** `components/ui/skeleton.tsx` (shown above) and `components/ui/card.tsx` — both use `data-slot="..."` attribute + `cn()` from `@/lib/utils` for className composition, no default export (named exports only).

**Do not hand-write this file** — install via `npx shadcn@latest add badge` (per RESEARCH.md and UI-SPEC.md Registry Safety section, official registry, no vetting gate needed) so it matches the installed `components.json` preset (`style: new-york`, `baseColor: neutral`) automatically. Only reference this analog if the CLI is unavailable and the component must be hand-authored as a fallback.

---

### `app/[locale]/(marketing)/pricing/actions.test.ts` (test, Vitest unit)

**Analog — exact match on mocking strategy:** `app/api/webhooks/stripe/route.test.ts`

**`vi.mock` pattern to copy** (lines 1-34):

```typescript
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockConstructEvent = vi.fn(); // substitute: mockSessionsCreate, mockSubscriptionsRetrieve as needed
const mockAction = vi.fn(); // substitute: mockConvexQuery for ConvexHttpClient.query

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      checkout: { sessions: { create: mockSessionsCreate } },
    };
  }),
}));

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(function ConvexHttpClientMock() {
    return { query: mockConvexQuery };
  }),
}));

let createCheckoutSession: (locale: string) => Promise<void>;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_PRO_PRICE_ID = "price_test_123";
  process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
  process.env.APP_URL = "https://localhost:3000";
  ({ createCheckoutSession } = await import("./actions"));
});
```

Also mock `@clerk/nextjs/server`'s `auth()` (no existing analog for this — new mock needed, shape confirmed against installed `@clerk/nextjs@7.5.1` types per RESEARCH.md: `auth()` resolves to `{ userId, redirectToSignIn }`).

**Test cases to mirror the webhook test's structure (lines 44-80):** one `describe` block, `beforeEach` resetting all mocks, one `it` per branch — signed-out → `redirectToSignIn` called and no Stripe call; existing active subscription → short-circuit redirect, no Stripe call (D-08); existing inactive/no subscription → Stripe call with correct `customer`/`metadata` args (D-06/D-07).

---

### `cypress/integration/pricing.spec.ts` + `cypress/integration/checkout-redirect.spec.ts` (test, e2e)

**Analog:** `cypress/integration/app.spec.ts` (only existing Cypress spec) and `cypress/support/commands.ts`/`cypress/support/e2e.ts` for the already-wired `@clerk/testing/cypress` `clerkSetup()` helper (per RESEARCH.md "Test Framework" row — confirmed already wired, reuse rather than re-configure).

## Shared Patterns

### Locale-aware navigation vs. external redirect (critical distinction)

**Source:** `i18n/routing.ts` (full file, 16 lines)
**Apply to:** `pricing/actions.ts` (internal short-circuit redirect uses `@/i18n/routing`'s `redirect`; external Stripe URL redirect uses plain `next/navigation`'s `redirect`), `checkout/success/page.tsx` (guard redirect back to `/pricing` — internal, use `@/i18n/routing`).

```typescript
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

### Convex reactive query — the only sanctioned "is it live yet" mechanism

**Source:** `app/[locale]/notes/page.tsx` lines 27-30, 452-454
**Apply to:** `pricing/page.tsx` (skip-gated), `checkout/success/SuccessStatus.tsx` (non-skip, always has a `clerkUserId`)

```tsx
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
const { data, isPending, error } = useQuery(
  convexQuery(api.subscriptions.getSubscription, args),
);
```

Never introduce `setInterval`/manual polling for this — the codebase has zero precedent for it and D-09 explicitly forbids it.

### `getSubscription` — read-only consumption, no changes

**Source:** `convex/subscriptions.ts` lines 4-12

```typescript
export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId))
      .unique();
  },
});
```

**Apply to:** every file in this phase that needs subscription status (Server Action pre-check, pricing page, success page) — call this exact function via `ConvexHttpClient` (server) or `convexQuery` (client); do not add a new Convex function.

### `cn()` + `data-slot` convention for any new/generated UI primitive

**Source:** `components/ui/skeleton.tsx`, `components/ui/card.tsx`
**Apply to:** `components/ui/badge.tsx` (verify shadcn CLI output matches this shape after install) and any custom wrapper components built on top of it for the pricing cards.

## No Analog Found

| File                                                                                                | Role    | Data Flow        | Reason                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------- | ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/(marketing)/pricing/actions.ts` (the `"use server"` directive + `auth()` call itself) | service | request-response | First Server Action and first server-side Clerk `auth()` usage in the repo — RESEARCH.md Pattern 1 (verified directly against installed `stripe@22.3.0`/`@clerk/nextjs@7.5.1` type defs) is the authoritative source instead of an in-repo analog.                                                 |
| `.env.example` addition for `APP_URL`                                                               | config  | static           | First env var needed for the app's own absolute origin (all prior env vars were third-party secrets/IDs) — follow the existing per-line comment convention in `.env.example` (see `STRIPE_WEBHOOK_SECRET` block, lines 5-8) when adding it, but there's no prior "app URL" entry to copy verbatim. |

## Metadata

**Analog search scope:** `app/**`, `components/**`, `convex/**`, `i18n/**`, `providers/**`, `hooks/**`, `messages/**`, `.env.example`, `cypress/**`
**Files scanned:** `app/[locale]/layout.tsx`, `app/[locale]/page.tsx`, `app/[locale]/notes/page.tsx`, `app/api/webhooks/stripe/route.ts`, `app/api/webhooks/stripe/route.test.ts`, `convex/subscriptions.ts`, `convex/subscriptions.test.ts`, `components/ui/{skeleton,card,button}.tsx`, `components/Header.tsx`, `providers/{HeaderProvider,ConvexClientProvider}.tsx`, `hooks/useStoreUserEffect.ts`, `i18n/routing.ts`, `.env.example`, `cypress/integration/app.spec.ts`
**Pattern extraction date:** 2026-07-09
