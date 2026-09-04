# Migration Vercel + Supabase → Infomaniak

Étude et vérifications préalables à la sortie de Vercel et de Supabase Cloud,
au profit d'une infrastructure hébergée chez **Infomaniak**, en Suisse. La
localisation dépend du produit : le Public Cloud est à Genève et Winterthour,
**Virtuozzo Cloud (ex-Jelastic) à Genève uniquement** (§ 4.3).

État au **03/09/2026**. Le lot 0 (vérifications bloquantes) est terminé, à
l'exception de la répétition de restauration (§ 7.2). Les chiffres de la § 2
sont des mesures réelles, pas des estimations.

**Motif du chantier** : l'empreinte écologique, avant le coût et avant la
souveraineté. C'est ce critère qui a désigné Infomaniak plutôt que Scaleway,
Clever Cloud ou Hetzner — datacenters en propre, 100 % d'énergie renouvelable,
récupération de chaleur revendue au réseau urbain, certifications ISO 14001 et
50001, infrastructure passée sous le contrôle d'une fondation en mai 2026.

---

## 0. Résumé

| Chantier | Verdict au 03/09/2026 |
|---|---|
| Sortie de Vercel | **Faisable, 1-2 j** — couplage faible, sept accroches identifiées |
| Photos hors base → stockage objet | **Validé de bout en bout**, CORS compris. 7-10 j |
| Sortie de Supabase Cloud | **Débloquée** — le Database Service ne propose que MySQL, mais Virtuozzo Cloud fournit PostgreSQL (§ 4). 5-8 j |
| Quitter l'API Supabase (PostgREST/GoTrue) | **Écarté** — réécriture de fond, § 1.3 |

**Le fait structurant** : la base pèse **57 Mo** et compte **7 comptes**. Tout
ce dossier a été réévalué à la lumière de ces deux chiffres — plusieurs
conclusions posées avant de les connaître étaient fausses (§ 8).

**Cible retenue** :

```
Virtuozzo Cloud (Genève)
├── Nœud Node.js 22    → Next.js standalone, déployé depuis GitHub
├── Docker             → supabase/postgres 15+
├── Docker             → PostgREST + GoTrue
└── Load Balancer      → Let's Encrypt, jepatisse.com + dev.jepatisse.com

Public Cloud Object Storage → photos (§ 3, validé)
```

---

## 1. Deux décisions indépendantes

Sortir de Vercel et sortir de Supabase ne sont pas le même chantier, ni de
loin. Les traiter comme un bloc était la première erreur à éviter.

### 1.1 Vercel — couplage faible

Sept accroches, toutes triviales :

| Accroche | Emplacement | Poids |
|---|---|---|
| `vercel.json` — 2 crons | racine | Trivial |
| `maxDuration` (20 routes) | `app/api/**` | Sans objet hors serverless |
| `VERCEL_GIT_COMMIT_SHA` | `app/sw.js/route.ts:27`, `app/contact/page.tsx:33` | 2 lignes — **le nom du cache PWA en dépend** |
| `VERCEL_URL` | `lib/site-url.ts:12` | 1 ligne |
| Middleware `runtime: 'nodejs'` | `middleware.ts` | Natif en auto-hébergé |
| `unstable_cache` + `revalidateTag` | 8 fichiers | OK mono-instance ; multi-instance → `cacheHandler` Redis |
| `next/image` | **0 fichier** | Rien à migrer |

**Bénéfice fonctionnel de la sortie** : la disparition du plafond
`maxDuration = 60 s`, et avec lui du `HARD_DEADLINE_MS = 54_000` de
`app/api/moderation-recette/route.ts:102`. Ce n'est pas qu'une affaire
d'hébergement : ce plafond tronque des imports photo et fait rendre la main à
la modération avant son terme.

**Ce qu'on perd** : les *preview deployments* par branche. Virtuozzo Cloud sait
cloner un environnement et pilote tout par API/CLI, donc la reconstruction est
plausible — mais elle n'a **pas été vérifiée**, et ce n'est pas une
fonctionnalité native. À prévoir explicitement, pas à supposer acquis.

### 1.2 Supabase — couplage profond, et voulu

Ce n'est pas « une base de données », c'est l'architecture de sécurité du
produit :

- `supabase-js` écrit **depuis le navigateur**, la RLS étant la seule barrière ;
- **21 RPC** appelées par l'application (`search_advanced_recipes`,
  `list_ideas`, `merge_ideas`, `mc_consume`, `duplicate_recipe`…) ;
- `getClaims()` — vérification ES256 locale contre le JWKS du projet, doctrine
  documentée dans `CLAUDE.md`, dont dépend ~65 % du trafic base ;
- GoTrue complet : e-mail/mot de passe, OAuth Google, `generateLink`
  (impersonation), `verifyOtp` ;
- clé `service_role` pour les modules sans policy d'écriture (contact/Jira,
  avis, pseudo).

**Ni Storage ni Realtime** (vérifié : aucun `.storage.` ni `.channel(` dans le
code). Deux dépendances lourdes en moins.

### 1.3 Les deux seules familles de sortie

**(A) Garder l'API Supabase** — PostgREST + GoTrue + Kong, tous open source, sur
une infrastructure à nous. **Zéro ligne de code métier modifiée.** On hérite de
l'exploitation.

**(B) Quitter l'API Supabase** — Appwrite, PocketBase, Nhost/Hasura,
Prisma + Auth.js… Toute la RLS remonterait en couche serveur : ~374 fichiers
concernés, plusieurs mois de travail, et la doctrine du projet détruite pour un
gain d'hébergement.

**(B) est écartée.** Tout ce document relève de (A).

---

## 2. Mesures du 03/09/2026

### 2.1 Volumétrie

Top des tables (`pg_total_relation_size`) :

| Table | Total | dont TOAST | Lignes |
|---|---|---|---|
| `step_photos` | 27 Mo | 27 Mo | 93 |
| `recipes` | 12 Mo | 12 Mo | 50 |
| `imports` | 4 888 ko | 4 816 ko | 26 |
| `recipe_shingle_index` | 3 552 ko | 312 ko | 42 |
| `contact_message_photos` | 2 528 ko | 2 488 ko | — |
| `site_settings` | 1 448 ko | 1 424 ko | — |
| `contact_reply_photos` | 992 ko | 952 ko | — |
| `comments` | 952 ko | 912 ko | — |
| `articles` | 824 ko | 736 ko | — |

**Cumul du top 20 : ≈ 57 Mo.** La prédominance du TOAST partout est la
signature des data-URL.

### 2.2 Poids des images

| Colonne | Lignes | Poids | % des images |
|---|---|---|---|
| `step_photos.original_url` | 89 | 14 Mo | 37,7 % |
| `step_photos.url` | 93 | 11 Mo | 30,2 % |
| `recipes.hero_image_url` | 37 | 5 334 ko | 14,3 % |
| `recipes.hero_image_original_url` | 25 | 3 597 ko | 9,6 % |
| `site_settings.value` | 4 | 947 ko | 2,5 % |
| `recipes.hero_card_url` | 37 | 939 ko | 2,5 % |
| `comments.photo_urls` | 2 | 650 ko | 1,7 % |
| `profiles.banner_url` | 1 | 182 ko | 0,5 % |
| `recipes.hero_thumb_url` | 37 | 119 ko | 0,3 % |
| `articles.cover_image_url` | 1 | 103 ko | 0,3 % |
| `profiles.avatar_url` | 2 | 64 ko | 0,2 % |
| `ads.image_url` | 1 | 31 ko | 0,1 % |
| `articles.content` (JSON) | **0** | 2 522 o | 0,0 % |

**≈ 37 Mo**, auxquels s'ajoutent `contact_message_photos` (2 528 ko) et
`contact_reply_photos` (992 ko), absentes de la requête faute d'être dans
`lib/database.types.ts` (§ 6.1).

**Total images ≈ 40 Mo, soit ~65 % de la base.**

Ramené au contenu : **~740 ko d'images par recette**. Projection — 1 000
recettes ≈ 740 Mo, 5 000 recettes ≈ 3,7 Go. La fenêtre pour traiter le sujet à
peu de frais est large aujourd'hui, elle se referme vite.

### 2.3 Extensions installées

| Extension | Schéma | Rôle |
|---|---|---|
| `pg_trgm` | `extensions` | Repli trigramme de `suggest_similar_ideas` |
| `unaccent` | `extensions` | **`mc_norm()`** — toute la recherche avancée |
| `pgcrypto` | `extensions` | — |
| `uuid-ossp` | `extensions` | — |
| `btree_gist` | **`public`** | — |
| `pg_stat_statements` | `extensions` | Observabilité, optionnel |
| `supabase_vault` | `vault` | **Non utilisé par l'application** (vérifié) |
| `plpgsql` | `pg_catalog` | Intégré |

Deux enseignements. D'abord `unaccent` est aussi critique que `pg_trgm` et
avait été oublié de la première liste. Ensuite `btree_gist` vit dans `public`,
pas dans `extensions` — un script de reconstruction qui met tout dans le même
schéma serait faux.

`supabase_vault` est le seul objet réellement spécifique à Supabase, et rien ne
l'utilise : **il n'y a rien à porter de ce côté.**

### 2.4 Comptes et surface SQL

- **7 identités** : 4 e-mail, 3 Google.
- **252 fonctions** dans `public`, **320 policies RLS**, **31 triggers**.

Le chiffre de 252 est trompeur : `btree_gist` installe à lui seul plus d'une
centaine de fonctions dans `public`. Et surtout, **tout cela est transporté par
`pg_dump`** — rien à réécrire à la main. Le risque n'est pas la quantité mais
l'ordre des dépendances : rôles et extensions doivent exister **avant** la
restauration, sinon 320 policies échouent ensemble.

---

## 3. Le stockage objet Infomaniak — validé

Vérifié sur un conteneur de test (`test-photos`, projet `PCP-BXPGU6A`,
région `dc4-a`) :

| Point | Résultat |
|---|---|
| Stockage objet compatible S3 (Swift) | ✅ disponible |
| Lecture publique d'un objet par son URL | ✅ |
| **CORS par défaut** | ❌ **absent** |
| CORS configurable | ✅ par métadonnée de conteneur |
| Configurable depuis Horizon | ❌ — Horizon n'expose pas les métadonnées |
| Quotas « niveau 1 » | 20 vCPU, 64 Go RAM, 1 To de volumes — largement suffisants |

**Horizon n'expose aucun service de base de données** : le menu s'arrête à
Compute / Volumes / Réseau / Orchestration / DNS / Stockage d'objet / Identité.
Le *Database Service* se pilote depuis le manager Infomaniak, l'API ou
Terraform.

### 3.1 Le CORS, et pourquoi il compte

Une image du conteneur **s'affiche parfaitement** dans le navigateur, et
pourtant son traitement canvas est refusé :

```
Access to image at 'https://s3.pub2.infomaniak.cloud/...'
from origin 'https://dev.jepatisse.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

C'est le piège exact du chantier photos : le symptôme n'apparaît pas à
l'affichage, mais à la **réédition** d'une photo et au **calcul des dérivés**.

Deux correctifs, indissociables, livrés dans la PR #201 :

1. `lib/images.ts` — `chargerImageDepuisSrc` pose `crossOrigin = 'anonymous'`
   avant `src`. Sans effet aujourd'hui, la spécification ignorant l'attribut
   sur le schéma `data:`.
2. `.github/workflows/object-storage-cors.yml` — pose les métadonnées CORS d'un
   conteneur Swift et **se vérifie lui-même** (relit l'en-tête, échoue s'il est
   absent). Exécuté avec succès sur `test-photos` le 03/09/2026.

Le workflow retire aussi `.rlistings` de l'ACL de lecture : l'option « accès
public » de Horizon l'ajoute, ce qui laisse **énumérer publiquement tous les
fichiers du conteneur**. Sans conséquence sur un conteneur de test, à ne pas
emporter tel quel une fois les photos des membres migrées.

---

## 4. La base : le Database Service ne suffit pas, Virtuozzo Cloud oui

### 4.1 Le Database Service ne propose que MySQL

**Au 03/09/2026, le Database Service du Public Cloud ne propose que MySQL.**
PostgreSQL, MariaDB, OpenSearch et Redis sont annoncés « Bientôt disponible »,
sans échéance publiée.

MySQL n'est pas une option : la sécurité repose sur la RLS PostgreSQL, plus 252
fonctions, 320 policies, `pg_trgm`, `jsonb` et les colonnes générées. Ce serait
une réécriture du produit, pas une migration.

### 4.2 Les voies examinées

**Attendre le managé.** « Bientôt » n'est pas une date. La question est posée au
support, mais on ne planifie pas contre ça.

**Séparer la base du reste** — application et photos à Genève, PostgreSQL managé
à Paris ou maintenu sur Supabase à Francfort. **Écartée**, et pour une raison
inscrite dans `DEPLOY.md` : les fonctions ont été déplacées de Washington à
Francfort précisément pour coller à la base, parce qu'*« une page en enchaîne
plusieurs, dont certaines en série »*. Genève ↔ Paris ou Genève ↔ Francfort,
c'est ~10 ms d'aller-retour contre moins de 2 ms aujourd'hui. Cette voie
régresse exactement sur l'axe qui avait été optimisé.

**PostgreSQL sur une instance Public Cloud nue.** Tenable — 57 Mo et 7 comptes
ne demandent pas une infrastructure — mais tout se pilote en SSH : `docker
compose`, unités systemd, scripts de sauvegarde. **Reste le repli.**

**Virtuozzo Cloud (ex-Jelastic Cloud).** Le PaaS d'Infomaniak. **Voie retenue.**

### 4.3 Virtuozzo Cloud — ce qui a été vérifié

| Point | Verdict |
|---|---|
| PostgreSQL | ✅ 14.24, **15.19, 16.15, 17.11, 18.6** (AlmaLinux 9) |
| Node.js | ✅ **22.23.2**, 24.20.0, 26.8.1 — 18.x et 20.x marqués EOL |
| SSH / superutilisateur | ✅ SSH natif (gate, Web SSH, add-on *Direct Access*). Root non ouvert par défaut, add-on JPS documenté pour l'obtenir |
| Conteneurs Docker personnalisés | ✅ n'importe quelle image |
| Déploiement depuis GitHub | ✅ Git avec mises à jour automatiques, add-on *Git-Push-Deploy*, API REST/CLI |
| SSL + domaine personnalisé | ✅ Let's Encrypt gratuit sur le nœud Load Balancer |
| Datacenter | ⚠️ **Genève 1 et Genève 2 uniquement** — pas Winterthour |
| Sauvegardes / PITR | ⚠️ **à notre charge** — add-on Backup/Restore (dumps planifiés) ou Swiss Backup, facturé à part. **Aucun PITR fourni** |
| Prix | ⚠️ **non confirmé** — voir § 4.5 |
| Pérennité | ✅ renommage « Virtuozzo Cloud (anciennement Jelastic Cloud) », simple alignement de marque. En production chez Infomaniak depuis 2018, v8.14.3 |

**Deux fournisseurs, une couche critique** : Infomaniak fournit l'infrastructure
et le support, **Virtuozzo le logiciel et sa maintenance**. C'est le vrai coût
de cette voie, et il porte sur la brique qui héberge la base.

### 4.4 `supabase/postgres` plutôt que le stack PostgreSQL certifié

Puisque les conteneurs Docker arbitraires sont autorisés, **on déploie l'image
`supabase/postgres`** plutôt que le stack certifié d'Infomaniak. Ça évite
d'ouvrir root pour compiler des extensions — mais l'argument principal est
ailleurs : **cette image pose l'environnement que le dump attend.**

| Ce que l'image apporte | Pourquoi ça compte |
|---|---|
| Rôles `anon`, `authenticated`, `service_role`, `authenticator`, `supabase_admin` | Les **320 policies** les référencent ; sans eux, elles échouent en bloc |
| Schémas `auth`, `extensions`, `graphql_public` | GoTrue n'a plus à créer `auth` ; l'ordre de restauration cesse d'être un piège |
| Extensions déjà dans le schéma `extensions` | Exactement la disposition mesurée en § 2.3 |
| `supabase_vault` | Inutile ici (§ 2.3), mais le dump y fait référence |

On ne bricole donc pas un PostgreSQL qui ressemblerait à Supabase : **on déploie
la pile self-host officielle, allégée** de Studio, Storage et Realtime — dont
l'application n'a de toute façon aucun usage (§ 1.2). Chemin documenté, pas
assemblage maison. L'accès root redevient un secours, pas un prérequis.

Reste une exception à poser à la main : `btree_gist` vit dans `public` sur la
base source (§ 2.3), l'image ne l'y mettra pas d'elle-même.

### 4.5 Ce qui reste à charge

**Le PITR n'est pas fourni, et ce n'est pas « un chantier à part ».** Avec
`supabase/postgres` d'un côté et un bucket S3 déjà validé de l'autre,
l'archivage WAL (`wal-g`) représente une demi-journée. Il appartient à la
**définition de terminé du lot C**, pas à un projet qu'on repousse : le moment
où il deviendra nécessaire — des abonnés payants — est celui où il sera trop
tard pour l'ajouter tranquillement. D'ici là, un `pg_dump` nocturne vers le
bucket suffit ; perdre 24 h de données avant l'ouverture ne coûte rien.

**Une seule région.** Genève uniquement : pas de reprise sur un autre site. À
accepter explicitement.

**Le prix reste le seul chiffre manquant.** Base annoncée : 1 conteneur de
128 Mo / 400 MHz, 20 Go SSD et 1 IPv4 pour **CHF 6.31/mois**. Sont offerts les
20 premiers Go de disque, le SSL, et **2,8 Go/h de trafic externe** (~2 To/mois,
généreux pour un site chargé en images). Les cloudlets réservés sont dégressifs
(56 % de remise entre 13 et 16). La pile réelle — Next.js ~0,5-1 Go, PostgreSQL
~0,5-1 Go, PostgREST et GoTrue ~256 Mo chacun — demande **1,5 à 2,5 Go
réservés**, soit un ordre de grandeur de **25-40 CHF/mois**. Le tarif unitaire
est chargé en JavaScript et n'a pu être lu ni par l'auteur de ce document ni par
la vérification manuelle : **à confirmer au simulateur.**

À comparer à Vercel Pro + Supabase Pro, ~45 $/mois aujourd'hui.

---

## 5. Trouvailles

### 5.1 Les originaux pèsent la moitié des images et ne sont jamais affichés

`step_photos.original_url` (14 Mo) + `recipes.hero_image_original_url`
(3,6 Mo) = **17,6 Mo, 48 % du poids image**. Ils ne servent qu'à la réédition
dans `CreerForm` et `RelectureEditor` (`originalSrc={p?.original_url}`).

Or `FULL_SELECT` (`lib/recipes.ts`, ~ligne 243) fait
`recipe_steps(*, step_photos(*))` et `select *` sur `recipes` : **chaque
ouverture de fiche recette publique transporte les originaux, jamais rendus.**

Ce n'est pas une correction d'une ligne — `getRecipeFull` est partagé :

| Appelant | A besoin des originaux ? |
|---|---|
| `app/recette/[id]/page.tsx` | **Non** |
| `app/api/moderation-recette/route.ts` | **Non** |
| `app/api/reindex-recette/route.ts` | **Non** — et il boucle sur toutes les recettes publiées |
| `app/creer/page.tsx` | Oui |
| `app/projets/[id]/page.tsx` | Oui |

Il faut une variante ou un paramètre. **Chantier indépendant de toute
migration, à fort rendement immédiat** — c'est le premier poste d'egress
identifié après ceux déjà traités dans `docs/audit-egress-supabase.md`.

### 5.2 Cinq réserves sur les colonnes image

L'hypothèse « les lecteurs des colonnes `*_url` sont indifférents au format »
est **confirmée pour l'affichage** — tous les sites de rendu passent la chaîne à
un `<img src>`, et `next/image` n'est utilisé nulle part. Cinq exceptions :

1. **Deux validations rejettent activement une URL http.** `lib/reviews.ts:78`
   (`!p.url.startsWith('data:image/')`) et `lib/contact.ts:198` (filtre sur le
   même préfixe). La seconde **écarte sans erreur** : une photo de contact
   migrée disparaîtrait en silence. `lib/contact.test.ts` verrouille ce
   comportement, à reprendre avec le contrat.
2. **Canvas taint CORS** — traité, § 3.1.
3. **Gisement d'images hors colonnes dédiées** : `articles.content` (HTML
   TipTap, `BlogEditor` sait y insérer des data-URL), `site_settings.value`
   (bannières, photo par défaut) et `ads.image_url`. **Mesuré : 0 image inline
   dans `articles.content`** — le blog n'est pas un gisement aujourd'hui, à
   surveiller si des articles illustrés sont rédigés d'ici là.
4. **`select('*')` sur les photos d'étape** — § 5.1.
5. **Cycle de vie des objets.** Supprimer une recette supprime aujourd'hui ses
   images (cascade FK). Avec un bucket, les objets survivent à la ligne : il
   faut une politique de nettoyage. Point le plus systématiquement oublié.

### 5.3 `imports` — 4,9 Mo sans rétention

26 lignes, 4 888 ko (8 % de la base) : des brouillons d'import IA, données
transitoires. Une politique de rétention récupérerait ces mégaoctets.

---

## 6. Points ouverts

### 6.1 `lib/database.types.ts` est périmé

`contact_messages`, `contact_replies`, `contact_message_photos` et
`contact_reply_photos` en sont **absents** (0 occurrence). Un
`npm run gen:types` s'impose avant d'attaquer le chantier photos — le module
contact porte des photos, et travailler sur une carte incomplète les ferait
oublier.

### 6.2 Non vérifié à ce jour

- **Prix Virtuozzo Cloud** — le tarif unitaire du cloudlet est chargé en
  JavaScript et n'a pas pu être lu. Ordre de grandeur retenu : **25-40
  CHF/mois** pour la pile complète (§ 4.5), **à confirmer au simulateur**.
  C'est le seul chiffre qui manque encore au dossier.
- **La restauration du dump Supabase n'a jamais été tentée** — c'est le
  Go/No-Go réel (§ 7.2).
- **Échéance du PostgreSQL managé du Public Cloud** — question posée au
  support. Sans effet sur le plan depuis que Virtuozzo Cloud fournit
  PostgreSQL (§ 4), mais un managé natif resterait préférable à terme.
- **RGPD / nLPD** : la Suisse est hors UE mais couverte par une décision
  d'adéquation. Transfert licite, à documenter au registre, dans la politique
  de confidentialité et les mentions légales **avant l'ouverture**.
- **Pas de CDN à points de présence mondiaux** chez Infomaniak. Non-sujet pour
  un public francophone (Genève ≈ 10-25 ms), sujet réel pour une audience
  mondiale.
- **La région du bucket n'est PAS un point ouvert**, contrairement à ce qu'on
  pourrait croire : les photos sont servies **au navigateur**, pas au serveur
  applicatif. La latence bucket ↔ application ne joue que sur les téléversements
  et la sauvegarde nocturne. Seul reliquat possible, négligeable : une
  éventuelle facturation du trafic inter-datacenter pour un dump de quelques
  dizaines de mégaoctets.
- **Le projet Vercel `dev_jp`** construit le même dépôt sur la même base. À
  trancher **avant** toute bascule, sinon deux applications écriront dans deux
  bases différentes.

---

## 7. Plan

### 7.1 Immédiat

Passer la pile au **simulateur de prix Virtuozzo Cloud** — le seul chiffre qui
manque encore (§ 4.5). Accessoirement, demander au support l'échéance du
PostgreSQL managé du Public Cloud : sans effet sur le plan, mais un managé natif
resterait préférable à terme.

### 7.2 Lot 0-bis — répétition de restauration (1 j)

Le Go/No-Go a changé de nature, et y a gagné. Plutôt que de vérifier des
permissions une à une sur un service managé, on répète le lot C pour de vrai :

> Monter un environnement Virtuozzo Cloud avec le conteneur Docker
> `supabase/postgres` (15+) et GoTrue, puis **restaurer le dump Supabase** et
> vérifier que les 320 policies, les 252 fonctions et les 31 triggers passent.

Ce test répond à toutes les questions d'un coup — extensions, rôles, schéma
`auth`, objets spécifiques à Supabase — et produit directement le mode
opératoire du lot C.

**L'image rend largement superflue la préparation manuelle** décrite ci-dessous
(§ 4.4) : rôles, schémas et extensions y sont déjà posés. Ce bloc reste comme
filet, à jouer seulement si la restauration échoue sur un objet manquant — et
`btree_gist` fait exception, il vit dans `public` sur la base source et l'image
ne l'y mettra pas d'elle-même.

```sql
-- Rôles supposés par les 320 policies (déjà présents dans supabase/postgres)
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- Extensions, dans les schémas d'origine (cf. § 2.3)
create schema if not exists extensions;
create extension if not exists pg_trgm     with schema extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists unaccent    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists btree_gist  with schema public;  -- à poser à la main
```

### 7.3 Lots

| Lot | Contenu | Estimation | Dépendances |
|---|---|---|---|
| **A** | Vercel → nœud Node.js 22 sur Virtuozzo Cloud | 1-2 j | Aucune |
| **B** | Photos → Object Storage | 7-10 j | Aucune |
| **C** | Base → `supabase/postgres` + PostgREST + GoTrue sur Virtuozzo, archivage WAL compris (§ 4.5) | 5-8 j | Lot 0-bis |

**Les lots B et C sont indépendants** (§ 8) : l'ordre est libre.

**A et C atterrissent sur la même plateforme**, donc application et base
colocalisées — ce qui était précisément la raison d'écarter la voie « base
ailleurs » (§ 4.2). Les enchaîner coûte moins cher que de les espacer : même
console, même déploiement depuis GitHub, même environnement à apprendre une
seule fois.

Tout est à faire **avant l'ouverture**. À 7 comptes, migrer l'authentification
est indolore ; après ouverture, c'est une déconnexion de masse, un transfert de
hachages bcrypt sans filet et un mapping `provider_id` Google à préserver
exactement sous peine de faire perdre son carnet à un membre.

---

## 8. Corrections apportées en cours d'étude

Consignées parce qu'elles expliquent pourquoi le plan a bougé, et pour éviter
qu'on ne réintroduise les raisonnements qu'elles ont invalidés.

| Affirmation initiale | Correction |
|---|---|
| « Migrer la base avant de sortir les photos, c'est déménager les cartons pleins » — d'où l'ordre B avant C | **Faux à 57 Mo.** Un dump/restore de cette taille prend quelques secondes. B et C sont indépendants, l'ordre est libre. Le chantier photos reste justifié — par l'egress, l'écologie et le coût futur, pas par le coût de la migration. |
| `BYPASSRLS` est indispensable, son refus est un No-Go | **Inexact.** Le propriétaire d'une table est déjà exempté de la RLS (sauf `FORCE ROW LEVEL SECURITY`) : faire de `service_role` le propriétaire produit le même effet. Sans objet depuis le § 4.2 (superutilisateur). |
| Le point de rupture d'un managé serait `pg_trgm` | **Incomplet.** `unaccent` est tout aussi critique (`mc_norm()`), et `btree_gist` vit dans `public`. |
| Le blog est un gisement d'images caché | **Infirmé par la mesure** : 0 image inline dans `articles.content`. |
| Les quotas « niveau 1 » d'Infomaniak devront être débloqués | **Faux** : 20 vCPU, 64 Go RAM, 1 To — largement suffisants. |
| Scénario « tout chez Infomaniak, base managée » | **Indisponible en Public Cloud** : le Database Service ne propose que MySQL. Mais **Virtuozzo Cloud fournit PostgreSQL 15 à 18** — le blocage était propre à un produit, pas à l'hébergeur (§ 4). |
| « Faute de managé, il faut monter PostgreSQL sur une instance nue » | **Dépassé.** Virtuozzo Cloud donne PostgreSQL sans SSH ni `docker compose` à la main — décisif pour qui travaille exclusivement en ligne. L'instance nue devient le repli. |
| La proximité du bucket avec l'application est à vérifier | **Non-sujet** : les photos sont servies au navigateur, pas au serveur. Cf. § 6.2. |
| Le PITR absent est « un chantier à part entière » | **Surévalué.** Avec `supabase/postgres` et un bucket S3 déjà validé, `wal-g` représente une demi-journée : ça appartient à la définition de terminé du lot C (§ 4.5). |

---

## 9. Références

- `docs/audit-egress-supabase.md` — audit egress du 25/08/2026, dont ce
  document prolonge les constats sur les images.
- `docs/note-regression-cache.md` — doctrine de cache des référentiels.
- `DEPLOY.md` — configuration Vercel actuelle, dont la région de Francfort et
  sa justification (§ 4.1).
- PR #201 — correctif `crossOrigin` et workflow CORS Object Storage.
- PR #205 — ce document.
