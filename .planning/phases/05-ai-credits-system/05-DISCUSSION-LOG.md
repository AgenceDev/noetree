# Phase 5: AI Credits System - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 5-AI Credits System
**Areas discussed:** AI feature scope, Deduction atomicity & failure handling, Zero-credit blocking UX, Top-up checkout flow

---

## AI Feature Scope

| Option                          | Description                                                                | Selected |
| ------------------------------- | -------------------------------------------------------------------------- | -------- |
| Note summarization              | Button sends note content to an LLM, returns a summary                     |          |
| Content suggestion/continuation | AI suggests next text/expansion in the editor                              |          |
| Generic "AI action" placeholder | Credit machinery wired to a stubbed/trivial AI call, real feature deferred | ✓        |
| Something else                  | Freeform                                                                   |          |

**User's choice:** Generic "AI action" placeholder — build the credit deduction/balance/blocking machinery, defer the real AI capability.

| Option                     | Description                                        | Selected |
| -------------------------- | -------------------------------------------------- | -------- |
| Vercel AI SDK + AI Gateway | Provider-agnostic strings through Vercel's Gateway |          |
| Direct Anthropic SDK       | @anthropic-ai/sdk wired directly                   | ✓        |
| Direct OpenAI SDK          | openai package wired directly                      |          |
| You decide                 | Leave to researcher/planner                        |          |

**User's choice:** Direct Anthropic SDK — locked as the intended provider for the future real feature (not consumed this phase, see follow-up).

| Option                             | Description                                             | Selected |
| ---------------------------------- | ------------------------------------------------------- | -------- |
| Real minimal call on note content  | Real Claude call, fixed prompt, sends note text         |          |
| Real minimal call, no note content | Real Claude call, trivial fixed prompt, no note content |          |
| You decide                         | Leave exact call shape to researcher/planner            |          |

**User's choice (free text):** "no real call just placeholders actions but we implement the calculation and rate limiting" — no real AI call at all in this phase; only the credit calculation/rate-limiting logic must be real.
**Notes:** This reconciles with the prior Anthropic SDK answer — Anthropic SDK is locked for whenever the real feature is eventually built, but nothing in Phase 5 makes that call.

| Option                  | Description                                      | Selected |
| ----------------------- | ------------------------------------------------ | -------- |
| Editor toolbar button   | New button in EditorToolbar.tsx/toolbarItems.tsx | ✓        |
| Note header/action area | Separate from formatting toolbar                 |          |
| You decide              | Leave placement to planner/executor              |          |

**User's choice:** Editor toolbar button — credit balance shown next to it.

---

## Deduction Atomicity & Failure Handling

| Option                                           | Description                                                                 | Selected |
| ------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| Check-and-deduct in one atomic mutation          | Balance check + deduct in same transaction, no separate reconciliation step |          |
| Deduct first, then run action, refund on failure | Deduct atomically, run action, refund if it fails                           | ✓        |
| You decide                                       | Leave sequencing to planner/executor                                        |          |

**User's choice:** Deduct first, then run action, refund on failure.

| Option                                  | Description                                                   | Selected |
| --------------------------------------- | ------------------------------------------------------------- | -------- |
| Single atomic mutation (Convex default) | Read+patch balance in same mutation handler, no extra locking | ✓        |
| You decide                              | Leave mechanism to researcher/planner                         |          |

**User's choice:** Single atomic mutation (Convex default).

| Option                                                          | Description                                                           | Selected |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Placeholder always succeeds — refund path built but untriggered | Refund logic exists for future real AI call, nothing fails this phase | ✓        |
| Placeholder simulates realistic failure conditions              | Refund path actually exercised/tested this phase                      |          |
| You decide                                                      | Leave to planner/executor                                             |          |

**User's choice:** Placeholder always succeeds — refund path built but untriggered.

| Option                                 | Description                                                 | Selected |
| -------------------------------------- | ----------------------------------------------------------- | -------- |
| Add "refund" as a new literal          | Schema migration, explicit 4th creditTransactions.type case | ✓        |
| Reuse "deduction" with reversed amount | No schema change, less explicit in history                  |          |
| You decide                             | Leave schema representation to planner/executor             |          |

**User's choice:** Add "refund" as a new literal.

---

## Zero-Credit Blocking UX

| Option                                    | Description                                       | Selected |
| ----------------------------------------- | ------------------------------------------------- | -------- |
| Reuse UpgradeModal-style dialog, new copy | Same Dialog pattern as Phase 4's UpgradeModal.tsx | ✓        |
| Disable the button + inline tooltip       | Greyed button with tooltip, no modal              |          |
| You decide                                | Leave UX to planner/executor                      |          |

**User's choice:** Reuse UpgradeModal-style dialog, new copy.

| Option                                 | Description                                                   | Selected |
| -------------------------------------- | ------------------------------------------------------------- | -------- |
| Hidden entirely for Free users         | Button not shown to Free tier                                 |          |
| Visible but always blocked (0 balance) | Same button shown, always blocked for Free (no aiCredits row) | ✓        |
| You decide                             | Leave to planner/executor                                     |          |

**User's choice:** Visible but always blocked (0 balance).

| Option                                             | Description                                         | Selected |
| -------------------------------------------------- | --------------------------------------------------- | -------- |
| Pro-only — Free users see "Upgrade to Pro" instead | Top-up purchase gated behind Pro subscription       | ✓        |
| Anyone can buy top-ups regardless of plan          | Standalone purchasable feature, independent of plan |          |
| You decide                                         | Leave gating to planner/executor                    |          |

**User's choice:** Pro-only — Free users see "Upgrade to Pro" instead.

| Option                                                             | Description                                                     | Selected |
| ------------------------------------------------------------------ | --------------------------------------------------------------- | -------- |
| Branch on Pro status: Free → upgrade CTA, Pro-at-zero → top-up CTA | Dialog checks subscriptions.status, shows different CTA by plan | ✓        |
| Single dialog, same top-up CTA for everyone                        | One dialog design regardless of plan                            |          |
| You decide                                                         | Leave to planner/executor                                       |          |

**User's choice:** Branch on Pro status: Free → upgrade CTA, Pro-at-zero → top-up CTA.

---

## Top-up Checkout Flow

| Option                                              | Description                                                | Selected |
| --------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Same Server Action pattern as Phase 3 subscriptions | New Server Action, Stripe Checkout Session in payment mode | ✓        |
| You decide                                          | Leave mechanism to planner/executor                        |          |

**User's choice:** Same Server Action pattern as Phase 3 subscriptions.

| Option                                                  | Description                                                   | Selected |
| ------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| Redirect back into the app, rely on Convex reactivity   | No dedicated success page, toolbar balance updates reactively | ✓        |
| Dedicated success page like Phase 3's /checkout/success | Reuse Phase 3 pattern exactly                                 |          |
| You decide                                              | Leave to planner/executor                                     |          |

**User's choice:** Redirect back into the app, rely on Convex reactivity.

| Option                                               | Description                                                    | Selected |
| ---------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Branch on session.mode ("payment" vs "subscription") | Existing Phase 2 dispatcher extended, no new event type/module | ✓        |
| You decide                                           | Leave branching mechanism to researcher/planner                |          |

**User's choice:** Branch on session.mode ("payment" vs "subscription").

| Option                                                     | Description                                                | Selected |
| ---------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| Same session.metadata.clerkUserId pattern as subscriptions | Reuses Phase 1/3 metadata pattern, no new resolution logic | ✓        |
| You decide                                                 | Leave to planner/executor                                  |          |

**User's choice:** Same session.metadata.clerkUserId pattern as subscriptions.

---

## Claude's Discretion

- Exact dialog copy/wording for the zero-credit block and refund messaging
- Exact toolbar button icon/placement within `toolbarItems.tsx`
- Exact file location for the new top-up Server Action
- Whether balance indicator is a number, icon+number, or icon+tooltip

## Deferred Ideas

- **Real AI capability** (note summarization, content suggestion, or generation via the Anthropic SDK) — explicitly discussed and deferred to a future phase/milestone. Phase 5 builds only the credit deduction/balance/blocking infrastructure wired to a placeholder action.
