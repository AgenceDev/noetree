---
phase: 05
slug: ai-credits-system
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 05 — AI Credits System — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                            | Description                                                                                                                         | Data Crossing                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| client → Convex `runAiAction` / `getMyCredits`      | Untrusted client invokes the deduction mutation and balance query; must not be able to act on another user's credits.               | clerkUserId (identity-derived only), balance |
| concurrent clients → aiCredits row                  | Two in-flight deductions against the same balance must serialize (TOCTOU).                                                          | balance mutation                             |
| Stripe → webhook dispatcher → `addCredits`          | Stripe delivers events at-least-once; a replayed/duplicated event must not double-credit.                                           | stripeEventId, amount, clerkUserId           |
| webhook payload → clerkUserId resolution            | The credited user is resolved from `session.metadata.clerkUserId` set server-side at checkout creation, not arbitrary client input. | clerkUserId                                  |
| client → `createTopupCheckoutSession` Server Action | A Free user could call the action directly, bypassing the UI that only shows the button to Pro users.                               | subscription status, clerkUserId             |
| Server Action → Stripe                              | `clerkUserId` written into `session.metadata` must come from the authenticated session, not client input.                           | clerkUserId, Stripe Checkout Session         |

---

## Threat Register

| Threat ID      | Category                      | Component                                                                    | Disposition | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status |
| -------------- | ----------------------------- | ---------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-05-01        | Elevation of Privilege / IDOR | `runAiAction`, `getMyCredits`, `createTopupCheckoutSession`                  | mitigate    | `convex/aiCredits.ts:86-91,126-135` — both declared `args: {}` and derive `clerkUserId` exclusively from `ctx.auth.getUserIdentity().subject`, never a client argument. `app/[locale]/(app)/notes/actions.ts:11,63` — `createTopupCheckoutSession` takes no parameters; `metadata: { clerkUserId: userId }` sourced from `auth()`. Proven cross-user-isolated by `convex/aiCredits.test.ts` (`getMyCredits`/`runAiAction` `describe` blocks) and `listMyTopups`'s explicit cross-user-isolation test. | closed |
| T-05-02        | Tampering / Repudiation       | `deductCredit` balance decrement (TOCTOU) + client-side button/badge display | mitigate    | `convex/aiCredits.ts:19-57` (`applyDeduction`) reads, branches, and patches inside a single mutation handler, never split across `ctx.runMutation`. Proven TOCTOU-safe by `convex/aiCredits.test.ts:252-282` (`Promise.allSettled` concurrency test: exactly 1 of 2 concurrent calls at balance=1 succeeds, final balance 0). Client-side: `components/editor/EditorToolbar.tsx:191-195` never gates the click on balance — the button is always enabled and the server enforces the check.           | closed |
| T-05-03        | Tampering                     | `addCredits` double-credit on Stripe replay                                  | mitigate    | `convex/aiCredits.ts:237-243` — idempotency check against `processedStripeEvents` by `by_stripeEventId`, checked before any balance write, returns `{ alreadyProcessed: true }` on replay. Proven by `convex/aiCredits.test.ts:447-485` and `convex/stripeWebhooks.test.ts:149-174` (dispatcher-level replay test — balance stays 50, not 100).                                                                                                                                                       | closed |
| T-05-04        | Elevation of Privilege        | `createTopupCheckoutSession` Pro-only gate                                   | mitigate    | `app/[locale]/(app)/notes/actions.ts:45-47` — `if (existing?.status !== "active") throw new Error("TOPUP_REQUIRES_PRO");` runs after an independent server-side `getSubscription` query and strictly before `stripe.checkout.sessions.create` (line 52), never trusting UI visibility.                                                                                                                                                                                                                | closed |
| T-05-05        | Spoofing / Tampering          | Forged/unsigned webhook payload                                              | accept      | Unchanged this phase — `stripe.webhooks.constructEvent` signature verification confirmed present in `app/api/webhooks/stripe/route.ts` (grep match), gating every event before it reaches `processWebhookEvent`. The `INTERNAL_WEBHOOK_SECRET` guard in `convex/stripeWebhooks.ts:33-39` is also unchanged and verified present. See Accepted Risks Log.                                                                                                                                              | closed |
| T-05-06        | Tampering                     | Credit amount derived from Stripe response                                   | mitigate    | `convex/stripeWebhooks.ts:65` — `amount: 50` is a literal in the dispatcher branch, never derived from `session.amount_total` or line items. Grep confirms no `amount_total` reference in the payment-mode branch.                                                                                                                                                                                                                                                                                    | closed |
| T-05-07        | Information Disclosure        | Error/token logging in `createTopupCheckoutSession`                          | mitigate    | `app/[locale]/(app)/notes/actions.ts:30-39` — the subscription-lookup catch logs only the error object (`console.error("...", err)`), never `convexToken` or any secret. Grep confirms no `console.log`/`console.error` call references `convexToken` anywhere in the file.                                                                                                                                                                                                                           | closed |
| T-05-IDOR-READ | Information Disclosure        | Legacy `getCredits` (client-supplied clerkUserId)                            | accept      | `convex/aiCredits.ts:63-71` — `getCredits` is declared as `internalQuery` (not `query`), making it unreachable from the public client SDK entirely — stronger than the original "accept" disposition anticipated. Client-facing reads use `getMyCredits` instead. See Accepted Risks Log.                                                                                                                                                                                                             | closed |
| T-05-SC        | Tampering                     | npm/pip/cargo supply-chain installs                                          | accept      | No new packages installed during Phase 5 — confirmed via `git log --oneline -- package.json`: the most recent `package.json`-touching commit predates all Phase 5 commits (`a0cf678`/`9778de2`/`4abfb37`, all Phase 1-3). See Accepted Risks Log.                                                                                                                                                                                                                                                     | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## Unregistered Flags

None — no SUMMARY.md in this phase contains a `## Threat Flags` section; all attack surface introduced in Plans 01–05 maps to a registered threat ID above.

---

## Accepted Risks Log

| Risk ID  | Threat Ref     | Rationale                                                                                                                                                                                                                                                    | Accepted By                             | Date       |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ---------- |
| AR-05-01 | T-05-05        | Webhook signature verification (`stripe.webhooks.constructEvent`) and the `INTERNAL_WEBHOOK_SECRET` shared-secret guard were established in prior phases and are unchanged/re-verified this phase; no new webhook surface was added without this protection. | Phase 5 plans (05-02 threat_model)      | 2026-07-10 |
| AR-05-02 | T-05-IDOR-READ | `getCredits` predates this phase (Phase 2) and is retained only as an `internalQuery` for internal/test callers to avoid breaking existing Phase 2 tests; it is not reachable from any client.                                                               | Phase 5 plan 05-01 threat_model         | 2026-07-10 |
| AR-05-03 | T-05-SC        | No new npm/pip/cargo packages were installed in any of the 5 plans comprising this phase (verified by `git log -- package.json` showing no Phase-5-range commits touching the file).                                                                         | Phase 5 plans (all threat_model blocks) | 2026-07-10 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-07-11 | 9             | 9      | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
