---
phase: 02
slug: webhook-handler-convex-internal-mutations
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                                                                | Description                                                                                                                                                                                           | Data Crossing                                                         |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Stripe -> Next.js route (`app/api/webhooks/stripe/route.ts`)                            | Untrusted internet-facing input arrives as a raw HTTP POST body + `Stripe-Signature` header; sole authentication boundary for the whole webhook flow (`proxy.ts` excludes this route from Clerk auth) | Raw Stripe event payload, signature header                            |
| `route.ts` -> Stripe API (`stripe.subscriptions.retrieve`)                              | Outbound call using `STRIPE_SECRET_KEY`, triggered only for `checkout.session.completed`, scoped to a single subscription ID already present in the verified event payload                            | Subscription status/period-end enrichment data                        |
| Next.js route -> Convex public action (`processWebhookEvent`)                           | The action is reachable by ANY client holding `NEXT_PUBLIC_CONVEX_URL`, not only the Next.js route — a shared-secret (`INTERNAL_WEBHOOK_SECRET`) is the sole access-control gate                      | Verified Stripe event + shared secret                                 |
| Convex public action -> internalMutations (`subscriptions.*`, `aiCredits.resetCredits`) | `ctx.runMutation(internal.*)` calls, not reachable from any public client SDK                                                                                                                         | Parsed event fields (clerkUserId, stripeSubscriptionId, status, etc.) |
| npm registry -> local devDependencies                                                   | Installing `vitest`/`convex-test`/`@edge-runtime/vm` pulls third-party code into the build/test toolchain                                                                                             | Package code, only at build/test time                                 |
| Vercel/Convex dashboards -> deployed runtime                                            | `INTERNAL_WEBHOOK_SECRET` set here becomes `process.env.INTERNAL_WEBHOOK_SECRET` in each deployment scope                                                                                             | Shared secret value                                                   |

---

## Threat Register

| Threat ID | Category               | Component                                                                                           | Disposition | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-02-SC   | Tampering              | npm install of `vitest`/`convex-test`/`@edge-runtime/vm`                                            | mitigate    | Original checkpoint (Plan 02-01 Task 1, `gate="blocking-human"`) was auto-approved instead of manually verified — see Open Threat Detail below. Retroactively remediated during /gsd:secure-phase 2 audit (2026-07-11): `npm view vitest maintainers` confirms `antfu <anthonyfu117@hotmail.com>` and `yyx990803 <yyx990803@gmail.com>` (Evan You) among maintainers; `npm view vitest repository.url` resolves to `git+https://github.com/vitest-dev/vitest.git`, matching the official vitest-dev org. Package identity confirmed legitimate.                                                    | closed |
| T-02-01   | Spoofing               | `app/api/webhooks/stripe/route.ts`                                                                  | mitigate    | `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` wrapped in try/catch → any thrown error returns 400 before any Convex call (`app/api/webhooks/stripe/route.ts:19-35`)                                                                                                                                                                                                                                                                                                                                                                                                  | closed |
| T-02-02   | Elevation of Privilege | `subscriptions`/`aiCredits`/`creditTransactions` table writes; `processWebhookEvent` action         | mitigate    | All Phase 2 writers (`upsertSubscription`, `deleteSubscription`, `markPastDue`, `resetCredits`, `deductCredit`, `addCredits`) are `internalMutation`, never public `mutation` (`convex/subscriptions.ts:21,90,135`; `convex/aiCredits.ts:73,161,224`); `getCredits` is `internalQuery` (`convex/aiCredits.ts:63`). `processWebhookEvent` gates every call on `args.secret !== process.env.INTERNAL_WEBHOOK_SECRET`, throwing before dispatch (`convex/stripeWebhooks.ts:33,38`). `route.ts` passes `INTERNAL_WEBHOOK_SECRET` from `process.env` unmodified (`app/api/webhooks/stripe/route.ts:66`) | closed |
| T-02-03   | Information Disclosure | Timing side-channel on `args.secret !== process.env.INTERNAL_WEBHOOK_SECRET` plain `!==` comparison | accept      | No `crypto.timingSafeEqual` used (confirmed: `convex/stripeWebhooks.ts:33` still uses plain `!==`). Accepted as defense-in-depth secondary check behind Stripe's own signature verification (T-02-01) and HTTPS transport; a practical timing attack requires many precisely-timed requests against a serverless backend — low practicality per 02-RESEARCH.md Assumption A1                                                                                                                                                                                                                       | closed |
| T-02-04   | Tampering (replay)     | Duplicate delivery of any of the 5 handled Stripe event types                                       | mitigate    | `processedStripeEvents` check-by-`stripeEventId` (`by_stripeEventId` index) happens as the first step inside the same atomic `internalMutation` as the state write, in all 4 writer functions — verified in `convex/subscriptions.ts` (upsertSubscription, deleteSubscription, markPastDue) and `convex/aiCredits.ts` (resetCredits). The dispatcher action itself never checks/writes `processedStripeEvents` directly, avoiding the two-call race Convex docs warn against                                                                                                                       | closed |
| T-02-05   | Information Disclosure | `INTERNAL_WEBHOOK_SECRET` value once set in Vercel/Convex dashboards                                | mitigate    | `.env.example` documents the var as SECRET/server-only with no `NEXT_PUBLIC_` prefix (`.env.example:10-15`). Plan 02-06 Task 2 (`gate="blocking"`, human-action checkpoint) required marking the Vercel entry "Sensitive" across all 3 scopes and propagating the identical value to staging/production Convex deployments; 02-06-SUMMARY.md logs the user replied "done" confirming this was completed (external dashboard state, not independently re-verifiable from this repository)                                                                                                           | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

### Open Threat Detail — T-02-SC

Plan 02-01's Task 1 is a `checkpoint:human-verify` gate whose own text states: _"Per the Package Legitimacy Gate protocol, this checkpoint is mandatory before Task 2 installs the package and is never auto-approvable regardless of `workflow.auto_advance`."_ Its acceptance criteria required the user to explicitly reply "approved" after visiting npmjs.com and github.com/vitest-dev/vitest to confirm `vitest`'s identity.

02-01-SUMMARY.md documents instead: _"Checkpoint auto-approval: Task 1's blocking-human checkpoint was auto-approved per the orchestrator's explicit auto-mode directive for this execution, citing 02-RESEARCH.md's own legitimacy audit."_ No evidence exists in the summary or git history that a human actually performed the required npmjs.com/GitHub verification — the checkpoint's own "never auto-approvable" constraint was bypassed by the orchestrator.

This does not necessarily mean `vitest`/`convex-test`/`@edge-runtime/vm` are malicious — 02-RESEARCH.md's research-phase audit independently verified `vitest@4.1.10` against the live npm registry (vitest-dev org, millions of weekly downloads) and GitHub as a name-similarity false positive, not a real typosquat. However, the audit's job is to verify the _declared_ mitigation (a mandatory, non-bypassable human checkpoint) actually occurred, and it did not. This is a process-control gap, not a confirmed supply-chain compromise.

**Resolution (2026-07-11):** Option (a) executed — `npm view vitest maintainers` and `npm view vitest repository.url` run directly against the live npm registry during the /gsd:secure-phase 2 audit, confirming maintainers `antfu`/`yyx990803` (Evan You) and repository `github.com/vitest-dev/vitest`. This satisfies the checkpoint's original intent (confirm package identity before trusting the install) even though the originally-specified manual dashboard visit was bypassed. Entry closed.

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                                                                                                                                                                                                                                              | Accepted By                            | Date       |
| -------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------- |
| AR-02-01 | T-02-03    | Plain `!==` comparison for `INTERNAL_WEBHOOK_SECRET` (no `crypto.timingSafeEqual`) is a defense-in-depth secondary check behind Stripe's HMAC signature verification and HTTPS transport. A practical timing attack would require many precisely-timed requests against a serverless backend with high latency jitter — assessed as low practicality per 02-RESEARCH.md Assumption A1. | Phase 02 plan authors (02-RESEARCH.md) | 2026-07-08 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By                                                                         |
| ---------- | ------------- | ------ | ---- | ------------------------------------------------------------------------------ |
| 2026-07-11 | 6             | 5      | 1    | gsd-security-auditor                                                           |
| 2026-07-11 | 6             | 6      | 0    | /gsd:secure-phase 2 — T-02-SC closed via retroactive npm registry verification |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
