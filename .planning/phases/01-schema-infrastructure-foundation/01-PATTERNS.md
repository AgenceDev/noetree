# Phase 1: Schema + Infrastructure Foundation - Pattern Map

**Mapped:** 2026-07-07
**Files analyzed:** 7 (2 new, 5 modified)
**Analogs found:** 7 / 7 (5 are "extend in place" self-analogs; 2 new files have strong cross-codebase analogs)

## File Classification

| New/Modified File               | Role                                   | Data Flow                | Closest Analog                                                                            | Match Quality                        |
| ------------------------------- | -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| `convex/schema.ts` (MODIFY)     | model/config                           | CRUD (table definitions) | `convex/schema.ts` (itself, existing `users`/`roles`/`notes` tables)                      | exact — extend in place              |
| `convex/subscriptions.ts` (NEW) | service (Convex query/mutation module) | CRUD                     | `convex/notes.ts` (query/mutation shape) + `convex/users.ts` (`withIndex` lookup pattern) | role-match, composite                |
| `convex/aiCredits.ts` (NEW)     | service (Convex query/mutation module) | CRUD                     | `convex/notes.ts` (query/mutation shape) + `convex/users.ts` (`withIndex` lookup pattern) | role-match, composite                |
| `middleware.ts` (MODIFY)        | middleware                             | request-response         | `middleware.ts` (itself, existing `clerkMiddleware` + `createRouteMatcher`)               | exact — extend in place              |
| `.env.example` (NEW)            | config                                 | n/a                      | none in repo (`.env.local` shows key-only convention, no inline comments)                 | no analog — use RESEARCH.md template |
| `.gitignore` (MODIFY)           | config                                 | n/a                      | `.gitignore` (itself, existing `.env*` block at line 34)                                  | exact — patch in place               |
| `package.json` (MODIFY)         | config                                 | n/a                      | `package.json` (itself, existing `dependencies` block)                                    | exact — patch in place               |

## Pattern Assignments

### `convex/schema.ts` (model/config, CRUD)

**Analog:** `convex/schema.ts` itself (existing file, extend in place — do not create a new file)

**Full current content** (`convex/schema.ts` lines 1-32):

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    picture: v.optional(v.string()),
    nickname: v.optional(v.string()),
    given_name: v.optional(v.string()),
    updated_at: v.optional(v.string()),
    family_name: v.optional(v.string()),
    phone_number: v.optional(v.string()),
    email_verified: v.optional(v.boolean()),
    phone_number_verified: v.optional(v.boolean()),
    role: v.id("roles"),
  }).index("by_token", ["tokenIdentifier"]),

  roles: defineTable({
    role: v.string(),
  }),

  notes: defineTable({
    owner: v.id("users"),
    created_at: v.optional(v.string()),
    updated_at: v.optional(v.string()),
    content: v.any(),
    childNotes: v.optional(v.array(v.id("notes"))),
    parentNote: v.optional(v.id("notes")),
  }),
});
```

**Conventions to preserve when adding the 4 new tables:**

- Single `defineSchema({...})` call — append new `defineTable(...)` entries as additional keys in the same object literal, do not split into multiple files.
- Index naming: `by_token` on `users` is the only existing precedent — follow the same `by_<fieldName>` convention (camelCase field name after `by_`) for `by_clerkUserId` and `by_stripeEventId`, exactly as locked in CONTEXT.md D-02.
- `defineTable({...}).index("name", ["field"])` — index chained directly off `defineTable`, matching the `users` table's `by_token` example (lines 5-18).
- Field naming is camelCase throughout (`tokenIdentifier`, `childNotes`, `parentNote`) — matches D-09/CONTEXT.md's required camelCase for `clerkUserId`, `stripeCustomerId`, etc.

**Discrepancy to flag for planner:** existing `notes`/`users` timestamp fields (`created_at`, `updated_at`) are `v.optional(v.string())` ISO strings (snake_case field names, oddly, unlike the rest of the camelCase convention). RESEARCH.md Pattern 1 recommends `v.number()` (epoch ms) for the 4 new tables' timestamp fields (`currentPeriodEnd`, `lastResetAt`, `createdAt`, `processedAt`) as a deliberate, flagged improvement — not a copy of the older `_string` pattern. This is RESEARCH.md Assumption A1; planner should confirm this choice explicitly rather than silently matching the older tables' string convention.

**Table definitions to add** (verbatim from RESEARCH.md Pattern 1 / CONTEXT.md `<code_context>`):

```typescript
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
```

Note: `v.union(v.literal(...), ...)` for the `status`/`type` enum fields has **no precedent** in the existing schema (`users`/`roles`/`notes` use only scalar/optional/array/id validators) — this is a new-but-standard Convex pattern, sourced from Convex docs (RESEARCH.md), not the existing codebase.

---

### `convex/subscriptions.ts` (service, CRUD) and `convex/aiCredits.ts` (service, CRUD)

**Analog 1 (query/mutation shape):** `convex/notes.ts`
**Analog 2 (indexed lookup pattern):** `convex/users.ts`

**Imports pattern** — `convex/notes.ts` lines 1-3:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";
import { mutation } from "./_generated/server";
```

For the new stub files, import `query` and `internalMutation` instead of `mutation` (per D-07/D-08/D-09, all writes are `internalMutation`, not public `mutation`):

```typescript
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
```

Confirmed available in generated server types: `convex/_generated/server.d.ts` line 42 (`internalQuery`) and line 62 (`internalMutation`) — both exported, no codegen changes needed.

**Core query pattern** — `convex/notes.ts` lines 5-13 (`getNoteById`):

```typescript
export const getNoteById = query({
  args: { id: v.id("notes") },
  handler: async (ctx, args) => {
    const note = await ctx.db
      .query("notes")
      .filter(q => q.eq(q.field("_id"), args.id));
    return note;
  },
});
```

Note: this uses `.filter()` on a non-indexed field, which is what the codebase currently does even where an index would help. **Do not copy `.filter()`** for the new `by_clerkUserId` lookups — instead follow the indexed-query pattern below (which is the correct, index-backed approach D-02 requires).

**Indexed lookup pattern (preferred for `getSubscription`/`getCredits`)** — `convex/users.ts` lines 17-22:

```typescript
const user = await ctx.db
  .query("users")
  .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
  .unique();
```

Translate directly for the new stubs' eventual (Phase 2) implementation shape — e.g. `ctx.db.query("subscriptions").withIndex("by_clerkUserId", q => q.eq("clerkUserId", args.clerkUserId)).unique()`. For Phase 1, the stub `handler` bodies just `throw`, but the `args: { clerkUserId: v.string() }` signature should be written with this eventual `withIndex` call in mind (i.e., don't shape args around `.filter()`).

**Core mutation pattern (write shape)** — `convex/notes.ts` lines 26-44 (`createNote`):

```typescript
export const createNote = mutation({
  args: {
    owner: v.id("users"),
    content: v.any(),
    parentNote: v.optional(v.id("notes")),
    childNotes: v.optional(v.array(v.id("notes"))),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.insert("notes", {
      owner: args.owner,
      content: args.content,
      parentNote: args.parentNote,
      childNotes: args.childNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return note;
  },
});
```

For the Phase 1 stubs, use `internalMutation` in place of `mutation`, and the args shape follows this same flat-object convention — but per D-07 the handler body is just a `throw`, not the real `ctx.db.insert`/`.patch()` logic shown here (that's Phase 2's job).

**No-op/error pattern (D-07 requirement) — no existing codebase precedent.** Source this verbatim from RESEARCH.md Pattern 2 (Convex docs-derived, not from the existing codebase since no stub-style functions exist yet):

```typescript
import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getSubscription = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const upsertSubscription = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const deleteSubscription = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});
```

**`convex/aiCredits.ts` stub set** (D-09 — same shape, different args, no existing analog beyond the above patterns):

```typescript
export const getCredits = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const deductCredit = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const resetCredits = internalMutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});

export const addCredits = internalMutation({
  args: { clerkUserId: v.string(), amount: v.number() },
  handler: async (ctx, args) => {
    throw new Error("Not implemented — Phase 2");
  },
});
```

(Exact `args` shape for `deductCredit`/`addCredits` beyond `clerkUserId` is Claude's discretion per RESEARCH.md — D-09 names the functions but not their full arg lists; `amount: v.number()` is a reasonable inference consistent with `creditTransactions.amount` in the schema.)

**Error handling pattern:** No try/catch exists anywhere in `convex/notes.ts` or `convex/users.ts` — errors are thrown directly and left to Convex's built-in error propagation (e.g. `convex/notes.ts` lines 118-124, `convex/users.ts` line 9). The D-07 stub pattern matches this exact convention — a bare `throw new Error(...)`, no wrapping needed.

**Validation pattern:** Convex `v.*` argument validators in the `args: {...}` block are the only validation mechanism used anywhere in this codebase (no separate schema library, no manual `if` checks for type validation) — consistent with RESEARCH.md's ASVS V5 note that Convex enforces these server-side automatically.

---

### `middleware.ts` (middleware, request-response)

**Analog:** `middleware.ts` itself (existing file, patch in place)

**Full current content** (`middleware.ts` lines 1-14):

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

**Target content** (D-06, additive patch — `config` block at lines 9-14 stays byte-for-byte unchanged, it already covers `/api` broadly):

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const isPublicRoute = createRouteMatcher(["/api/webhooks/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req) && isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

Only 2 lines change (add `isPublicRoute` const, wrap the `auth.protect()` condition) plus a brace-style reformat of the `if` body — the `export const config` block is untouched.

**Security note (RESEARCH.md Pitfall 1):** `package.json` currently pins `@clerk/nextjs@^6.12.4`, which is below the patched `6.39.2` fixing CVE-2026-41248 (critical middleware route-gating bypass). Since this phase already touches `middleware.ts`, RESEARCH.md recommends bumping to `^6.39.2` (same major, non-breaking) as part of this same task. Flag for human verification per RESEARCH.md guidance (security-sensitive dependency bump).

---

### `.env.example` (config, n/a) — NEW, no analog

No `.env.example` or documented-env-var file exists in the repo. `.env` and `.env.local` (both git-ignored, not readable analogs for structure since they contain only bare `KEY=` lines with real/blank values, no inline comments). Use the template synthesized in RESEARCH.md verbatim (Code Examples → `.env.example`):

```bash
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

**Prerequisite ordering:** `.gitignore` MUST be patched (see next section) before `.env.example` is created/committed, or the commit will silently contain zero file changes.

---

### `.gitignore` (config) — MODIFY, patch in place

**Analog:** `.gitignore` itself

**Current relevant block** (`.gitignore` lines 33-34):

```
# env files (can opt-in for committing if needed)
.env*
```

**Patch** — add a negation line immediately after line 34:

```
# env files (can opt-in for committing if needed)
.env*
!.env.example
```

**Verification command** (RESEARCH.md Pitfall 2): `git check-ignore -v .env.example` should exit 1 (no output) after this patch, confirming the file is no longer swallowed by the blanket `.env*` rule.

---

### `package.json` (config) — MODIFY, patch in place

**Analog:** `package.json` itself

**Current `dependencies` block** (`package.json` lines 18-19 show alphabetical ordering convention):

```json
  "dependencies": {
    "@clerk/nextjs": "^6.12.4",
    "@radix-ui/react-alert-dialog": "^1.1.6",
```

**Additions required:**

1. Bump `@clerk/nextjs` from `^6.12.4` to `^6.39.2` (security fix, RESEARCH.md Pitfall 1 — same line, version bump only, no key reorder needed).
2. Add `stripe` and `@stripe/stripe-js` as new dependency entries, inserted alphabetically per the existing convention (`stripe` after existing S-prefixed entries near `tailwind-merge`/`tailwindcss-animate` boundary — actual alphabetical slot is before `"tailwind-merge"`; `@stripe/stripe-js` slot is right after `@radix-ui/*` block, before `@tiptap/*`).

**Install command** (RESEARCH.md): `npm install stripe @stripe/stripe-js` — let npm handle the `package.json`/`package-lock.json` edit rather than hand-editing versions, then separately edit the `@clerk/nextjs` version string and run `npm install` again to apply the bump.

## Shared Patterns

### Convex validator style (`v.*` from `"convex/values"`)

**Source:** `convex/schema.ts` lines 1-2, all `args: {...}` blocks in `convex/notes.ts`
**Apply to:** `convex/schema.ts` (4 new tables), `convex/subscriptions.ts`, `convex/aiCredits.ts`

```typescript
import { v } from "convex/values";
// v.string(), v.number(), v.boolean(), v.optional(v.string()), v.id("tableName"),
// v.union(v.literal("a"), v.literal("b")) — union/literal is new-but-standard, no prior use in this repo
```

### Indexed-query lookup (`withIndex`, not `.filter()`)

**Source:** `convex/users.ts` lines 17-22 (`by_token` lookup)
**Apply to:** All `by_clerkUserId`/`by_stripeEventId` query stub shapes in `convex/subscriptions.ts` and `convex/aiCredits.ts` (shapes only in Phase 1; the actual `withIndex(...)` call body is Phase 2, since Phase 1 handlers just `throw`)

```typescript
await ctx.db
  .query("users")
  .withIndex("by_token", q => q.eq("tokenIdentifier", identity.tokenIdentifier))
  .unique();
```

### Bare-throw error convention (no try/catch wrapping)

**Source:** `convex/notes.ts` lines 118-124 (`moveNote`'s `throw new Error("Note not found")`), `convex/users.ts` line 9
**Apply to:** All 7 stub functions in `convex/subscriptions.ts`/`convex/aiCredits.ts` (D-07) — matches existing codebase convention exactly, no new pattern introduced for error handling.

```typescript
throw new Error("Not implemented — Phase 2");
```

### `internalMutation` for state-mutating functions not meant for direct client calls

**Source:** No existing codebase precedent (only `mutation`/`query` used so far in `convex/notes.ts`/`convex/users.ts`) — sourced from `convex/_generated/server.d.ts` line 62 (type already generated/available) and Convex docs via RESEARCH.md Pattern 2.
**Apply to:** `upsertSubscription`, `deleteSubscription`, `deductCredit`, `resetCredits`, `addCredits` (5 of the 7 new stub functions — the other 2, `getSubscription`/`getCredits`, are public `query`).

### Clerk route-matcher gating

**Source:** `middleware.ts` lines 1-7 (existing `isProtectedRoute` pattern)
**Apply to:** `middleware.ts` patch itself (D-06) — extends the exact same `createRouteMatcher` idiom already in use, just adds a second matcher checked first.

## No Analog Found

| File                                                                                                            | Role    | Data Flow | Reason                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------- | ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env.example`                                                                                                  | config  | n/a       | No env-documentation file exists anywhere in repo; `.env`/`.env.local` are git-ignored key-only files with no inline-comment convention to copy. Use RESEARCH.md's synthesized template verbatim.                                                                                                                                                                                 |
| `convex/subscriptions.ts` / `convex/aiCredits.ts` — the `internalMutation` D-07 "throw stub" idiom specifically | service | CRUD      | No prior stub-style (typed-but-unimplemented) Convex function exists in this codebase at all — every existing `query`/`mutation` has a real implementation. Composite-sourced from `notes.ts` (shape) + Convex docs (throw-stub idiom + `internalMutation` builder) as documented above; not a gap that blocks planning, just noted as a genuinely new pattern for this codebase. |

## Metadata

**Analog search scope:** `convex/*.ts` (schema.ts, notes.ts, users.ts, auth.config.ts), `middleware.ts`, `package.json`, `.gitignore`, `.env`/`.env.local` (structure only, not values), `convex/_generated/server.d.ts` (type availability check)
**Files scanned:** 9
**Pattern extraction date:** 2026-07-07
