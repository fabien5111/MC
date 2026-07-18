# Déploiement du frontend Next.js (`web/`) sur Vercel

Ce guide déploie l'app Next.js **en parallèle** du site vanilla existant (racine
du dépôt, déjà sur Vercel), sur une **URL de préversion** distincte. Le site en
production n'est pas touché : tu testes la nouvelle version, puis tu bascules le
domaine quand tu es prêt.

> Pourquoi en parallèle et pas en remplacement direct : quelques sous-systèmes
> interactifs de la fiche recette (planification jour par jour, exécution,
> ajustement IA des quantités, génération de liste de courses) ne sont pas encore
> rebranchés. Une bascule immédiate les ferait régresser. On garde donc le site
> vanilla en prod tant que ces features ne sont pas portées.

---

## 1. Créer un nouveau projet Vercel (dans le navigateur)

1. Va sur **https://vercel.com/new**
2. **Import** le dépôt **`fabien5111/mc`** (autorise Vercel sur GitHub si besoin).
3. Écran de configuration du projet :
   - **Root Directory** → clique **Edit** → sélectionne **`web`** ⚠️ (étape clé :
     sans ça, Vercel déploierait le site vanilla de la racine, pas l'app Next).
   - **Framework Preset** → doit passer automatiquement à **Next.js**.
   - **Build/Output** → laisse les valeurs par défaut (Next.js détecté).
4. Ne clique pas encore **Deploy** : ajoute d'abord les variables d'environnement
   (section suivante).

## 2. Variables d'environnement

Dans **Settings → Environment Variables** du projet (ou l'écran d'import), ajoute :

| Nom | Valeur | Portée |
|-----|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://acbabqolghhyxksouaye.supabase.co` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_lWH25Aszggrc6ZttxyMTig_XwXs_IAG` | Production + Preview |
| `ANTHROPIC_API_KEY` | *(ta clé Anthropic — jamais préfixée `NEXT_PUBLIC_`)* | Production + Preview |
| `IMPORT_MODEL` | `claude-sonnet-5` *(optionnel, valeur par défaut)* | Production + Preview |
| `IMPORT_DAILY_QUOTA` | `20` *(optionnel, valeur par défaut)* | Production + Preview |

- Les deux `NEXT_PUBLIC_*` sont **inlinées au build** : elles doivent exister
  avant le déploiement.
- `ANTHROPIC_API_KEY` sert aux routes `/api/import-url` et `/api/scale-recipe`
  (import et ajustement IA). C'est la même clé que sur le projet vanilla actuel.

## 3. Déployer

Clique **Deploy**. Vercel installe, build (`next build`) et publie. Tu obtiens
une URL du type `https://maryse-club-web.vercel.app`.

---

## 4. ⚠️ Configurer l'authentification Supabase (indispensable)

L'app utilise l'auth Supabase par cookies + OAuth (Google/Facebook). Sans cette
étape, la connexion et la confirmation d'e-mail échoueront sur la nouvelle URL.

Dans le **dashboard Supabase → Authentication → URL Configuration** :

1. **Site URL** : ajoute/garde l'URL de production voulue.
2. **Redirect URLs** : ajoute
   - `https://<ton-projet>.vercel.app/**`
   - (et ton domaine custom plus tard, ex. `https://maryseclub.fr/**`)

Ces URL doivent couvrir la destination des `redirectTo` OAuth (le formulaire de
connexion renvoie vers `window.location.origin`) et des liens de confirmation
d'e-mail. Côté **Google/Facebook** (consoles OAuth), l'URL de callback reste
celle de Supabase (`…supabase.co/auth/v1/callback`) — rien à changer là.

## 5. Tester la préversion

Sur l'URL Vercel, vérifie :
- [ ] `/` s'affiche (accueil, recettes si la base en contient)
- [ ] `/connexion` : connexion e-mail **et** Google/Facebook
- [ ] `/profil` accessible une fois connecté (sinon → redirigé vers `/connexion`)
- [ ] `/creer` : créer une recette → apparaît dans le carnet et sur `/recette/[id]`
- [ ] `/importer` : import d'une URL → brouillon → `/relecture/[id]` → création
- [ ] `/admin` (avec un compte `role = admin`) : dashboard + les 5 sous-écrans

## 6. Bascule vers la production (plus tard)

Quand la parité fonctionnelle est atteinte :

- **Option A (recommandée)** — Domaine sur le projet Next : dans **Settings →
  Domains** du projet `web`, ajoute le domaine de production (ex.
  `maryseclub.fr`). Retire-le de l'ancien projet vanilla. Le trafic bascule sans
  changer de dépôt.
- **Option B** — Repartir d'un seul projet : reconfigure le projet Vercel
  existant pour **Root Directory = `web`**. À ce moment, les fonctions
  `api/import-url` et `api/scale-recipe` de Next remplacent les `api/*.js` de la
  racine (mêmes endpoints, même clé).

Dans les deux cas, mets à jour la **Site URL** Supabase vers le domaine final.

## 7. Notes

- **Node** : épinglé à `22.x` (`package.json` → `engines`, `.nvmrc`). Vercel
  s'aligne automatiquement.
- **Durée des fonctions** : `/api/import-url` déclare `maxDuration = 60`
  (analyse IA des recettes longues). Vérifie que le plan Vercel l'autorise
  (Hobby : 60 s max ; Pro : jusqu'à 300 s).
- **Images** : l'app stocke les photos en data-URL dans la base (comme le site
  vanilla) — pas de bucket ni de CDN d'images à configurer.
- **Types Supabase** : voir `README.md` (section « Types de la base ») pour
  régénérer `lib/database.types.ts` via GitHub Actions.
