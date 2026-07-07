# Phase 1: Schema + Infrastructure Foundation - Research

**Researched:** 2026-07-07
**Domain:** Convex schema design, Stripe SDK installation, Next.js/Vercel + Convex environment variable management, Clerk middleware
**Confidence:** MEDIUM-HIGH (schema/package findings HIGH; environment-topology findings MEDIUM — see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### User-Subscription Linkage

- **D-01:** The `subscriptions` table stores `clerkUserId: v.string()` directly — no reference to `v.id("users")`. Webhook processing writes `clerkUserId` straight from Stripe metadata without a cross-table lookup. All subsequent phases query subscriptions by `clerkUserId` index.
- **D-02:** Add a Convex index `by_clerkUserId` on the `subscriptions` table so lookups in Phase 2–6 are O(log n) without a full table scan.

### Environment Variables

- **D-03:** Phase 1 execution includes creating the two Stripe products in Stripe Dashboard **test mode** and capturing the real Price IDs (not placeholders). Both `STRIPE_PRO_PRICE_ID` and `STRIPE_TOPUP_PRICE_ID` must be real test-mode `price_xxx` values before Phase 1 is considered complete.
- **D-04:** Create `.env.example` in the repo root listing all required vars with inline comments explaining which are secret vs. public and which vary per environment. CONTEXT.md documents the 3-webhook-secret pattern (local CLI secret, staging secret, production secret).
- **D-05:** Required env vars:
  - `STRIPE_SECRET_KEY` — secret, server-only, per environment
  - `STRIPE_WEBHOOK_SECRET` — secret, server-only, **one per environment** (local CLI / staging / production = 3 distinct values)
  - `STRIPE_PRO_PRICE_ID` — can be shared across envs (test mode value) or per-env
  - `STRIPE_TOPUP_PRICE_ID` — same as above
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public, safe to expose in client code

### Clerk Middleware Exclusion

- **D-06:** Use the `isPublicRoute` pattern with `createRouteMatcher`. The middleware body becomes:

  ```ts
  const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
  const isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"]);

  export default clerkMiddleware(async (auth, req) => {
    if (!isPublicRoute(req) && isProtectedRoute(req)) {
      await auth.protect();
    }
  });
  ```

  This is additive — existing `/dashboard` protection unchanged; webhook routes bypass Clerk auth entirely.

### Stub File Depth

- **D-07:** Stubs export named query/mutation/internalMutation functions with correct argument types and return type annotations, but throw a descriptive error in the body (e.g., `throw new Error("Not implemented — Phase 2")`). This ensures:
  - `convex dev` compiles cleanly (Phase 1 success criterion)
  - Phase 2 fills in implementations without schema surprises
  - Type contracts between phases are established in Phase 1
- **D-08:** `convex/subscriptions.ts` stubs to include: `getSubscription` (query by clerkUserId), `upsertSubscription` (internalMutation), `deleteSubscription` (internalMutation).
- **D-09:** `convex/aiCredits.ts` stubs to include: `getCredits` (query by clerkUserId), `deductCredit` (internalMutation, atomic), `resetCredits` (internalMutation), `addCredits` (internalMutation for top-up).

### Claude's Discretion

Not explicitly separated as a distinct section in 01-CONTEXT.md — the document's `<decisions>` block covers all in-scope choices as locked decisions (D-01 through D-09). Areas not covered by an explicit D-number (e.g., exact Convex timestamp type — `v.number()` vs `v.string()`; exact wording of stub error messages beyond D-07's example) are Claude's discretion by omission. See Assumptions Log (A1) for the one discretionary choice this research makes explicit.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope (01-CONTEXT.md `<deferred>` block).
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 1 owns no direct requirement IDs — per ROADMAP.md and REQUIREMENTS.md, it is a prerequisite for all 19 v1.0 requirements, with one exception: the numeric value behind PLAN-05 is baked directly into this phase's schema.

| ID | Description | Research Support |
|----|-------------|-------------------|
| PLAN-05 | Pro tier includes a defined monthly AI credits quota | The quota value (100 credits/month, per STATE.md/CONTEXT.md `<specifics>`) is not a schema field itself but the *initial/reset value* written into `aiCredits.balance` by the (stubbed-in-Phase-1, implemented-in-Phase-2) `resetCredits` internalMutation. This research's Pattern 1 (schema) and Pattern 2 (stub signatures) establish the `aiCredits` table and `resetCredits`/`addCredits` stub shapes that Phase 2 will fill with this constant — no schema field stores "100" directly, it is applied in mutation logic, consistent with D-09's requirement that `resetCredits` be an internalMutation |

**Coverage note:** All other 18 requirements (PAY-*, CRED-*, SET-*, remaining PLAN-*) are indirectly enabled by this phase's infrastructure but have no phase-specific research finding beyond "the schema/env vars/stubs this research documents must exist before those phases can be planned."
</phase_requirements>

## Summary

Phase 1 is a pure infrastructure phase: extend `convex/schema.ts` with 4 new tables, install two Stripe packages, patch `middleware.ts` to exclude webhook routes, and write typed stub files for `convex/subscriptions.ts` and `convex/aiCredits.ts`. All four sub-tasks are individually low-risk and well-documented by Context7/official docs, following patterns already established in the existing codebase (`convex/schema.ts`, `convex/notes.ts`, `convex/users.ts`).

Two findings require attention beyond the CONTEXT.md decisions as written. First, the repo's `.gitignore` contains a blanket `.env*` rule, which will **silently swallow** the `.env.example` file D-04 requires — it must be negated. Second, the installed `@clerk/nextjs@6.12.4` is affected by a disclosed, critical (CVSS 9.1) middleware route-protection bypass (CVE-2026-41248 / GHSA-vqx2-fgx2-5wq9) that is fixed starting at `6.39.2`. Because this phase is the one editing `middleware.ts`, this is the natural point to also bump the package to a patched version — the `createRouteMatcher` pattern in D-06 itself is unaffected in shape, but running it on a vulnerable SDK version undermines the `/dashboard` protection it exists to enforce.

**Primary recommendation:** Implement D-01 through D-09 exactly as locked, using Convex's `.withIndex()` query pattern (matching `convex/users.ts`) for all four new tables; add `!.env.example` to `.gitignore` before creating that file; and bump `@clerk/nextjs` to `>=6.39.2` (same major, non-breaking) as part of the middleware patch task, flagged for human verification given its security nature.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Convex schema (4 new tables) | Database / Storage | API / Backend | Convex unifies storage schema and function runtime — `defineTable` is simultaneously a DDL and an API contract |
| `convex/subscriptions.ts`, `convex/aiCredits.ts` stub functions | API / Backend | Database / Storage | Convex query/mutation/internalMutation functions ARE the backend API layer, directly coupled to the tables they read/write |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Frontend Server (SSR/Next.js runtime) | — | Per PROJECT.md constraint, the Stripe webhook handler is a Next.js API route (not a Convex HTTP action) — these secrets are consumed server-side by Next.js, not by Convex functions |
| `STRIPE_PRO_PRICE_ID`, `STRIPE_TOPUP_PRICE_ID` | Frontend Server (SSR/Next.js runtime) | — | Read by the (future) Checkout-session-creation code, which per the same constraint lives in Next.js, not Convex |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser / Client | Frontend Server (SSR) | `NEXT_PUBLIC_` vars are inlined into the client bundle at build time; consumed by `@stripe/stripe-js`'s `loadStripe()` in the browser |
| Clerk middleware route exclusion | Frontend Server (SSR/Edge middleware) | — | `middleware.ts` executes before any route handler, in Next.js's middleware runtime, not in the browser or in Convex |
| `stripe` package | Frontend Server (SSR/Next.js runtime) | — | Server-only SDK (uses Node `crypto` for signature verification) — must never be imported in client components |
| `@stripe/stripe-js` package | Browser / Client | — | Explicitly designed to be safe for browser bundles (lazy-loads Stripe.js from Stripe's CDN) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | `22.3.0` [VERIFIED: npm registry] | Server-side Stripe SDK — webhook signature verification, Checkout session creation, customer/subscription API calls | Official Stripe-maintained Node SDK; only supported way to call Stripe API from Node.js server code |
| `@stripe/stripe-js` | `9.9.0` [VERIFIED: npm registry] | Client-side loader for Stripe.js — used to redirect to Stripe Checkout | Official Stripe-maintained browser loader; required by Stripe for PCI-compliant client-side Checkout redirect (raw Stripe.js CDN script is the alternative, not a package) |

Both package names were discovered via WebSearch/training knowledge and are additionally confirmed as the officially documented Stripe package names at `stripe.com/docs/js` (homepage listed in npm registry metadata) — this satisfies the `[VERIFIED]` bar (official-source confirmation + registry existence), not registry existence alone.

### Supporting
None required for Phase 1 — no additional packages needed. `convex@1.19.5` (installed, current registry latest is `1.42.1` [VERIFIED: npm registry]) is untouched by this phase; upgrading it is out of scope and not required by any Phase 1 success criterion.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@stripe/stripe-js` npm package | Raw `<script src="https://js.stripe.com/v3/">` tag | The npm package is the officially recommended approach for framework apps (typed, tree-shakeable, no manual script-tag lifecycle management); no reason to deviate |
| Convex tables for subscription/credit state | External Postgres/Redis | Rejected already at STATE.md/PROJECT.md level — Convex is the locked store of truth; not re-litigated here |

**Installation:**
```bash
npm install stripe @stripe/stripe-js
```

**Version verification:** Confirmed via `npm view stripe version` → `22.3.0`, `npm view @stripe/stripe-js version` → `9.9.0` (checked 2026-07-07). `stripe` requires Node `>=18` [VERIFIED: npm registry `engines` field] — local Node is `v26.4.0`, well above minimum.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `stripe` | npm | ~14.8 yrs (first published 2011-09-28) | 13.87M/week | github.com/stripe/stripe-node | [OK] | Approved |
| `@stripe/stripe-js` | npm | ~6.5 yrs (first published 2020-01-10) | 8.75M/week | github.com/stripe/stripe-js | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Both packages also have no `postinstall` script (`npm view <pkg> scripts.postinstall` returned empty for both), so there is no supply-chain script-execution risk at install time.

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │         Vercel (Next.js runtime)          │
                    │                                           │
   Browser  ───────►│  middleware.ts                            │
                     │   ├─ isPublicRoute(/api/webhooks/*)  ────┼──► (bypasses auth, Phase 2 handles)
                     │   └─ isProtectedRoute(/dashboard/*)      │
                     │        └─ auth.protect() [Clerk]         │
                     │                                           │
                     │  process.env.STRIPE_SECRET_KEY            │
                     │  process.env.STRIPE_WEBHOOK_SECRET         │
                     │  process.env.STRIPE_PRO_PRICE_ID           │
                     │  process.env.STRIPE_TOPUP_PRICE_ID         │
                     │  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
                     │        (inlined into client bundle)        │
                     └───────────────────┬───────────────────────┘
                                          │ NEXT_PUBLIC_CONVEX_URL
                                          ▼
                    ┌─────────────────────────────────────────┐
                    │              Convex deployment             │
                    │                                           │
                    │  schema.ts                                │
                    │   ├─ subscriptions      (by_clerkUserId)   │
                    │   ├─ aiCredits          (by_clerkUserId)   │
                    │   ├─ creditTransactions (by_clerkUserId)   │
                    │   └─ processedStripeEvents (by_stripeEventId)
                    │                                           │
                    │  subscriptions.ts (stub)                  │
                    │   ├─ getSubscription       (query)         │
                    │   ├─ upsertSubscription    (internalMutation)
                    │   └─ deleteSubscription    (internalMutation)
                    │                                           │
                    │  aiCredits.ts (stub)                      │
                    │   ├─ getCredits    (query)                 │
                    │   ├─ deductCredit  (internalMutation)      │
                    │   ├─ resetCredits  (internalMutation)      │
                    │   └─ addCredits    (internalMutation)      │
                    └─────────────────────────────────────────┘
```

Phase 1 delivers the right-hand column (schema + stubs) and the left-hand middleware patch + env vars. No wiring between them happens yet — internalMutations are not called by anything until Phase 2's webhook handler exists. This is intentional (D-07): the phase's job is that everything *compiles and deploys*, not that it does anything.

### Recommended Project Structure
```
convex/
├── schema.ts              # extend existing defineSchema — add 4 tables (no new file)
├── subscriptions.ts        # NEW — stub query/internalMutations for subscription state
├── aiCredits.ts             # NEW — stub query/internalMutations for credit state
├── notes.ts                 # existing — pattern reference only, untouched
└── users.ts                 # existing — pattern reference only, untouched

middleware.ts                # PATCHED — add isPublicRoute for /api/webhooks/**
.env.example                 # NEW — repo root, documents all 5 required vars
.gitignore                   # PATCHED — add `!.env.example` negation above `.env*`
```

### Pattern 1: Convex table + index definition (extend existing schema)
**What:** Add tables to the single `defineSchema({...})` call in `convex/schema.ts` using `defineTable` + `v` validators, chaining `.index(...)`.
**When to use:** Every new Convex table in this codebase — this is the only pattern already in use (`users`, `notes`).
**Example:**
```typescript
// Source: convex/schema.ts (existing file, extend in place) + https://docs.convex.dev/database/schemas
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ...existing users, roles, notes tables unchanged...

  subscriptions: defineTable({
    clerkUserId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean()
  }).index("by_clerkUserId", ["clerkUserId"]),

  aiCredits: defineTable({
    clerkUserId: v.string(),
    balance: v.number(),
    lastResetAt: v.number()
  }).index("by_clerkUserId", ["clerkUserId"]),

  creditTransactions: defineTable({
    clerkUserId: v.string(),
    type: v.union(
      v.literal("deduction"),
      v.literal("topup"),
      v.literal("reset")
    ),
    amount: v.number(),
    createdAt: v.number(),
    stripePaymentIntentId: v.optional(v.string())
  }).index("by_clerkUserId", ["clerkUserId"]),

  processedStripeEvents: defineTable({
    stripeEventId: v.string(),
    processedAt: v.number(),
    eventType: v.string()
  }).index("by_stripeEventId", ["stripeEventId"])
});
```
Note: `currentPeriodEnd`, `lastResetAt`, `createdAt`, `processedAt` are typed `v.number()` (Unix ms timestamp), matching Convex idiom (`_creationTime` is a number) — this differs from the existing `notes`/`users` tables' `v.optional(v.string())` ISO-string timestamps. This is a deliberate improvement, not a copy of the older pattern; flag for planner/user confirmation since it's a stylistic choice not explicitly locked in CONTEXT.md.

### Pattern 2: Stub query/internalMutation with typed-but-unimplemented body (D-07)
**What:** Export the real function signature (args + implicit return) but `throw` in the handler body.
**When to use:** Exactly the 7 functions named in D-08/D-09.
**Example:**
```typescript
// Source: pattern derived from convex/notes.ts (existing mutation shape) + https://docs.convex.dev/functions/internal-functions
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  }
});

export const upsertSubscription = internalMutation({
  args: {
    clerkUserId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due")
    ),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean()
  },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  }
});

export const deleteSubscription = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  }
});
```
`internalMutation` (not `mutation`) is required for `upsertSubscription`/`deleteSubscription`/`deductCredit`/`resetCredits`/`addCredits` per D-08/D-09 — these must only be callable from other Convex functions (the Phase 2 webhook handler calling in via `ctx.runMutation(internal.subscriptions.upsertSubscription, ...)`), never directly from a client. Convex enforces this at the framework level: "Internal functions can only be called by other functions and cannot be called directly from a Convex client" [CITED: docs.convex.dev/functions/internal-functions].

Because `tsconfig.json` has `"strict": true`, the unused `ctx`/`args` parameters in stub handlers will NOT raise TS errors under default `strict` settings (unused-parameter checks require `noUnusedParameters`, which is not set) — but confirm this against the project's actual `eslint.config.mjs` rules, since ESLint's `no-unused-vars` is a separate, commonly-stricter check.

### Pattern 3: Clerk middleware route exclusion (D-06, as locked)
**What:** `createRouteMatcher` for both a protected-route matcher and a public-route matcher; check public first.
**Example:** (verbatim from CONTEXT.md D-06, confirmed to match the currently-documented Clerk pattern for excluding webhook routes)
```typescript
// Source: https://clerk.com/docs/reference/nextjs/clerk-middleware (pattern confirmed via WebSearch, official docs)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && isProtectedRoute(req)) {
    await auth.protect();
  }
});
```
See **Common Pitfalls → Pitfall 1** below: this pattern is currently sound, but only on a patched `@clerk/nextjs` version.

### Anti-Patterns to Avoid
- **Manually parsing/verifying Stripe webhook signatures with Node `crypto` instead of `stripe.webhooks.constructEvent()`:** not relevant to Phase 1 directly (Phase 2 territory) but worth noting now since the `stripe` package installed in this phase exists specifically to avoid this hand-rolled HMAC comparison.
- **Adding a second, separate Convex deployment env-var set for "staging" without confirming that deployment exists:** see Open Questions — don't assume `npx convex env set --prod` covers "staging" without verifying the actual Convex project topology first.
- **Committing `.env.example` without first fixing `.gitignore`:** see Common Pitfalls → Pitfall 2.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotent webhook event processing (guard against Stripe's at-least-once delivery/retries) | Custom distributed lock or Redis SETNX-style dedup | Convex's built-in serializable mutation semantics (Optimistic Concurrency Control) — a plain "query `by_stripeEventId`, insert if not found" inside a single `internalMutation` | Convex mutations are fully serializable; concurrent conflicting mutations are automatically retried by the platform rather than racing. "A 'query-then-insert-if-not-found' pattern within a single mutation is safe from race conditions" [CITED: docs.convex.dev/database/advanced/occ]. No manual locking needed — this directly informs the `processedStripeEvents` table design already locked in D-01–D-09 |
| Atomic credit deduction (TOCTOU-safe, per PROJECT.md constraint) | Manual read-modify-write with application-level locks/semaphores, or a Postgres `SELECT ... FOR UPDATE` equivalent | A single Convex `internalMutation` that reads current `balance` and `ctx.db.patch()`s it in the same handler | Same OCC guarantee as above — this is why `deductCredit` (Phase 5) can be "atomic" simply by being one mutation, no extra primitives required. Phase 1 only needs to shape the stub signature correctly for this to hold later |
| Stripe webhook signature verification | Custom HMAC-SHA256 comparison against raw body | `stripe.webhooks.constructEvent(rawBody, signature, secret)` (Phase 2, but the `stripe` package installed in Phase 1 exists for this) | Stripe's SDK handles timestamp tolerance, multi-secret rotation support, and constant-time comparison correctly; hand-rolled comparisons are a common source of timing-attack bugs |

**Key insight:** The single most consequential "don't hand-roll" decision in this whole milestone is architectural, not library-level: Convex's transactional mutation model removes the need for any manual concurrency-control code anywhere in this feature (idempotency, credit deduction, subscription upserts). Phase 1's job is simply to shape the schema/stub signatures so later phases can rely on this for free.

## Common Pitfalls

### Pitfall 1: Clerk middleware route-protection bypass CVE on the currently-installed version
**What goes wrong:** `createRouteMatcher`-based route gating in `@clerk/nextjs`, `@clerk/nuxt`, and `@clerk/astro` has a disclosed, critical (CVSS 3.1 base score 9.1) bypass — crafted requests can skip the middleware's `auth.protect()` gating entirely and reach downstream handlers unauthenticated (CVE-2026-41248 / GHSA-vqx2-fgx2-5wq9, disclosed 2026-04-15) [VERIFIED: WebSearch cross-referenced against GitHub Security Advisory + ZeroPath/Spectrosec vulnerability write-ups].
**Why it happens:** A flaw in how `createRouteMatcher` matches certain crafted paths against the configured route patterns, independent of any application code — it affects the library itself.
**How to avoid:** The installed version is `@clerk/nextjs@6.12.4` [VERIFIED: `npm ls @clerk/nextjs`]. Fixed versions are `5.7.6`, `6.39.2`, and `7.2.1` [VERIFIED: npm registry — both `6.39.2` and `7.2.1` confirmed to exist and are non-canary releases]. **Bump to `@clerk/nextjs@^6.39.2` (same major version, non-breaking) as part of this phase's middleware task**, since this phase is already the one touching `middleware.ts` and this is the lowest-risk moment to apply the fix. Do not jump to the `7.x` major line unless the user explicitly wants to take on that migration — it is out of scope for this phase. Session compromise is NOT part of this CVE's impact (no existing user can be impersonated), but the `/dashboard` gating itself can be bypassed, which is exactly the mechanism D-06 relies on.
**Warning signs:** `npm ls @clerk/nextjs` showing anything below `6.39.2` in the `6.x` line, or below `7.2.1` in the `7.x` line, or below `5.7.6` in the `5.x` line.

### Pitfall 2: `.gitignore`'s blanket `.env*` rule will silently swallow `.env.example`
**What goes wrong:** D-04 requires creating `.env.example` at the repo root and committing it. The repo's `.gitignore` (line 34: `.env*`) matches `.env.example` too — `git add .env.example` will appear to succeed with no error, but the file will not actually be tracked (or `git status` will show it as ignored, easy to miss).
**Why it happens:** The existing `.gitignore` comment even says "env files (can opt-in for committing if needed)" — this is a known-intentional broad rule that wasn't previously negated because no example file existed yet.
**How to avoid:** Add `!.env.example` on its own line immediately after the `.env*` rule in `.gitignore`, before creating/committing `.env.example`. Verify with `git check-ignore -v .env.example` (should output nothing / exit 1 after the fix) or `git status --short` (file should show as untracked `??`, not be absent entirely).
**Warning signs:** `.env.example` doesn't show up in `git status` after `git add .env.example`, or the commit that's supposed to add it has zero file changes.

### Pitfall 3: Convex environment variables are NOT the same store as Vercel/Next.js environment variables
**What goes wrong:** Running `npx convex env set STRIPE_SECRET_KEY ...` only makes the variable visible to Convex functions (`process.env` inside `convex/*.ts` files) — it does nothing for `process.env.STRIPE_SECRET_KEY` inside Next.js API routes, and vice versa for variables set in the Vercel dashboard.
**Why it happens:** Convex and Vercel are two independent deployment platforms, each with its own env var store, even though `NEXT_PUBLIC_CONVEX_URL` connects them at the network level.
**How to avoid:** Per the Architectural Responsibility Map above, all 5 required Phase 1 env vars are consumed exclusively by Next.js/Vercel-side code (webhook handler + future checkout code are both Next.js per PROJECT.md's constraint) — **none of them need to be set via `npx convex env set`** for Phase 1's success criteria to pass. Set all 5 in Vercel project settings (scoped per environment — see Pitfall 4) and in `.env.local` for local dev. Flag explicitly in the plan so this isn't assumed to also need a Convex-side mirror.
**Warning signs:** `convex dev` compiling fine (it doesn't reference these vars at all in Phase 1's stub files) gives false confidence that env vars are "done" — the actual check is whether the Next.js process (`next dev`, and each Vercel environment) has them.

### Pitfall 4: "Staging" may not map to a stable, persistent Convex deployment
**What goes wrong:** D-04/D-05 assume 3 distinct, stable environments (local / staging / production), each with its own `STRIPE_WEBHOOK_SECRET`. This maps cleanly onto Vercel (Development / Preview-scoped-to-`dev`-branch / Production). It does NOT map cleanly onto Convex's actual deployment model unless the team has manually created a dedicated, persistent third Convex deployment for staging.
**Why it happens:** Convex's documented model is two persistent deployments (per-developer `dev` + shared `production`) plus optional **ephemeral** Preview Deployments that are auto-created per Git branch/PR and auto-deleted after 5 days [CITED: docs.convex.dev/production/hosting/preview-deployments]. An ephemeral deployment cannot hold a stable "staging secret" the way D-04 describes.
**How to avoid:** This doesn't block Phase 1's 5 stated success criteria (which are all about Next.js/Vercel env vars, per Pitfall 3 — Convex doesn't need the Stripe vars at all in Phase 1). But it DOES affect whether "staging" env vars belong in Vercel's Preview environment (scoped to the `dev` branch) alone, or also require Convex-side setup for a phase-2-or-later need. Flagged as an Open Question below — confirm actual Convex project structure (`npx convex env list` scoped to each deployment, or Convex dashboard → Deployment Settings) before finalizing the env var plan, rather than assuming.
**Warning signs:** Confusion later in Phase 2/3 about which Convex deployment a "staging" webhook test actually hit.

## Code Examples

### `.env.example` (D-04)
```bash
# Source: pattern synthesized from Vercel docs (docs.convex.dev/production/environment-variables, vercel.com/docs/environment-variables) + D-05 requirements
# ── Stripe: secret, server-only (Next.js API routes) ─────────────────────────
# One value per environment. Get from Stripe Dashboard → Developers → API keys (test mode).
STRIPE_SECRET_KEY=sk_test_xxx

# ── Stripe: webhook signing secret — DISTINCT VALUE PER ENVIRONMENT ──────────
# Local:      `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints this.
# Staging:    Stripe Dashboard → Webhooks → [staging endpoint] → Signing secret.
# Production: Stripe Dashboard → Webhooks → [production endpoint] → Signing secret.
STRIPE_WEBHOOK_SECRET=whsec_xxx

# ── Stripe: Price IDs — created once in test mode, can be shared across envs ─
STRIPE_PRO_PRICE_ID=price_xxx
STRIPE_TOPUP_PRICE_ID=price_xxx

# ── Stripe: publishable key — SAFE to expose in client bundle ────────────────
# Must keep the NEXT_PUBLIC_ prefix (Next.js inlines this at build time).
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

### Middleware patch (D-06)
```typescript
// Source: middleware.ts (existing file — patch in place)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // unchanged — existing matcher already covers /api routes broadly
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `@clerk/nextjs@6.12.4` `createRouteMatcher` gating (currently installed) | Same API, but patched build (`>=6.39.2`) | Fix disclosed 2026-04-15 | Installed version is vulnerable to a critical middleware-bypass CVE; must upgrade, not just re-verify the pattern |
| Manual `isPublicRoute`/`isProtectedRoute` middleware gating as the sole access control | Clerk's current official guidance leans toward resource-level `auth()` checks as defense-in-depth, citing `createRouteMatcher()` middleware gating alone as insufficient | Ongoing guidance shift, reinforced by the above CVE | Not a Phase 1 blocker (D-06 is locked and the webhook-exclusion use case is unaffected — excluding a route from auth is different from relying on inclusion for security), but worth flagging to the user for `/dashboard` protection specifically, which does rely on inclusion |

**Deprecated/outdated:** Nothing in the Convex or Stripe SDK space is deprecated as it pertains to this phase's scope.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `currentPeriodEnd`/`lastResetAt`/`createdAt`/`processedAt` should be `v.number()` (epoch ms) rather than `v.string()` (ISO, matching existing `notes`/`users` convention) | Architecture Patterns → Pattern 1 | Low — purely a type/format choice; if the team prefers ISO strings for consistency with existing tables, this is a one-line change per field, no structural rework. Flag for planner/user confirmation since CONTEXT.md doesn't specify the exact Convex type |
| A2 | Convex-side env vars (`npx convex env set`) are NOT needed for any of the 5 required Phase 1 secrets, because both the webhook handler and checkout flow live in Next.js per PROJECT.md's constraint | Common Pitfalls → Pitfall 3 | Medium — if a later phase decides to move any Stripe-calling code into a Convex action, this assumption breaks and a Convex-side env var set becomes newly required. Does not affect Phase 1's own success criteria, which only reference "local, staging, and production environments" without specifying which platform |
| A3 | "Staging" (per PROJECT.md: "staging depuis dev [branch]") maps to a Vercel Preview environment scoped to the `dev` branch, not to a Convex Preview Deployment | Common Pitfalls → Pitfall 4 | Medium — if the team's actual Convex project has a 3rd persistent "staging" deployment (not discoverable from the repo alone), the env var setup steps in the plan may need an extra Convex-side task |
| A4 | Unused stub-handler parameters (`ctx`, `args` in `throw`-only bodies) won't fail the project's lint/typecheck gates | Architecture Patterns → Pattern 2 | Low — easily fixed by prefixing with `_` or referencing them in a comment if ESLint's `no-unused-vars` is stricter than assumed; doesn't block `convex dev` compilation (the actual Phase 1 success criterion), only `npm run lint` |

## Open Questions

1. **Does the project have a stable, persistent 3rd Convex deployment for "staging", or does "staging" only exist at the Vercel level?**
   - What we know: `.env.local` shows `CONVEX_DEPLOYMENT=dev:frugal-echidna-922` for local dev. PROJECT.md says production deploys "depuis tags git" and staging "depuis dev" branch — describing Vercel's branch-to-environment mapping, not Convex's.
   - What's unclear: Whether a second/third Convex deployment (beyond the local `dev:` one visible in the repo) already exists and is wired to Vercel's Preview/Production environments via `CONVEX_DEPLOY_KEY`, per the standard Convex+Vercel integration pattern.
   - Recommendation: Since none of Phase 1's 5 required env vars need to live in Convex's env store (Pitfall 3), this doesn't block the plan — but the planner should have a task/checkpoint to confirm actual Convex deployment topology (via Convex dashboard or `npx convex env list` per deployment) before Phase 2, where webhook-writing internalMutations will need this clarified for testing across environments.

2. **Should `@clerk/nextjs` be bumped to `7.x` (latest, `7.5.13`) instead of the minimal `6.39.2` patch?**
   - What we know: `6.39.2` fixes the CVE with no major-version migration required. `7.x` is a new major line (first `7.x` release exists per registry) that likely carries breaking changes not investigated here (out of scope for this research pass).
   - What's unclear: Whether the team wants to stay current long-term vs. take the minimal, safest fix now.
   - Recommendation: Default to `^6.39.2` for this phase (lowest risk, unblocks the CVE, no migration work). Note the `7.x` option for the user/planner to explicitly opt into as a separate, later decision if desired — do not bundle a major upgrade into an infrastructure-foundation phase whose stated goal is stability.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | `stripe` package (`>=18` engine requirement) | ✓ | v26.4.0 | — |
| npm | package install | ✓ | (bundled with Node) | — |
| Convex CLI (`npx convex`) | schema deploy, stub compile | ✓ | via `convex@1.19.5` in package.json | — |
| Stripe CLI (`stripe`) | D-03 local webhook secret capture (`stripe listen`), Stripe Dashboard test-mode product creation | Not verified in this session — required for D-03's local webhook secret and is typically a separate binary install, not an npm package | — | If absent locally, the Stripe Dashboard UI can be used instead of the CLI for creating products/prices (D-03) and for retrieving the local webhook secret via a manually-configured test webhook endpoint, though `stripe listen` is the standard/expected local workflow |
| Vercel CLI / Vercel dashboard access | Setting staging/production env vars (D-05) | Not verified in this session — requires Vercel account access, not a local tool check | — | Env vars can be set via Vercel web dashboard UI without the CLI |
| Stripe Dashboard access (test mode) | D-03 (creating Pro/Top-up products, capturing real Price IDs) | Not verified in this session — requires Stripe account access | — | None — this is a hard requirement, no code-only fallback exists for obtaining real `price_xxx` IDs |

**Missing dependencies with no fallback:**
- Stripe Dashboard test-mode access to create the 2 products and capture real Price IDs (D-03) — this is inherently a manual, human-in-the-loop step; the plan should include a `checkpoint:human-verify` or equivalent for this sub-task.

**Missing dependencies with fallback:**
- Stripe CLI — Dashboard UI can substitute if the CLI binary isn't installed, though with more manual steps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 + `@testing-library/react` 16.2.0 (unit/component); Cypress 13.17.0 (e2e, separate CI workflow) |
| Config file | No standalone `jest.config.*` found at repo root in this pass — verify presence during planning; `cypress.config.ts` exists |
| Quick run command | `npm run test-cypress` runs the Cypress suite; no dedicated `jest` script currently in `package.json` — the `test` script actually runs Prettier + ESLint, not Jest, despite Jest being a devDependency |
| Full suite command | `npm run cy:run` (Cypress headless) |

Given this project's `test` npm script does NOT invoke Jest despite Jest being installed [VERIFIED: package.json `scripts.test` = `"prettier --write . && eslint app/ --fix"`], and no Jest config file was found at the repo root in this research pass, this is a pre-existing infrastructure gap unrelated to Phase 1's scope — flagged here for planner awareness, not as a Phase 1 task.

### Phase Requirements → Test Map

Phase 1 owns no formal `REQ-ID`s (see Phase Requirements section below) — its 5 numbered Success Criteria (ROADMAP.md) are the testable units instead:

| Success Criterion | Behavior | Test Type | Automated Command | File Exists? |
|--------------------|----------|-----------|--------------------|--------------|
| SC-1 | `convex dev` compiles without errors after 4-table schema addition | smoke | `npx convex dev --once` (or `npx convex codegen && npx convex dev --once` — confirm exact one-shot compile flag at execution time) | ❌ Wave 0 — no automated schema-compile check currently exists in CI |
| SC-2 | All 5 required env vars present in local/staging/production, no `NEXT_PUBLIC_` prefix on secrets | manual-only | Local: `grep` of `.env.local` / `.env.example` keys against D-05 list. Staging/Production: Vercel dashboard inspection (no local automated check possible — external system state) | N/A — inherently manual, human-in-the-loop |
| SC-3 | `stripe` and `@stripe/stripe-js` installed and importable | smoke | `node -e "require('stripe')"` (CJS) or a minimal `import Stripe from 'stripe'` in a throwaway `.ts` file compiled via `tsc --noEmit`; for `@stripe/stripe-js`, `npx tsc --noEmit` over a file that imports `loadStripe` | ❌ Wave 0 — no existing test covers package importability directly (implicitly covered by `npm run build` succeeding once these packages are referenced somewhere, e.g. the stub files or a placeholder import) |
| SC-4 | Clerk middleware excludes `/api/webhooks/**` from auth | unit/manual | No existing test infra for middleware route matching in this repo. Manual verification: hit a stub `/api/webhooks/test` route unauthenticated (should not redirect to sign-in); hit `/dashboard` unauthenticated (should still redirect) | ❌ Wave 0 — no middleware test exists; Cypress could cover this but is currently scoped to app-level e2e flows only |
| SC-5 | Stub files for `subscriptions.ts`/`aiCredits.ts` compile and deploy cleanly | smoke | Covered by the same `npx convex dev --once` check as SC-1 | ❌ Wave 0 — same gap as SC-1 |

### Sampling Rate
- **Per task commit:** `npx convex dev --once` (or equivalent one-shot Convex compile check) + `npx tsc --noEmit` for the Next.js side
- **Per wave merge:** Full `npm run build` (exercises both Next.js typecheck/bundle and confirms Stripe packages resolve) + manual env var checklist against D-05
- **Phase gate:** All 5 success criteria manually confirmed true (this phase is infra/config-heavy — full automation of "are all envs set in Vercel dashboard" is not realistic; a checklist-style verification is appropriate)

### Wave 0 Gaps
- [ ] No automated check currently exists for "Convex schema compiles cleanly" as a repeatable CI step — recommend adding a `npx convex dev --once` (or `npx convex deploy --dry-run` if available in the installed CLI version) invocation, even if just documented as a manual pre-merge command for this phase, since building full CI wiring is arguably out of scope for an infrastructure-foundation phase
- [ ] No middleware-level test (unit or Cypress) exists to assert `/api/webhooks/**` bypasses auth while `/dashboard` still requires it — consider a minimal Cypress smoke test if the phase's `UI hint: no` designation still permits touching test infra
- [ ] Confirm whether a `jest.config.*` exists anywhere in the repo (not found in this pass) before assuming Jest is runnable at all

*(These are pre-existing infra gaps surfaced by this phase, not necessarily Phase 1 deliverables — planner should decide whether to address them in Wave 0 of this phase or defer.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes (indirectly) | Clerk (`@clerk/nextjs`) — already the project's chosen auth provider; Phase 1 only patches middleware routing around it |
| V3 Session Management | No | Unchanged by this phase — Clerk manages sessions; no session code touched |
| V4 Access Control | Yes | `createRouteMatcher`/`clerkMiddleware` gating of `/dashboard` vs. public `/api/webhooks/**` — see Pitfall 1 for the version-currency requirement on this control |
| V5 Input Validation | Yes | Convex `v.string()`/`v.union(v.literal(...))`/`v.number()` argument validators on every stub function (D-07 requires typed signatures) — Convex enforces these server-side automatically, no hand-rolled validation needed |
| V6 Cryptography | Deferred to Phase 2 | Stripe webhook signature verification (`stripe.webhooks.constructEvent`) — the `stripe` package installed in Phase 1 is the enabling dependency, but no cryptographic code is written until Phase 2 |
| V14 Configuration | Yes | Secret vs. public env var separation (D-05's explicit "no `NEXT_PUBLIC_` prefix on secrets" requirement) — this is the primary security-relevant surface of Phase 1 itself |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Middleware route-gating bypass (CVE-2026-41248) | Elevation of Privilege | Upgrade `@clerk/nextjs` to `>=6.39.2` (see Pitfall 1) — the mitigation IS the upgrade, no code-level workaround fully closes the gap on a vulnerable SDK version |
| Secret leakage via accidental `NEXT_PUBLIC_` prefix | Information Disclosure | Explicit D-05 requirement + `.env.example` documentation (D-04) distinguishing secret vs. public vars; code review / checklist verification, since Next.js provides no runtime guard against this mistake — it's a naming-convention-only protection |
| Committing real secrets to git history via `.env.example` mistakes | Information Disclosure | Fixed `.gitignore` (Pitfall 2) ensures `.env.example` (placeholder values only, e.g. `sk_test_xxx`) is trackable while `.env`/`.env.local` (real values) remain ignored — verify `.env.example` never contains a real key before committing |
| Unauthenticated access to future `/api/webhooks/**` routes being mistaken for "no auth needed at all" | Spoofing | Out of Phase 1 scope (Phase 2 territory) — flagged here only as a forward pointer: excluding a route from Clerk auth is correct (Stripe can't present a Clerk session) but that route MUST verify the Stripe signature instead, which Phase 2's `stripe.webhooks.constructEvent()` usage provides |

## Sources

### Primary (HIGH confidence)
- npm registry (`npm view stripe`, `npm view @stripe/stripe-js`, `npm view @clerk/nextjs`, `npm view convex`) — versions, publish dates, download counts, engine requirements, repository URLs, all checked 2026-07-07
- `slopcheck install stripe @stripe/stripe-js` — both packages returned `[OK]`
- Existing codebase: `convex/schema.ts`, `convex/notes.ts`, `convex/users.ts`, `convex/auth.config.ts`, `middleware.ts`, `package.json`, `tsconfig.json`, `convex/tsconfig.json`, `.gitignore`, `.env`, `.env.local`, `.github/workflows/*.yml` — read directly

### Secondary (MEDIUM confidence)
- [Convex Schemas docs](https://docs.convex.dev/database/schemas) — `defineSchema`/`defineTable`/index syntax (WebFetch summary; small-model summarization noted as not covering `internalMutation` distinctions, cross-verified against a second fetch)
- [Convex Internal Functions docs](https://docs.convex.dev/functions/internal-functions) — `internalMutation` vs `mutation`/`query` distinction
- [Convex OCC/transactions docs](https://docs.convex.dev/database/advanced/occ) — serializability guarantee underlying the "Don't Hand-Roll" idempotency/atomicity claims
- [Convex Preview Deployments docs](https://docs.convex.dev/production/hosting/preview-deployments) — informs Pitfall 4 / Open Question 1
- [Convex Environment Variables docs](https://docs.convex.dev/production/environment-variables) — CLI vs dashboard, per-deployment scoping
- [Vercel Environment Variables docs](https://vercel.com/docs/environment-variables) — Development/Preview/Production scoping, `.env.local` for local dev
- [Clerk `clerkMiddleware()` reference](https://clerk.com/docs/reference/nextjs/clerk-middleware) — confirms current `createRouteMatcher` exclusion pattern, and separately surfaces the "createRouteMatcher deprecated, prefer resource-level checks" guidance discussed in Open Question / State of the Art
- Stripe webhook signature verification pattern (`docs.stripe.com/webhooks/quickstart`) — Phase 2-relevant, included for forward context on why the `stripe` package is being installed now

### Tertiary (LOW confidence, cross-verified where possible)
- CVE-2026-41248 / GHSA-vqx2-fgx2-5wq9 details (CVSS score, affected/fixed versions, disclosure date) — sourced via WebSearch from ZeroPath, Vulnerability-Lookup (CIRCL), Spectrosec, and AppSecure write-ups (not the primary GitHub Security Advisory page directly, which returned only navigation chrome via WebFetch). Cross-referenced across 4 independent secondary sources reporting consistent version numbers (`6.39.2`, `7.2.1`, `5.7.6` as fixed versions), and the specific patched versions were independently confirmed to exist on the npm registry — raised to MEDIUM confidence for the version numbers themselves, but the CVSS score and exact disclosure date remain LOW/unverified against the primary GHSA source.

## Metadata

**Confidence breakdown:**
- Standard stack (Stripe packages): HIGH — versions and legitimacy directly verified via npm registry + slopcheck
- Convex schema/stub architecture: HIGH — directly follows existing codebase patterns, cross-verified against official Convex docs
- Environment variable topology (Vercel vs. Convex, staging mapping): MEDIUM — inferred from docs + codebase conventions, not directly observable (no access to live Vercel/Convex dashboards in this session); flagged as Open Questions
- Clerk CVE finding: MEDIUM — version numbers cross-verified against npm registry directly; CVSS score/disclosure date sourced from secondary security-blog aggregators, not the primary GHSA page
- Security domain: MEDIUM — ASVS mapping is standard reasoning (HIGH), CVE-specific threat pattern is MEDIUM per above

**Research date:** 2026-07-07
**Valid until:** 2026-07-21 (14 days — shorter than the default 30 because the Clerk CVE finding is time-sensitive; re-verify `@clerk/nextjs` patched-version numbers if this research is consumed after that date, in case of further point releases)
