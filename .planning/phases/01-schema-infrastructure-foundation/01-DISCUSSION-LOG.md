# Phase 1: Schema + Infrastructure Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 1 — Schema + Infrastructure Foundation
**Areas discussed:** User-subscription linkage, Env var setup scope, Middleware exclusion, Stub file depth

---

## User-Subscription Linkage

| Option | Description | Selected |
|--------|-------------|----------|
| clerkUserId string | Store clerkUserId: v.string() directly. Webhook processing is simple — write clerkUserId straight from Stripe metadata. Queries in later phases look up subscriptions by clerkUserId index. No cross-table join needed. | ✓ |
| v.id("users") reference | Store a Convex internal user ID. Webhook must first find the users row by tokenIdentifier, then write the subscription with the Convex ID. Allows Convex relational joins but adds one DB read per webhook event. | |
| Both (clerkUserId + v.id("users")) | Store both fields. Webhook sets clerkUserId directly; background/sync process populates the Convex user reference. Most flexible but two fields to maintain in sync. | |

**User's choice:** clerkUserId string (Recommended)
**Notes:** Webhook processing simplicity preferred; avoids extra DB read per webhook event. All subsequent phases will query by clerkUserId index.

---

## Env Var Setup Scope

### Q1: Create real Stripe products in test mode?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — create real Price IDs | Phase 1 sets up everything end-to-end: create products in Stripe Dashboard test mode, capture real Price IDs, set all vars in .env.local, Vercel staging, and Vercel production. | ✓ |
| No — placeholders only | Set placeholder values; Phase 3 handles Stripe Dashboard setup. Risk: Phase 3 has a manual prerequisite step. | |

**User's choice:** Yes — create real Price IDs
**Notes:** Eliminates the Phase 3 blocker noted in STATE.md. Phase 1 executor will need Stripe Dashboard access.

### Q2: Documentation approach for 3 webhook secrets

| Option | Description | Selected |
|--------|-------------|----------|
| CONTEXT.md + .env.example | Create .env.example listing all required vars with comments. CONTEXT.md explains the 3-secret pattern. | ✓ |
| CONTEXT.md only | Document the 3-secret requirement in CONTEXT.md only. | |

**User's choice:** CONTEXT.md + .env.example
**Notes:** .env.example added to repo for onboarding clarity.

---

## Middleware Exclusion

| Option | Description | Selected |
|--------|-------------|----------|
| isPublicRoute matcher | Add createRouteMatcher(["/api/webhooks/(.*)"]) and skip auth.protect() for matching routes. Additive, keeps /dashboard protection. | ✓ |
| Matcher config exclusion | Remove /api/webhooks from middleware matcher config via negative lookahead. Simpler body but risks side effects on other API routes. | |

**User's choice:** isPublicRoute matcher (Recommended)
**Notes:** User selected the code preview showing explicit isPublicRoute check in the middleware handler.

---

## Stub File Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Typed signatures, no implementations | Export named functions with correct arg/return types but throw NotImplementedError. Phase 2 fills in bodies. Catches type mismatches early. | ✓ |
| Minimal — empty exports only | Just enough to compile. Phase 2 builds from scratch. | |

**User's choice:** Typed signatures, no implementations (Recommended)
**Notes:** Type contracts between phases established in Phase 1. Reduces Phase 2 schema surprises.

---

## Claude's Discretion

- Field names for the 4 new tables (subscriptions, aiCredits, creditTransactions, processedStripeEvents) — Claude proposed; user did not override
- Specific mutation/query names for stubs (getSubscription, upsertSubscription, getCredits, deductCredit, resetCredits, addCredits)
- `processedStripeEvents` storing `eventType` + `processedAt` beyond just the idempotency key

## Deferred Ideas

None — discussion stayed within phase scope.
