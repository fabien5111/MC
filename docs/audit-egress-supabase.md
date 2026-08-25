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

### 1.6 Suite proposée (chantier 1-bis, à arbitrer)

1. **Supprimer le second `getUser()`** : ne pas appeler
   `getImpersonationContext()` inconditionnellement dans le layout racine
   (cf. chantier 4), ou faire descendre l'utilisateur du middleware vers le
   rendu par un en-tête de requête.
2. **Sortir du middleware sur prefetch** : tester
   `next-router-prefetch === '1'` **avant** `getUser()`. Attention : le
   middleware n'écrirait alors plus de cookie rafraîchi sur ces réponses —
   à valider, c'est une modification à risque, pas un réglage.
3. Envisager `getClaims()` (`@supabase/ssr` 0.12) à la place de `getUser()`
   dans le middleware : vérification locale de la signature JWT, **zéro**
   aller-retour GoTrue. C'est le levier de loin le plus puissant sur ce poste.

---

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

## 5. Chantier 5 — Audit des payloads

**Confirmé en partie.**

- **`select('*')`** — 15 occurrences, dont sur des tables de référence :
  `lib/auth.ts:58` (`profiles`), `lib/profile.ts:245` (`units`),
  `lib/taxonomy.ts:69` (`difficulties`), `lib/admin.ts:20` (`mold_types`),
  `lib/impersonation.ts:109`, `lib/recipes.ts:131` (`recipes`),
  `lib/admin-blog.ts:49,61,68`, `lib/blog.ts:118,175`, `lib/imports.ts:32`,
  `lib/admin.ts:458,529`.
- **Pagination absente** sur `ingredient_refs` (`lib/imports.ts:40,51`,
  `lib/recipes.ts:298`) et `utensils` (`lib/imports.ts:71`) — confirmé, aucun
  `range()` ni `limit()`.
- **`shopping_lists`** : à instrumenter au moment du chantier 5 (le poids de
  la jointure imbriquée n'est pas mesurable statiquement).
- **Polling / Realtime — infirmé, rien à corriger.** Aucun abonnement Realtime
  (`.channel(` : 0 occurrence), aucun `onAuthStateChange`. Les deux seuls
  `setInterval` sont dans `components/admin/BlogEditor.tsx:272,279` et ne
  déclenchent **aucune** requête Supabase (compteur d'affichage local). Le
  compteur Realtime à 0 du dashboard est donc confirmé par le code.

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
