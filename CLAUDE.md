# Maryse Club

Site de partage de recettes de pâtisserie (Next.js + Supabase).

Documentation technique complète (stack, architecture, base de données,
authentification, déploiement) : @TECHNIQUE.md

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
