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

La base n'est plus un projet Supabase managé : la génération passe par une
**chaîne de connexion PostgreSQL**. Le port 5432 n'étant pas exposé, le
workflow GitHub Actions « Régénérer les types de la base »
(`.github/workflows/gen-types.yml`, lancement manuel) passe par le nœud
applicatif en SSH et ouvre une pull request avec le résultat — aucun Endpoint
à ouvrir. Mise en place et rôle `gen_types` : `DEPLOY.md` § « Régénérer les
types de la base ».

```bash
# Contre une base joignable directement (locale, par exemple) :
export GEN_TYPES_DB_URL=postgresql://<user>:<mdp>@<hôte>:<port>/postgres
npm run gen:types                          # écrase lib/database.types.ts
npm run typecheck                          # repérer les écarts éventuels
```

## Variables d'environnement

Voir `.env.local.example`. `ANTHROPIC_API_KEY` reste **côté serveur
uniquement** (jamais de préfixe `NEXT_PUBLIC_`).

## Déploiement

Voir `DEPLOY.md`.
