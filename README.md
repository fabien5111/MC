# Maryse Club

Site de partage de recettes de pâtisserie. **Next.js App Router + TypeScript +
Tailwind CSS**, avec Supabase (auth, base de données).

## Stack

- **Next.js 15** (App Router, Route Handlers)
- **TypeScript** (strict)
- **Tailwind CSS 3** — design system dans `tailwind.config.ts`
- **Supabase** via `@supabase/ssr` — auth par cookies, vérifiable côté serveur
  (`lib/supabase/{client,server,middleware}.ts`)

## Démarrer

```bash
npm install
cp .env.local.example .env.local   # puis renseigner ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

## Routes API

- `POST /api/import-url` — import de recette (URL ou texte collé) → brouillon
- `POST /api/scale-recipe` — coefficient d'ajustement des quantités (IA)

Auth/RLS via la session (cookies).

## Types de la base

`lib/database.types.ts` est la source de vérité pour les types Supabase. Pour
le régénérer depuis la base live :

```bash
export SUPABASE_ACCESS_TOKEN=<ton_token>   # https://supabase.com/dashboard/account/tokens
npm run gen:types                          # écrase lib/database.types.ts
npm run typecheck                          # repérer les écarts éventuels
```

Un workflow GitHub Actions (`.github/workflows/gen-types.yml`, lancement
manuel) fait la même chose et committe le résultat sur la branche choisie.

## Variables d'environnement

Voir `.env.local.example`. `ANTHROPIC_API_KEY` reste **côté serveur
uniquement** (jamais de préfixe `NEXT_PUBLIC_`).

## Déploiement

Voir `DEPLOY.md`.
