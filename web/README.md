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

## Variables d'environnement

Voir `.env.local.example`. `ANTHROPIC_API_KEY` reste **côté serveur
uniquement** (jamais de préfixe `NEXT_PUBLIC_`).
