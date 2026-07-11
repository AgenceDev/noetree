---
phase: 4
slug: plan-enforcement
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary                                            | Description                                                                                                                                                    | Data Crossing                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| client → Convex `createNote` mutation               | Untrusted client input (note args) and untrusted client-side plan state cross into the server. The client may bypass any UI limit check.                       | Note creation args; must not carry plan/tier authority                 |
| `createNote` → `subscriptions` table (via identity) | Plan/tier authority must derive from the authenticated identity, never from client-supplied data.                                                              | Clerk identity (`ctx.auth.getUserIdentity()`) → `subscriptions.status` |
| server error → client `onError`                     | The client trusts the error signal to decide whether to show the upgrade modal. UX-only boundary; the actual note-creation block already happened server-side. | `ConvexError.data` string (`"NOTE_LIMIT_REACHED"`)                     |
| n/a (client-only UI)                                | `UpgradeModal` renders static, translated copy and a same-app `/pricing` link only. No user-specific or sensitive data is rendered.                            | Static i18n strings only                                               |

---

## Threat Register

| Threat ID | Category               | Component                              | Disposition | Mitigation                                                                                                                                                                                                                                | Status |
| --------- | ---------------------- | -------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| T-04-01   | Elevation of Privilege | `createNote` note-limit gate           | mitigate    | Server-side 20-note cap enforced inside the `createNote` mutation handler itself (`convex/notes.ts`), independent of any client UI state.                                                                                                 | closed |
| T-04-02   | Spoofing / IDOR        | `isProUser` plan resolution            | mitigate    | Pro status resolved exclusively from `ctx.auth.getUserIdentity().subject` via `subscriptions.by_clerkUserId` — never from a client-supplied plan/status argument (`convex/helpers/helper.ts`).                                            | closed |
| T-04-03   | Denial of Service      | Count query on notes by owner          | accept      | `.take(FREE_NOTE_LIMIT + 1)` bounds the per-request scan to O(21) rows regardless of how many notes a user owns.                                                                                                                          | closed |
| T-04-04   | Information Disclosure | `UpgradeModal` content                 | accept      | Modal renders only public, static i18n plan copy and a `/pricing` link — no PII, no secrets, no user-specific data.                                                                                                                       | closed |
| T-04-05   | Tampering              | Client error-signal branch (`onError`) | accept      | Client keys the modal-open decision off a `ConvexError` data code; this is a UX signal only. The security boundary is the server gate (T-04-01) — no client-side tampering with this signal can allow a Free user to exceed the note cap. | closed |

_Status: open · closed_
_Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)_

### Verification Evidence

| Threat ID | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04-01   | `convex/notes.ts:531-561` — `createNote` handler: after `getUser`/`!user` throw and before `ctx.db.insert`, calls `isProUser(ctx)`; if not Pro, queries `by_owner` bounded to `FREE_NOTE_LIMIT + 1` and throws `ConvexError("NOTE_LIMIT_REACHED")` when `ownedNotes.length >= FREE_NOTE_LIMIT`. `FREE_NOTE_LIMIT = 20` at `convex/notes.ts:6`.                                                                                                                                                                                                                                                                                         |
| T-04-02   | `convex/helpers/helper.ts:27-41` — `isProUser` calls `ctx.auth.getUserIdentity()`, returns `false` if null, otherwise looks up `subscriptions` via `.withIndex("by_clerkUserId", q => q.eq("clerkUserId", identity.subject))` and returns `subscription?.status === "active"`. No client-supplied argument accepted.                                                                                                                                                                                                                                                                                                                   |
| T-04-03   | `convex/notes.ts:549-552` — `.query("notes").withIndex("by_owner", q => q.eq("owner", user._id)).take(FREE_NOTE_LIMIT + 1)`; no `.collect()` used for the count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| T-04-04   | `components/UpgradeModal.tsx:1-46` — props are only `{ open, onOpenChange }` (booleans/callback); body renders `useTranslations("PlanEnforcement")` keys (`title`, `body`, `dismiss`, `upgradeCta`) and a static `<Link href="/pricing">`. No user data passed in or rendered.                                                                                                                                                                                                                                                                                                                                                         |
| T-04-05   | `hooks/useNoteMutations.ts:82-84` and `app/[locale]/(app)/notes/page.tsx:673-675` — both `onError` handlers check `err instanceof ConvexError && err.data === "NOTE_LIMIT_REACHED"` before calling `upgradeModal.open()`, and both preserve the pre-existing optimistic-revert logic unconditionally beforehand. Note: implementation was gap-closure-corrected from an initial bare `Error`/`err.message` check (which is redacted crossing the real Convex client/server boundary) to `ConvexError`/`err.data` during 04-04 human verification (commit `f2a7f06`) — the corrected pattern is what ships and is what's verified here. |

---

## Accepted Risks Log

| Risk ID  | Threat Ref | Rationale                                                                                                                                                                                                                                                                                                                                                                                 | Accepted By                           | Date       |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ---------- |
| AR-04-01 | T-04-03    | Bounding the Free-tier count query with `.take(FREE_NOTE_LIMIT + 1)` keeps per-request cost constant (O(21)) regardless of total notes owned; this is a complete mitigation for the DoS vector described, not a residual risk requiring further work, but is logged as `accept` per the plan's own disposition since no further hardening (e.g. rate limiting) was scoped for this phase. | gsd-security-auditor (phase-04 audit) | 2026-07-11 |
| AR-04-02 | T-04-04    | `UpgradeModal` is confirmed to render only static, translated plan copy and a same-app navigation link — no PII or user-specific data is ever passed as props or read from context. Accepted as out-of-scope for further mitigation.                                                                                                                                                      | gsd-security-auditor (phase-04 audit) | 2026-07-11 |
| AR-04-03 | T-04-05    | The client-side `ConvexError.data === "NOTE_LIMIT_REACHED"` branch is a UX affordance only; confirmed the server-side gate (T-04-01) is the sole enforcement point and does not depend on this client check. A spoofed or absent signal can at worst suppress the upgrade prompt, never bypass the note cap. Accepted as designed.                                                        | gsd-security-auditor (phase-04 audit) | 2026-07-11 |

_Accepted risks do not resurface in future audit runs._

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By               |
| ---------- | ------------- | ------ | ---- | -------------------- |
| 2026-07-11 | 5             | 5      | 0    | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
