# Note de régression — cache et déduplication des lectures

**Livrable 4** de la spécification « Réduction de la consommation egress
Supabase ». À conserver : ce sont les règles que tout développement ultérieur
doit respecter pour ne pas réintroduire le problème — ou en créer un pire,
celui de la donnée périmée.

Portée : chantier 2 (§ 1 à 3, `lib/data/reference.ts`), chantier 3 (§ 4,
`lib/auth.ts`), chantier 4 (§ 5, impersonation), chantier 1-bis (§ 6,
sessions) et chantier 5 (§ 7, payloads).

---

## 1. Ce qui a changé

Les neuf tables de référence (`tags`, `recipe_types`, `difficulties`, `units`,
`mold_types`, `allergens`, `ingredient_refs`, `utensils`,
`ingredient_conversions`) et les clés publiques de `site_settings` ne sont plus
lues à chaque rendu. Elles passent par `lib/data/reference.ts`, qui superpose :

1. `unstable_cache` — cache serveur partagé **entre requêtes et entre
   visiteurs**, avec étiquettes ;
2. `cache()` React — déduplication à l'intérieur d'un même rendu ;
3. un repli non mis en cache sur le client à cookies, si la lecture publique
   échoue ou revient vide.

## 2. Les trois règles à respecter

### Règle 1 — Ne jamais lire un référentiel directement

Aucun `supabase.from('tags')` (ni `units`, `allergens`…) **en lecture** hors de
`lib/data/reference.ts`. C'est la dispersion des accès qui avait produit trois
requêtes distinctes sur `tags`, deux sur `allergens` et trois sur
`ingredient_refs` — la même table, découpée différemment selon l'appelant.

Besoin d'une forme différente ? Elle se dérive **en mémoire** de la lecture
déjà en cache (cf. `getTags` / `getHomeCategories` / `getTagBySlug`, qui
partagent une seule lecture). Ces tables sont petites ; une requête SQL par
variante ne se justifie pas.

`lib/taxonomy.ts`, `lib/imports.ts` et les autres ne sont plus que des
ré-exports : ils existent pour ne pas avoir eu à toucher ~60 sites d'appel, pas
pour y remettre des requêtes.

### Règle 2 — Toute écriture sur un référentiel doit invalider son étiquette

Une écriture non suivie d'une invalidation laisse la valeur périmée **jusqu'à
24 h** selon la table. Depuis un Client Component :

```ts
import { revalidateReference } from '@/lib/revalidate-reference';
await revalidateReference('units'); // puis router.refresh()
```

L'ordre compte : invalider **avant** de re-rendre. `router.refresh()` seul
re-rend la page, mais le Server Component relit la valeur en cache — l'écran ne
bouge pas, et le développement conclut à tort que l'écriture a échoué.

Sites déjà câblés : `ListsManager` (les neuf tables, aux deux points de
mutation), `BannerManager`, `RecipeDefaultPhotoManager`, `CreerForm` et
`RelectureEditor` (tags / ustensiles / ingrédients créés depuis l'éditeur).

### Règle 3 — Le client de cache ne voit que ce que la RLS ouvre à tout le monde

`unstable_cache` interdit toute API de requête dans son callback : la lecture
se fait donc au rôle `anon`, sans cookie. **Ne jamais y faire passer une donnée
dépendant de l'utilisateur** (favoris, brouillons, carnet, planning) : la
première réponse mise en cache serait servie à tous les visiteurs suivants.

Le corollaire est moins évident et plus dangereux : une RLS qui refuse ne
renvoie pas une erreur, mais **zéro ligne**. Un cache posé dessus figerait une
liste vide, silencieusement, pendant 24 h.

D'où l'invariant du module : **un référentiel vide est un symptôme, jamais un
résultat.** Une lecture vide n'est pas mise en cache et la requête est refaite
avec le client à cookies — le comportement d'avant le chantier. On perd le
gain sur cette table, jamais l'affichage.

`site_settings` est la seule exception (`allowEmpty: true`) : n'avoir aucune
bannière est un état normal du site.

## 3. Points de vigilance

- **Une nouvelle table de référence** doit être ajoutée dans
  `lib/data/reference.ts`, avec sa durée de validité, **et** être invalidée à
  l'écriture. Ajoutée ailleurs, elle repart pour un tour du problème initial.
- **Un référentiel n'est pas lisible au rôle `anon`** ? Le repli fonctionne, et
  c'est silencieux par conception. Symptôme à connaître : le compteur de cette
  table ne baisse pas alors que les autres s'effondrent. Deux tables sont dans
  ce cas incertain — `ingredient_refs` et `utensils`, lues uniquement depuis
  des écrans authentifiés (`/importer`, `/relecture`), soit 1 869 appels du
  relevé. À vérifier après déploiement ; si le repli s'avère systématique,
  ouvrir la RLS en lecture publique sur ces deux tables (leur contenu est un
  référentiel, pas une donnée personnelle).
- **Le back-office lit sans cache** : `getSiteSettings` (`lib/site.ts`) est
  conservé non mis en cache pour `app/admin/photos`. Un écran d'administration
  ne pèse rien et n'a pas à voir une valeur périmée. Ne pas « optimiser » ça.
- **Les durées de validité sont un filet, pas le mécanisme** : la propagation
  repose sur l'invalidation (règle 2). Les allonger sans vérifier que toutes
  les écritures invalident bien reviendrait à allonger le délai pendant lequel
  un oubli reste invisible.
- **`lib/data/reference.ts` importe `next/headers`** (via le client à cookies
  du repli) : il ne doit jamais être importé par un Client Component. Le build
  échoue si ça arrive — c'est le garde-fou, il suffit de ne pas le contourner.


---

## 4. Profil et rôle (chantier 3)

### Ce qui a changé

`getRole()` ne fait plus de requête : il **dérive** de `getProfile()`. Les deux
visaient la même ligne de `profiles` — l'une ne prenait que `role`, l'autre
tout le reste — et chacune portait son propre `cache()` React, si bien qu'elles
ne se dédupliquaient jamais entre elles. `Header` appelait précisément les deux
(`getProfile` pour l'avatar, `isManager` pour le lien back-office), ce qui
reproduisait le doublon sur **chaque page du site** : 5 572 + 4 306 appels au
relevé du 25/08/2026.

### Règle 4 — `getProfile()` est le seul accesseur du profil courant

Ne jamais rajouter de `supabase.from('profiles')` visant l'utilisateur courant.
`getProfile`, `getRole`, `isAdmin`, `isManager` sont mémoïsés par requête et
partagent désormais **une seule** lecture. Une lecture directe ajoutée ailleurs
recrée exactement le doublon que ce chantier a supprimé — c'est ce qui était
arrivé à `/api/admin/*`, `getAdminImpersonationAccess` et `aChoisiSonPseudo`,
tous ramenés sur l'accesseur unique.

Les lectures de `profiles` qui visent **quelqu'un d'autre** (recherche de
membres, profil public, disponibilité d'un pseudo) restent des requêtes à part
entière : ce n'est pas la même ligne, il n'y a rien à dédupliquer.

### Règle 5 — Pas de `select('*')` sur `profiles`

Les colonnes sont énumérées (`PROFILE_COLUMNS`, `lib/auth.ts`). La liste couvre
exactement le type `Row` : le comportement est identique. Ce qu'on gagne est
ailleurs — `profiles` porte **trois colonnes d'image en data-URL**
(`avatar_url`, `banner_url`, `cover_url`) et cette ligne est lue à chaque rendu
de page par le `Header`. Avec `select('*')`, toute colonne lourde ajoutée à la
table rejoindrait silencieusement le payload de tout le site ; ici il faut
l'écrire, donc le décider.

### À verser au chantier 5

`Header` et `MobileNav` lisent le profil complet à chaque page alors qu'ils
n'en utilisent que `avatar_url` (via `resolveAvatarUrl`). Ils rapatrient donc
`banner_url` et `cover_url` — deux data-URL — pour rien, sur toutes les pages
du site. À noter : **`cover_url` n'est lu nulle part dans le code applicatif**.

Le correctif n'est pas gratuit et sort du périmètre du chantier 3 : un
accesseur allégé pour le chrome ferait deux lectures sur `/reglages`, seule
page qui a besoin du profil complet **et** du `Header`. À arbitrer sur mesure
d'octets, pas d'intuition.

### Cible non faite — le rôle dans le JWT

La spec (§ 6) prévoit à terme d'injecter `role` dans le token via un *Custom
Access Token Hook* Supabase, ce qui supprimerait la lecture plutôt que de la
dédupliquer. **Non fait**, délibérément : cela touche au schéma (seule entorse
prévue au non-objectif « ne pas toucher au schéma »), exige une configuration
côté tableau de bord Supabase, et surtout change la sémantique de propagation —
un changement de rôle ne prendrait effet qu'au rafraîchissement du token, ce
qui impose d'invalider les sessions lors d'un changement de rôle admin.

À traiter comme un chantier à part entière, avec sa propre mesure. La
déduplication ci-dessus ramène déjà le poste de ~9 900 appels à une lecture par
rendu de page.


---

## 5. Impersonation (chantier 4)

### Ce qui a changé

`impersonation_sessions` était interrogée à **chaque rendu de page**, pour tout
membre connecté, depuis le layout racine — 3 871 appels au relevé, pour un cas
qui ne concerne qu'une poignée de sessions d'administration. Un cookie témoin
`mc_imp` conditionne désormais la requête.

### Pourquoi pas le critère proposé par la spec

La spec (§ 7) proposait de conditionner à `role === 'admin'`. **C'est faux
ici** : la *cible* d'une impersonation est un membre ordinaire, pas un admin —
la ligne vise `target_user_id`. Ce critère aurait sauté la vérification pour
exactement les comptes qu'elle protège, c'est-à-dire désactivé le bridage
lecture seule côté client. C'est l'« alternative complémentaire » de la même
section qui était la bonne.

### Règle 6 — Le cookie aiguille, la table décide, la RLS garantit

Trois niveaux, à ne pas confondre :

| | Rôle | Peut-on s'en passer ? |
|---|---|---|
| Cookie `mc_imp` | dit s'il vaut la peine d'interroger la table | oui, au prix d'une requête par page |
| Ligne `impersonation_sessions` | décide du mode (`read_only` / `write`) | non — c'est la logique applicative |
| `public.is_read_only_session()` (RLS) | refuse les écritures en SQL | non — **c'est la sécurité** |

Ne jamais inverser cet ordre. En particulier : **ne pas faire du cookie une
source de vérité** (y stocker le mode, l'id de session, une date). Sa valeur est
opaque (`'1'`) exprès — il n'y a rien à y lire, donc rien à falsifier.

### Ce que ça coûte, dit franchement

Supprimer le cookie (il est `httpOnly`, donc hors de portée d'un script : il
faut les outils de développement) fait disparaître le bandeau et lève les
gardes **client** (`useMutation`, `useWriteGuard`, `requireWritableSession`).
Les écritures partent alors — et sont refusées par la RLS. On y perd un message
clair au profit d'une erreur, pas une protection. Et la personne qui opère cette
fenêtre est l'admin lui-même, qui n'y gagne rien.

C'est un écart assumé avec la doctrine antérieure (« pas de cookie dédié : le
mode ne peut pas être désactivé côté navigateur »), corrigée dans `CLAUDE.md`
plutôt que laissée à faux.

### Cas limites, tous inoffensifs par construction

Le cookie n'ouvre qu'une vérification : il ne peut donc jamais faire croire à
une session qui n'existe pas.

- **L'admin clôture la session depuis `/admin/membres`** (pas depuis le
  bandeau) : le cookie survit dans le navigateur du membre, mais la table
  répond « aucune session ». Comportement correct, au prix d'une requête par
  page jusqu'à expiration — soit le comportement d'avant ce chantier.
- **Le membre se déconnecte normalement** : même chose, ≤ 60 min.
- **Un autre compte se connecte sur ce navigateur** : la requête est toujours
  clefée sur l'utilisateur courant, elle ne trouve rien. Aucune fuite possible.


---

## 6. Sessions et vérification du JWT (chantier 1-bis)

### Règle 7 — Deux niveaux de vérification, à ne pas confondre

| Où | Appel | Ce qu'il prouve |
|---|---|---|
| `middleware.ts` | `getClaims()` | le JWT est **signé par Supabase et non expiré** (vérification locale) |
| Pages privées, routes | `getUser()` via `getCurrentUser()` | la session est **encore valide côté serveur d'authentification** |

Le middleware ne fait qu'aiguiller vers `/connexion`. Le contrôle qui compte —
`requireUser()`, `requireAdmin()`, les routes `/api` — passe par
`getCurrentUser()`, qui appelle toujours `getUser()`.

**Ne pas « optimiser » `getCurrentUser()` en `getClaims()`.** Le gain serait
d'un aller-retour par rendu, le coût serait qu'une session révoquée
(déconnexion sur un autre appareil, compte supprimé, mot de passe changé)
resterait acceptée jusqu'à l'expiration de son token — soit une heure par
défaut. C'est un arbitrage de sécurité, pas une optimisation ; s'il doit être
fait un jour, ce sera une décision explicite, pas un effet de bord.

### Le gain dépend d'un réglage hors du dépôt

`getClaims()` ne vérifie localement que si le projet Supabase utilise des
**clés de signature asymétriques** (ECC/RSA). Sur l'ancien secret partagé
(HS256), il retombe tout seul sur `getUser()` : le code est correct, mais le
gain est nul. La bascule se fait dans le tableau de bord Supabase
(Authentication → JWT Keys).

Symptôme si l'oubli passe inaperçu : les compteurs GoTrue (`sessions`,
`identities`, `mfa_amr_claims`, `users`) ne baissent pas après déploiement,
alors que les compteurs REST se sont effondrés.

### Ce qui n'a pas été fait, et pourquoi

Sortir du middleware sur les prefetch RSC (`next-router-prefetch`) était la
piste la plus risquée du chantier : le middleware n'écrirait plus de cookie
rafraîchi sur ces réponses, avec un risque de sessions perdues difficile à
reproduire. `getClaims()` lui retire sa raison d'être — un prefetch ne coûte
plus d'aller-retour réseau. À ne pas ressortir sans une raison neuve.


---

## 7. Payloads et lectures en série (chantier 5)

### Règle 8 — Un accesseur de liste ne ramène pas les enfants que la vue n'affiche pas

`getShoppingLists` ramène ses articles (`id, checked`) parce que la vue en
calcule un avancement. `getShoppingListNames` ne ramène rien parce qu'un
sélecteur n'affiche que des noms. Deux vues, deux accesseurs.

Le piège est de réutiliser l'accesseur riche « puisqu'il existe » et de filtrer
en JavaScript : c'est ce que faisait la fiche recette, qui tirait tous les
articles de toutes les listes du membre pour afficher une liste déroulante.
Filtrer après coup ne coûte rien en code et beaucoup en réseau — et ça ne se
voit pas à la lecture du composant, seulement à celle de l'accesseur.

### Règle 9 — Les lectures du chrome sont sur le chemin critique de tout le site

`Header` et `MobileNav` sont rendus sur **chaque** page. Une lecture ajoutée là
est une lecture ajoutée partout, et un `await` de plus est un aller-retour de
plus avant que quoi que ce soit ne s'affiche.

Y ajouter quelque chose : le mettre dans le `Promise.all` existant, jamais à la
suite. Ce qui ne dépend pas de la session part avec `getCurrentUser()`, pas
après.

### Ce que « moins de requêtes » ne veut pas dire

Le nombre de requêtes et le temps de chargement sont deux problèmes distincts,
et ce chantier l'a montré :

- Dix requêtes dans un `Promise.all` coûtent **un** aller-retour ; trois
  requêtes enchaînées en coûtent **trois**. Le chantier 2 a supprimé 22 920
  requêtes, mais l'essentiel était déjà parallèle — c'était un problème de
  facture, pas de vitesse.
- À l'inverse, la parallélisation ci-dessus ne supprime **aucune** requête et
  se voit directement au chargement.

Ne pas confondre les deux en lisant les compteurs après déploiement.

### `select('*')` : ce qui reste, et pourquoi

Il en subsiste dans `lib/admin.ts`, `lib/admin-blog.ts`, `lib/impersonation.ts`
et `lib/imports.ts` : écrans de back-office, volume négligeable. Ce n'est pas
un oubli. La règle utile n'est pas « bannir `select('*')` partout » mais
**« pas de `select('*')` sur une table lue à chaque rendu, ni sur une table qui
porte des colonnes d'image en data-URL »** — `profiles` et `recipes` cochent
les deux cases.
