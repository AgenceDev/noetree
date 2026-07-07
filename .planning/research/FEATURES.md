# Feature Landscape: Noetree Monetisation v1.0

**Domain:** Freemium SaaS note-taking app with AI credits
**Researched:** 2026-07-07
**Confidence:** HIGH (corroborated across Stripe docs, competitor analysis, SaaS UX research)

---

## Table Stakes

Features users expect in any Free/Pro note-taking SaaS. Missing = product feels unfinished or untrustworthy.

| Feature | Why Expected | Complexity | Depends On |
|---------|--------------|------------|------------|
| Pricing page (Free vs Pro) | Users won't subscribe without understanding what they get | Low | None |
| Hard note limit enforcement on Free | Without enforcement, the free tier has no upgrade pressure | Medium | Convex note count query + Clerk userId |
| Upgrade prompt at limit | Industry standard (Evernote, Notion): warn before hard block | Low | Note limit enforcement |
| In-app subscription confirmation | Users expect instant feedback after payment; no confirmation = distrust | Low | Stripe webhook → Convex |
| Cancel subscription from app | Stripe Portal or custom UI — users refuse apps where cancellation requires email | Medium | Stripe API + Convex status update |
| Settings/Billing page showing plan + renewal date | Standard: every SaaS shows current plan, next billing date, status | Medium | Convex subscription record |
| Webhook idempotency | Stripe retries webhooks; double-processing a credit grant or plan upgrade causes real bugs | High | Convex mutation deduplication |
| Real-time plan enforcement | After webhook fires, the app must reflect the new plan without page reload | Medium | Convex reactive queries |

---

## Differentiators

Features not universally expected but meaningfully valued for Noetree's specific model.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI credits balance visible in-app | Transparency reduces support tickets and increases trust in metered usage | Low | Convex `credits` field on user/subscription record |
| Credits top-up via Stripe Checkout | Lets Pro users extend AI usage without upgrading plan tier — unlocks usage monetization on top of subscription | Medium | Separate Stripe Price (one-time), `checkout.session.completed` webhook |
| Monthly credits auto-reset | Predictability: users know what to expect each billing cycle | Medium | Convex scheduled function or webhook on `invoice.payment_succeeded` |
| Top-up purchase history | Builds trust, helps users track spend, reduces "where did my credits go" support | Low | Log `credits_transactions` table in Convex |
| Low-credits nudge | Proactively surface top-up before user hits zero mid-session — reduces frustration | Low | Convex reactive query with threshold check |
| Upgrade prompt framed as opportunity | "You've unlocked a Pro feature" > "You've hit the free limit" — measurably better conversion | Low | Copy/UX decision only, no extra code |

---

## Anti-Features

Features to explicitly NOT build in v1.0, with rationale.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Stripe Customer Portal (native) | Decided out of scope (PROJECT.md): poor UX cohesion, harder to style to match dark mode / Shadcn | Build custom Settings/Billing page |
| Credit expiry with short windows | Stigg research: short expiry creates resentment, support burden, bad reviews | Either no expiry on top-up credits or 12+ month window |
| Aggressive mid-session interruption when credits hit zero | Users in flow should not be blocked with a full-screen modal mid-edit | Show a dismissable banner; block only on next AI action attempt |
| Manual refund UI | Stripe handles this; building custom refund logic is high complexity, low value | Direct users to support email or Stripe's automated flow |
| Unlimited credit rollover on Free plan | Free has no AI credits — no rollover logic needed | Only Pro credits roll over (or reset) |
| Teams/seats management | Out of scope (PROJECT.md) | Deferred to v2 |
| Dunning / failed payment retry UI | Stripe handles dunning natively with email; building in-app dunning is overkill for v1 | Let Stripe manage failed payments |
| Plan downgrade enforcement (notes over limit) | Deciding what happens to 25 notes when user downgrades from Pro adds complexity | On downgrade: keep existing notes readable, block creation until under 20 |

---

## Feature Dependencies

```
Clerk userId
  └─→ Stripe Customer (createCustomer on first checkout)
        ├─→ Stripe Subscription (PAY-01)
        │     └─→ Convex `subscriptions` record (PAY-03 webhook)
        │           ├─→ Plan enforcement: note limit (PLAN-02/03)
        │           ├─→ Settings page: plan + renewal (SET-01/02)
        │           ├─→ Cancel flow (PAY-04, SET-04)
        │           └─→ Monthly credits reset (CRED-01)
        └─→ Stripe one-time credits checkout (PAY-05)
              └─→ Convex credits += amount (CRED-03)
                    ├─→ Credits display (CRED-02, SET-05)
                    ├─→ Credits deduction on AI use (CRED-04)
                    └─→ Top-up history log (SET-05)

Upgrade prompt (PLAN-04) depends on:
  - Note count query (already exists in Convex)
  - Plan enforcement check (PLAN-02)
```

---

## MVP Recommendation

Prioritize in this order, matching required complexity gates:

1. **Pricing page (PLAN-01)** — Zero backend, establishes value prop, unblocks user testing
2. **Note limit enforcement + upgrade prompt (PLAN-02, PLAN-04)** — Creates upgrade pressure; can ship before Stripe is wired up using a stub `isPro` flag
3. **Stripe Checkout subscription (PAY-01)** — Core monetization path; everything downstream depends on this
4. **Webhook → Convex subscription record (PAY-03)** — Must ship with PAY-01; no deferral
5. **Settings page: plan + renewal + cancel (SET-01, SET-02, SET-04, PAY-04)** — Needed for trust and legal compliance (ability to cancel)
6. **Monthly AI credits display + reset (PLAN-05, CRED-01, CRED-02)** — Pro value delivery
7. **AI credit deduction on use (CRED-04)** — Required for credits to mean anything
8. **Credits top-up checkout + history (PAY-05, CRED-03, SET-05)** — Secondary revenue stream; can ship after core subscription is stable

Defer (not in v1.0): pause subscription, prorated downgrade enforcement, low-credits email notifications.

---

## Expected User Behaviors

Based on freemium SaaS research (Stigg, Appcues, Lago):

**Free tier users:**
- Will hit 20-note limit within the first 1-2 sessions if they're genuinely engaged
- Expect a clear, non-punitive explanation of the limit (not a red error)
- Convert best when the upgrade prompt shows the specific feature/action they were trying to take

**Pro subscribers:**
- Will check the Settings page once after subscribing, then almost never unless something breaks
- Expect the renewal date to be clearly visible (reduces "unexpected charge" support tickets)
- Will use cancel as a button to test ease-of-exit — if cancellation is hard, they'll dispute the charge instead

**Credits users:**
- AI credit balance must be visible near the AI feature entry point (not buried in settings)
- Will not notice credits running low unless the app tells them — passive depletion without warning kills trust
- Top-up intent is impulsive: the flow from "I want more credits" to Stripe checkout should be under 3 clicks

---

## Phase-Specific Complexity Notes

| Requirement Group | Complexity | Key Reason |
|-------------------|------------|------------|
| PLAN-01: Pricing page | Low | Static or near-static UI |
| PLAN-02/03/04: Note limits + prompts | Low-Medium | Convex query exists; enforcement is a count check |
| PAY-01/02/03: Stripe Checkout + webhook | High | Webhook idempotency, Clerk↔Stripe customer ID linking, signature verification |
| PAY-04/SET-04: Cancel | Medium | Stripe subscription update API + Convex sync |
| PAY-05/CRED-03: Top-up checkout | Medium | Reuses Checkout pattern but needs separate Price ID; credits arithmetic must be atomic |
| CRED-01: Monthly reset | Medium | Requires Convex scheduled action or reliable `invoice.payment_succeeded` event handling |
| CRED-04: Deduction on AI use | Medium | Server-side only (never trust client); must be atomic with the AI action |
| SET-01/02/03/05: Settings page | Low-Medium | UI assembly of Convex data; upgrade path reuses PAY-01 flow |

---

## Sources

- Stripe credits model guide: https://stripe.com/resources/more/what-is-a-credits-based-subscription-model-and-how-does-it-work
- Stripe SaaS integration: https://docs.stripe.com/saas
- Stigg AI credits implementation: https://www.stigg.io/blog-posts/weve-built-ai-credits-and-it-was-harder-than-we-expected
- Convex + Stripe pattern: https://stack.convex.dev/stripe-with-convex
- Freemium upgrade prompt UX: https://www.appcues.com/blog/best-freemium-upgrade-prompts
- SaaS subscription management best practices: https://getlago.com/blog/subscription-management-best-practices-and-strategies
- Note-taking app pricing comparison: https://www.stackscored.com/pricing/note-taking/
- Credit-based pricing for AI SaaS: https://getlago.com/blog/6-proven-pricing-models-for-ai-saas
- Chargebee prepaid credits guide: https://www.chargebee.com/pricing-labs/prepaid-credit-pricing-guide/
