# Phase 4: Plan Enforcement - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-10
**Phase:** 4-Plan Enforcement
**Areas discussed:** Note-count scope, Enforcement surface, Upgrade prompt UX, Grace period

---

## Note-count scope

| Option                               | Description                                                                                                                                                                                                               | Selected |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Total notes (root + all descendants) | Every note document owned by the user counts, at any depth. Matches the plain reading of "limited to 20 notes maximum" and is simplest to reason about (one COUNT query on convex's by_owner index, ignoring parentNote). | ✓        |
| Root-level trees only                | Only top-level notes (no parentNote) count toward 20; a user could nest unlimited children under each of their 20 root notes. More generous, but lets a Free user build an effectively unlimited tree.                    |          |

**User's choice:** Total notes (root + all descendants)
**Notes:** None — direct selection.

---

## Enforcement surface

| Option                                   | Description                                                                                                                                                                                                                                                             | Selected |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Enforce on createNote only (Recommended) | Matches the ROADMAP success criteria literally ("21st createNote mutation is rejected"). Leaves a known minor loophole: duplicating a note with children could push a Free user over 20. Simpler, ships faster.                                                         | ✓        |
| Enforce on createNote AND duplicateNote  | Closes the loophole — duplicateNote checks the resulting total against the cap and rejects (or partially blocks) if it would exceed 20. More correct, more implementation work, and behavior on partial-overflow needs its own decision (reject entirely vs. truncate). |          |

**User's choice:** Enforce on createNote only
**Notes:** duplicateNote loophole explicitly accepted as a known limitation, not deferred to a future phase.

---

## Upgrade prompt UX

| Option                                                  | Description                                                                                                                                                                                                                                  | Selected |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Inline error + link, reusing existing dialog error slot | The root-note dialog already has a titleError display slot — show "You've reached your 20-note limit" there with a link to /pricing. For child-note creation, add an equivalent inline message near the '+' control. No new dependency.      |          |
| Dedicated upgrade modal/dialog                          | A distinct Shadcn Dialog pops up (not just an inline error) with plan comparison teaser and a clear "Upgrade to Pro" CTA linking to /pricing. More visually prominent, more implementation work, reuses Dialog primitive already in the app. | ✓        |
| Toast notification                                      | Add a toast library (e.g. sonner) and fire a toast with the upgrade message + CTA. New dependency, but decouples the message from any specific dialog/component.                                                                             |          |

**User's choice:** Dedicated upgrade modal/dialog
**Notes:** Must be reachable from both note-creation call sites (root dialog and tree child-creation).

---

## Grace period

| Option                                    | Description                                                                                                                                                                                        | Selected |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Only 'active' counts as Pro (Recommended) | past_due and canceled are both treated as Free tier — simplest rule, matches "Stripe is the source of authority" constraint (no separate grace-period logic to build or reason about).             | ✓        |
| 'active' and 'past_due' both count as Pro | Gives users a grace period while Stripe retries the failed payment before they lose Pro access. Softer UX, but adds a second status branch and needs its own definition of when grace period ends. |          |

**User's choice:** Only 'active' counts as Pro
**Notes:** None — recommended option selected directly.

---

## Claude's Discretion

- Exact wording/copy of the upgrade modal
- Exact shape of the "limit exceeded" error thrown by createNote (as long as it's distinguishable from other note errors client-side)
- Whether Free/Pro resolution in createNote is a new shared helper function or inline query logic

## Deferred Ideas

- **duplicateNote limit enforcement** — considered and explicitly rejected for this phase (see Enforcement surface above), not deferred to a future phase; documented as an accepted known loophole.
- **Grace period for past_due subscriptions** — considered and explicitly rejected (see Grace period above), not deferred; Stripe's own retry/dunning cycle (ending in `customer.subscription.deleted`) is the only "grace" mechanism.
