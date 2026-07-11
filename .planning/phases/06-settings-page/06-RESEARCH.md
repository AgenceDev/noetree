# Phase 6: Settings Page - Research

**Researched:** 2026-07-11
**Domain:** In-app billing/subscription settings UI on Next.js App Router + Convex + Stripe + Clerk
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Cancel Subscription UX**

- **D-01:** The "Cancel subscription" confirmation uses Shadcn's **`AlertDialog`** primitive (`components/ui/alert-dialog.tsx`), not `Dialog`. This primitive exists in the codebase but is currently unused — this phase is its first consumer. Chosen over `Dialog` (used by `UpgradeModal.tsx`/`CreditsExhaustedDialog.tsx`) because it's semantically built for destructive/confirm-or-abort actions.
- **D-02:** A Pro user with a pending cancellation (`cancelAtPeriodEnd === true`, still before `currentPeriodEnd`) can click **"Resume subscription"** to undo it — this calls Stripe to set `cancel_at_period_end: false` on the same subscription (no new Checkout Session, no access gap). The existing `customer.subscription.updated` webhook handling (Phase 2) picks up the resulting Stripe event and updates Convex automatically — no new webhook branch needed, only a new outbound Stripe API call from a Server Action.
- **D-03:** Status copy for a pending cancellation reads **"Cancels on [date]"** (matches ROADMAP SC3 literally), with the "Resume subscription" button (D-02) shown alongside it in the same Plan section.

**Navigation & Page Location**

- **D-04:** Settings is a new route inside the authenticated app shell: `app/[locale]/(app)/settings/page.tsx` (parallel to the existing `app/[locale]/(app)/notes/` structure — same layout, sidebar, and auth boundary).
- **D-05:** Reached via a new **"Settings" item in the `NavUser` dropdown** (`components/nav-user.tsx`), added as its own entry — NOT merged with the existing "Account" item. "Account" keeps opening Clerk's `openUserProfile()` modal (identity/security); "Settings" navigates to the new in-app page (billing/credits). These are kept distinct because they serve different concerns.
- **D-06:** The Settings page is visible to **both Free and Pro users**, not Pro-only. A Free user sees their Plan section render "Free" + an "Upgrade to Pro" CTA (D-08) and their (always-empty/zero) Credits section — same visibility principle already established for the AI credits balance badge in Phase 5 (D-09, "visible for both Free and Pro tiers").

**Credit History Scope**

- **D-07:** The Credits section shows a history of **top-up purchases only** (`creditTransactions` rows filtered to `type === "topup"`) — not a full ledger of all four transaction types (deduction/topup/reset/refund). This matches SET-05's literal wording ("top-up purchases") and ROADMAP SC5. Deductions, resets, and refunds stay internal bookkeeping, not surfaced in this UI.
- **D-08:** A new Convex query is needed — no read-query over `creditTransactions` exists yet (only internal mutations write to it: `deductCredit`'s `applyDeduction`, `resetCredits`, `addCredits`). The new query (e.g. `listMyTopups` in `convex/aiCredits.ts`) must derive `clerkUserId` exclusively from `ctx.auth.getUserIdentity().subject` — never a client-supplied argument — mirroring the identity-derived IDOR-safe pattern already established by `getMyCredits` and `subscriptions.getSubscription`. It queries `creditTransactions.by_clerkUserId`, filtered to `type: "topup"`, sorted by `createdAt` descending.
- **D-09:** No pagination this phase — top-ups are infrequent (2€ for 50 credits), so a full unpaginated list is small and simple. Do not build a `paginate()`-based query or client pagination UI.

**Page Layout & Sections**

- **D-10:** Single page, **stacked sections** (not tabs): a "Plan" `Card` (current plan, renewal/cancel/resume status, upgrade/cancel actions) directly above a "Credits" `Card` (balance + top-up history list). Reuses `components/ui/card.tsx`, the app's established content-grouping primitive (already used on the pricing page). No `Tabs` primitive is introduced — it would be overkill for 2 sections and isn't used elsewhere in this app.
- **D-11:** A Free user's Plan card shows **plan name + "Upgrade to Pro" CTA only** — no inline feature/plan comparison. The CTA links to `/pricing` (the sole upgrade destination, per the Phase 3 D-04 constraint reused here), where the full Free-vs-Pro comparison already lives. Settings does not duplicate that comparison table.

### Claude's Discretion

- Exact `AlertDialog` copy/wording for the cancel confirmation and the post-cancel/post-resume toasts or inline confirmations
- Exact icon and position of the new "Settings" NavUser dropdown item
- Exact layout details within each Card (spacing, field ordering, exact date formatting)
- Exact naming of the new Server Actions (cancel/resume) and the new Convex query, as long as they follow the established identity-derived/Server-Action conventions

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. (A full transaction ledger showing deductions/resets/refunds, and a tabbed page layout, were both explicitly considered and rejected in favor of the simpler top-up-only / stacked-sections approach — not deferred as future work, just decided against.)
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID     | Description                                                         | Research Support                                                                                                                                                       |
| ------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SET-01 | User can view current plan (Free or Pro) in a settings/billing page | `subscriptions.getSubscription` (existing, identity-derived) reused as-is; Pattern 2 (Reactive Plan section) shows the render logic                                    |
| SET-02 | User can view subscription renewal date and status in settings      | Same query supplies `currentPeriodEnd`/`status`/`cancelAtPeriodEnd`; Pitfall 1 documents the seconds-vs-ms conversion required to render the date correctly            |
| SET-03 | User can upgrade from Free to Pro directly from settings            | D-11-locked plain `Link` to `/pricing` — no new Server Action, reuses Phase 3's checkout flow entirely (see Architectural Responsibility Map)                          |
| SET-04 | User can cancel subscription from settings with confirmation dialog | Pattern 1 (Server Action) + Code Examples (AlertDialog) + Don't Hand-Roll (`AlertDialog` reuse) + Security Domain (server-side re-verification)                        |
| SET-05 | User can view AI credits balance and top-up history in settings     | `aiCredits.getMyCredits` (existing) for balance; Pattern 3 (`listMyTopups`, new query) for top-up history; Pitfall 3 documents the accepted in-handler filter tradeoff |
| PAY-04 | User can cancel Pro subscription from within the app                | Same as SET-04, plus D-02's resume counterpart — Pattern 1 generalizes to both `cancelSubscription`/`resumeSubscription`                                               |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

- This project uses Convex as its backend. `convex/_generated/ai/guidelines.md` **must** be read
  before writing any Convex code — its rules override training-data assumptions about Convex APIs.
  Key directives relevant to this phase (all verified against the current guidelines file):
  - ALWAYS include argument validators (`v.object`/`v.string`/etc.) for every Convex function,
    including the new `listMyTopups` query.
  - Do NOT use `.filter()` in queries where an index can do the filtering — `withIndex()` is
    preferred (see Pitfall 3 for why this phase makes a documented, bounded exception).
  - Prefer `.take()`/`.paginate()` over `.collect()` unless the caller explicitly wants the full
    result set — D-09 is exactly this explicit instruction for `listMyTopups`.
  - Never accept a `userId`/identifier as a function argument for authorization — always derive via
    `ctx.auth.getUserIdentity()` (already the pattern for every existing query this phase reuses or
    mirrors).
  - Use `internalMutation`/`internalQuery` for anything not meant to be called directly by the
    client SDK — not relevant to new code this phase adds (no new internal mutations), but relevant
    context for why `getCredits`/`deductCredit` in `convex/aiCredits.ts` are internal while
    `getMyCredits`/the new `listMyTopups` are public.

## Summary

Phase 6 is almost entirely a UI-composition and Stripe-API-call phase, not a new-infrastructure
phase. Every backend primitive it needs already exists and is deployed: `subscriptions.getSubscription`
(identity-derived query), `aiCredits.getMyCredits` (identity-derived query), the
`customer.subscription.updated`/`customer.subscription.deleted` webhook branches in
`convex/stripeWebhooks.ts` (already map `cancel_at_period_end` into Convex), and the Server Action
shape used twice already in `notes/actions.ts` and `pricing/actions.ts` (Clerk `auth()` →
identity-derived Convex read → narrow try/catch around a single Stripe call → `redirect()` outside
the try/catch). The only genuinely new backend code is one Convex query (`listMyTopups`) and two
Server Actions (`cancelSubscription`, `resumeSubscription`) that each make exactly one
`stripe.subscriptions.update()` call and rely on the existing webhook to write the resulting state
back into Convex reactively.

No new npm packages are required. `@radix-ui/react-alert-dialog` (via `components/ui/alert-dialog.tsx`)
and `stripe` (22.3.0) are already installed dependencies; `AlertDialog` is unused in the codebase
outside of `notes/page.tsx`'s delete-confirmation, which is this phase's structural template for the
cancel confirmation.

One real, code-verified pitfall was found and must be handled correctly: `subscriptions.currentPeriodEnd`
is written directly from Stripe's raw `current_period_end` value (Unix **seconds**), not multiplied by
1000, even though a Phase 1 research note describes the field as an "epoch-ms" convention. Rendering it
with `new Date(currentPeriodEnd)` (treating it as milliseconds) will produce a date in January 1970. The
correct render is `new Date(currentPeriodEnd * 1000)`.

**Primary recommendation:** Build one server component page (`app/[locale]/(app)/settings/page.tsx`)
that composes two `Card`s reading `getSubscription`/`getMyCredits`/`listMyTopups` via
`convexQuery`+`useQuery` (client component, matching the established reactive pattern), add the two
cancel/resume Server Actions in a sibling `actions.ts` mirroring `notes/actions.ts`'s shape exactly, add
one new Convex query, add one `NavUser` dropdown item, and reuse `AlertDialog`/`Card` as-is — no new
dependencies, no new webhook branches, no schema changes.

## Architectural Responsibility Map

| Capability                                          | Primary Tier                                          | Secondary Tier                               | Rationale                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display current plan / renewal date / cancel status | Frontend Server (SSR shell) + Browser (reactive read) | API/Backend (Convex query)                   | Page is a Next.js route; live data comes from a Convex `useQuery` subscription reading `subscriptions.getSubscription` — same pattern as `pricing/page.tsx` and `CreditsExhaustedDialog.tsx`                                                                                                            |
| Upgrade CTA (Free → Pro)                            | Browser (Link navigation)                             | —                                            | D-11 locks this to a plain `Link` to `/pricing`, not a new checkout call — no Server Action needed here, reuses Phase 3's flow entirely                                                                                                                                                                 |
| Cancel subscription                                 | API/Backend (Server Action → Stripe)                  | —                                            | Server Action calls `stripe.subscriptions.update(id, { cancel_at_period_end: true })`; Convex state is NOT written directly from this action — the existing webhook dispatcher (`convex/stripeWebhooks.ts`) picks up the resulting `customer.subscription.updated` event and calls `upsertSubscription` |
| Resume subscription                                 | API/Backend (Server Action → Stripe)                  | —                                            | Same shape as cancel, `cancel_at_period_end: false` — no new webhook branch (D-02)                                                                                                                                                                                                                      |
| Downgrade to Free at period end                     | API/Backend (existing webhook)                        | Database (Convex)                            | `customer.subscription.deleted` → `internal.subscriptions.deleteSubscription` — already implemented in Phase 2, zero changes needed this phase                                                                                                                                                          |
| Credits balance                                     | API/Backend (Convex query)                            | Browser (reactive read)                      | Reuses `aiCredits.getMyCredits` as-is                                                                                                                                                                                                                                                                   |
| Top-up history list                                 | API/Backend (new Convex query)                        | Database (Convex `creditTransactions` table) | New `listMyTopups` query, identity-derived, reads existing table — no schema change                                                                                                                                                                                                                     |

## Standard Stack

### Core

| Library                                                                          | Version                                                                                                          | Purpose                                                            | Why Standard                                                                                                                                              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stripe`                                                                         | 22.3.0 [VERIFIED: package.json]                                                                                  | Server-side Stripe SDK, `subscriptions.update()` call              | Already the project's sole Stripe client, used identically in `notes/actions.ts`/`pricing/actions.ts`                                                     |
| `@radix-ui/react-alert-dialog` (via `components/ui/alert-dialog.tsx`)            | ^1.1.16 [VERIFIED: package.json]                                                                                 | Cancel confirmation primitive (D-01)                               | Already installed and used elsewhere (`notes/page.tsx` delete confirmation) — this phase is its second consumer, not first-install                        |
| `@convex-dev/react-query` (`convexQuery`) + `@tanstack/react-query` (`useQuery`) | already installed [VERIFIED: used throughout `notes/page.tsx`, `pricing/page.tsx`, `CreditsExhaustedDialog.tsx`] | Reactive read of subscription/credits/top-ups on the Settings page | Established project-wide pattern for all Convex reads from client components — no polling, no manual refetch                                              |
| `next-intl`                                                                      | ^4.13.0 [VERIFIED: package.json]                                                                                 | i18n for all new page/component copy                               | Every existing page/component in this app is translated via `messages/en.json`/`messages/fr.json`; a new `Settings` namespace must be added to both files |

### Supporting

None — no new supporting libraries needed. This phase is pure composition of existing primitives.

### Alternatives Considered

| Instead of                                                    | Could Use                                                       | Tradeoff                                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom cancel/resume Server Actions                           | Stripe Customer Portal (`stripe.billingPortal.sessions.create`) | Explicitly rejected by the project — `.planning/REQUIREMENTS.md` "Out of Scope" table: "Portail Stripe natif — UI custom dans l'app choisie pour cohérence UX". Do not suggest this to the planner. |
| `cancel_at_period_end: boolean` on Stripe subscription update | `cancel_at: "min_period_end"                                    | "max_period_end"` (newer Stripe enum, introduced in the "Basil" API version, 2025-05-28 changelog)                                                                                                  | Stripe's own docs are self-contradictory on deprecation status (see Open Questions) — the enum form only matters for subscriptions with multiple line items on different billing intervals, which this app's single-price Pro plan never has. **Use `cancel_at_period_end` boolean** — it is what the existing schema field (`cancelAtPeriodEnd: v.boolean()`), webhook handler, and Phase 6 CONTEXT D-02 (locked) all already assume. Switching to `cancel_at` would require a schema change out of scope for this phase. |

**Installation:** None — no new packages required this phase.

**Version verification:** `stripe` 22.3.0 and `@radix-ui/react-alert-dialog` ^1.1.16 confirmed present in `C:\noetree\package.json` (read directly, not searched). No `npm view` call was needed since these are already-installed, already-used dependencies, not new additions.

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new external packages.** All libraries used
(`stripe`, `@radix-ui/react-alert-dialog`, `@convex-dev/react-query`, `next-intl`) are pre-existing
dependencies already used by prior phases (1, 2, 3, 5). No `npm install` step belongs in this phase's
plan; a task that attempts to install any of these would indicate scope creep.

## Architecture Patterns

### System Architecture Diagram

```
Browser (Settings page, client component)
  │
  ├─ useQuery(convexQuery(api.subscriptions.getSubscription, {}))  ──┐
  ├─ useQuery(convexQuery(api.aiCredits.getMyCredits, {}))          ──┼─→ Convex (reactive subscriptions)
  ├─ useQuery(convexQuery(api.aiCredits.listMyTopups, {}))          ──┘   identity derived from
  │                                                                        ctx.auth.getUserIdentity()
  ├─ [Free user] "Upgrade to Pro" → <Link href="/pricing">  (no Stripe call from Settings)
  │
  ├─ [Pro user, not cancelling] "Cancel subscription" → AlertDialog confirm
  │       └─ onClick → <form action={cancelSubscription}> (Server Action)
  │              └─ Next.js Server Action (Node runtime)
  │                     ├─ Clerk auth() → userId
  │                     ├─ Convex query (forwarded Clerk token) → subscriptions.getSubscription
  │                     │      (re-verify: status active, own stripeSubscriptionId — never trust UI)
  │                     └─ stripe.subscriptions.update(id, { cancel_at_period_end: true })
  │                            └─ Stripe emits `customer.subscription.updated` webhook
  │                                   └─ app/api/webhooks/stripe/route.ts
  │                                          └─ convex.stripeWebhooks.processWebhookEvent (action)
  │                                                 └─ internal.subscriptions.upsertSubscription
  │                                                        (writes cancelAtPeriodEnd: true)
  │                                                               │
  │              ◄────────────────────────────────────────────────┘ (reactive useQuery re-renders
  │                                                                    "Cancels on [date]" automatically)
  │
  └─ [Pro user, cancelAtPeriodEnd === true] "Resume subscription" → same Server Action shape,
         stripe.subscriptions.update(id, { cancel_at_period_end: false }), same webhook round-trip

Stripe (async, out of band)
  └─ customer.subscription.deleted fires at period end (no user action)
         └─ same webhook path → internal.subscriptions.deleteSubscription
                └─ Convex subscriptions row deleted → getSubscription returns null
                       → Settings page reactively renders "Free" (SC4, zero new code this phase)
```

### Recommended Project Structure

```
app/[locale]/(app)/settings/
├── page.tsx           # Server/client boundary: page shell, useHeaderConfig title, renders sections
├── actions.ts          # "use server" — cancelSubscription, resumeSubscription
└── actions.test.ts      # vitest, mirrors pricing/actions.test.ts's mock shape

convex/
└── aiCredits.ts         # add listMyTopups query (same file as getMyCredits — no new file needed)

components/
└── nav-user.tsx          # add one new DropdownMenuItem (D-05)

messages/
├── en.json               # add "Settings" namespace
└── fr.json               # add "Settings" namespace (mirror)
```

Whether the Plan/Credits sections live as inline JSX inside `page.tsx` or as extracted
`SettingsPlanCard.tsx` / `SettingsCreditsCard.tsx` components is Claude's discretion (not specified
in CONTEXT.md) — given the two-section, no-tabs, stacked-Card layout locked by D-10, and that this
page has meaningfully more state (subscription + credits + top-ups + dialog open state + pending
states for two distinct mutations) than `pricing/page.tsx`, extracting two card components keeps
`page.tsx` from growing past ~250 lines. Recommend extraction but do not treat as load-bearing.

### Pattern 1: Server Action cancel/resume (mirrors `notes/actions.ts` exactly)

**What:** A `"use server"` function that authenticates via Clerk, re-verifies subscription ownership
server-side via an identity-forwarded Convex query, then makes exactly one Stripe API call inside a
narrow try/catch.
**When to use:** For both `cancelSubscription` and `resumeSubscription`.
**Example:**

```typescript
// Source: pattern extracted from app/[locale]/(app)/notes/actions.ts (existing, deployed code)
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

### Pattern 2: Reactive Plan section (client component)

**What:** `useQuery(convexQuery(api.subscriptions.getSubscription, ...))`, branch UI on `status` and
`cancelAtPeriodEnd`.
**When to use:** Settings page Plan `Card`.
**Example:**

```typescript
// Source: pattern extracted from CreditsExhaustedDialog.tsx / pricing/page.tsx (existing, deployed code)
const { data: subscription } = useQuery(
  convexQuery(api.subscriptions.getSubscription, isSignedIn ? {} : "skip"),
);
const isPro = subscription?.status === "active";
const isCancelling = isPro && subscription?.cancelAtPeriodEnd === true;

// Pitfall: currentPeriodEnd is stored in Unix SECONDS (raw Stripe value),
// not milliseconds — multiply by 1000 before constructing a Date.
const renewalDate = subscription?.currentPeriodEnd
  ? new Date(subscription.currentPeriodEnd * 1000)
  : null;
```

### Pattern 3: New identity-derived Convex query, filtered to one transaction type

**What:** Mirrors `getMyCredits`'s identity-derivation exactly; adds an in-handler JS filter for `type`.
**When to use:** `listMyTopups` in `convex/aiCredits.ts`.
**Example:**

```typescript
// Source: pattern extracted from convex/aiCredits.ts getMyCredits (existing, deployed code)
export const listMyTopups = query({
  args: {},
  handler: async ctx => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // D-09: no pagination — an explicit instruction to return the full,
    // small (top-ups are 2€/50-credit, infrequent) result set justifies
    // .collect() over the Convex guideline default of .take()/paginate().
    const rows = await ctx.db
      .query("creditTransactions")
      .withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))
      .order("desc")
      .collect();

    return rows.filter(r => r.type === "topup");
  },
});
```

See **Common Pitfalls → Pitfall 3** for why this in-handler filter (not a compound index) is the
correct call for this phase, and what the planner should flag as a fast-follow.

### Anti-Patterns to Avoid

- **Writing Convex state directly from the cancel/resume Server Action:** The established pattern in
  this codebase (Phase 2, Phase 3, Phase 5) is Stripe-call → webhook → Convex write. A cancel/resume
  action that calls `internal.subscriptions.upsertSubscription` directly would create a second,
  competing write path and risk the two racing or diverging (e.g. if the webhook and the direct write
  compute `currentPeriodEnd` differently). Let the existing webhook be the only writer.
- **Trusting the client's `status`/`cancelAtPeriodEnd` in the Server Action:** The UI only conditionally
  renders the Cancel/Resume buttons — that is not authorization. Re-fetch `getSubscription` server-side
  inside the Server Action itself (Pattern 1) before calling Stripe.
- **Introducing a `Tabs` primitive:** Explicitly rejected by D-10 for this 2-section page.
- **Building a `paginate()`-based top-up history:** Explicitly rejected by D-09.

## Don't Hand-Roll

| Problem                                         | Don't Build                                                  | Use Instead                                                                  | Why                                                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cancel/resume confirmation dialog               | Custom modal state machine                                   | `AlertDialog` (`components/ui/alert-dialog.tsx`)                             | Already installed, accessible (Radix), and is the semantically correct primitive for destructive/confirm-or-abort actions (D-01)     |
| Subscription state sync after cancel/resume     | Manual polling or direct Convex write from the Server Action | Existing `customer.subscription.updated` webhook branch                      | Already handles `cancel_at_period_end`; a second write path is a correctness risk, not a convenience                                 |
| Plan/credits state refresh on the Settings page | `setInterval`/manual refetch button                          | `useQuery` (Convex reactive subscription)                                    | Already the established pattern across every billing-adjacent surface in this app                                                    |
| Currency/date formatting                        | Hand-rolled string concatenation                             | `Intl.DateTimeFormat` / `toLocaleDateString()` (built-in, no new dependency) | No date library (`date-fns` etc.) is installed in this project — do not add one for a single date field; native `Intl` is sufficient |

**Key insight:** Every "hard part" of this phase (auth derivation, Stripe error handling, reactive
state sync) has already been solved twice in this codebase (Phase 3's checkout, Phase 5's top-up).
The only genuinely new logic is the two one-line Stripe API calls (`cancel_at_period_end: true` /
`false`) and the read-side `type: "topup"` filter.

## Common Pitfalls

### Pitfall 1: `currentPeriodEnd` is stored in Unix seconds, not milliseconds

**What goes wrong:** Rendering `new Date(subscription.currentPeriodEnd)` directly produces a date in
January 1970, because `Date` expects milliseconds.
**Why it happens:** `convex/stripeWebhooks.ts` line 126 writes
`subscription.items?.data?.[0]?.current_period_end ?? 0` directly — this is Stripe's raw API value,
which Stripe returns in Unix **seconds** (confirmed: Stripe's `current_period_end` field is
documented and universally seconds-based). No `* 1000` conversion happens anywhere in the write path.
This contradicts a stated intent in `.planning/phases/01-schema-infrastructure-foundation/01-RESEARCH.md`
("epoch-ms timestamp... matching Convex idiom") — that intent was apparently not carried through to
the Phase 2 webhook implementation. `[VERIFIED: convex/stripeWebhooks.ts line 126, read directly]`
**How to avoid:** Every place the Settings page (or any future code) turns `currentPeriodEnd` into a
`Date`, multiply by 1000 first: `new Date(subscription.currentPeriodEnd * 1000)`.
**Warning signs:** Any rendered renewal/cancellation date showing "1/15/1970" or similar during manual
testing is this bug. This is exactly the kind of thing SC1/SC3 ("renewal date", "cancels on [date]")
will surface if missed — add a verification step that checks the rendered date is in the future,
not just that a date string renders.

### Pitfall 2: Stripe's own docs are inconsistent about `cancel_at_period_end` deprecation

**What goes wrong:** A search for "current Stripe subscription cancellation API" surfaces a 2025-05-28
Stripe changelog page stating `cancel_at_period_end` is deprecated in favor of `cancel_at` with enum
values (`min_period_end`/`max_period_end`), which could lead an implementer to switch parameters
mid-phase.
**Why it happens:** The changelog is about a narrower feature (mixed-interval subscription
cancellation) being layered on top of the existing parameter, not a hard deprecation — Stripe's main
"Cancel subscriptions" doc page and its Update Subscription API reference page (fetched directly)
both continue to document `cancel_at_period_end` as a first-class, non-deprecated parameter with no
deprecation notice.
**How to avoid:** Use `cancel_at_period_end: true`/`false` (boolean) — matches the existing
`cancelAtPeriodEnd: v.boolean()` schema field, the existing webhook read
(`subscription.cancel_at_period_end ?? false`), and D-02 (locked decision, explicitly names
`cancel_at_period_end: false` for resume). Switching to the `cancel_at` enum form is out of scope —
it would require a schema field type change this phase does not need.
**Warning signs:** N/A — this is a documentation-research trap, not a runtime failure mode, as long as
the boolean parameter is used consistently with the rest of the codebase.

### Pitfall 3: `listMyTopups`'s in-handler `.filter()` violates the project's own "push filters to

storage" rule — acceptable here, but should not be copied elsewhere
**What goes wrong:** The project's Convex guidelines (`convex/_generated/ai/guidelines.md`) and the
`convex-performance-audit` skill (`hot-path-rules.md`) both explicitly say "Do NOT use `filter` in
queries... use `withIndex`". `listMyTopups` as specified by D-08 queries `by_clerkUserId` then filters
to `type: "topup"` in JavaScript — a pattern the project's own tooling would normally flag.
**Why it happens:** `creditTransactions` only has a `by_clerkUserId` index (no `type` field in any
index) — adding a compound `by_clerkUserId_and_type` index is possible but was not raised in
CONTEXT.md, and D-08 explicitly describes the query as "queries `creditTransactions.by_clerkUserId`,
filtered to `type: "topup"`". Given per-user top-up counts are small (each top-up is a manual 2€
purchase — realistically single digits to low tens of rows per user, confirmed by D-09's own framing
"top-ups are infrequent"), the JS-filter cost here is bounded and low, unlike the hot-path table-scan
scenarios `hot-path-rules.md` warns about.
**How to avoid:** Accept the in-handler filter as-is for this phase (it matches the locked D-08
wording and the row counts are small) — do NOT let a plan-checker pass silently "fix" this into a
scope-creeping schema migration. If the planner wants to proactively harden it, the correct fix is
adding `.index("by_clerkUserId_and_type", ["clerkUserId", "type"])` to `creditTransactions` in
`convex/schema.ts` and switching the query to `withIndex("by_clerkUserId_and_type", q =>
q.eq("clerkUserId", identity.subject).eq("type", "topup"))` — but this is an optional hardening, not
required to satisfy SET-05, and should be called out explicitly as in-scope-or-not during planning
rather than added silently.
**Warning signs:** None expected at this data volume — flag only if a future phase reports Settings
page load latency issues.

### Pitfall 4: `redirect()` inside the cancel/resume Server Action's try/catch

**What goes wrong:** Next.js's `redirect()` throws internally to unwind the render; if a cancel/resume
action wraps a `redirect()` call inside the same try/catch guarding the Stripe call, the redirect throw
gets caught and misreported as a Stripe failure.
**Why it happens:** Copy-pasting the checkout Server Actions' shape (`notes/actions.ts`,
`pricing/actions.ts`) without noticing they call `redirect(session.url)` outside their try/catch for
exactly this reason.
**How to avoid:** The cancel/resume actions in this phase likely need **no redirect at all** — success
means "stay on the Settings page, let `useQuery` reactively update." If a toast/confirmation is added
instead of a redirect, it does not have this hazard. If a redirect is added anyway (e.g. redirecting to
`/settings` after a successful action initiated from elsewhere), keep it strictly outside the
try/catch, per the existing pattern.
**Warning signs:** A cancel/resume action that always reports failure even when the Stripe dashboard
shows the subscription successfully updated.

## Code Examples

### Cancel confirmation AlertDialog (mirrors notes/page.tsx's delete confirmation exactly)

```typescript
// Source: pattern extracted from app/[locale]/(app)/notes/page.tsx (existing, deployed code)
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
        onClick={() => cancelMutate()}
      >
        {t("confirmCancel")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### NavUser dropdown item (D-05)

```typescript
// Source: components/nav-user.tsx (existing, deployed code) — insert as its own
// DropdownMenuItem, separate from the existing "Account" item that calls openUserProfile()
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

Note: `nav-user.tsx` uses `@/i18n/routing`'s `useRouter`/`usePathname`, already imported — reuse
`router.push` (or a `Link` wrapped in `DropdownMenuItem asChild`, matching whichever idiom the
executor finds cleaner; both are valid in this codebase, `Link` is used in `UpgradeModal.tsx`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact                                                                                            |
| ------------ | ---------------- | ------------ | ------------------------------------------------------------------------------------------------- |
| N/A          | N/A              | N/A          | This phase has no "old approach" to replace — it is new UI over existing, current infrastructure. |

**Deprecated/outdated:** None applicable to this phase's actual implementation surface. (See Pitfall 2
for a documentation-ambiguity note about `cancel_at_period_end` that does NOT change what this phase
should build.)

## Assumptions Log

| #   | Claim                                                                                                                                                                                                                                                                                  | Section                                                        | Risk if Wrong                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Stripe's `current_period_end` field is returned in Unix seconds (industry-standard Stripe convention, cross-checked against three Stripe doc pages during this research, none of which state otherwise)                                                                                | Common Pitfalls → Pitfall 1                                    | If wrong, the recommended `* 1000` fix would make dates worse, not better — however this is an extremely stable, long-standing Stripe API convention with no contradicting evidence found, so risk is low                                                                                                                                                            |
| A2  | `stripe.subscriptions.update(id, { cancel_at_period_end: true })` reliably fires a `customer.subscription.updated` webhook event that includes the updated `cancel_at_period_end` value (relied on by D-02, not re-verified live against a real Stripe test-mode account this session) | Architecture Patterns → Pattern 1, System Architecture Diagram | If wrong, cancel/resume would silently not update Convex state — however this is the same event/field the existing `checkout.session.completed`→subscription flow already round-trips successfully per `.planning/STATE.md`'s "Both re-verified against live Stripe test mode" note, so this is a well-trodden path in this specific codebase, not a cold assumption |

**If this table is empty:** N/A — see A1/A2 above.

## Open Questions

1. **Should `listMyTopups` sort by `createdAt` (app-level field) or rely on index/`_creationTime` order?**
   - What we know: D-08 says "sorted by `createdAt` descending"; the `creditTransactions` table has
     both a `createdAt: v.number()` field (set via `Date.now()` in `addCredits`) and Convex's
     automatic `_creationTime`. Since both are set in the same mutation transaction, they are
     effectively identical in practice.
   - What's unclear: Whether the query should explicitly sort in JS by `createdAt` (defensive,
     matches D-08's literal wording) or rely on `.order("desc")` over the index (which sorts by
     `_creationTime`, not `createdAt`, when only `by_clerkUserId` is used).
   - Recommendation: Use `.order("desc")` (sorts by `_creationTime`, which will match `createdAt`
     order for all realistically-possible data in this app) — do not add a manual JS sort by
     `createdAt` unless a future migration ever backfills historical rows out of order.

2. **Extracted Card components vs. inline JSX in `page.tsx`?**
   - What we know: D-10 locks the two-Card, stacked, no-tabs layout. Nothing in CONTEXT.md specifies
     file structure below the page level.
   - What's unclear: Whether the planner should task out `SettingsPlanCard.tsx`/`SettingsCreditsCard.tsx`
     as separate files or keep everything in `page.tsx`.
   - Recommendation: Extract (see Recommended Project Structure) for readability given the page has
     three separate Convex reads and two Server Action bindings, but this is non-blocking — either
     structure satisfies all five success criteria.

## Environment Availability

Skipped — this phase has no new external tool/service dependencies. Stripe (test-mode, already
configured with live-verified Price IDs per `.planning/STATE.md`) and Convex are both already
operational from prior phases; no new environment setup is required.

## Validation Architecture

### Test Framework

| Property           | Value                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| Framework          | Vitest (`environment: "edge-runtime"`), `convex-test` for Convex function tests       |
| Config file        | `C:\noetree\vitest.config.ts`                                                         |
| Quick run command  | `npx vitest run convex/aiCredits.test.ts app/[locale]/(app)/settings/actions.test.ts` |
| Full suite command | `npx vitest run`                                                                      |

### Phase Requirements → Test Map

| Req ID          | Behavior                                                                                                                               | Test Type                                     | Automated Command                                                                                                    | File Exists?                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| SET-01          | Settings page shows current plan (Free/Pro)                                                                                            | unit (component data logic) / manual UI check | `npx vitest run` (no dedicated file yet)                                                                             | ❌ Wave 0                           |
| SET-02          | Renewal date + status displayed correctly, including the seconds-vs-ms pitfall                                                         | unit                                          | new test asserting `new Date(currentPeriodEnd * 1000)` renders a future date given a realistic epoch-seconds fixture | ❌ Wave 0                           |
| SET-03          | Free user sees Upgrade CTA linking to `/pricing`                                                                                       | manual / component test                       | N/A (simple `Link`, low-value to unit test — mirrors `UpgradeModal.tsx`'s untested CTA)                              | —                                   |
| SET-04          | Cancel with confirmation, Server Action calls Stripe with `cancel_at_period_end: true`, guarded by active-subscription check           | unit                                          | `npx vitest run app/[locale]/(app)/settings/actions.test.ts`                                                         | ❌ Wave 0                           |
| PAY-04 (resume) | Resume Server Action calls Stripe with `cancel_at_period_end: false`                                                                   | unit                                          | same file as above                                                                                                   | ❌ Wave 0                           |
| SET-05          | `listMyTopups` returns only `type: "topup"` rows for the caller's own `clerkUserId`, sorted desc, and returns `[]` for unauthenticated | unit (`convex-test`)                          | `npx vitest run convex/aiCredits.test.ts`                                                                            | ❌ Wave 0 (append to existing file) |

### Sampling Rate

- **Per task commit:** targeted `npx vitest run <changed test file>`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `app/[locale]/(app)/settings/actions.test.ts` — new file, covers SET-04/PAY-04 (cancel/resume
      Server Actions) — mirror the mock shape of
      `app/[locale]/(marketing)/pricing/actions.test.ts` exactly (mock `stripe`, `convex/browser`,
      `@clerk/nextjs/server`; assert the active-subscription guard rejects a Free/canceled caller
      before any Stripe call, mirroring `TOPUP_REQUIRES_PRO` in `notes/actions.ts`'s existing test
      coverage pattern)
- [ ] `convex/aiCredits.test.ts` — append test cases for the new `listMyTopups` query, covering:
      identity-derivation (returns `[]` for unauthenticated, matching `getMyCredits`'s existing test),
      `type` filtering (a mixed set of deduction/topup/reset/refund rows returns only topups), and
      cross-user isolation (another user's topups never leak)
- [ ] No new framework install needed — Vitest + `convex-test` already fully configured

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | yes     | Clerk `auth()` in Server Actions (existing pattern, reused)                                                                                                                                                                                                                                                                      |
| V3 Session Management | no      | Delegated entirely to Clerk — no new session logic this phase                                                                                                                                                                                                                                                                    |
| V4 Access Control     | yes     | Identity-derived `clerkUserId` (never client-supplied) for `getSubscription`, `getMyCredits`, `listMyTopups`, and both new Server Actions — this is the single most important security invariant already established in this codebase (03-REVIEW.md CR-01 IDOR fix) and must be preserved for every new function this phase adds |
| V5 Input Validation   | yes     | Convex `v.object`/`v.string` argument validators (guidelines-mandated); cancel/resume Server Actions take **zero** arguments — the subscription to act on is always derived from the caller's own identity-scoped `getSubscription` lookup, never a client-supplied subscription ID                                              |
| V6 Cryptography       | no      | No new crypto surface — Stripe API key stays server-only env var, unchanged from existing phases                                                                                                                                                                                                                                 |

### Known Threat Patterns for this stack

| Pattern                                                                                                                                       | STRIDE                 | Standard Mitigation                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDOR: a signed-in user cancels/resumes another user's subscription by guessing/supplying a `stripeSubscriptionId`                             | Elevation of Privilege | Never accept a subscription ID as a Server Action parameter — always re-derive via the caller's own identity-scoped `getSubscription` query inside the action itself (Pattern 1), exactly as `getSubscription` and `runAiAction` already do for reads/deductions |
| A Free or already-cancelling user hits `cancelSubscription`/`resumeSubscription` directly (bypassing UI conditionals) via a crafted form POST | Tampering              | Server-side re-verification of `status === "active"` (for cancel) / `cancelAtPeriodEnd === true` (for resume) before any Stripe call — UI-only conditional rendering is not a security boundary (mirrors `notes/actions.ts`'s `TOPUP_REQUIRES_PRO` guard)        |
| Stripe webhook replay used to desynchronize cancel/resume state                                                                               | Tampering              | Already mitigated — `processedStripeEvents` idempotency table (Phase 2, unchanged) rejects replayed `stripeEventId`s before any mutation runs                                                                                                                    |
| Leaking another user's top-up history via a client-supplied `clerkUserId` argument on `listMyTopups`                                          | Information Disclosure | `listMyTopups` MUST follow `getMyCredits`'s zero-argument, identity-derived shape exactly (D-08 locks this)                                                                                                                                                      |

## Sources

### Primary (HIGH confidence)

- `C:\noetree\convex\subscriptions.ts`, `convex\aiCredits.ts`, `convex\stripeWebhooks.ts`,
  `convex\schema.ts` — read directly, current deployed code
- `C:\noetree\app\[locale]\(app)\notes\actions.ts`, `app\[locale]\(marketing)\pricing\actions.ts` —
  read directly, established Server Action pattern this phase must mirror
- `C:\noetree\components\nav-user.tsx`, `components\ui\alert-dialog.tsx`, `components\ui\card.tsx`,
  `components\UpgradeModal.tsx`, `components\CreditsExhaustedDialog.tsx` — read directly
- `C:\noetree\convex\_generated\ai\guidelines.md` — project's Convex API/pattern rules (overrides
  training data per project CLAUDE.md instruction)
- `C:\noetree\.claude\skills\convex-performance-audit\references\hot-path-rules.md` — project skill,
  informs Pitfall 3
- `C:\noetree\package.json` — dependency versions verified directly
- `.planning/phases/06-settings-page/06-CONTEXT.md`, `.planning/REQUIREMENTS.md`,
  `.planning/STATE.md` — locked decisions and requirement text

### Secondary (MEDIUM confidence)

- [Stripe: Cancel a subscription (API Reference)](https://docs.stripe.com/api/subscriptions/cancel) —
  confirms `cancel_at_period_end` is a live, documented parameter
- [Stripe: Cancel subscriptions (guide)](https://docs.stripe.com/billing/subscriptions/cancel) —
  confirms cancel-at-period-end and resume-via-`cancel_at_period_end:false` flow, no deprecation
  notice on this page

### Tertiary (LOW confidence)

- [Stripe changelog: Adds more flexibility for how you manage subscription end-of-period
  cancellations](https://docs.stripe.com/changelog/basil/2025-05-28/cancel-at-enums) — states
  `cancel_at_period_end` is "deprecated" for mixed-interval subscriptions specifically; contradicts
  the two docs pages above for the simple single-price case this app uses. Flagged as LOW confidence
  / Pitfall 2 — do not let this override the locked D-02 decision.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new dependencies, all versions read directly from `package.json`
- Architecture: HIGH — every pattern (Server Action shape, reactive query shape, webhook round-trip)
  is copied from three already-deployed, already-tested prior phases in this exact codebase
- Pitfalls: HIGH for Pitfall 1 (verified by direct source read of the exact line writing
  `currentPeriodEnd`), MEDIUM for Pitfall 2 (Stripe's own docs conflict), HIGH for Pitfalls 3–4
  (verified against project's own guideline docs and existing code)

**Research date:** 2026-07-11
**Valid until:** 2026-08-10 (30 days — stack is stable; re-check Stripe's `cancel_at_period_end`
deprecation status if this phase is revisited after that window, given the ambiguity noted in
Pitfall 2)
