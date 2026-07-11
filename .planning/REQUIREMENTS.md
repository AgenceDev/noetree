# Requirements: Noetree

**Defined:** 2026-07-07
**Core Value:** Un utilisateur peut créer, organiser et naviguer dans ses notes en structure arborescente.

## v1.0 Requirements — Monétisation & Paiements

### Plans

- [ ] **PLAN-01**: User can view a pricing page showing Free and Pro plans with their features
- [ ] **PLAN-02**: Free tier user is blocked from creating more than 20 notes
- [ ] **PLAN-03**: Pro tier user can create unlimited notes
- [ ] **PLAN-04**: Free tier user sees an upgrade prompt when hitting note limit or accessing Pro features
- [x] **PLAN-05**: Pro tier includes a defined monthly AI credits quota

### Paiements

- [ ] **PAY-01**: User can subscribe to Pro plan via Stripe Checkout
- [ ] **PAY-02**: User receives in-app confirmation after successful subscription activation
- [x] **PAY-03**: Stripe webhooks update subscription status in Convex in real time
- [ ] **PAY-04**: User can cancel Pro subscription from within the app
- [x] **PAY-05**: User can purchase AI credits top-up via Stripe Checkout (one-time payment)

### Crédits IA

- [x] **CRED-01**: Pro user's monthly AI credits quota resets automatically on billing date
- [x] **CRED-02**: User can view remaining AI credits balance in the app
- [x] **CRED-03**: User can trigger a top-up purchase when credits are low
- [x] **CRED-04**: AI credits are deducted when AI features are used (consumed server-side)

### Settings

- [x] **SET-01**: User can view current plan (Free or Pro) in a settings/billing page
- [ ] **SET-02**: User can view subscription renewal date and status in settings
- [ ] **SET-03**: User can upgrade from Free to Pro directly from settings
- [ ] **SET-04**: User can cancel subscription from settings with confirmation dialog
- [ ] **SET-05**: User can view AI credits balance and top-up history in settings

## v2 Requirements (Deferred)

### Marketplace

- **MKT-01**: User can list a note for sale in a marketplace
- **MKT-02**: User can purchase a note from another user
- **MKT-03**: Revenue sharing between seller and platform

### Teams

- **TEAM-01**: Team/Business plan with multiple seats
- **TEAM-02**: Shared notes and collaboration
- **TEAM-03**: Team billing and seat management

## Out of Scope

| Feature                       | Reason                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| Plan Business/Teams           | Complexité multi-seats hors scope v1.0 — dédié milestone futur        |
| Marketplace de notes          | Produit à part entière — nécessite maturité et confiance utilisateurs |
| Portail Stripe natif          | UI custom dans l'app choisie pour cohérence UX                        |
| Remboursements manuels        | Stripe gère automatiquement via son dashboard                         |
| Webhooks pour failed payments | Stripe retry logic intégrée, notifications email gérées par Stripe    |

## Traceability

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| PLAN-01     | Phase 3 | Pending  |
| PLAN-02     | Phase 4 | Pending  |
| PLAN-03     | Phase 4 | Pending  |
| PLAN-04     | Phase 4 | Pending  |
| PLAN-05     | Phase 1 | Complete |
| PAY-01      | Phase 3 | Pending  |
| PAY-02      | Phase 3 | Pending  |
| PAY-03      | Phase 2 | Complete |
| PAY-04      | Phase 6 | Pending  |
| PAY-05      | Phase 5 | Complete |
| CRED-01     | Phase 2 | Complete |
| CRED-02     | Phase 5 | Complete |
| CRED-03     | Phase 5 | Complete |
| CRED-04     | Phase 5 | Complete |
| SET-01      | Phase 6 | Complete |
| SET-02      | Phase 6 | Pending  |
| SET-03      | Phase 6 | Pending  |
| SET-04      | Phase 6 | Pending  |
| SET-05      | Phase 6 | Pending  |

**Coverage:**

- v1.0 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---

_Requirements defined: 2026-07-07_
_Last updated: 2026-07-07 — Traceability populated by roadmapper, all 19 requirements mapped to phases 1-6_
