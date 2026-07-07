# Noetree

## What This Is

Noetree est une application web de prise de notes hiérarchique (style Notion/Obsidian) où les utilisateurs créent et organisent des notes en arborescence. L'app cible les individus qui veulent structurer leur connaissance dans une interface épurée. Construite avec Next.js, Convex (backend temps réel) et Shadcn UI.

## Core Value

Un utilisateur peut créer, organiser et naviguer dans ses notes en structure arborescente — la navigation et la hiérarchie doivent toujours fonctionner.

## Current Milestone: v1.0 Monétisation & Paiements

**Goal :** Intégrer Stripe pour monétiser Noetree via un modèle Free/Pro avec quota de crédits IA rechargeables.

**Target features :**

- Plans Free (notes limitées + features basiques) et Pro (illimité + features avancées)
- Abonnement mensuel via Stripe Checkout
- Quota mensuel de crédits IA inclus dans Pro, rechargeable par top-up
- Webhooks Stripe → mise à jour statut abonnement dans Convex
- Page Settings in-app : gérer abonnement, voir crédits, top-up

## Requirements

### Validated

<!-- Fonctionnalités livrées et confirmées. -->

- ✓ Authentification utilisateur (Clerk) — v0.x
- ✓ CRUD notes avec Convex (créer, lire, mettre à jour, supprimer) — v0.x
- ✓ Structure arborescente des notes (parent/enfant) — v0.x
- ✓ Drag & drop des nœuds dans l'arbre — v0.x
- ✓ Éditeur de texte riche avec panneaux redimensionnables (Shadcn Resizable) — v0.x
- ✓ Dark mode — v0.x
- ✓ CI/CD GitHub Actions + Vercel (staging/production) — v0.x

### Active

<!-- Scope actuel — milestone v1.0. -->

- [ ] User can view pricing page (Free vs Pro plans)
- [ ] Free tier user is limited to 20 notes maximum
- [ ] Pro tier user has unlimited notes
- [ ] User can subscribe to Pro via Stripe Checkout
- [ ] Stripe webhooks update subscription status in Convex
- [ ] User can cancel Pro subscription
- [ ] Pro user receives monthly AI credits quota
- [ ] User can purchase AI credits top-up via Stripe
- [ ] User can view and manage subscription in Settings page

### Out of Scope

- Plan Business/Teams — complexité équipe hors scope pour v1.0
- Marketplace de vente de notes — futur milestone, nécessite plus de maturité produit
- Portail Stripe natif — UI custom dans l'app choisie à la place
- Remboursements / prorations manuels — Stripe gère automatiquement

## Context

- **Stack :** Next.js 15 App Router, Convex (real-time DB + backend functions), Shadcn UI, Clerk auth, Tailwind CSS
- **Déploiement :** Vercel (production depuis tags git, staging depuis dev)
- **État actuel :** App fonctionnelle avec auth, notes tree, éditeur. Branche `dev` active avec 2 commits locaux divergeant de origin/dev (58 commits distants non mergés)
- **Paiements :** Aucune intégration existante — greenfield dans le projet

## Constraints

- **Tech stack :** Next.js + Convex — les webhooks Stripe doivent être des routes API Next.js
- **Auth :** Clerk gère l'identité — le `userId` Clerk doit être lié à l'abonnement Stripe
- **Temps réel :** Convex est le store de vérité pour le statut d'abonnement, Stripe est la source d'autorité
- **Sécurité :** Webhook signature verification obligatoire (Stripe-Signature header)

## Key Decisions

| Decision                              | Rationale                                                   | Outcome   |
| ------------------------------------- | ----------------------------------------------------------- | --------- |
| Stripe comme provider                 | Maturité, webhooks robustes, support abonnements + one-time | — Pending |
| UI custom (pas Stripe Portal)         | Meilleure cohérence UX dans l'app                           | — Pending |
| Convex pour stocker statut abonnement | Temps réel, cohérent avec le reste du stack                 | — Pending |
| Modèle hybride Free/Pro + crédits     | Monétisation flexible : récurrent + usage IA                | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-07-07 — Milestone v1.0 initialized_
