# Phase 4: Plan Enforcement - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Enforce the Free tier's 20-note cap server-side in Convex — specifically in the `createNote` mutation — so a Free user cannot exceed 20 total notes regardless of client-side state, and Pro users (subscription `status === "active"`) can create unlimited notes. When a Free user's note-creation is rejected, the UI shows a dedicated upgrade modal linking to `/pricing` (built in Phase 3).

This phase delivers no other Pro-gated features — AI credits (Phase 5) and Settings (Phase 6) are out of scope. "Accessing Pro features" (PLAN-04) collapses to the note-limit case only, since no other Pro-only capability exists yet in the app at this point in the milestone.

</domain>

<decisions>
## Implementation Decisions

### Note-Count Scope

- **D-01:** The 20-note cap counts **every note document owned by the user, at any depth** — root notes plus all nested children, not just top-level trees. Enforced via a count query against the existing `by_owner` index (`convex/schema.ts` — `["owner", "parentNote"]`), scanning without a `parentNote` filter to get the user's total note count.

### Enforcement Surface

- **D-02:** The limit is enforced **only in `createNote`** (`convex/notes.ts`). `duplicateNote` is NOT gated in this phase — a Free user duplicating a note with children could exceed 20 as a known, accepted minor loophole. This matches the ROADMAP success criteria literally ("A Free tier user's 21st `createNote` mutation is rejected"). Do not add duplicate-note capping; it's explicitly deferred (see `<deferred>`).

### Free/Pro Determination

- **D-03:** A user counts as **Pro only when their `subscriptions` row has `status === "active"`**. Both `"past_due"` and `"canceled"` are treated as Free tier — no grace period. This matches the PROJECT.md constraint that Stripe is the source of authority and Convex mirrors it; no additional grace-period branch is introduced.
- **D-04:** A user with **no `subscriptions` row at all** (pre-existing user from before Stripe integration, or never subscribed) is treated as Free tier — same as ROADMAP SC3. This is the natural fallthrough of checking `status === "active"` against a `null` query result.
- **D-05:** `createNote` (a `mutation`) needs to resolve Free/Pro status itself. The existing `subscriptions.getSubscription` query already derives `clerkUserId` from `ctx.auth.getUserIdentity().subject` (not a client-supplied argument, per the Phase 3 IDOR fix in `03-REVIEW.md` CR-01) and queries `by_clerkUserId`. `createNote` should reuse the same identity-derived lookup pattern (shared helper or inline query against `subscriptions` `by_clerkUserId`), NOT re-implement its own resolution logic or accept a client-supplied plan/status argument.

### Upgrade Prompt UX

- **D-06:** When a Free user's `createNote` is rejected for hitting the limit, the UI shows a **dedicated upgrade modal/dialog** (not just an inline error message) with a clear "Upgrade to Pro" CTA linking to `/pricing`. Reuse the existing Shadcn `Dialog` primitive already used elsewhere in the app (e.g., the "New note" dialog in `app/[locale]/(app)/notes/page.tsx`) rather than introducing a new UI pattern.
- **D-07:** This modal must be reachable from **both note-creation call sites** that use `api.notes.createNote` via `useNoteMutations.ts`/direct `useConvexMutation`: the root-level "New note" dialog (`app/[locale]/(app)/notes/page.tsx`) and child-note creation inside the tree (`components/NotesTree.tsx`). Both currently only revert optimistic state `onError` with no user-facing message — this phase adds the upgrade-modal trigger to both error handlers, keyed off a distinguishable error (e.g., a specific error message/code from `createNote`, not a generic thrown `Error`).
- **D-08:** No toast library is introduced in this phase — the modal approach uses only existing Dialog primitives, no new dependency.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap

- `.planning/ROADMAP.md` §"Phase 4: Plan Enforcement" — 4 success criteria (21st createNote rejected for Free, Pro unlimited, no-subscription-row = Free, upgrade prompt on limit hit)
- `.planning/REQUIREMENTS.md` — PLAN-02 (Free tier blocked past 20 notes), PLAN-03 (Pro unlimited), PLAN-04 (upgrade prompt on limit/Pro-feature access) map to this phase
- `.planning/PROJECT.md` §Constraints — "Temps réel : Convex est le store de vérité pour le statut d'abonnement, Stripe est la source d'autorité" (locks D-03's active-only rule — no independent grace-period state); §Key Decisions confirms Stripe/Convex hybrid model

### Phase 1–3 Context (prerequisite decisions this phase builds on)

- `.planning/phases/01-schema-infrastructure-foundation/01-CONTEXT.md` — D-01/D-02 (`clerkUserId` as bare string on `subscriptions`, `by_clerkUserId` index); note on `tokenIdentifier` (Clerk JWT subject, `https://clerk.dev|user_xxx`) vs `clerkUserId` (bare `user_xxx`) — distinct formats, do not conflate
- `.planning/phases/03-checkout-flow-pricing-page/03-CONTEXT.md` — D-14 (pricing page reads subscription status the same way this phase's enforcement check will), confirms `/pricing` as the sole upgrade destination
- `convex/subscriptions.ts` inline comment (post `03-REVIEW.md` CR-01 fix) — `getSubscription` derives `clerkUserId` exclusively from `ctx.auth.getUserIdentity()`, never a client-supplied argument; this phase's enforcement check must follow the same identity-derivation pattern, not accept a client-passed plan/status

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/subscriptions.ts` `getSubscription` query — pattern to mirror (not directly call, since it's a `query` and `createNote` is a `mutation`) for resolving the caller's subscription row via `ctx.auth.getUserIdentity().subject` + `by_clerkUserId` index
- `convex/helpers/helper.ts` `getUser(ctx)` — existing helper resolving the Convex `users` row from `identity.tokenIdentifier`; `createNote` already calls this for ownership/access checks — a parallel helper (e.g. `getPlanStatus`/`isProUser`) resolving Free/Pro from `identity.subject` is the natural place to add the new check
- `components/ui/dialog.tsx` (Shadcn) — already used for the "New note" dialog (`app/[locale]/(app)/notes/page.tsx`); reuse for the new upgrade modal (D-06)
- `convex/schema.ts` `notes` table `by_owner` index (`["owner", "parentNote"]`) — usable for the total-note-count query (D-01), scanning by `owner` alone

### Established Patterns

- Bare-throw error convention: `convex/notes.ts` mutations throw plain `Error`s with no try/catch (e.g. `"User not found"`, `"Note not found"`) — the new limit-exceeded error should follow this same convention, with a distinguishable message/shape so client `onError` handlers (D-07) can tell it apart from other note errors
- `useNoteMutations.ts` and the root-page mutation both wire `onError` to only revert optimistic state today — no user-facing error surfacing exists yet; this phase is the first to add one
- Convex reactive `useQuery` (via `@convex-dev/react-query`'s `convexQuery`) is the established data-fetching pattern (`hooks/useNoteMutations.ts`, `app/[locale]/(app)/notes/page.tsx`) — any new "current note count" or "current plan" display, if needed by the modal, should follow this pattern rather than one-off fetches

### Integration Points

- `convex/notes.ts` `createNote` mutation (line ~522) — the single point where the limit check is added; no other mutation in this file changes
- `hooks/useNoteMutations.ts` `createNote` (child-note creation, used by `components/NotesTree.tsx`) and the root-level `createNote` mutation in `app/[locale]/(app)/notes/page.tsx` — both `onError` handlers need the new upgrade-modal trigger (D-07)
- `/pricing` (Phase 3, `app/[locale]/(marketing)/pricing/`) — the link target for the upgrade modal's CTA; no changes needed to the pricing page itself

</code_context>

<specifics>
## Specific Ideas

- Pro plan value (unlimited notes) and Free plan value (20 notes max) are already locked in PROJECT.md/REQUIREMENTS.md — this phase implements the enforcement, not the numbers themselves
- The upgrade modal's exact copy/design is left to planner/executor discretion — only the mechanism (dedicated Dialog, not inline-only or toast) and destination (`/pricing`) are locked

</specifics>

<deferred>
## Deferred Ideas

- **`duplicateNote` limit enforcement** — explicitly discussed and deferred (D-02). A Free user could exceed 20 notes via duplicating a note with children; accepted as a known loophole for this phase, not planned for a future phase unless it becomes a real problem.
- **Grace period for `past_due` subscriptions** — explicitly discussed and rejected (D-03), not deferred to a future phase; Stripe's own dunning/retry cycle is the only grace mechanism, ending in `customer.subscription.deleted` (Phase 2 webhook) which naturally drops the user to Free.

</deferred>

---

_Phase: 4-Plan Enforcement_
_Context gathered: 2026-07-10_
</decisions>
