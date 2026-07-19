# Déploiement sur Vercel

Le dépôt est la racine du projet Vercel `mc-snowy` — pas de sous-dossier
`Root Directory` à configurer, Vercel détecte Next.js directement.

## Variables d'environnement

Dans **Settings → Environment Variables** du projet :

| Nom | Valeur | Portée |
|-----|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://acbabqolghhyxksouaye.supabase.co` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG` | Production + Preview |
| `ANTHROPIC_API_KEY` | *(clé Anthropic — jamais préfixée `NEXT_PUBLIC_`)* | Production + Preview |
| `IMPORT_MODEL` | `claude-sonnet-5` *(optionnel, valeur par défaut)* | Production + Preview |
| `IMPORT_DAILY_QUOTA` | `20` *(optionnel, valeur par défaut)* | Production + Preview |

Les deux `NEXT_PUBLIC_*` sont inlinées au build : elles doivent exister avant
le déploiement. `ANTHROPIC_API_KEY` sert aux routes `/api/import-url` et
`/api/scale-recipe`.

## Authentification Supabase

Dans le **dashboard Supabase → Authentication → URL Configuration** :

1. **Site URL** : le domaine de production.
2. **Redirect URLs** : `https://<domaine>/**` (couvre `/auth/callback` et les
   liens de confirmation d'e-mail). Côté Google (console OAuth),
   l'URL de callback reste celle de Supabase
   (`…supabase.co/auth/v1/callback`) — rien à changer là.

## Vérifier après déploiement

- [ ] `/` s'affiche (accueil, recettes)
- [ ] `/connexion` : connexion e-mail **et** Google
- [ ] `/profil` accessible une fois connecté (sinon → redirigé vers `/connexion`)
- [ ] `/creer` : créer une recette → apparaît dans le carnet et sur `/recette/[id]`
- [ ] `/importer` : import d'une URL → brouillon → `/relecture/[id]` → création
- [ ] `/admin` (avec un compte `role = admin`) : dashboard + les 5 sous-écrans

## Notes

- **Node** : épinglé à `22.x` (`package.json` → `engines`, `.nvmrc`). Vercel
  s'aligne automatiquement.
- **Durée des fonctions** : `/api/import-url` déclare `maxDuration = 60`
  (analyse IA des recettes longues). Vérifie que le plan Vercel l'autorise
  (Hobby : 60 s max ; Pro : jusqu'à 300 s).
- **Images** : les photos sont stockées en data-URL dans la base — pas de
  bucket ni de CDN d'images à configurer.
- **Types Supabase** : voir `README.md` (section « Types de la base ») pour
  régénérer `lib/database.types.ts`.
