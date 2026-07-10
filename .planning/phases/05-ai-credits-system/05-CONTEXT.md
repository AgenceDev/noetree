# Phase 5: AI Credits System - Context

**Gathered:** 2026-07-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the AI credits deduction/balance/blocking machinery: a toolbar-triggered AI action that atomically deducts 1 credit (with real TOCTOU-safe concurrency protection and a refund-on-failure path), a visible balance indicator next to the entry point, a blocking dialog when balance hits 0, and a one-time Stripe top-up purchase (50 credits / 2€) that credits the balance via an extension of the existing webhook dispatcher. Credit auto-reset on billing cycle (CRED-01) was already implemented in Phase 2 (`resetCredits`) — this phase does not touch it.

**Explicitly NOT delivered this phase:** a real AI capability. No LLM API call is made — the toolbar action is a placeholder that always succeeds. Building the actual summarization/suggestion/generation feature is deferred (see `<deferred>`).

</domain>

<decisions>
## Implementation Decisions

### AI Feature Scope

- **D-01:** No real AI/LLM call happens in this phase. The toolbar action is a placeholder that always succeeds instantly — no external API, no network call, no failure simulation. What must be real and correctly implemented is the credit calculation (deduction) and rate-limiting (concurrency/atomicity) logic around it.
- **D-02:** When the real AI capability is eventually built (future phase/milestone), it should use the **direct Anthropic SDK** (`@anthropic-ai/sdk`), not the Vercel AI Gateway/AI SDK abstraction. This is locked for future work only — nothing this phase depends on it or installs it.
- **D-03:** The AI action lives as a new button in the **editor toolbar** (`components/editor/EditorToolbar.tsx` / `components/editor/toolbarItems.tsx`), alongside existing formatting controls. The credit balance indicator is shown next to it — this satisfies ROADMAP SC2 ("balance visible near AI feature entry points").

### Deduction Atomicity & Failure Handling

- **D-04:** Flow is **deduct-first, then run the action, refund on failure**: the mutation atomically deducts 1 credit, then runs the (placeholder) action; if the action reports failure, a refund transaction restores the credit.
- **D-05:** Concurrency safety (ROADMAP SC1 — two concurrent calls when only 1 credit remains must not both succeed) relies on **Convex's default per-document mutation serialization**: read balance and patch it within the same mutation handler. This mirrors the check-and-mark atomicity pattern already established in Phase 2 (`02-CONTEXT.md` D-14) — no additional locking mechanism needed.
- **D-06:** Because the placeholder action always succeeds, **the refund path is implemented but not exercised** in this phase. It exists so the real AI call (which can genuinely fail/timeout) can plug into the same mutation later without a redesign.
- **D-07:** `convex/schema.ts` `creditTransactions.type` union (`"deduction" | "topup" | "reset"`) gets a **new `v.literal("refund")` case**. Planner must include this schema change.

### Zero-Credit Blocking UX

- **D-08:** Reuse the **Dialog pattern from `components/UpgradeModal.tsx`** (Phase 4) for the "out of credits" block — a dedicated dialog with new copy, not an inline-disabled button or toast.
- **D-09:** The toolbar AI button is **visible for both Free and Pro users**. Free users have no `aiCredits` row at all — treated as 0 balance — and see the same button, same blocked state, as a Pro user who has spent all their credits. It is never hidden.
- **D-10:** Top-up purchases are **Pro-only**. A Free user who clicks the blocked AI button sees the existing "Upgrade to Pro" CTA (Phase 4 pattern, linking to `/pricing`) — not a credit-purchase option.
- **D-11:** The blocking dialog **branches its CTA on subscription status**, using the same `subscriptions.status === "active"` check pattern established in Phase 4's `createNote` enforcement (`04-CONTEXT.md` D-03/D-05): Free → "Upgrade to Pro" CTA; Pro-at-zero-balance → "Buy 50 credits" top-up CTA.

### Top-up Checkout Flow

- **D-12:** The "Buy 50 credits for 2€" purchase reuses the **Phase 3 Server Action pattern** (`03-CONTEXT.md` D-05/D-06) — a new Server Action creates a Stripe Checkout Session in **`payment` mode** (one-time), reusing the existing Stripe-customer lookup logic. Invoked from the zero-credit dialog's top-up CTA (D-11).
- **D-13:** **No dedicated success page** (unlike Phase 3's subscription flow, which has `/checkout/success`). `success_url` redirects back into the app; the toolbar balance indicator updates automatically via Convex's reactive `useQuery` once the webhook processes the payment.
- **D-14:** The existing **Phase 2 single-writer webhook dispatcher** (`convex/stripeWebhooks.ts`) is extended, not duplicated — it branches on **`session.mode`** (`"payment"` vs `"subscription"`) inside the existing `checkout.session.completed` handler to decide between calling `addCredits` vs the existing subscription-upsert logic. No new Stripe event type, no new webhook module — preserves Phase 2's "single writer" decision (`02-CONTEXT.md` D-01/D-03).
- **D-15:** The top-up Server Action sets `clerkUserId` in **`session.metadata.clerkUserId`**, exactly like the Phase 1/3 pattern for subscriptions (`02-CONTEXT.md` D-06). The webhook resolves it the same way — no new resolution logic.

### Claude's Discretion

- Exact dialog copy/wording for the zero-credit block and refund messaging
- Exact toolbar button icon/placement within `toolbarItems.tsx`
- Exact file location for the new top-up Server Action (mirrors Phase 3's discretion on Server Action location)
- Whether balance indicator is a number, icon+number, or icon+tooltip

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Requirements & Roadmap

- `.planning/ROADMAP.md` §"Phase 5: AI Credits System" — 5 success criteria (atomic deduction with TOCTOU protection, visible balance, 0-credit blocking with top-up prompt, Stripe payment-mode top-up, existing auto-reset)
- `.planning/REQUIREMENTS.md` — CRED-02 (view balance), CRED-03 (trigger top-up when low), CRED-04 (server-side deduction), PAY-05 (top-up via Stripe Checkout one-time) map to this phase. CRED-01 (monthly reset) is already complete (Phase 2) — not re-scoped here.
- `.planning/PROJECT.md` §Key Decisions — "Modèle hybride Free/Pro + crédits" confirms 1 credit = 1 AI action, top-up = 50 credits for 2€, monthly quota = 100 credits (all pre-locked values, not re-decided this phase)

### Phase 1–4 Context (prerequisite decisions this phase builds on)

- `.planning/phases/02-webhook-handler-convex-internal-mutations/02-CONTEXT.md` — D-01/D-03 (single-writer dispatcher, one action handles all event types — this phase extends it rather than adding a new one), D-06/D-07 (clerkUserId resolution via `session.metadata`/`subscription.metadata`, reused for top-up's `session.metadata.clerkUserId`), D-14 (atomic check-and-mark idempotency pattern this phase's deduction mutation mirrors)
- `.planning/phases/03-checkout-flow-pricing-page/03-CONTEXT.md` — D-05/D-06/D-08 (Server Action + Checkout Session creation pattern, customer reuse via `stripeCustomerId`) — this phase's top-up action follows the same shape in `payment` mode instead of `subscription` mode
- `.planning/phases/04-plan-enforcement/04-CONTEXT.md` — D-03/D-05 (Free/Pro determination via `subscriptions.status === "active"`, identity-derived not client-supplied), D-06/D-07/D-08 (Dialog-based upgrade-prompt pattern, `components/UpgradeModal.tsx`) — both directly reused this phase

### Existing Code (already deployed, this phase's starting point)

- `convex/aiCredits.ts` — `deductCredit` and `addCredits` are `internalMutation` stubs (`throw new Error("Not implemented — Phase 2")`, both marked `// LEAVE UNCHANGED — Phase 5`) — this phase fills in real bodies. `resetCredits` is **already fully implemented** (Phase 2) — do not modify it.
- `convex/schema.ts` — `aiCredits` table (`clerkUserId`, `balance`, `lastResetAt`, `by_clerkUserId` index) and `creditTransactions` table (`type: "deduction"|"topup"|"reset"`, `amount`, `createdAt`, optional `stripePaymentIntentId`, `by_clerkUserId` index) already deployed. This phase adds `"refund"` to the `type` union (D-07).
- `convex/stripeWebhooks.ts` — existing single-writer dispatcher for the 5 Stripe event types (Phase 2); this phase extends its `checkout.session.completed` branch on `session.mode` (D-14).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `components/UpgradeModal.tsx` — Dialog component to clone/extend for the zero-credit block (D-08), including its Free-vs-Pro CTA branching precedent
- `convex/subscriptions.ts` `getSubscription` / the Phase 4 Free-Pro check pattern — reused for D-11's dialog CTA branching and for gating who sees a top-up option (D-10)
- Phase 3's Server Action for Stripe Checkout Session creation — structural template for the new top-up action (D-12), swap `mode: "subscription"` for `mode: "payment"` and the price to `STRIPE_TOPUP_PRICE_ID` (already in `.env.example` since Phase 1)
- `convex/stripeWebhooks.ts` dispatcher — extend, don't duplicate (D-14)

### Established Patterns

- Convex mutations are transactional by default — the check-and-mutate-in-one-handler pattern (Phase 2 D-14) is the concurrency-safety mechanism for D-05, no new locking primitive needed
- Bare-throw error convention in Convex mutations (`convex/notes.ts`, `convex/aiCredits.ts` stubs) — the deduction mutation's "insufficient balance" case should follow this same convention
- `session.metadata.clerkUserId` as the resolution path for `checkout.session.completed` (Phase 1/2/3 precedent) — reused unchanged for top-up sessions (D-15)
- Convex reactive `useQuery` as the established real-time UI pattern (Phase 3 D-09) — the balance indicator and post-topup update (D-13) follow this, no polling

### Integration Points

- `convex/aiCredits.ts` — `deductCredit` (fill in real body, add refund path) and `addCredits` (fill in real body for top-up webhook)
- `convex/schema.ts` — add `"refund"` literal to `creditTransactions.type`
- `convex/stripeWebhooks.ts` — extend `checkout.session.completed` handling to branch on `session.mode`
- `components/editor/EditorToolbar.tsx` / `components/editor/toolbarItems.tsx` — new AI action button + balance indicator
- New Server Action (exact location left to planner, likely near the toolbar or a new `app/[locale]/(app)/notes/actions.ts`-style file) — creates the top-up Checkout Session
- `components/UpgradeModal.tsx` — either extended with a variant or a sibling component created for the zero-credit dialog

</code_context>

<specifics>
## Specific Ideas

- 1 credit = 1 AI action, monthly quota = 100 credits, top-up = 50 credits for 2€ — all already locked in PROJECT.md/STATE.md, not re-decided this phase
- The AI action itself is intentionally inert this phase (no LLM call) — the point of the phase is the credit machinery, not the AI feature; Anthropic SDK is named as the intended provider for whenever the real feature is built

</specifics>

<deferred>
## Deferred Ideas

- **Real AI capability** (note summarization, content suggestion, or generation via the Anthropic SDK) — explicitly discussed and deferred to a future phase/milestone. This phase builds only the credit deduction/balance/blocking infrastructure wired to a placeholder action.

None else — discussion stayed within phase scope.

</deferred>

---

_Phase: 5-AI Credits System_
_Context gathered: 2026-07-10_
