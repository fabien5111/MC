# Déploiement sur Vercel

Le dépôt est la racine du projet Vercel **`mc`** (anciennement `mc-snowy` —
le domaine `mc-snowy.vercel.app` en garde la trace) : pas de sous-dossier
`Root Directory` à configurer, Vercel détecte Next.js directement.

**Région des fonctions : Francfort**, la même que le projet Supabase. Ce n'est
pas cosmétique : les fonctions étaient à Washington, ce qui faisait traverser
l'Atlantique à **chaque** requête base. Une page en enchaîne plusieurs, dont
certaines en série. Un changement de région ne prend effet qu'au
**redéploiement**.

## Variables d'environnement

Dans **Settings → Environment Variables** du projet :

| Nom | Valeur | Portée |
|-----|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://acbabqolghhyxksouaye.supabase.co` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG` | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Supabase → Settings → API Keys → **Secret keys** : `sb_secret_…`. Équivalent historique : Settings → API → `service_role`)* | Production + Preview |
| `ANTHROPIC_API_KEY` | *(clé Anthropic — jamais préfixée `NEXT_PUBLIC_`)* | Production + Preview |
| `IMPORT_MODEL` | `claude-haiku-4-5` *(optionnel, valeur par défaut)* | Production + Preview |
| `IMPORT_DAILY_QUOTA` | `20` *(optionnel, valeur par défaut)* | Production + Preview |
| `COMING_SOON` | `true` | **Production uniquement** |

Les deux `NEXT_PUBLIC_*` sont inlinées au build : elles doivent exister avant
le déploiement. `ANTHROPIC_API_KEY` sert aux routes `/api/import-url` et
`/api/scale-recipe`.

`SUPABASE_SERVICE_ROLE_KEY` **contourne la RLS** : à marquer *Sensitive* dans
Vercel, à ne jamais préfixer `NEXT_PUBLIC_` ni committer. Elle n'est lue que
par `lib/supabase/admin.ts`, utilisé uniquement par les routes serveur de la
connexion « en tant que » (génération du lien temporaire et journal d'audit).
Sans elle, ces routes renvoient 503 avec un message explicite ; le reste du
site fonctionne normalement. Contrairement aux `NEXT_PUBLIC_*`, elle est lue
au runtime : un simple redéploiement suffit, sans vider le cache de build.

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
- **Domaines du projet `mc`** — tous en **Production**, un seul déploiement
  les met tous à jour :

  | Domaine | Rôle |
  |---|---|
  | `www.jepatisse.com` | canonique |
  | `jepatisse.com` | 308 → `www.jepatisse.com` |
  | `jepatisse.fr`, `www.jepatisse.fr` | 301 → `www.jepatisse.com` |
  | `dev.jepatisse.com` | URL réelle des testeurs |
  | `mc-snowy.vercel.app` | domaine Vercel d'origine |

  `COMING_SOON=true` (scopée Production) affiche la page d'attente sur tous ;
  `middleware.ts` exempte spécifiquement `dev.jepatisse.com` (comparaison sur
  `Host`) pour que les testeurs gardent accès au site réel.

- **Un second projet Vercel, `dev_jp`, déploie le même dépôt.** Il ne porte
  aucun domaine propre, seulement `mc-oqp7.vercel.app`. Conséquences à
  connaître : chaque push construit **deux fois**, et cette URL sert une copie
  publiquement joignable du site, branchée sur la **même** base Supabase.
  Vérifier que `COMING_SOON` y est bien positionnée, ou détacher le projet du
  dépôt s'il n'a plus d'usage.
