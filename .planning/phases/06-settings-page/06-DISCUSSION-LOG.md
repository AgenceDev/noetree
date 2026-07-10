# Phase 6: Settings Page - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 6-Settings Page
**Areas discussed:** Cancel subscription UX, Navigation & page location, Credit history scope, Page layout & sections

---

## Cancel Subscription UX

| Option      | Description                                                                                | Selected |
| ----------- | ------------------------------------------------------------------------------------------ | -------- |
| AlertDialog | Shadcn's alert-dialog.tsx, unused so far, semantically built for destructive confirmations | ✓        |
| Dialog      | Reuses the same primitive as UpgradeModal.tsx/CreditsExhaustedDialog.tsx                   |          |
| You decide  | Let Claude pick during planning                                                            |          |

**User's choice:** AlertDialog

| Option                         | Description                                                       | Selected |
| ------------------------------ | ----------------------------------------------------------------- | -------- |
| Yes, add "Resume subscription" | Undo pending cancellation via Stripe API, no new Checkout Session | ✓        |
| No, cancellation is final      | User must wait for lapse then re-subscribe via normal checkout    |          |

**User's choice:** Yes, add "Resume subscription"

| Option                                         | Description                         | Selected |
| ---------------------------------------------- | ----------------------------------- | -------- |
| "Cancels on [date]" + Resume button            | Matches ROADMAP SC3 wording exactly | ✓        |
| "Active until [date], then downgrades to Free" | More explicit about end-state       |          |
| You decide                                     | Let Claude choose exact wording     |          |

**User's choice:** "Cancels on [date]" + Resume button

---

## Navigation & Page Location

| Option                                  | Description                                                   | Selected |
| --------------------------------------- | ------------------------------------------------------------- | -------- |
| New "Settings" item in NavUser dropdown | Route under (app)/settings, new dropdown item above "Account" | ✓        |
| Persistent sidebar nav item             | Top-level sidebar item instead                                |          |
| You decide                              | Let Claude pick placement                                     |          |

**User's choice:** New "Settings" item in NavUser dropdown

| Option                          | Description                                                           | Selected |
| ------------------------------- | --------------------------------------------------------------------- | -------- |
| Separate items                  | Keep "Account" (Clerk profile) distinct from new "Settings" (billing) | ✓        |
| Merge into one "Settings" entry | Replace "Account", link out to Clerk profile from the new page        |          |

**User's choice:** Separate items

| Option                              | Description                                | Selected |
| ----------------------------------- | ------------------------------------------ | -------- |
| Visible to both Free and Pro        | Free sees Upgrade CTA + zero-credits state | ✓        |
| Pro-only, redirect Free to /pricing | Simpler but contradicts SET-01/SET-03      |          |

**User's choice:** Visible to both Free and Pro

---

## Credit History Scope

| Option                                | Description                                                            | Selected |
| ------------------------------------- | ---------------------------------------------------------------------- | -------- |
| Top-up purchases only                 | Filters creditTransactions to type === "topup", matches SET-05 wording | ✓        |
| Full transaction ledger (all 4 types) | Shows deductions/resets/refunds too — more than SET-05 asked for       |          |

**User's choice:** Top-up purchases only

| Option                                    | Description                                                    | Selected |
| ----------------------------------------- | -------------------------------------------------------------- | -------- |
| New identity-derived query, no pagination | Mirrors getMyCredits' IDOR-safe pattern, full unpaginated list | ✓        |
| Paginated query                           | Convex paginate(), more future-proof but unneeded added UI     |          |

**User's choice:** New identity-derived query, no pagination

---

## Page Layout & Sections

| Option                        | Description                                                 | Selected |
| ----------------------------- | ----------------------------------------------------------- | -------- |
| Single page, stacked sections | Plan Card above Credits Card, reuses components/ui/card.tsx | ✓        |
| Tabbed sections               | Shadcn Tabs, not used elsewhere in this app                 |          |

**User's choice:** Single page, stacked sections

| Option                                       | Description                                                 | Selected |
| -------------------------------------------- | ----------------------------------------------------------- | -------- |
| Plan name + Upgrade CTA only                 | No inline feature comparison, links to /pricing for details | ✓        |
| Plan name + feature comparison + Upgrade CTA | Duplicates /pricing's comparison table into Settings        |          |

**User's choice:** Plan name + Upgrade CTA only

---

## Claude's Discretion

- Exact AlertDialog copy/wording for cancel confirmation and post-cancel/post-resume messaging
- Exact icon and position of the new "Settings" NavUser dropdown item
- Exact layout details within each Card (spacing, field ordering, date formatting)
- Exact naming of the new Server Actions (cancel/resume) and the new Convex query

## Deferred Ideas

None — discussion stayed within phase scope. A full transaction ledger and a tabbed page layout were considered and explicitly rejected in favor of the simpler approach, not deferred as future work.
