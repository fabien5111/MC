# Maryse Club — Frontend Next.js (migration)

Migration progressive du site vanilla (racine du dépôt) vers **Next.js App
Router + TypeScript + Tailwind CSS**. Le site vanilla reste en production
pendant toute la migration ; on porte les pages une par une, et toute nouvelle
fonctionnalité se développe désormais ici.

## Stack

- **Next.js 15** (App Router, Route Handlers)
- **TypeScript** (strict)
- **Tailwind CSS 3** — design system transposé depuis le site vanilla
  (`tailwind.config.ts`)
- **Supabase** via `@supabase/ssr` — auth par **cookies** (vérifiable côté
  serveur), remplace le `localStorage`/`getSession()` du `db.js` vanilla

## Démarrer

```bash
cd web
npm install
cp .env.local.example .env.local   # puis renseigner ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000
```

## Ce qui est en place (Phase 0)

- Scaffolding Next.js/TS/Tailwind + design tokens (`tailwind.config.ts`)
- Clients Supabase : `lib/supabase/{client,server,middleware}.ts`
- Middleware d'auth : redirige les routes protégées vers `/connexion`
- Types de la base : `lib/database.types.ts` (à régénérer via `npm run gen:types`)
- Routes IA portées depuis `../api/` :
  - `POST /api/import-url` — import de recette (URL ou texte) → brouillon
  - `POST /api/scale-recipe` — coefficient d'ajustement des quantités
  - Auth/RLS via la session (cookies) au lieu du jeton en en-tête

## Prochaines étapes (Phase 1 — composants partagés)

- `components/Header.tsx` / navigation (dédupliquer les ~15 pages vanilla)
- `components/ImageSlot.tsx` (remplace le web component `image-slot.js`)
- Modules d'accès données typés dans `lib/` (auth, recettes, planning…)
- Gating payant/gratuit centralisé (middleware + helpers serveur)

## Types de la base (source de vérité définitive)

`lib/database.types.ts` est actuellement **reconstruit hors-ligne** depuis les
migrations du repo (`schema.sql`, `setup-*.sql`) et l'usage réel dans le code —
la génération automatique est impossible depuis l'environnement web (le réseau
y bloque l'accès au projet Supabase). Les tables marquées « INFÉRÉ » (créées via
le dashboard, sans migration dans le repo : `executions`, `utensils`,
`ingredient_refs`, `shopping_lists`, `shopping_list_items`, `site_settings`) ont
des colonnes déduites — à confirmer.

Pour obtenir la version **100 % fidèle** à la base live, lance en local (accès
réseau + token requis) :

```bash
cd web
export SUPABASE_ACCESS_TOKEN=<ton_token>   # https://supabase.com/dashboard/account/tokens
npm run gen:types                          # écrase lib/database.types.ts
npm run typecheck                          # repérer les écarts éventuels
```

Committe le fichier régénéré : il devient la référence. En cas d'écart avec la
reconstruction, on réaligne le code applicatif (`lib/*.ts`) en conséquence.

## Variables d'environnement

Voir `.env.local.example`. `ANTHROPIC_API_KEY` reste **côté serveur
uniquement** (jamais de préfixe `NEXT_PUBLIC_`).
