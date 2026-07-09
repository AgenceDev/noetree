# Deferred Items — Phase 03 (Checkout Flow + Pricing Page)

| Category | Item | Status | Deferred At |
| -------- | ---- | ------ | ----------- |
| Out-of-scope test failure | `app/[locale]/(marketing)/pricing/actions.test.ts` fails with `Cannot find module './actions'` — the Server Action (`app/[locale]/(marketing)/pricing/actions.ts`) it targets does not exist yet in this worktree. The test file is a Wave 0 RED scaffold (commit `02b4619`, plan 03-01) for a different plan (pricing page + Server Action, not plan 03-03/checkout-success). Not touched by plan 03-03. | Deferred — belongs to the plan that implements `pricing/actions.ts` | Plan 03-03 execution |
