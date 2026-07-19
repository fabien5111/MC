# Maryse Club — Documentation technique

Site de partage de recettes de pâtisserie. Application web full-stack
TypeScript, déployée sur Vercel, avec Supabase comme backend (base de
données, authentification).

## Repères pour travailler sur ce dépôt

- **Production** : la branche `main` est déployée automatiquement sur Vercel
  (projet `mc-snowy`). Ne pousser sur `main` que du code vérifié.
- **Vérification** avant tout push : `npm run typecheck` (et `npm run build`
  pour les changements structurels).
- **Langue** : code commenté en français, UI en français ; les messages de
  commit sont en français.
- **Types Supabase** : ne jamais éditer `lib/database.types.ts` à la main —
  le régénérer (`npm run gen:types` ou workflow GitHub Actions).
- **Images** : stockées en data-URL en base (pas de bucket) — compression
  côté client via `lib/images.ts` / composant `ImageSlot`.

---

## Stack

| Couche | Technologie | Version |
|---|---|---|
| Framework | **Next.js** (App Router, Route Handlers) | 15.x |
| Langage | **TypeScript** (mode strict) | 5.7 |
| UI | **React** (Server + Client Components) | 19 |
| Styles | **Tailwind CSS** (design tokens dans `tailwind.config.ts`) | 3.4 |
| Backend | **Supabase** (PostgreSQL, Auth, RLS) | — |
| Client Supabase | `@supabase/supabase-js` + `@supabase/ssr` (auth par cookies) | 2.x / 0.12 |
| IA | **API Anthropic (Claude)** — import et ajustement de recettes | `claude-sonnet-5` |
| Hébergement | **Vercel** (fonctions serverless, projet `mc-snowy`) | Node 22.x |

## Architecture

```
app/                    Pages et routes (App Router)
├── page.tsx            Accueil
├── connexion/          Connexion / inscription (e-mail + OAuth)
├── creer/              Éditeur de recette (création + édition)
├── recette/[id]/       Fiche recette (+ mode planifié)
├── execution/[id]/     Écran d'exécution guidée d'une recette
├── courses/[id]/       Liste de courses
├── profil/             Profil (recettes, favoris, planning, listes)
├── importer/           Import de recette par IA (URL ou texte)
├── relecture/[id]/     Relecture d'un brouillon importé
├── admin/              Back-office (layout partagé + 5 sous-écrans)
├── api/
│   ├── import-url/     POST — analyse IA d'une recette (URL/texte) → brouillon
│   └── scale-recipe/   POST — coefficient IA d'ajustement des quantités
└── auth/callback/      Callback OAuth / confirmation e-mail

components/             Composants React (client pour l'interactif)
lib/                    Accès données typés + logique métier pure
├── supabase/           Clients navigateur / serveur / middleware
├── database.types.ts   Types générés depuis la base Supabase
└── *.ts                recipes, profile, executions, admin, recipe-plan…
middleware.ts           Auth : protège les routes privées (runtime Node)
```

### Principes

- **Server Components** pour la lecture des données (requêtes Supabase côté
  serveur, RLS appliquée via la session en cookies) ; **Client Components**
  (`'use client'`) pour l'interactivité, avec mutations Supabase côté
  navigateur puis `router.refresh()` pour resynchroniser le rendu serveur.
- **Logique métier pure** isolée dans `lib/` (ex. `recipe-plan.ts`,
  `recipe-view.ts`) : fonctions sans effet de bord, utilisables côté serveur
  comme côté client.
- **Alias d'import** `@/*` → racine du projet (`tsconfig.json`).

## Authentification

- Supabase Auth par **cookies** (`@supabase/ssr`), vérifiable côté serveur.
- Fournisseurs : **e-mail/mot de passe** (avec confirmation par e-mail) et
  **OAuth Google / Facebook** (callback : `/auth/callback`).
- `middleware.ts` (runtime **Node.js**) protège `/profil`, `/creer`,
  `/admin`, `/execution`, `/courses`, `/importer`, `/relecture` → redirection
  vers `/connexion?next=…` si non connecté. Tolérant aux pannes : une erreur
  Supabase transitoire ne bloque pas le site, le contrôle fin restant assuré
  dans chaque page (`requireUser`, `requireAdmin`).
- Rôles applicatifs dans `profiles.role` (`admin` pour le back-office).

## Base de données (Supabase / PostgreSQL)

Types générés dans `lib/database.types.ts` (source de vérité). Tables
principales :

| Domaine | Tables |
|---|---|
| Utilisateurs | `profiles`, `allowlist` |
| Recettes | `recipes`, `recipe_steps`, `step_photos`, `ingredient_groups`, `ingredients`, `recipe_utensils`, `recipe_tags`, `tags`, `difficulties` |
| Référentiels | `units`, `ingredient_refs`, `utensils`, `molds`, `mold_types` |
| Interactions | `favorites`, `comments` |
| Planification | `planning` (avec `overrides` JSON), `executions` (snapshot JSON) |
| Courses | `shopping_lists`, `shopping_list_items` |
| Import IA | `imports` |
| Site | `site_settings` (bannières d'accueil) |

- Sécurité par **Row Level Security** (les requêtes passent par la session
  de l'utilisateur, jamais par une clé service côté front).
- **Images stockées en data-URL** directement en base (compression côté
  client dans `lib/images.ts` — pas de bucket de stockage ni de CDN).
- Régénération des types : `npm run gen:types` (token Supabase requis) ou
  workflow GitHub Actions manuel (`.github/workflows/gen-types.yml`).

## Routes IA (API Anthropic)

- `POST /api/import-url` — analyse une URL ou un texte collé et produit un
  brouillon de recette structuré. `maxDuration = 60 s`, quota journalier
  configurable (`IMPORT_DAILY_QUOTA`, défaut 20).
- `POST /api/scale-recipe` — calcule un coefficient d'ajustement des
  quantités (changement de moule/dimensions). `maxDuration = 30 s`.
- Clé `ANTHROPIC_API_KEY` **côté serveur uniquement** ; modèle configurable
  via `IMPORT_MODEL` (défaut `claude-sonnet-5`).

## Variables d'environnement

| Variable | Rôle | Exposition |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Publique (inlinée au build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase | Publique (inlinée au build) |
| `ANTHROPIC_API_KEY` | API Claude (import / ajustement) | Serveur uniquement |
| `IMPORT_MODEL` | Modèle IA (optionnel) | Serveur uniquement |
| `IMPORT_DAILY_QUOTA` | Quota d'imports/jour (optionnel) | Serveur uniquement |

Modèle local : `.env.local.example` → `.env.local`.

## Déploiement

- **Vercel**, projet `mc-snowy`, branche de production `main`, racine du
  dépôt (framework preset **Next.js**, Node **22.x** — voir `DEPLOY.md`).
- Les variables `NEXT_PUBLIC_*` étant inlinées au build, tout changement
  nécessite un redéploiement **sans cache de build**.
- Côté Supabase : Site URL + Redirect URLs (`https://<domaine>/**`) dans
  Authentication → URL Configuration.

## Commandes

```bash
npm run dev         # serveur de développement (http://localhost:3000)
npm run build       # build de production
npm run start       # serveur de production local
npm run lint        # ESLint (next/core-web-vitals)
npm run typecheck   # tsc --noEmit
npm run gen:types   # régénère lib/database.types.ts depuis la base live
```

---

## Fonctionnalités

<!-- À compléter -->
