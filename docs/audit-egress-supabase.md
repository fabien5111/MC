# Rapport d'audit — Réduction de la consommation egress Supabase

**Livrable 1** de la spécification « Réduction de la consommation egress
Supabase ». Établi **avant toute modification**, sur l'état de `main` au
25/08/2026.

Objet : pour chaque chantier de la spécification, confronter la cause
*présumée* au code réel, et dire ce qui est **confirmé**, **infirmé** ou
**requalifié**.

---

## 0. Résumé

| Chantier | Cause présumée par la spec | Verdict | Gain réellement atteignable |
|---|---|---|---|
| 1 — Matcher du middleware | `matcher` absent ou trop large (`/:path*`) | **Infirmé** — le matcher existe et exclut déjà les assets statiques | Faible : `/api/*` + `sitemap.xml` + quelques extensions. **Pas 30 000 requêtes.** |
| 1-bis — Prefetch RSC (hors spec) | — | **Nouvelle cause identifiée** | Potentiellement le plus gros poste d'auth |
| 2 — Cache des données de référence | Aucune couche de cache | **Confirmé** | ~20 000, conforme |
| 3 — Déduplication du profil | Deux requêtes sur la même ligne | **Confirmé, et le coupable est nommé** (`components/Header.tsx`) | ~9 900, conforme |
| 4 — Impersonation conditionnelle | Requêtée sur chaque requête | **Confirmé** (layout racine) | ~3 900, conforme |
| 5 — Audit des payloads | `select *`, pas de pagination, polling | **Confirmé en partie** — aucun polling, aucun Realtime | Octets uniquement |

**Le point important de cet audit** : la spécification attribue au chantier 1
un gain de ~30 000 requêtes en supposant que le middleware s'exécute sur les
assets statiques. **Ce n'est pas le cas.** Le multiplicateur d'authentification
est ailleurs — il est structurel, et il est décrit en § 1.3 et § 1.4.

---

## 1. Chantier 1 — Matcher du middleware

### 1.1 État constaté

`middleware.ts:56-61` :

```ts
export const config = {
  runtime: 'nodejs',
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

Le matcher **existe déjà** et exclut `_next/static`, `_next/image`,
`favicon.ico`, `manifest.json`, `sw.js` et six extensions d'image.

`public/` ne contient que `icons/` et `splash/` (**exclusivement des `.png`**,
vérifié), `manifest.json` et `sw.js` — tous déjà exclus. Aucune police n'est
servie localement (Google Fonts en `<link>` externe, `app/layout.tsx:40-49`) :
`woff`/`woff2`/`ttf` ne représentent donc **aucun trafic**.

**Conclusion : l'hypothèse « une page chargeant 40 ressources produit
40 validations d'auth » est fausse sur ce projet.** Les 40 ressources sont
déjà hors matcher.

### 1.2 Ce qui échappe réellement au matcher aujourd'hui

| Cible non exclue | Volume | Effet |
|---|---|---|
| `/api/*` (21 routes) | élevé | `getUser()` middleware **+** `getUser()` de la route = 2 validations pour 1 appel |
| `/sitemap.xml` (`app/sitemap.ts`) | faible | validation d'auth sur un crawl |
| `/robots.txt` (404, aucun `app/robots.ts`) | faible | idem |
| `.avif`, `.ico`, `.txt`, `.xml` hors `favicon.ico` | négligeable | — |

Le poste `/api/*` est le seul significatif, et il est aggravé par les routes
appelées **à la frappe** (débouncées, mais plusieurs appels par saisie) :

- `components/search/IngredientPicker.tsx:56` → `/api/ingredients`
- `components/share/MemberPicker.tsx:42` → `/api/membres`
- `components/ideas/IdeaForm.tsx:57` → `/api/idees/similaires`
- `components/search/SearchFiltersPanel.tsx:69` → `/api/recherche/compte`
- `components/recipe/IngredientExpandDialog.tsx:138`,
  `components/admin/BlogEditor.tsx:706` → `/api/recipes/picker`

Chacun de ces appels paie aujourd'hui une validation de session middleware
**en pure perte** : `PROTECTED_PREFIXES` (`lib/supabase/middleware.ts:25-37`)
ne contient **aucun** préfixe `/api`, et la bascule `COMING_SOON`
(`middleware.ts:19`) saute déjà explicitement `/api`. Le middleware n'apporte
donc **strictement aucune protection** aux routes d'API : elles s'authentifient
toutes elles-mêmes. Les exclure est sans effet fonctionnel.

### 1.3 Cause requalifiée (a) — deux `getUser()` par rendu de page

Sur **chaque** page :

1. `lib/supabase/middleware.ts:76` — `supabase.auth.getUser()` (middleware) ;
2. `app/layout.tsx:37` — `getImpersonationContext()` →
   `lib/impersonation.ts:47` → `getCurrentUser()` → `lib/auth.ts:22`
   `supabase.auth.getUser()`.

Le `cache()` React de `getCurrentUser` déduplique à l'intérieur d'un rendu,
mais **pas avec le middleware**, qui s'exécute dans un contexte séparé, avec
son propre client Supabase. Ce sont bien deux allers-retours GoTrue distincts.

C'est très exactement le point de vigilance de la spec § 4 (« Vérifier qu'il
n'existe qu'un seul appel à `getUser()` par requête ») — **il est en défaut**,
et il n'est pas réparable par un `cache()` React.

### 1.4 Cause requalifiée (b) — les prefetch RSC, non couverts par la spec

Les prefetch automatiques de `<Link>` (survol, entrée dans le viewport)
déclenchent le middleware au même titre qu'une navigation réelle — le code
le sait et les détecte déjà (`lib/supabase/middleware.ts:88`), mais
**seulement pour ne pas rediriger** : le `getUser()` a déjà eu lieu, ligne 76,
avant le test.

Le projet a manifestement déjà rencontré le problème : `prefetch={false}` est
posé à la main sur ~20 liens (`RecipeCardLayout.tsx`, `app/page.tsx`,
`CarnetContent.tsx`, `Header.tsx`, `MobileNav.tsx`…). La couverture reste
partielle, et chaque prefetch survivant coûte une validation de session
complète.

Un `getUser()` déclenche côté GoTrue les requêtes sur `sessions`, `identities`,
`mfa_amr_claims` et `users` — les quatre tables du poste à ~37 000 appels de
la spec. À 4 requêtes par appel, cela représente **~9 250 `getUser()`**, soit
un ordre de grandeur cohérent avec « 2 par page + prefetch + `/api` », et
**incohérent** avec l'hypothèse « assets statiques » (qui en produirait
beaucoup plus).

### 1.5 Correction retenue pour le chantier 1

Restreindre le matcher à ce qui reste réellement inutile (`/api/`,
`sitemap.xml`, `robots.txt`, extensions manquantes). **Une ligne**, sans effet
fonctionnel, dont l'objet premier est de **valider le protocole de mesure**
du § 9 de la spec.

Exactement, le matcher passe de :

```
'/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
```

à :

```
'/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf)$).*)'
```

Soit trois ajouts : `api/`, les deux fichiers de robot/indexation nommément,
et cinq extensions. `/blog/rss.xml` est **volontairement laissé dans le
périmètre** : le middleware inspecte `/blog/<slug>` pour renvoyer 410 sur un
article dépublié (`matchBlogArticleSlug`), et l'en sortir demanderait de
vérifier ce comportement — hors du périmètre d'un chantier qui doit rester
une ligne de configuration sans effet fonctionnel.

**Gain attendu, annoncé sans optimisme** : de l'ordre de quelques centaines à
quelques milliers de requêtes GoTrue selon l'usage des écrans de recherche et
d'autocomplétion — **pas les 30 000 annoncés**, qui reposaient sur un
diagnostic infirmé. Si le compteur bouge peu, ce n'est donc pas que la méthode
de mesure est mauvaise : c'est le résultat attendu, et il oriente vers 1-bis.

### 1.6 Chantier 1-bis — fait

Les trois pistes ouvertes ici ont été traitées, deux par du code et une par
constat.

**1. Le second `getUser()` a disparu — sans travail supplémentaire.** Il venait
de `app/layout.tsx` → `getImpersonationContext()` → `getCurrentUser()`. Le
portillon du chantier 4 (cookie témoin) rend la main **avant** cet appel pour
tout membre ordinaire. Il ne reste qu'un `getUser()` par rendu, celui du
`Header`, partagé par tout l'arbre via `cache()` React.

**2. `getClaims()` remplace `getUser()` dans le middleware.** La vérification
de signature se fait localement contre le JWKS du projet, récupéré une fois
puis gardé dans un registre **de processus** (`GLOBAL_JWKS`, indexé par
`storageKey`) — prévu par `auth-js` pour les environnements à mémoire partagée
type Lambda. Coût réseau nul une fois l'instance chaude, là où `getUser()`
payait un aller-retour GoTrue (et ses quatre lectures `sessions` /
`identities` / `mfa_amr_claims` / `users`) sur **chaque** requête, prefetch RSC
compris.

Trois points vérifiés dans le code de `@supabase/auth-js` 2.110.7 avant
d'écrire la ligne :

- **Le rafraîchissement est préservé** : `getClaims()` appelle `getSession()`,
  dont `__loadSession` teste l'expiration et rafraîchit, en reposant les
  cookies par l'adaptateur du middleware. C'est exactement le chemin
  qu'empruntait `getUser()` — la mise en garde du § 4 de la spec est
  respectée.
- **Repli automatique** : si l'algorithme est symétrique (`HS*`, l'ancien
  secret partagé) ou s'il n'y a pas de `kid`, la signature n'est pas
  vérifiable sans le secret et `getClaims()` retombe de lui-même sur
  `getUser()`. Le comportement reste juste, simplement sans gain.
- **Condition du gain** : le projet Supabase doit être passé aux **clés de
  signature asymétriques** (ECC/RSA), ce qui se règle dans le tableau de bord
  (Authentication → JWT Keys). Tant que ce n'est pas fait, le changement est
  un non-événement — ni gain, ni risque.

**3. La sortie du middleware sur prefetch n'a pas été faite, délibérément.**
C'était la piste la plus risquée (le middleware n'écrirait plus de cookie
rafraîchi sur ces réponses), et `getClaims()` lui retire sa raison d'être :
un prefetch ne coûte plus d'aller-retour réseau.

### 1.7 Ce que ça change au chemin critique

Appels d'authentification réseau par rendu de page, pour un membre ordinaire :

| | Avant | Après |
|---|---:|---:|
| Middleware | 1 (`getUser`) | 0 (`getClaims`, JWKS en cache) |
| Layout (impersonation) | 1 (`getUser`) + 1 requête table | 0 |
| `Header` | 1 (`getUser`) | 1 (`getUser`) |
| **Total** | **3** | **1** |

Le `getUser()` restant est conservé exprès : c'est lui qui interroge réellement
le serveur d'authentification, et donc qui voit une session révoquée avant
l'expiration de son token. Le middleware, lui, ne fait qu'aiguiller vers
`/connexion` ; lui faire confiance à un JWT signé et non expiré est sans
conséquence, le contrôle fin des pages privées restant assuré par
`requireUser()`.

## 2. Chantier 2 — Cache des données de référence

**Confirmé.** Aucun accès aux tables de référence n'est mis en cache.

| Table | Accès | Fichier |
|---|---|---|
| `tags` | `getTags`, `getHomeCategories`, `getTagBySlug` | `lib/taxonomy.ts:17,31,45` |
| `tags` (écriture) | création depuis l'éditeur | `components/CreerForm.tsx:517`, `components/RelectureEditor.tsx:579` |
| `difficulties` | `getDifficulties` (`select('*')`) | `lib/taxonomy.ts:69` |
| `recipe_types` | `getRecipeTypes` | `lib/taxonomy.ts:60` |
| `allergens` | `getAllergens`, import | `lib/recipes.ts:268`, `lib/imports.ts:64` |
| `units` | `select('*')`, import | `lib/profile.ts:245`, `app/api/import-url/route.ts:135` |
| `ingredient_refs` | 3 accesseurs distincts, sans limite | `lib/recipes.ts:298`, `lib/imports.ts:40,51` |
| `utensils` | sans limite | `lib/imports.ts:71` |
| `mold_types` | `select('*')` | `lib/admin.ts:20` |
| `ingredient_conversions` | — | `lib/recipes.ts:283` |
| `site_settings` | `getSiteSettings`, `getRecipeDefaultPhoto` | `lib/site.ts:7,19` |

**Le multiplicateur est `components/Header.tsx`** — Server Component monté sur
quasiment toutes les pages. Il appelle `getHomeCategories()`
(`Header.tsx:36`) : **une requête sur `tags` par page rendue**, y compris pour
un visiteur déconnecté. Idem pour `getRecipeDefaultPhoto()` (`site_settings`)
sur tout écran affichant des cartes recette.

Deux observations qui conditionnent l'implémentation :

- **Le précédent existe déjà dans le projet** : `lib/blog.ts` enveloppe sept
  accesseurs dans `unstable_cache` avec étiquettes et `revalidateTag`
  (`app/api/admin/blog/revalidate/route.ts:32`). Le chantier 2 consiste à
  étendre ce motif éprouvé, pas à en inventer un.
- **Le cache de données Next est neutralisé pour Supabase** :
  `lib/supabase/server.ts:21` force `cache: 'no-store'` sur **tous** les
  `fetch` du client serveur (contournement délibéré et documenté d'une
  invalidation défaillante). `unstable_cache`, qui mémorise le **résultat de
  la fonction** et non le `fetch`, reste donc la seule voie possible — et
  fonctionne.
- **Version** : Next `^15.1.6` (`package.json`) → `unstable_cache`, **pas** la
  directive `use cache` (Next 15.3+).
- **Point de vigilance RLS de la spec § 5, vérifié et écarté** : `getTags`,
  `getHomeCategories` et `getRecipeTypes` filtrent tous explicitement sur
  `.eq('status', 'published')`. Le résultat ne dépend donc pas du rôle
  appelant : **une seule entrée de cache suffit**, sans risque de fuite de
  contenu non publié.

---

## 3. Chantier 3 — Déduplication du profil utilisateur

**Confirmé, avec le coupable exact.**

`lib/auth.ts` expose deux accesseurs mémoïsés **séparément**, sur la même
ligne de `profiles` :

- `getProfile(userId)` — `lib/auth.ts:58` — `.select('*')`
- `getRole(userId)` — `lib/auth.ts:79` — `.select('role')`

Chacun porte son propre `cache()` React : ils ne se dédupliquent donc
**jamais** entre eux. `isAdmin` et `isManager` dérivent de `getRole`.

`components/Header.tsx:24-28` appelle **les deux** sur chaque page :

```ts
const profile = user ? await getProfile(user.id) : null;   // select('*')
const backOffice = user ? await isManager(user.id) : false; // select('role')
```

C'est la reproduction exacte du constat de `pg_stat_statements` : 5 572 appels
`profiles.role` + 4 306 appels `profiles.*`, deux requêtes pour une ligne.
60 sites d'appel de ces helpers sont recensés dans `app/`, `components/` et
`lib/`.

**Correction court terme** : faire dériver `getRole` de `getProfile` (un seul
aller-retour, `role` inclus) et énumérer les colonnes au lieu de `select('*')`.
Le changement est confiné à `lib/auth.ts` — aucun site d'appel à modifier.

**Cible (Custom Access Token Hook)** : réservée à un chantier ultérieur ; c'est
la seule entorse au non-objectif « ne pas toucher au schéma » (spec § 3).

---

## 4. Chantier 4 — Vérification d'impersonation

**Confirmé.** `app/layout.tsx:37` appelle `getImpersonationContext()` dans le
**layout racine**, donc sur **chaque rendu de page**, pour **tout** utilisateur
connecté. La fonction (`lib/impersonation.ts:47-71`) interroge
`impersonation_sessions` avec cinq prédicats, pour un cas qui ne concerne
qu'un admin en session d'impersonation.

Elle n'est mémoïsée que par `cache()` React (par requête) — ce qui évite les
doublons dans un rendu, pas la requête elle-même.

Deux conditionnements possibles, sans changement de sémantique :

1. `role === 'admin'` — mais la cible d'une impersonation est un **membre
   ordinaire**, pas un admin : ce critère ne s'applique pas ici tel quel.
   C'est la présence d'une session ouverte **sur ce compte** qui compte.
2. **Cookie témoin** posé par `app/auth/impersonation/route.ts` à la
   consommation du lien, et lu avant toute requête. C'est l'« alternative
   complémentaire » de la spec § 7 — **c'est la bonne ici**, et la seule qui
   ramène la requête à zéro pour 100 % des membres.

**Contrainte à respecter** : la doctrine du projet (`CLAUDE.md`, « le mode ne
peut pas être désactivé côté navigateur ») interdit de faire du cookie la
*source de vérité*. Il ne doit servir que d'**aiguillage négatif** : pas de
cookie → pas de requête ; cookie présent → la table tranche, comme
aujourd'hui. La RLS (`public.is_read_only_session()`) reste de toute façon
la garantie réelle, côté base.

---

## 5. Chantier 5 — Audit des payloads — fait

Les quatre points de la spec, traités ou écartés avec leur raison.

### 1. `shopping_lists` — fait, et la vraie cause était ailleurs

La spec décrit « une jointure imbriquée avec `select *` ». Ce n'était pas
exact : `getShoppingLists` (`lib/profile.ts`) restreignait déjà sa jointure à
`id, checked`, les deux colonnes du décompte d'avancement.

Le gaspillage était en amont, sur le **plus consulté** des trois appelants :
`app/recette/[id]/page.tsx` appelait `getShoppingLists()` puis n'en gardait que
`{ id, name }` — il rapatriait donc **tous les articles de toutes les listes**
du membre pour peupler une liste déroulante de noms. Dix listes de quarante
articles, c'est quatre cents lignes traversées pour rien, à chaque consultation
de fiche.

Correction : `getShoppingListNames(userId)`, sans jointure. Colonnes énumérées
des deux côtés de la jointure dans la vue détail (`lib/shopping.ts`), où tout
est réellement affiché.

### 2. `select('*')` — traité là où ça compte, laissé ailleurs, dit franchement

Supprimé sur `profiles` (chantier 3), `units`, `difficulties`, `mold_types`
(chantier 2) et `shopping_lists` — c'est-à-dire sur **tout ce que le top 20
contenait**.

Reste en place, délibérément :

- **`lib/admin.ts`, `lib/admin-blog.ts`, `lib/impersonation.ts:120`,
  `lib/imports.ts:32`** — écrans de back-office et lecture d'un import à la
  fois. Volume négligeable, et énumérer les colonnes de tables que personne ne
  lit en boucle ajoute du risque sans gain.
- **`select('*', { count: 'exact', head: true })`** (`lib/admin.ts:68-70`) —
  ce n'en est pas un : `head: true` ne renvoie aucune ligne, c'est un compteur.
- **`lib/blog.ts`** — déjà servi par `unstable_cache`.
- **`recipes`** — la spec en fait un **non-objectif** explicite (§ 3 :
  « optimiser les requêtes sur `recipes` : elles ne sont pas en cause »), et le
  relevé lui donne raison : aucune requête `recipes` dans le top 20.

**Une exception traitée quand même** : `getRecipe(id)` faisait un `select('*')`
sur `recipes` — 42 colonnes dont **cinq d'image**, `hero_image_original_url`
comprise, soit l'objet le plus lourd de la base. La fonction était **exportée
mais jamais appelée** (la fiche utilise `getRecipeFull`). Supprimée : du code
mort qui porte ce piège finit tôt ou tard copié-collé. Récupérable dans
l'historique git si besoin.

### 3. Pagination de `ingredient_refs` / `utensils` — rendue sans objet

Le constat de la spec était juste : ces deux tables étaient lues sans `limit()`
ni `range()`. Mais **y appliquer une pagination serait maintenant une
régression** : ce sont des listes d'autocomplétion, une liste tronquée ne
propose plus certains ingrédients. Et depuis le chantier 2, elles sont lues une
fois par fenêtre de validité, plus à chaque requête — le problème que la
pagination devait résoudre a été résolu autrement.

**Ce qui reste, et qui n'est pas un problème d'egress** : `getIngredientRefNames`
descend la table entière dans le payload RSC envoyé au navigateur, pour
l'autocomplétion de l'éditeur. À quelques centaines d'ingrédients c'est sans
conséquence ; à quelques milliers, il faudra basculer sur la recherche serveur
— la route `/api/ingredients` existe déjà et fait exactement ça. C'est une
question de produit, pas de facture Supabase.

### 4. Polling et Realtime — infirmé, rien à corriger

Aucun abonnement Realtime (`.channel(` : 0 occurrence), aucun
`onAuthStateChange`. Les deux seuls `setInterval`
(`components/admin/BlogEditor.tsx:272,279`) ne déclenchent aucune requête
Supabase. Le compteur Realtime à 0 du tableau de bord est confirmé par le code.

### 5. Hors spec — les lectures en série du chemin critique

Découvert en traitant le reste, et sans rapport avec le nombre de requêtes :
plusieurs lectures indépendantes étaient enchaînées en `await` successifs, donc
payées en allers-retours cumulés plutôt qu'en un seul.

| Fichier | Avant | Après |
|---|---:|---:|
| `components/Header.tsx` | 5 en série | 2 vagues |
| `components/MobileNav.tsx` | 4 en série | 2 vagues |
| `app/recette/[id]/page.tsx` (2ᵉ vague) | 4 en série | 1 vague |

Le chrome (`Header`, `MobileNav`) est rendu sur **chaque** page : ses lectures
sont sur le chemin critique de tout le site. C'est le seul lot de ce chantier
qui se voie directement en temps de chargement.

## 5-bis. Mesure de référence (« avant »), 25/08/2026

Relevé `pg_stat_statements` (top 20, filtre `%pgrst_source%`) pris **avant
tout déploiement**. Il complète le tableau agrégé du § 1 de la spec en
nommant chaque requête.

**Fenêtre non réinitialisée, et antérieure à la migration « Fournées ».**
Deux indices concordants : les compteurs `profiles` (5 572 / 4 306) sont
identiques au chiffre près à ceux cités par la spec ; et `public.executions`
totalise 1 462 appels alors qu'**aucun code du dépôt n'interroge cette
table** — seul `executions_legacy` est lu
(`app/execution/[id]/page.tsx:20`). La fenêtre contient donc du trafic
produit par une version antérieure de l'application. Elle vaut comme
**baseline de cadrage**, pas comme mesure d'un parcours.

| Requête | Appels | Chantier |
|---|---:|---|
| `profiles.role` | 5 572 | 3 |
| `profiles.*` | 4 306 | 3 |
| `tags` (`+ category_picto`) | 3 930 | 2 |
| `impersonation_sessions` | 3 871 | 4 |
| `favorites.recipe_id` | 3 557 | *(hors spec, cf. ci-dessous)* |
| `allergens` (picto, tooltip) | 2 932 | 2 |
| `units.*` | 2 513 | 2 |
| `shopping_lists` + items imbriqués | 2 444 | 5 |
| `mold_types.*` | 2 128 | 2 |
| `site_settings` (1) | 1 580 | 2 |
| `allergens` (2) | 1 493 | 2 |
| `executions.id` | 1 462 | *(code mort / version antérieure)* |
| `tags` (2) | 1 435 | 2 |
| `ingredient_conversions` | 1 390 | 2 |
| `site_settings` (2) | 1 322 | 2 |
| `difficulties.*` | 1 278 | 2 |
| `tags` (`id, name, slug`) | 1 050 | 2 |
| `batches.id` | 995 | — |
| `ingredient_refs.name` | 962 | 2 et 5 |
| `utensils.name` | 907 | 2 et 5 |
| **Total top 20** | **~45 127** | |

### Ce que la mesure change dans les priorités

| Chantier | Appels mesurés | Part du top 20 |
|---|---:|---:|
| **2 — Référentiels** | **22 920** | **51 %** |
| 3 — Profil | 9 878 | 22 % |
| 4 — Impersonation | 3 871 | 8,6 % |
| **2 + 3 + 4** | **36 669** | **81 %** |

Détail du chantier 2 : `tags` 6 415 (trois requêtes distinctes) · `allergens`
4 425 (deux) · `site_settings` 2 902 (deux) · `units` 2 513 · `mold_types`
2 128 · `ingredient_conversions` 1 390 · `difficulties` 1 278 ·
`ingredient_refs` 962 · `utensils` 907.

**Le chantier 2 pèse à lui seul plus que les chantiers 3, 4 et 5 réunis.** Le
classement du § 6 est donc confirmé par la mesure, et non plus seulement
estimé.

### Le chemin chaud, nommé

`app/recette/[id]/page.tsx:65` charge **cinq tables de référence** dans un
seul `Promise.all` — `units`, `mold_types`, `allergens`, `ingredient_conversions`,
`site_settings` — auxquelles s'ajoute `tags` via le `Header`. Soit **six
requêtes de référentiel par consultation de fiche recette**, pour des données
qui ne changent pas d'une semaine à l'autre. C'est le multiplicateur principal,
et le chantier 2 le ramène à zéro après premier chargement.

### `favorites` — poste non prévu par la spec

`getFavoriteIds()` (`lib/favorites.ts:6`) est appelé par cinq pages
(`app/page.tsx:71`, `recherche:60`, `carnet:59`, `u/[handle]:49`,
`recette/[id]:67`) : 3 557 appels, soit **plus que l'impersonation**. La spec
le range dans « données utilisateur » sans le traiter.

Il ne relève pas du chantier 2 — la donnée est propre à l'utilisateur et
change à chaque clic sur un cœur — mais il est justiciable d'un `cache()`
React (déduplication intra-rendu, gratuite) et, surtout, d'un rapatriement
ciblé : les pages n'ont besoin que des favoris **parmi les recettes
affichées**, pas de la liste complète. À verser au chantier 5.

---

## 6. Ordre d'exécution recommandé

L'ordre 1 → 4 de la spec reste valable, avec une réserve : **le chantier 1
n'aura pas l'effet annoncé**, son diagnostic étant infirmé (§ 1.1). Il garde
sa valeur de **calibrage du protocole de mesure** — c'est à ce titre qu'il est
traité seul en premier.

Sur le fond, le classement par gain réel devient :

1. **Chantier 2** (référentiels, ~20 000) — le plus gros poste, sans risque
   fonctionnel ;
2. **Chantier 1-bis** (§ 1.6 : `getClaims()`, double `getUser()`, prefetch) —
   probablement le plus gros poste *auth*, mais le plus risqué : il touche au
   rafraîchissement de session ;
3. **Chantier 3** (profil, ~9 900) — correction confinée à `lib/auth.ts` ;
4. **Chantier 4** (impersonation, ~3 900) ;
5. **Chantier 5** (octets).

## 7. Limites de cet audit

- Audit **statique**. Le nombre de requêtes par parcours n'a pas été mesuré à
  l'exécution : les volumes cités proviennent du `pg_stat_statements` de la
  spec, corrélés au code.
- Le partage entre trafic applicatif et **trafic du dashboard Supabase**
  (474 chargements de l'éditeur SQL relevés sur la période, spec § 9) n'est
  pas décidable depuis le dépôt. Si le plancher de 150 Mo/jour ne bouge pas
  après les chantiers 1 à 4, c'est la piste à instruire — elle expliquerait à
  elle seule un plancher sans jour à zéro.
- Le poids en **octets** par requête n'a pas été mesuré ; le chantier 5 ne
  peut être chiffré que par instrumentation.
