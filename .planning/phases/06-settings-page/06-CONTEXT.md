# Phase 6: Settings Page - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a single in-app Settings page where a signed-in user (Free or Pro) can see their current plan, and if Pro, their subscription renewal date and cancel/cancel-pending status; upgrade from Free (linking into the existing Phase 3 checkout flow); cancel a Pro subscription with confirmation (status flips to "cancels on [date]" without losing Pro access until period end, driven by the existing Phase 2 webhook flow); resume a pending cancellation before it takes effect; and view their AI credits balance plus a history of top-up purchases. This phase delivers no new billing logic beyond cancel/resume — checkout (Phase 3), note-limit enforcement (Phase 4), and credit deduction/top-up purchase (Phase 5) are all reused, not rebuilt.

</domain>

<decisions>
## Implementation Decisions

### Cancel Subscription UX

- **D-01:** The "Cancel subscription" confirmation uses Shadcn's **`AlertDialog`** primitive (`components/ui/alert-dialog.tsx`), not `Dialog`. This primitive exists in the codebase but is currently unused — this phase is its first consumer. Chosen over `Dialog` (used by `UpgradeModal.tsx`/`CreditsExhaustedDialog.tsx`) because it's semantically built for destructive/confirm-or-abort actions.
- **D-02:** A Pro user with a pending cancellation (`cancelAtPeriodEnd === true`, still before `currentPeriodEnd`) can click **"Resume subscription"** to undo it — this calls Stripe to set `cancel_at_period_end: false` on the same subscription (no new Checkout Session, no access gap). The existing `customer.subscription.updated` webhook handling (Phase 2) picks up the resulting Stripe event and updates Convex automatically — no new webhook branch needed, only a new outbound Stripe API call from a Server Action.
- **D-03:** Status copy for a pending cancellation reads **"Cancels on [date]"** (matches ROADMAP SC3 literally), with the "Resume subscription" button (D-02) shown alongside it in the same Plan section.

### Navigation & Page Location

- **D-04:** Settings is a new route inside the authenticated app shell: `app/[locale]/(app)/settings/page.tsx` (parallel to the existing `app/[locale]/(app)/notes/` structure — same layout, sidebar, and auth boundary).
- **D-05:** Reached via a new **"Settings" item in the `NavUser` dropdown** (`components/nav-user.tsx`), added as its own entry — NOT merged with the existing "Account" item. "Account" keeps opening Clerk's `openUserProfile()` modal (identity/security); "Settings" navigates to the new in-app page (billing/credits). These are kept distinct because they serve different concerns.
- **D-06:** The Settings page is visible to **both Free and Pro users**, not Pro-only. A Free user sees their Plan section render "Free" + an "Upgrade to Pro" CTA (D-08) and their (always-empty/zero) Credits section — same visibility principle already established for the AI credits balance badge in Phase 5 (D-09, "visible for both Free and Pro tiers").

### Credit History Scope

- **D-07:** The Credits section shows a history of **top-up purchases only** (`creditTransactions` rows filtered to `type === "topup"`) — not a full ledger of all four transaction types (deduction/topup/reset/refund). This matches SET-05's literal wording ("top-up purchases") and ROADMAP SC5. Deductions, resets, and refunds stay internal bookkeeping, not surfaced in this UI.
- **D-08:** A new Convex query is needed — no read-query over `creditTransactions` exists yet (only internal mutations write to it: `deductCredit`'s `applyDeduction`, `resetCredits`, `addCredits`). The new query (e.g. `listMyTopups` in `convex/aiCredits.ts`) must derive `clerkUserId` exclusively from `ctx.auth.getUserIdentity().subject` — never a client-supplied argument — mirroring the identity-derived IDOR-safe pattern already established by `getMyCredits` and `subscriptions.getSubscription`. It queries `creditTransactions.by_clerkUserId`, filtered to `type: "topup"`, sorted by `createdAt` descending.
- **D-09:** No pagination this phase — top-ups are infrequent (2€ for 50 credits), so a full unpaginated list is small and simple. Do not build a `paginate()`-based query or client pagination UI.

### Page Layout & Sections

- **D-10:** Single page, **stacked sections** (not tabs): a "Plan" `Card` (current plan, renewal/cancel/resume status, upgrade/cancel actions) directly above a "Credits" `Card` (balance + top-up history list). Reuses `components/ui/card.tsx`, the app's established content-grouping primitive (already used on the pricing page). No `Tabs` primitive is introduced — it would be overkill for 2 sections and isn't used elsewhere in this app.
- **D-11:** A Free user's Plan card shows **plan name + "Upgrade to Pro" CTA only** — no inline feature/plan comparison. The CTA links to `/pricing` (the sole upgrade destination, per the Phase 3 D-04 constraint reused here), where the full Free-vs-Pro comparison already lives. Settings does not duplicate that comparison table.

### Claude's Discretion

- Exact `AlertDialog` copy/wording for the cancel confirmation and the post-cancel/post-resume toasts or inline confirmations
- Exact icon and position of the new "Settings" NavUser dropdown item
- Exact layout details within each Card (spacing, field ordering, exact date formatting)
- Exact naming of the new Server Actions (cancel/resume) and the new Convex query, as long as they follow the established identity-derived/Server-Action conventions

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap

- `.planning/ROADMAP.md` §"Phase 6: Settings Page" — 5 success criteria (plan/renewal/status display, Free upgrade CTA, Pro cancel-with-confirm showing "cancels on [date]" without immediate access loss, webhook-driven downgrade to Free at period end, credits balance + top-up history)
- `.planning/REQUIREMENTS.md` — SET-01 (view current plan), SET-02 (renewal date/status), SET-03 (upgrade from Free), SET-04 (cancel with confirmation), SET-05 (credits balance + top-up history), PAY-04 (cancel subscription from within the app) map to this phase
- `.planning/PROJECT.md` §Constraints — "Convex est le store de vérité pour le statut d'abonnement, Stripe est la source d'autorité" (locks the webhook-driven update model this phase's cancel/resume actions rely on, per D-02); §Key Decisions confirms "UI custom (pas Stripe Portal)" — this phase's custom cancel/resume UI is the direct fulfillment of that earlier decision

### Phase 1-5 Context (prerequisite decisions this phase builds on)

- `.planning/phases/02-webhook-handler-convex-internal-mutations/02-CONTEXT.md` — the webhook dispatcher's `customer.subscription.updated` handling already reads `cancel_at_period_end` and upserts it into Convex (confirmed by reading `convex/stripeWebhooks.ts` directly) — D-02/D-03 depend on this existing behavior requiring zero webhook changes
- `.planning/phases/03-checkout-flow-pricing-page/03-CONTEXT.md` — D-05/D-06/D-08 (Server Action pattern for Stripe API calls, customer/subscription lookup via `subscriptions.getSubscription`), D-04 (`/pricing` as sole upgrade destination, reused by D-11)
- `.planning/phases/04-plan-enforcement/04-CONTEXT.md` — D-03/D-05 (Free/Pro determination via `subscriptions.status === "active"`, identity-derived, no grace period) — this phase's Plan section rendering and cancel/resume gating reuse this exact rule
- `.planning/phases/05-ai-credits-system/05-CONTEXT.md` — D-09 (credits balance visible to both Free and Pro, reused for D-06), D-12 (Server Action pattern for Stripe Checkout in `payment` mode, structural precedent for this phase's cancel/resume Server Actions even though those don't create Checkout Sessions), D-08 (`creditTransactions.type` union already includes `"refund"` — this phase's history query explicitly excludes it per D-07)

### Existing Code (already deployed, this phase's starting point)

- `convex/subscriptions.ts` — `getSubscription` (identity-derived query, reused as-is for Plan section rendering); `upsertSubscription`/`deleteSubscription`/`markPastDue` (internal mutations, already fully wired to the webhook dispatcher — no changes needed for cancel/resume since Stripe's own `customer.subscription.updated` event triggers `upsertSubscription` automatically)
- `convex/aiCredits.ts` — `getMyCredits` (identity-derived query pattern to mirror for the new `listMyTopups` query, D-08); `creditTransactions` rows already carry `type`, `amount`, `createdAt`, optional `stripePaymentIntentId` — sufficient fields for a top-up history list, no schema change needed
- `convex/stripeWebhooks.ts` — `customer.subscription.updated` branch (lines ~117-141) already maps `subscription.cancel_at_period_end` into the `upsertSubscription` call; this phase's cancel/resume Server Actions trigger this same event via `stripe.subscriptions.update(...)`, no dispatcher changes
- `app/[locale]/(app)/notes/actions.ts` — `createTopupCheckoutSession` Server Action — structural template for the new cancel/resume Server Actions (Clerk `auth()` → identity-derived Convex query → guarded Stripe API call → error handling convention)
- `components/nav-user.tsx` — existing dropdown structure (`DropdownMenuItem` for "Account"/theme/language/logout) — new "Settings" item inserted here (D-05)
- `components/ui/alert-dialog.tsx` — exists, unused until this phase (D-01)
- `components/ui/card.tsx` — existing content-grouping primitive, reused for Plan/Credits sections (D-10)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `convex/subscriptions.ts` `getSubscription` — read directly for Plan section data (status, currentPeriodEnd, cancelAtPeriodEnd)
- `convex/aiCredits.ts` `getMyCredits` — read directly for Credits section balance; its identity-derivation pattern is the template for the new `listMyTopups` query
- `components/ui/alert-dialog.tsx`, `components/ui/card.tsx` — Shadcn primitives ready to use, no new dependency needed
- `app/[locale]/(app)/notes/actions.ts` — Server Action shape (Clerk `auth()`, Convex client with forwarded token, narrow try/catch around only the Stripe call, `redirect()` outside try/catch) to replicate for cancel/resume actions

### Established Patterns

- Identity-derived Convex queries/mutations (never trust a client-supplied `clerkUserId`) — established across `subscriptions.getSubscription`, `aiCredits.getMyCredits`/`runAiAction` — the new `listMyTopups` query and any new mutation this phase touches must follow this same IDOR-safe convention
- Convex reactive `useQuery` (via `@convex-dev/react-query`'s `convexQuery`) as the real-time UI pattern — Plan/Credits sections and the post-cancel/resume status update should follow this, no polling
- Server Action → Stripe API call → rely on webhook for state write-back (established in Phase 3's checkout and Phase 5's top-up) — this phase's cancel/resume actions follow the same shape: call Stripe, let the existing webhook dispatcher update Convex reactively, don't write Convex state directly from the Server Action

### Integration Points

- `components/nav-user.tsx` — add "Settings" `DropdownMenuItem` (D-05)
- New `app/[locale]/(app)/settings/page.tsx` — the Settings page itself
- New Server Actions for cancel and resume (exact file location left to planner — likely a `settings/actions.ts` sibling to the page, mirroring `notes/actions.ts`)
- `convex/aiCredits.ts` — add new `listMyTopups` query (D-08)
- No changes needed to `convex/stripeWebhooks.ts` or `convex/subscriptions.ts` — both already support everything this phase's cancel/resume flow requires

</code_context>

<specifics>
## Specific Ideas

- "Cancels on [date]" copy is locked to match ROADMAP SC3's exact phrasing; other copy (confirmation dialog body, resume confirmation, etc.) is left to planner/executor discretion
- Top-up history has no pagination — full list, sorted newest-first, is expected to stay small given the 2€/50-credit purchase pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (A full transaction ledger showing deductions/resets/refunds, and a tabbed page layout, were both explicitly considered and rejected in favor of the simpler top-up-only / stacked-sections approach — not deferred as future work, just decided against.)

</deferred>

---

_Phase: 6-Settings Page_
_Context gathered: 2026-07-11_
