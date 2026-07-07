---
milestone: v1.0
name: Monétisation & Paiements
status: planning
progress:
  phases_total: 6
  phases_complete: 0
  current_phase: 1
---

## Current Position

Phase: 1 of 6 (Schema + Infrastructure Foundation)
Plan: — of — in current phase
Status: Ready to plan
Last activity: 2026-07-07 — Roadmap created, 6 phases defined, 19/19 requirements mapped

Progress: [░░░░░░░░░░] 0%

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07)

**Core value:** Un utilisateur peut créer, organiser et naviguer dans ses notes en structure arborescente.
**Current focus:** Phase 1 — Schema + Infrastructure Foundation

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
| ----- | ----- | ----- | -------- |
| -     | -     | -     | -        |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Pro plan 9€/month, 100 AI credits/month quota, top-up 50 credits for 2€, 1 credit = 1 AI action, Free tier max 20 notes
- Architecture: Webhook handler in Next.js API route (not Convex HTTP action); clerkUserId in BOTH session.metadata AND subscription_data.metadata; credit deduction is single atomic Convex mutation; Free tier enforcement is in Convex mutations server-side; credits reset driven by invoice.paid not calendar cron

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 1 requires Stripe Price IDs to be created in Stripe Dashboard (test mode) before Phase 3 coding — do this during Phase 1 env var setup
- Three webhook secrets needed (CLI, staging, production) — document separately per environment
- Verify `billing_reason === "subscription_cycle"` field name at implementation time (Stripe has renamed fields before)

## Deferred Items

| Category | Item | Status | Deferred At |
| -------- | ---- | ------ | ----------- |
| _(none)_ |      |        |             |

## Session Continuity

Last session: 2026-07-07
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-schema-infrastructure-foundation/01-CONTEXT.md
