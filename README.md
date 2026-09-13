# Je pâtisse !

Site de partage de recettes de pâtisserie. **Next.js App Router + TypeScript +
Tailwind CSS**, sur une pile Supabase auto-hébergée chez Infomaniak (auth,
base de données).

## Stack

- **Next.js 15** (App Router, Route Handlers)
- **TypeScript** (strict)
- **Tailwind CSS 3** — design system dans `tailwind.config.ts`
- **PostgreSQL 17.6**, **GoTrue** et **PostgREST** auto-hébergés sur Virtuozzo
  Cloud (Infomaniak), joints par `@supabase/ssr` — auth par cookies,
  vérifiable côté serveur (`lib/supabase/{client,server,middleware}.ts`). Le
  client reste `@supabase/supabase-js` : c'est la même API, sans le service
  managé.
- **Stockage objet Swift** (Infomaniak Public Cloud) pour les photos, en dépôt
  signé direct navigateur → conteneur (`lib/storage*.ts`)

## Démarrer

```bash
npm install
cp .env.local.example .env.local   # puis renseigner ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

## Routes API

- `POST /api/import-url` — import de recette (texte collé) → brouillon
- `POST /api/scale-recipe` — coefficient d'ajustement des quantités (IA)

Auth/RLS via la session (cookies).

## Types de la base

`lib/database.types.ts` est la source de vérité pour les types de la base — à
régénérer, jamais à éditer à la main.

La base n'est plus un projet Supabase managé : la génération passe désormais
par une **chaîne de connexion PostgreSQL**, et non plus par une référence de
projet. Comme le port 5432 n'est pas exposé en production, il faut ouvrir un
**Endpoint temporaire** sur le nœud PostgreSQL le temps de l'opération, puis
le refermer.

```bash
export GEN_TYPES_DB_URL=postgresql://postgres:<mdp>@<hôte>:<port>/postgres
npm run gen:types                          # écrase lib/database.types.ts
npm run typecheck                          # repérer les écarts éventuels
```

Un workflow GitHub Actions (`.github/workflows/gen-types.yml`, lancement
manuel) fait la même chose et committe le résultat sur la branche choisie ;
son en-tête décrit le mode opératoire complet, Endpoint compris.

## Variables d'environnement

Voir `.env.local.example`. `ANTHROPIC_API_KEY` reste **côté serveur
uniquement** (jamais de préfixe `NEXT_PUBLIC_`).

## Déploiement

Voir `DEPLOY.md`.
