---
phase: 06
slug: settings-page
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 06 — Settings Page — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                                                  | Description                                                                               | Data Crossing                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| client → Convex query (`listMyTopups`, `getSubscription`, `getMyCredits`) | Signed-in browser client reactively reads billing/credit data                             | Subscription status, renewal date, credit balance, top-up history |
| browser → Server Action (`cancelSubscription`, `resumeSubscription`)      | A crafted form POST can invoke these actions directly, bypassing UI conditional rendering | Subscription cancel/resume mutation trigger (Stripe-bound)        |
| Server Action → Stripe API                                                | Outbound state mutation on a subscription                                                 | `cancel_at_period_end` boolean                                    |
| browser → `/settings` route                                               | Client-side navigation; **not gated by Clerk middleware** (see T-06-05/T-06-06 below)     | Page shell only — no route-level auth boundary exists here        |

---

## Threat Register

| Threat ID | Category                      | Component                                                                              | Disposition                             | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status |
| --------- | ----------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-06-01   | Tampering                     | `cancelSubscription` / `resumeSubscription` (`app/[locale]/(app)/settings/actions.ts`) | mitigate                                | Server-side re-verification of `status === "active"` (cancel, line 42) / `cancelAtPeriodEnd === true` (resume, line 90) via `getSubscription` fetched INSIDE the Server Action (lines 27, 79) before any Stripe call. UI conditionals in `SettingsPlanCard.tsx` are not trusted.                                                                                                                                                               | closed |
| T-06-02   | Elevation of Privilege (IDOR) | Server Action arguments (`actions.ts`)                                                 | mitigate                                | `cancelSubscription()`/`resumeSubscription()` are zero-argument exported functions (lines 10, 66); `stripeSubscriptionId` passed to `stripe.subscriptions.update()` is read from `existing.stripeSubscriptionId`, itself derived from the caller's own identity-scoped `getSubscription` call — never a client-supplied id.                                                                                                                    | closed |
| T-06-03   | Tampering                     | webhook replay desync after cancel/resume (`convex/subscriptions.ts`)                  | accept                                  | `processedStripeEvents` idempotency table (checked in `upsertSubscription` lines 37-45, `deleteSubscription` lines 97-105, `markPastDue` lines 142-150) already mitigates replay from Phase 2. Verified via `git log` that `convex/subscriptions.ts` had zero Phase-06 commits (last touch: `e5793d5`, Phase 03 IDOR fix) — confirms "zero changes this phase" claim.                                                                          | closed |
| T-06-04   | Information Disclosure        | `listMyTopups` / `getSubscription` / `getMyCredits` reads                              | mitigate                                | All three are zero-argument, identity-derived queries: `listMyTopups` (`convex/aiCredits.ts` lines 145-159) and `getMyCredits` (lines 126-137) call `ctx.auth.getUserIdentity()` and return `[]`/`null` when absent, scoping all reads via `withIndex("by_clerkUserId", identity.subject)`; `getSubscription` (`convex/subscriptions.ts` lines 4-19) follows the identical pattern. No client-supplied id argument exists in any of the three. | closed |
| T-06-05   | Elevation of Privilege        | `/settings` route access                                                               | accept (rationale corrected — see note) | See "T-06-05 / T-06-06 Verification Note" below.                                                                                                                                                                                                                                                                                                                                                                                               | closed |
| T-06-06   | Spoofing                      | unauthenticated access to `/settings`                                                  | accept (rationale corrected — see note) | Same root cause as T-06-05; see note below.                                                                                                                                                                                                                                                                                                                                                                                                    | closed |
| T-06-SC   | Tampering                     | npm/pip/cargo installs                                                                 | accept                                  | `git log --oneline -- package.json` shows no Phase-06 commits touch `package.json`; all packages used this phase (`stripe`, `convex`, `lucide-react`, `next-intl`) were already installed in earlier phases.                                                                                                                                                                                                                                   | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

---

## T-06-05 / T-06-06 Verification Note (independent audit finding)

**The stated rationale in 06-03-PLAN.md and 06-04-PLAN.md is factually incorrect.** Both plans claim `/settings` is protected because "Clerk middleware protects all `(app)` routes." This was independently verified to be **false**:

- `proxy.ts` line 7-10: `isProtectedRoute` is `createRouteMatcher(["/notes(.*)", "/:locale/notes(.*)"])` — it does **not** include `/settings` or `/:locale/settings`. `auth.protect()` (line 14) is therefore never invoked for `/settings` requests.
- `app/[locale]/(app)/layout.tsx` — a plain shell (`SidebarProvider`/`Header`/`HeaderProvider`) with **no server-side auth check, no redirect, no `auth()` call**.
- `app/[locale]/(app)/settings/page.tsx` is a `"use client"` component that unconditionally renders its `<h1>` and both card components regardless of sign-in state — there is no page-level `isSignedIn` gate either.

**Actual impact assessed (verified, not assumed):**

An unauthenticated visitor who navigates directly to `/settings` **is not redirected** and the page shell **does render**. However, no sensitive data or mutating capability is exposed, because three independent layers of defense-in-depth exist below the (missing) route layer:

1. **Query-level identity gating (real trust boundary):** `getSubscription` (`convex/subscriptions.ts:11-12`), `getMyCredits` (`convex/aiCredits.ts:129-130`), and `listMyTopups` (`convex/aiCredits.ts:148-149`) each independently call `ctx.auth.getUserIdentity()` inside the Convex handler and return `null`/`[]` if absent — this holds regardless of what the client sends, so even a maliciously modified client cannot retrieve another user's (or any real) data through these queries.
2. **Client-side `"skip"` sentinel:** `SettingsPlanCard.tsx:41` and `SettingsCreditsCard.tsx:20,23` gate all three `useQuery(convexQuery(...))` calls behind `isSignedIn ? {} : "skip"`, so the queries never even fire for a signed-out visitor — the card renders with `subscription`/`credits`/`topups` all `undefined`.
3. **Mutation-level auth guard:** `cancelSubscription`/`resumeSubscription` (`actions.ts:11-14, 67-70`) independently call Clerk's `auth()` and throw `UNAUTHENTICATED` before touching Convex or Stripe. The Cancel/Resume buttons in `SettingsPlanCard.tsx` are additionally only rendered when `isPro === true` (line 109, 123), which is always `false` for a signed-out visitor since `subscription` is `undefined` — so the destructive/mutating UI surface isn't even reachable to click.

Net result: an unauthenticated visitor to `/settings` sees only a **generic, non-personalized, inert page shell** — "Settings" title, "Free plan" + "Upgrade to Pro" CTA (identical to what any Free user sees), "0 credits" (the `?? 0` fallback, not real data), and the "No top-ups yet" empty state. No other user's data, no real balance, no functional mutation entry point is exposed. This is a **cosmetic/UX gap** (missing redirect-to-sign-in), not a data-disclosure or privilege-escalation vulnerability — the actual trust boundary for this phase's sensitive reads/writes is the identity-derived Convex query layer and the Server Action auth guard, both of which are independently verified present and correct.

**Recommendation: CLOSED (accept-as-is, rationale corrected in this document).** No code fix is required to close the security gap because no exploitable gap exists — only the _documentation_ of why it's safe was wrong (it credited middleware that doesn't apply, not the identity-derived checks that do the actual work). This is logged as a corrected accepted risk below rather than a blocker.

**Non-blocking hardening recommendation for a future phase:** Add `/settings(.*)`/`/:locale/settings(.*)` to `proxy.ts`'s `isProtectedRoute` matcher (or add a page-level redirect for signed-out users) so this page fails safe by construction rather than by the coincidence of every card author remembering to gate their queries with `isSignedIn`. This removes reliance on every future contributor to `SettingsPlanCard`/`SettingsCreditsCard` correctly re-deriving the `isSignedIn` gate if new, genuinely sensitive UI is added to this page later.

---

## Accepted Risks Log

| Risk ID  | Threat Ref       | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Accepted By                  | Date       |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------- |
| AR-06-01 | T-06-03          | `processedStripeEvents` idempotency (Phase 2) already prevents webhook replay desync; zero Phase-06 changes to the webhook/subscription-write path (verified via `git log convex/subscriptions.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                         | gsd-security-auditor (audit) | 2026-07-11 |
| AR-06-02 | T-06-05, T-06-06 | **Corrected rationale:** `/settings` is NOT protected by Clerk middleware (plan's original claim was false — verified against `proxy.ts` and `app/[locale]/(app)/layout.tsx`). Risk is accepted anyway because the actual trust boundary — identity-derived `ctx.auth.getUserIdentity()` checks in `getSubscription`/`getMyCredits`/`listMyTopups`, the client `"skip"` sentinel, and the Server Actions' independent `auth()` guard — fully prevents any real data disclosure or mutation for an unauthenticated visitor. Only a generic, non-personalized page shell renders. Hardening the middleware matcher is recommended as non-blocking future work. | gsd-security-auditor (audit) | 2026-07-11 |
| AR-06-03 | T-06-SC          | No new packages installed in Phase 06 (`git log -- package.json` shows no Phase-06 commits).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | gsd-security-auditor (audit) | 2026-07-11 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-07-11 | 7             | 7      | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
