# Migration Vercel + Supabase → Infomaniak

Étude et vérifications préalables à la sortie de Vercel et de Supabase Cloud,
au profit d'une infrastructure hébergée chez **Infomaniak**, en Suisse. La
localisation dépend du produit : le Public Cloud est à Genève et Winterthour,
**Virtuozzo Cloud (ex-Jelastic) à Genève uniquement** (§ 4.3).

État au **05/09/2026**. **Le lot 0 est terminé, répétition de restauration
comprise : le Go/No-Go est un GO** (§ 7.4). Les chiffres des § 2 et 4.5 sont des
mesures réelles, pas des estimations.

**Motif du chantier** : l'empreinte écologique, avant le coût et avant la
souveraineté. C'est ce critère qui a désigné Infomaniak plutôt que Scaleway,
Clever Cloud ou Hetzner — datacenters en propre, 100 % d'énergie renouvelable,
récupération de chaleur revendue au réseau urbain, certifications ISO 14001 et
50001, infrastructure passée sous le contrôle d'une fondation en mai 2026.

---

## 0. Résumé

| Chantier | Verdict au 05/09/2026 |
|---|---|
| Images inutiles transportées (§ 5.1) | **Fait** — premier poste d'egress, corrigé sans migration |
| Photos hors base → stockage objet | **TERMINÉ le 05/09** (B0 à B4, § 7.5-§ 7.8), exécuté en production et vérifié : **365 objets** déposés (355 sur `jp-photos`, 10 sur `jp-contact`), autant de références en base, **0 orphelin**. Plus aucune image en data-URL sur les onze cibles mesurées au B0 |
| Sortie de Vercel | **Faisable, 1-2 j** — couplage faible, sept accroches identifiées |
| Sortie de Supabase Cloud | **Débloquée** — Virtuozzo Cloud fournit PostgreSQL (§ 4). 5-8 j |
| Quitter l'API Supabase (PostgREST/GoTrue) | **Écarté** — réécriture de fond, § 1.3 |
| Coût de la cible | **Mesuré** : ≈ 16 €/mois avant l'ouverture, ≈ 28 € après (§ 4.5) |
| **Restauration du dump sur Virtuozzo** | **GO** — 949 objets restaurés sur 949, zéro erreur (§ 7.4) |

**Deux faits structurants.** La base pèse **57 Mo** et compte **7 comptes** :
tout ce dossier a été réévalué à leur lumière, et plusieurs conclusions posées
avant de les connaître étaient fausses (§ 8). Et **les plans gratuits saturent
déjà**, sur un site non ouvert — la migration ne coûte donc pas plus cher que
la trajectoire actuelle, elle coûte moins (§ 4.6).

**Cible retenue** :

```
Virtuozzo Cloud (Genève)
├── Nœud Node.js 22    → Next.js standalone, déployé depuis GitHub
├── Docker             → supabase/postgres 17.6 (version de la source)
├── Docker             → PostgREST + GoTrue
└── Load Balancer      → Let's Encrypt, jepatisse.com + dev.jepatisse.com

Public Cloud Object Storage → photos (§ 3, validé)
```

**Deux produits, un seul fournisseur.** L'application et la base vivent sur
**Virtuozzo Cloud**, les photos sur l'**Object Storage du Public Cloud** :
consoles distinctes, facturations distinctes, mais mêmes datacenters suisses et
même juridiction. Ce découpage n'est pas un compromis — Virtuozzo propose des
nœuds de stockage, mais ce sont des systèmes de fichiers partagés : servir les
photos depuis là les ferait transiter par l'application, ce que le lot B vise
précisément à supprimer. Le stockage objet sert le navigateur **en direct**,
sans consommer de cloudlets.

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

**Ce tableau est incomplet** : il a été composé à la main, colonne par colonne,
et il en manquait trois — `imports.recette`, `tags.category_picto`,
`allergens.picto`. Le relevé exhaustif du 05/09 les a trouvées (§ 7.5) en
balayant *toutes* les colonnes du schéma plutôt qu'une liste supposée. La leçon
vaut au-delà des images : une énumération manuelle de colonnes est une
hypothèse, pas une mesure.

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

- **6 comptes pour 7 identités** : 4 e-mail, 3 Google — donc **un compte porte
  les deux** (mesuré le 06/09, § 7.10). La formulation « 7 identités » employée
  ailleurs dans ce dossier désignait des comptes ; c'est une identité de plus
  que de comptes, et cet écart est précisément le cas le plus délicat du C1.
- **252 fonctions** dans `public`, **320 policies RLS**, **25 triggers**.

Le compte de triggers est celui de la requête documentée en § 7.2 : **schéma
`public`, triggers internes exclus** (`tgisinternal`, ceux que PostgreSQL crée
lui-même pour appliquer les clés étrangères). Le relevé du 03/09 annonçait 31 —
un comptage plus large, réconcilié le 04/09 sur la base elle-même. C'est 25 qui
sert de valeur de référence, parce que c'est ce que le test de restauration
comptera des deux côtés.

**Aucun rôle applicatif propre au projet** (relevé du 04/09) : les 15 rôles de
la base sont tous des rôles Supabase standard — `anon`, `authenticated`,
`service_role`, `authenticator`, `pgbouncer`, `dashboard_user` et les
`supabase_*`. C'est le pari du § 4.4 confirmé : l'image `supabase/postgres` les
pose tous, il n'y a rien à recréer à la main avant la restauration.

Le chiffre de 252 est trompeur : `btree_gist` installe à lui seul plus d'une
centaine de fonctions dans `public`. Et surtout, **tout cela est transporté par
`pg_dump`** — rien à réécrire à la main. Le risque n'est pas la quantité mais
l'ordre des dépendances : rôles et extensions doivent exister **avant** la
restauration, sinon 320 policies échouent ensemble.

### 2.5 Version du serveur source — PostgreSQL 17.6

Relevée le 04/09 par le premier dump réussi : la CLI Supabase tire l'image dont
la version correspond à celle de la base distante, pour que `pg_dump` soit du
bon millésime. Elle a tiré **`supabase/postgres:17.6.1.165`**.

**C'est le tag à déployer sur Virtuozzo**, et il corrige une approximation du
dossier, qui parlait de « `supabase/postgres` 15+ ». Restaurer dans un 15 un
dump produit par PostgreSQL 17 serait une **rétrogradation** : `pg_dump` ne
promet nulle part d'être relisible par une version antérieure, et toute syntaxe
apparue depuis échouerait à la restauration. On déploie 17.6, pas « 15 ou plus ».

**La liste du § 4.3 ne contraint pas ce choix** : elle décrit le stack
PostgreSQL *certifié* d'Infomaniak, que le § 4.4 écarte précisément au profit
de l'image Docker. La version déployée est celle de l'image, pas celle du
catalogue.

**Poids du dump** : `schema.sql` 399 196 octets (10 811 lignes), `roles.sql`
297 octets (13 lignes). Le second est si petit parce que la CLI retire les
rôles réservés de Supabase — cohérent avec le § 2.4, qui ne trouve aucun rôle
applicatif propre au projet.

### 2.6 Ce que l'image apporte vraiment — relevé du 05/09

Mesuré sur `supabase/postgres:17.6.1.165` fraîchement démarré chez Virtuozzo,
avant toute restauration.

| Ce qui est là | Ce qui manque |
|---|---|
| **14 rôles**, dont `anon`, `authenticated`, `service_role`, `authenticator`, `supabase_auth_admin` | — |
| **4 schémas** : `auth`, `extensions`, `public`, `vault` | — |
| `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (dans `extensions`), `supabase_vault`, `plpgsql` | **`pg_trgm`**, **`unaccent`**, `btree_gist` |

**Le pari du § 4.4 tient sur les rôles et les schémas, pas sur les
extensions.** Et les deux manquantes sont précisément celles que le § 2.3
désigne comme critiques : `unaccent` porte `mc_norm()`, donc toute la recherche
avancée, et `pg_trgm` le repli trigramme de `suggest_similar_ideas`.

**Conséquence sur le mode opératoire** : le bloc de préparation du § 7.2 cesse
d'être un filet à jouer en cas d'échec, il devient une étape à part entière du
workflow — qui pose **les cinq** extensions sans se demander lesquelles l'image
apporte. Dépendre du jeu par défaut d'une image, c'est dépendre de ce qui change
d'un tag au suivant ; `if not exists` rend la pose gratuite là où le travail est
déjà fait.

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
Access to image at 'https://s3.pub1.infomaniak.cloud/...'
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
| Extensions déjà dans le schéma `extensions` | **Partiellement seulement** — l'image en pose cinq, mais ni `pg_trgm` ni `unaccent` (relevé du 05/09, § 2.6). Les extensions sont donc toutes posées par le workflow, sans rien supposer de l'image |
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
l'archivage WAL (`wal-g`) représente une demi-journée. *(Fait le 12/09 — mais
avec **pgBackRest**, pas wal-g, dont les binaires sont liés à la glibc alors
que le conteneur est en Alpine/musl. Et il a fallu une matinée, pas une
demi-journée : l'outil n'était pas le sujet, les endpoints de stockage l'ont
été. Cf. § 7.15.)* Il appartient à la
**définition de terminé du lot C**, pas à un projet qu'on repousse : le moment
où il deviendra nécessaire — des abonnés payants — est celui où il sera trop
tard pour l'ajouter tranquillement. D'ici là, un `pg_dump` nocturne vers le
bucket suffit ; perdre 24 h de données avant l'ouverture ne coûte rien.

**Une seule région.** Genève uniquement : pas de reprise sur un autre site. À
accepter explicitement.

**Le prix, mesuré au configurateur le 04/09/2026.** Deux lectures suffisent à
en tirer le modèle, le configurateur imposant la même RAM à tous les conteneurs :

| Lecture | Configuration | Cloudlets | Prix |
|---|---|---|---|
| Plancher | 1 × 128 Mo / 400 MHz, 20 Go, 1 IP | 1 | 5,32 €/mois |
| A | 5 × 512 Mo / 800 MHz, 20 Go, 1 IP | 20 | **25,94 €/mois** |
| B | 5 × 1 Go / 1600 MHz, 20 Go, 1 IP | 40 | **48,58 €/mois** |

```
Coût marginal = (48,58 − 25,94) / (40 − 20) = 1,13 € par cloudlet et par mois
Part fixe     = 25,94 − 20 × 1,13          = 3,30 €  (IP + 20 Go inclus)
```

Soit **≈ 9 €/mois par Go de RAM**. Valable dans la plage mesurée : en dessous
de 4 cloudlets par conteneur la remise tombe de 45 % à 30 %, les petits nœuds
coûtent donc un peu plus au cloudlet.

**Les lectures A et B surestiment.** Le configurateur impose une RAM uniforme,
la plateforme non : PostgREST, GoTrue et le load balancer n'ont pas besoin d'un
gigaoctet chacun. En dimensionnant chaque nœud pour ce qu'il est :

| Nœud | Pré-ouverture | Après ouverture |
|---|---|---|
| Next.js | 512 Mo *(4)* | 1 Go *(8)* |
| `supabase/postgres` | 512 Mo *(4)* | 1 Go *(8)* |
| PostgREST | 128 Mo *(1)* | 256 Mo *(2)* |
| GoTrue | 128 Mo *(1)* | 256 Mo *(2)* |
| Load Balancer | 128 Mo *(1)* | 256 Mo *(2)* |
| **Total** | **11 cloudlets → ≈ 16 €/mois** | **22 cloudlets → ≈ 28 €/mois** |

Et ce sont encore des plafonds : seuls les cloudlets **réservés** sont facturés
en continu, les **dynamiques** ne le sont qu'à l'usage.

Sont offerts : les 20 premiers Go de disque, le SSL, et **2,8 Go/h de trafic
externe** (~2 To/mois — généreux pour un site chargé en images).

### 4.6 L'économie réelle : la trajectoire actuelle n'est pas gratuite

Le site tourne aujourd'hui sur les **plans gratuits** de Vercel et Supabase —
mais **les alertes de dépassement se déclenchent déjà**, avec 7 comptes et un
site non ouvert.

| | Limite gratuite | État |
|---|---|---|
| Supabase — egress base | 5 Go/mois | Alertes déclenchées |
| Supabase — taille base | 500 Mo | 57 Mo, large marge |
| Vercel — bande passante | 100 Go/mois | Alertes déclenchées |

La trajectoire « ne rien faire » mène donc à Supabase Pro (25 $) + Vercel Pro
(20 $), **≈ 40 €/mois**, pas à zéro. Infomaniak à 16-28 €/mois est **moins cher
que là où le projet allait**.

**Un point contractuel s'ajoute** : le plan Hobby de Vercel est réservé à un
usage personnel non commercial. Or l'application porte un module d'abonnements
payants (`mc_consume`, `mc_start_trial`, `subscriptions`, `plans`). Le jour de
l'ouverture avec une offre payante, Hobby cesse d'être une option, quelles que
soient les limites techniques. *(À vérifier dans les conditions en vigueur, mais
c'est une clause de longue date.)*

**Ce que les alertes révèlent surtout.** Saturer 5 Go d'egress avec 7 testeurs
et 50 recettes n'est pas normal : à ~740 ko d'images par fiche, 5 Go
représentent environ 6 700 pages vues. Chaque page coûte anormalement cher, et
la § 5.1 dit pourquoi. **Migrer l'hébergement sans traiter les images
déplacerait le problème au lieu de le résoudre** — chez Infomaniak les 2,8 Go/h
inclus le masqueraient, mais le gaspillage reviendrait en consommation de
cloudlets.

---

## 5. Trouvailles

### 5.1 Les originaux pèsent la moitié des images et ne sont jamais affichés — **traité**

`step_photos.original_url` (14 Mo) + `recipes.hero_image_original_url`
(3,6 Mo) = **17,6 Mo, 48 % du poids image**. Ils ne servent qu'à la réédition
dans `CreerForm` et `RelectureEditor` (`originalSrc={p?.original_url}`).

Or `FULL_SELECT` faisait `recipe_steps(*, step_photos(*))` et `select('*')` sur
`recipes` : **chaque ouverture de fiche recette publique transportait les
originaux, jamais rendus.**

Ce n'était pas une correction d'une ligne — `getRecipeFull` est partagé, et
chaque appelant a un besoin différent :

| Appelant | Portée retenue |
|---|---|
| `app/recette/[id]/page.tsx` | `lecture` — photos affichées, pas les originaux |
| `app/projets/[id]/page.tsx` | `lecture` — le parcours guidé ne réédite aucune photo |
| `app/creer/page.tsx` | `edition` — seul écran qui réédite |
| `app/api/moderation-recette/route.ts` | `texte` — `buildModerationSource` ne lit que du texte |
| `app/api/reindex-recette/route.ts` | `texte` — et il boucle sur toutes les recettes publiées |

**Corrigé le 04/09/2026** : `getRecipeFull` prend désormais une portée
explicite — `lecture`, `edition` ou `texte` — sans valeur par défaut. Trois
gaspillages traités d'un coup :

| Gaspillage | Traitement |
|---|---|
| Originaux sur la fiche publique (17,6 Mo, 48 % du poids image) | Absents de la portée `lecture` |
| `select('*')` sur 42 colonnes, dont `fts` (tsvector) et les dérivés `hero_card_url` / `hero_thumb_url` | Colonnes énumérées, comme `PROFILE_COLUMNS` |
| `/api/moderation-recette` et `/api/reindex-recette` tirant toutes les images pour n'en lire aucune | Portée `texte`, **aucune image** |

Le dernier est le plus lourd : le réindex complet boucle sur **toutes** les
recettes publiées.

Deux décisions à connaître. **Pas de valeur par défaut** sur la portée : un
défaut à `lecture` aurait fait hériter un futur écran d'édition d'une recette
sans ses originaux, sans erreur visible avant la première réédition de photo.
Et **`difficulty_id` reste dans la liste énumérée** bien qu'absent de
`RecipeFull` — `CreerForm` le lit via un cast pour pré-remplir la difficulté ;
le retirer aurait cassé l'éditeur en silence. C'est le piège de tout passage
de `*` à une énumération.

C'était le premier poste d'egress restant après ceux déjà traités dans
`docs/audit-egress-supabase.md`, et il se corrigeait **sans migration et sans
risque** — d'où sa priorité 1 (§ 7.1).

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

### 5.3 `imports` — 4,9 Mo sans rétention, et ce sont des images

26 lignes, 4 888 ko (8 % de la base) : des brouillons d'import IA, données
transitoires. Une politique de rétention récupérerait ces mégaoctets.

**Le relevé du 05/09 dit d'où vient le poids** : `imports.recette` porte
4 379 ko de data-URL **imbriquées dans son JSON**, sur 17 lignes — les photos
transcrites voyagent avec le brouillon.

**Ces mégaoctets sortent donc du lot B** (§ 7.5). Les migrer vers un bucket
serait du travail pour rien, et pire : ça fabriquerait des objets orphelins le
jour de la purge, exactement le piège du § 5.2 point 5, appliqué à des données
qui n'ont pas vocation à durer. La rétention reste la bonne réponse, et elle est
bien moins chère.

---

## 6. Points ouverts

### 6.1 `lib/database.types.ts` est périmé

`contact_messages`, `contact_replies`, `contact_message_photos` et
`contact_reply_photos` en sont **absents** (0 occurrence). Un
`npm run gen:types` s'impose avant d'attaquer le chantier photos — le module
contact porte des photos, et travailler sur une carte incomplète les ferait
oublier.

### 6.2 Non vérifié à ce jour

- **Quelles limites exactement ont déclenché les alertes** (§ 4.6) : egress
  Supabase, bande passante Vercel, invocations de fonctions ? Les trois
  premières confirment le diagnostic images ; la quatrième pointerait ailleurs,
  vers le middleware ou les routes IA.
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

### 7.1 Ordre de priorité

Les alertes de dépassement (§ 4.6) réordonnent le plan : **le chantier photos
n'est plus « bon pour l'écologie », c'est la cause du problème.**

| Priorité | Chantier | Effet |
|---|---|---|
| **1** | § 5.1 — ne plus transporter les images inutiles | **Fait le 04/09/2026.** Sans migration, sans risque |
| **2** | Lot B — photos vers le stockage objet | Supprime la source dominante d'egress |
| **3** | Lots A et C — la migration | Devient un choix serein, pas une fuite en avant |

Traiter 1 et 2 peut remettre le site **sous les seuils gratuits** et rendre le
temps de mener la migration calmement, plutôt que sous la pression d'une
facture.

Reste à demander au support l'échéance du PostgreSQL managé du Public Cloud :
sans effet sur le plan depuis Virtuozzo Cloud, mais un managé natif resterait
préférable à terme.

### 7.2 Lot 0-bis — répétition de restauration (1 j)

Le Go/No-Go a changé de nature, et y a gagné. Plutôt que de vérifier des
permissions une à une sur un service managé, on répète le lot C pour de vrai :

> Monter un environnement Virtuozzo Cloud avec le conteneur Docker
> `supabase/postgres` (17.6, cf. § 2.5) et GoTrue, puis **restaurer le dump
> Supabase** et
> vérifier que les 320 policies, les 252 fonctions et les 25 triggers passent.

Ce test répond à toutes les questions d'un coup — extensions, rôles, schéma
`auth`, objets spécifiques à Supabase — et produit directement le mode
opératoire du lot C.

#### Les trois arbitrages, et pourquoi

**Le runner GitHub Actions est le seul terminal disponible** (§ 10.1). Tout le
reste se pilote au navigateur : l'éditeur SQL de Supabase, le tableau de bord
Virtuozzo, l'onglet Actions. Ce découpage commande les trois choix ci-dessous,
faits une fois pour toutes pour ne pas être rejoués sous la pression du chrono
de l'essai.

**1. Le dump ne transite jamais par un artefact — le dépôt est public.** Sur un
dépôt public, les artefacts de workflow et les journaux d'exécution sont
téléchargeables par n'importe qui. Un `schema.sql` déposé en artefact
publierait le **corps** des 252 fonctions — dont les `SECURITY DEFINER` comme
`merge_ideas`, qui existent précisément pour contourner la RLS — et le texte
des 320 policies. Leurs *noms* sont déjà publics — `lib/database.types.ts` est versionné
— mais pas leur contenu. D'où : dump et restauration **dans le même job**,
aucun artefact, et `VERBOSITY=terse` sur `psql`, qui réduit chaque erreur à
« fichier, ligne, message » sans recracher le fragment de SQL fautif. Le numéro
de ligne suffit à diagnostiquer.
*Un dépôt privé dédié aurait été l'autre réponse. Écarté : il scinde les
secrets, la documentation et l'historique du chantier en deux endroits, pour un
gain que le job unique obtient déjà.*

**2. La cible est jointe par un Endpoint TCP, pas par Web SSH.** L'environnement
expose le port 5432 via `Settings` → `Endpoints` → `Add` (Private Port 5432,
TCP) : la plateforme attribue un *Public Port* et une *Access URL* à travers le
Shared Load Balancer, **sans IP publique dédiée**. Le runner restaure alors
comme il le fera au lot C.
*La variante « déposer le dump dans un conteneur Swift privé, le tirer par
`curl` depuis Web SSH » n'ouvre aucun port. Écartée quand même : elle ne
produit pas de procédure rejouable, alors que c'est précisément ce que ce lot
doit livrer. Contrepartie assumée : PostgreSQL est joignable depuis Internet
pendant quelques heures — base sans données, mot de passe long, et **Endpoint
supprimé dès la phase 4**.*

**3. GoTrue est dans le même passage, mais après le verdict du DDL.** L'énoncé
du Go/No-Go ci-dessus le nomme, et ce qu'on veut savoir de lui — ses
migrations de démarrage entrent-elles en conflit avec le schéma `auth` déjà posé
par l'image (§ 4.4) — ne se découvre pas autrement. La phase 3 est néanmoins
séparée : si GoTrue échoue, **le verdict du DDL tient toujours**.

#### Phase 0 — avant de commander l'essai (ne consomme aucun jour)

Le chrono des 14 jours part à la commande. Tout ce qui peut être fait avant
doit l'être.

1. **Relever la version du serveur source et ses rôles**, dans l'éditeur SQL
   Supabase. Le § 4.3 dit ce que Virtuozzo *propose* (15.19 → 18.6), jamais ce
   que Supabase *sert* : c'est cette lecture qui fixe le tag de l'image et le
   majeur que `pg_dump` doit savoir lire. *Fait le 04/09 — § 2.5.*
2. **Réancrer les compteurs** du § 2.4 (320 / 252 / 25). S'ils ont bougé, ce
   sont les nouveaux qui font foi. *Fait le 04/09 : policies et fonctions
   confirmées, triggers ramenés de 31 à 25 (§ 2.4).* Cet écart ne menace pas le
   Go/No-Go — la comparaison de la phase 2 joue **la même requête des deux
   côtés**, elle est immunisée contre une divergence de définition.
3. **Poser le secret `SUPABASE_DB_URL`** : Supabase → `Project Settings` →
   `Database` → `Connection string` → onglet **Session pooler**, port **5432**.
   Ni le pooler transactionnel (6543, qui coupe les sessions longues et fait
   échouer `pg_dump`), ni la connexion directe (IPv6, quand les runners GitHub
   sont en IPv4). **Le signe qui les distingue est l'utilisateur**, pas l'hôte :
   le pooler écrit `postgres.<ref-du-projet>`, la connexion directe écrit
   `postgres` tout court. Les deux workflows refusent désormais les deux
   mauvaises formes avant d'ouvrir la moindre connexion.
4. **Jouer `migration-dump-schema.yml`** (Actions → Run workflow). Il ne touche
   aucune cible : il valide la connexion, la version de `pg_dump` et le
   filtrage, et affiche les points 1 et 2 au passage. **S'il échoue, il échoue
   gratuitement.**

#### Phase 1 — monter l'environnement (jour 1 de l'essai)

1. Manager Infomaniak → `Cloud Computing` → `Jelastic Cloud` → **« Commander un
   Jelastic Cloud »**. **Noter la date de fin dans l'agenda** : l'essai est
   borné à 10 Go de SSD, 20 Mb/s et 5 environnements — sans conséquence ici
   (le dump pèse quelques mégaoctets), mais la date de fin, elle, se rate.
2. **`New environment`** → onglet **`Docker`** → **`Select an image`** →
   `supabase/postgres`, tag **`17.6.1.165`** (§ 2.5). Région **Genève**
   (seule option, § 4.3), nom `mc-restore-test`, **1 cloudlet réservé** et
   **8 dynamiques** (≈ 1 Go) — restaurer 320 policies demande de la marge, et
   le dynamique n'est pas facturé au repos (§ 4.5).
   **Ni Load Balancer ni nœud Node.js** : le lot 0-bis ne sert pas
   l'application (§ 10.4).
3. Icône engrenage (`Configuration`) du nœud → variable `POSTGRES_PASSWORD`,
   longue et aléatoire. Redémarrer, puis **laisser les scripts d'initialisation
   de l'image finir** : ce sont eux qui posent les rôles, les schémas `auth` /
   `extensions` et les extensions (§ 4.4).
4. `Settings` → `Endpoints` → `Add` : nœud Postgres, *Private Port* **5432**,
   TCP. Reporter l'`Access URL` et le *Public Port* dans les secrets GitHub
   `VZ_PG_HOST`, `VZ_PG_PORT`, `VZ_PG_PASSWORD`.

#### Phase 2 — la restauration et son verdict

Jouer **`migration-restauration-repetition.yml`** en mode `restaurer`. Le job
enchaîne, sans intervention : `btree_gist` dans `public` → dump → `roles.sql`
puis `schema.sql` (dans cet ordre, § 2.4) → inventaire des deux côtés →
tests fonctionnels → verdict.

Deux partis pris s'y lisent :

- **`ON_ERROR_STOP=0` est délibéré.** On veut l'inventaire *complet* des échecs
  en une passe, pas le premier : c'est la matière première du mode opératoire du
  lot C, et repasser dix fois coûte des heures d'essai.
- **Le test n'est pas l'égalité des inventaires, c'est l'inclusion.** L'image
  `supabase/postgres` apporte ses propres objets, et c'est très bien. Ce qui
  compte est que **tout objet de la source existe sur la cible** — d'où un
  `comm -23` plutôt qu'un `diff`. Deux extensions sont écartées de la
  comparaison : `supabase_vault`, que rien n'utilise (§ 2.3, vérifié), et
  `pg_stat_statements`, de l'observabilité optionnelle.

L'inventaire couvre policies, fonctions **avec leur signature**, triggers,
tables, vues, index, colonnes générées (`recipes.fts`), tables sous RLS et
extensions **avec leur schéma** — ce dernier point n'est pas décoratif :
`btree_gist@public` et `pg_trgm@extensions` sont deux choses différentes
(§ 2.3). Une divergence est **nommée**, pas seulement comptée.

**Verdict : GO si `comm -23` est vide et que `schema.sql` n'a produit aucune
erreur.** Sinon le job échoue en listant ce qui manque.

#### Phase 3 — GoTrue

Ajouter un nœud Docker `supabase/auth` (ex-`supabase/gotrue`) dans le même
environnement : `GOTRUE_DB_DRIVER=postgres`, `GOTRUE_DB_DATABASE_URL` (vers
`supabase_auth_admin`, `search_path=auth`), `GOTRUE_API_HOST=0.0.0.0`,
`PORT=9999`, `GOTRUE_JWT_SECRET`, `GOTRUE_JWT_AUD=authenticated`,
`GOTRUE_SITE_URL`, `API_EXTERNAL_URL`.

Deux choses à observer, dans cet ordre : les **migrations de démarrage** passent
dans les journaux du nœud, puis `/health` répond. Puis **rejouer le workflow en
mode `verifier`** : si GoTrue a modifié quoi que ce soit dans `public`, on veut
le savoir maintenant, pas au lot C.

*Point à vérifier sur place plutôt qu'à supposer* : l'image crée les rôles de
service, mais c'est la pile self-host officielle qui leur assigne un mot de
passe, par un script monté que nous n'avons pas ici. Un `\du` en Web SSH dira ce
qui existe réellement ; un `alter role supabase_auth_admin with password …`
suffit si besoin.

#### Phase 4 — clôture

Supprimer l'Endpoint (le port ne doit pas survivre au test), arrêter
l'environnement, **faire tourner le mot de passe de la base Supabase** (il a
transité par un secret GitHub), puis consigner ici : le verdict, la version
PostgreSQL source, et les objets à poser à la main en plus de `btree_gist`. Le
§ 6.2 perd alors sa première puce.

#### Ce que ce test ne dit pas

Il valide le **DDL**. Ni la restauration des données, ni la migration des
7 identités (hachages bcrypt, `provider_id` Google) — le § 10.4 les renvoie au
lot C, et c'est le bon arbitrage. Mais un « Go » du lot 0-bis **ne se lit pas
comme un Go sur l'authentification**.

#### La préparation des extensions — une étape, plus un filet

**Ce bloc n'est pas optionnel**, contrairement à ce que ce document a d'abord
affirmé. Le relevé du 05/09 (§ 2.6) montre que l'image pose bien les rôles et
les schémas, mais **pas `pg_trgm` ni `unaccent`** — les deux extensions que le
§ 2.3 désigne comme critiques. Le workflow exécute donc les cinq lignes
`create extension` d'office, avant `schema.sql`.

Les rôles ci-dessous, eux, restent un vrai filet : l'image les fournit tous
(§ 2.6), et ils ne sont là que pour un environnement qui ne serait pas monté
depuis `supabase/postgres`.

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
| **C** | Base → `supabase/postgres` + PostgREST + GoTrue sur Virtuozzo, archivage WAL compris (§ 4.5) | 5-8 j | **Débloqué** — lot 0-bis au vert (§ 7.4) |

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

### 7.4 Verdict du lot 0-bis — **GO** (05/09/2026)

La répétition a été menée de bout en bout. **949 objets à la source, 949 à
l'arrivée, aucun manquant, aucune erreur de restauration.**

**Environnement de test** : Virtuozzo Cloud, Genève DC2, un seul nœud Docker
`supabase/postgres:17.6.1.165`, 1 cloudlet réservé et 6 dynamiques, Endpoint TCP
sur le port privé 5432. Restauration pilotée depuis un runner GitHub Actions,
sans aucun terminal local (§ 10.1).

| Contrôle | Résultat |
|---|---|
| Inventaire source ↔ cible (`comm -23`) | **949 / 949, 0 manquant** |
| Erreurs de `schema.sql` | **0** |
| `mc_norm('Crème brûlée')` | `creme brulee` — `unaccent` opérationnel |
| `'chronomètre' % 'chrono'` | `t` — `pg_trgm` opérationnel |
| Colonnes générées de `recipes` | `fts` **et `has_hero_image`** |
| `btree_gist` | dans `public`, comme sur la source |
| `set role anon; select … from recipes` | passe, **sans `permission denied`** |

Durées : dump 1 min 40, restauration 6 min, vérification 10 s.

**Quatre questions ouvertes se referment d'un coup.**

**Le rôle `postgres` n'est pas superutilisateur, et ça ne bloque rien.** C'était
la dernière inconnue, posée en § 2.6 et laissée délibérément non contournée. Les
cinq extensions sont passées — toutes « trusted » depuis PostgreSQL 13, donc
installables par un non-superutilisateur — et les 399 Ko de DDL avec elles, sous
ce seul rôle. Aucun besoin d'ouvrir un accès superutilisateur au lot C.

**Les `GRANT` voyagent dans le dump.** `set role anon` puis une lecture de
`recipes` répond `0` — zéro parce que la base est vide, mais surtout **sans
`permission denied`**. Si les droits n'étaient pas passés, PostgREST aurait
refusé toute lecture anonyme au lot C ; on l'aurait découvert en production.

**La RLS est bien en place**, sans quoi les 320 policies auraient manqué à
l'inventaire.

**`recipes` porte deux colonnes générées**, pas une : `fts` et
`has_hero_image`. Le § 2 n'en mentionnait qu'une.

**Ce que ce GO ne couvre pas**, et qu'il ne faut pas lui faire dire : le DDL,
rien que le DDL. Ni la restauration des **données**, ni la migration des
**7 identités** (hachages bcrypt, `provider_id` Google) — le § 10.4 les renvoie
au lot C, et c'est le bon arbitrage. Ni GoTrue, dont la phase 3 reste à jouer.

**Ce que la répétition a coûté**, et qui vaut d'être retenu pour le lot C : trois
faux départs, tous attrapés avant d'entamer sérieusement l'essai — un tag
d'image par défaut en PostgreSQL 14 (§ 2.5), deux extensions absentes de l'image
(§ 2.6), un rôle `postgres` qui ne peut pas changer son propre mot de passe. Le
mode opératoire du § 7.2 les intègre désormais tous les trois.

---

### 7.5 Lot B — découpage et décisions (B0, B1, B2 complet le 05/09)

Le lot B sort les images de la base vers le stockage objet. Le § 7.1 en fait la
**priorité 1** : c'est lui qui traite la cause des alertes de dépassement, il ne
dépend d'aucun fournisseur, et il peut remettre le site sous les seuils gratuits.

#### Ce que la mesure exhaustive a donné

Relevé du 05/09, en balayant **toutes** les colonnes texte, tableau et JSON du
schéma et en ne retenant que celles portant réellement des data-URL — plutôt
qu'une liste énumérée à la main, qui est une hypothèse déguisée.

| Colonne | Poids | Objets |
|---|---|---|
| `step_photos.original_url` | 14 Mo | 89 |
| `step_photos.url` | 11 Mo | 93 |
| `recipes.hero_image_url` | 5 473 ko | 38 |
| ~~`imports.recette`~~ *(hors lot, § 5.3)* | *4 379 ko* | *17* |
| `recipes.hero_image_original_url` | 3 714 ko | 26 |
| `contact_message_photos.url` | 2 400 ko | 8 |
| `recipes.hero_card_url` | 962 ko | 38 |
| `site_settings.value` | 947 ko | 4 |
| `contact_reply_photos.url` | 872 ko | 2 |
| `comments.photo_urls` | 650 ko | 2 |
| `tags.category_picto` | 234 ko | 9 |
| `profiles.banner_url` | 182 ko | 1 |
| `recipes.hero_thumb_url` | 122 ko | 38 |
| `articles.cover_image_url` | 103 ko | 1 |
| `profiles.avatar_url` | 64 ko | 2 |
| `allergens.picto` | 46 ko | 8 |
| `ads.image_url` | 31 ko | 1 |
| **Total à migrer** | **≈ 40 Mo** | **≈ 360** |

**360 objets, pas des milliers.** C'est l'enseignement qui redimensionne le
chantier : la reprise des données existantes (B3) est affaire d'heures, pas de
jours. Le gros est concentré — `step_photos` et `recipes` font 35 Mo et 322
objets à eux seuls.

**Trois colonnes manquaient au § 2.2** : `imports.recette`, `tags.category_picto`
et `allergens.picto`. Et **`profiles.cover_url` existe mais est vide** — rien à
reprendre, mais son chemin d'écriture est à traiter comme les autres.

#### Les deux pictos et le profil sont sur le chemin chaud

`tags.category_picto` et `allergens.picto` sont servis par
`lib/data/reference.ts`, les référentiels mis en cache — et `tags` est chargé par
le `Header`, donc **sur chaque page**. Même remarque, en plus fort, pour
`profiles` : `lib/auth.ts` le commente lui-même, ses trois colonnes image sont
lues **à chaque rendu de page**. Petits en octets, structurels en fréquence.

#### Décisions arrêtées

**Deux conteneurs, pas un.** `jp-photos` (public) pour recettes, profils, blog,
publicité, référentiels ; **`jp-contact` (privé)** pour les photos de contact.
Ce sont des données personnelles — `docs/contact-jira.md` § 15 en fait déjà
l'argument pour ne jamais les transmettre à Jira. Une clé d'objet non devinable
n'est pas un contrôle d'accès.

**Swift TempURL plutôt que S3 présigné.** Aucun nouvel identifiant (les sept
secrets `OS_*` suffisent), aucune dépendance (`node:crypto` signe en une
quinzaine de lignes), et surtout : ça supprime le problème de créer des
credentials EC2 **sans jamais les afficher** sur un dépôt public. Le seul point
où le S3 gagnait était la portabilité vers un autre fournisseur — or le § 0 a
choisi Infomaniak sur des critères qui ne bougeront pas.

**Téléversement direct navigateur → bucket**, jamais de transit par
l'application : c'est l'argument du § 3 (*« le stockage objet sert le navigateur
en direct, sans consommer de cloudlets »*), et ça contourne la limite de 4,5 Mo
du corps d'une fonction serverless.

#### Ce que la sonde a établi — et l'hypothèse qu'elle a corrigée

`.github/workflows/object-storage-tempurl-sonde.yml`, jouée le 05/09. Elle
existait parce que les clés TempURL **par conteneur** ne sont pas supportées par
Ceph RadosGW, et que l'endpoint en `s3.` avait tout d'un RadosGW. Si l'hypothèse
avait tenu, une clé unique aurait signé les téléversements publics **et** les
lectures de `jp-contact` — le cloisonnement n'aurait plus été qu'un décor.

**C'était faux, et la sonde l'a montré plutôt que de le supposer dans un sens ou
dans l'autre** :

```
Additional middleware: s3api
Additional middleware: tempurl
  allowed_digests: ['sha1', 'sha256', 'sha512']
  deprecated_digests: ['sha1']
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE']
```

C'est du **Swift natif avec le middleware `s3api`** par-dessus : le nom d'hôte
en `s3.` désigne un protocole servi, pas l'implémentation. Trois conséquences
opérationnelles :

- **Clé par conteneur acceptée** — vérifiée en la posant puis en relisant la
  métadonnée, seul test qui vaille : une clé non supportée est ignorée **en
  silence**, sans erreur. Deux clés indépendantes, donc cloisonnement réel.
- **`PUT` autorisé** — les téléversements signés fonctionnent.
- **Signer en `sha256`** : `sha1` est déclaré déprécié par le cluster lui-même.
- **Signature NUE, jamais préfixée** — mesuré le 05/09, après coup (§ 8) :
  ce cluster refuse en 401 la forme `sha256:<hex>` que documente Swift, et
  n'accepte que le condensat seul. Ce que le cluster *déclare* accepter
  (`allowed_digests`) ne dit rien de la forme dans laquelle il veut la
  signature.

#### Un piège dans l'outillage existant

**Ne jamais lancer `object-storage-cors.yml` sur `jp-contact`.** Son étape
« Restreindre l'énumération publique » pose `--read-acl '.r:*'`, ce qui rend les
objets **lisibles par leur URL pour tout le monde**. C'est le bon réglage pour
`jp-photos`, et exactement la fuite à éviter sur l'autre. Le workflow gagnera un
interrupteur public/privé au B1.

#### Découpage

| Sous-lot | Contenu | État |
|---|---|---|
| **B0** | `gen:types`, mesure, conteneurs, CORS, arbitrages, sonde TempURL | **Fait le 05/09** |
| **B1** | `lib/storage.ts` (signature TempURL) + route de présignature. Aucun écran modifié | **Fait le 05/09** |
| **B2** | Bascule des écritures, par risque croissant | **Complet le 05/09** (4 étapes) |
| **B3** | Reprise des ≈ 360 objets, **sans supprimer les data-URL** | **Fait le 05/09** (§ 7.6) |
| **B4** | Vérification a posteriori + réconciliation des orphelins (cycle de vie) | **Fait et exécuté le 05/09** (§ 7.7, § 7.8) — 365/365, 0 orphelin, aucune suppression nécessaire |

**Ordre du B2, dicté par la mesure** : d'abord `site_settings`, `ads`,
`articles` et les deux pictos (1,4 Mo, 23 objets, aucune donnée membre — une
répétition à faible enjeu qui exerce toute la chaîne, même logique que la
phase 0 du lot 0-bis) ; puis `step_photos` et `recipes` (35 Mo, 322 objets) ;
puis `profiles` et `comments` ; enfin `contact_*` sur le conteneur privé.

**Correction à l'étape 1** : `tags.category_picto` et `allergens.picto` n'ont
**aucun chemin d'écriture applicatif** — aucune des deux tables n'a d'écran
d'administration, elles s'éditent directement dans Supabase (cohérent avec
leur taille, 9 et 8 lignes). Il n'y a donc rien à basculer côté code pour ces
deux colonnes : leurs data-URL existantes seront reprises telles quelles par
le B3, comme n'importe quelle valeur trouvée en base. L'étape 1 du B2 s'est
donc réduite à trois écrans réels : `BannerManager` (`site_settings`),
`PartnersManager` (`ads.image_url`), `BlogEditor` (`articles.cover_image_url`).

**Ce que l'étape 1 a livré** : `lib/storage-client.ts`, le pont client entre la
data-URL produite par `lib/images.ts` et l'URL de stockage — dépose puis rend
l'URL finale, ou rend `valeur` inchangée si ce n'est pas une data-URL. C'est
cette dernière propriété qui rend l'appel **idempotent et inconditionnel** :
chaque écran l'appelle avant chaque écriture, que l'image ait changé ou non, et
elle ne fait rien tant que la colonne porte déjà une URL de stockage — la même
logique qui rendra le B3 (les valeurs déjà migrées ne sont pas retéléversées)
et un B2 rejoué partiellement sans risque.

**`BlogEditor` porte un second chemin d'écriture de data-URL, hors périmètre.**
`insertImage()` insère une image **dans `content` (jsonb)**, pas dans une
colonne mesurée — c'est le gisement que le § 5.2 point 3 disait « à
surveiller », mesuré à 0 image inline au 03/09. Non traité ici : la bascule y
est structurellement différente (remplacer un nœud TipTap après téléversement
asynchrone, pas juste substituer une valeur avant un `update`), et le mesurer
à 0 aujourd'hui ne justifie pas la complexité maintenant. Reste dans le
dossier tant qu'il n'est pas traité.

**Intention de départ : ne jamais effacer une data-URL avant d'avoir relu
l'objet distant** — d'où B3 et B4 séparés, pour garder le chantier
réversible jusqu'au dernier moment. **Corrigé au § 8** : ce n'est pas ce que
le B3 a construit — il écrase la colonne dès que le dépôt répond `ok`, sans
relecture préalable. Le B4 ne protège donc plus une décision d'effacement
(déjà prise), il détecte seulement après coup un objet devenu illisible.

#### Étape 2 : `recipes` et `step_photos` (35 Mo, 322 objets)

Le gros du chantier, sur les trois écrans qui écrivent réellement ces deux
tables : `CreerForm` (création/édition manuelle), `RelectureEditor` (validation
d'un import IA), et `RecipeImageBackfill` (outil admin qui régénère
`hero_thumb_url` / `hero_card_url` sur les recettes créées avant leur
existence). Même geste partout : chaque data-URL candidate à l'écriture passe
par `televerserImage('recette', …)` juste avant l'`insert`/`update`, sans
changer la structure de la fonction qui la contient.

**Six colonnes, cinq appels par recette.** `hero_image_url`,
`hero_image_original_url`, `hero_thumb_url` et `hero_card_url` sur `recipes`,
plus `url` et `original_url` sur chaque ligne de `step_photos`. `CreerForm` et
`RelectureEditor` les déposent **en parallèle** (`Promise.all`) — ce sont des
dépôts indépendants les uns des autres, les enchaîner un par un aurait multiplié
la durée de l'enregistrement par le nombre de colonnes puis par le nombre de
photos de l'étape.

**Aucune restructuration du contrôle d'erreur.** Les trois écrans encadraient
déjà tout leur enregistrement d'un `try`/`catch` qui affiche l'erreur à
l'utilisateur (`dialog.alert`, ou le motif propre au backfill qui marque une
chaîne vide plutôt que réessayer indéfiniment) — un dépôt refusé par le
stockage objet remonte donc par le même chemin qu'un `insert` refusé par
Postgres, sans code supplémentaire.

**`televerserImage` gagne une deuxième signature** (surcharge TypeScript) :
`(usage, valeur: string) => Promise<string>` en plus de la forme nullable
existante. Une photo d'étape (`p.url`) est toujours renseignée — sans la
surcharge, son transit par une fonction qui rend `string | null` aurait forcé
un `!` ou un cast à chaque appelant, pour un cas qui ne peut pas se produire.
Seule la photo principale d'une recette (facultative) garde le retour
nullable.

**Rien à changer dans `lib/images.ts`.** Le commentaire de
`chargerImageDepuisSrc` (§ 3.1) anticipait déjà ce jour : `crossOrigin =
'anonymous'` y est posé pour le moment où ces colonnes porteraient une URL
`https://` plutôt qu'une data-URL — c'est le cas dès qu'une recette rouverte
dans `CreerForm` ou relue par `RecipeImageBackfill` passe sa photo existante
dans `resizeDataUrlToThumb`. Le CORS de `jp-photos`, déjà posé et vérifié au
B0/§3.1, est la condition qui rend ce rechargement possible sans polluer le
canvas.

#### Étape 3 : `profiles` et `comments.photo_urls`

**Un seul écrivain réel pour `profiles`** : `ProfileHeader.saveImage` (avatar,
bannière), appelé par `ImageSlot.onChange` — une callback `void`, jamais
attendue par son appelant. `televerserImage()` y est donc entouré d'un
`try`/`catch` propre, qui affiche l'erreur puis abandonne, plutôt que de
laisser une exception s'échapper en rejet de promesse non intercepté — le
même risque déjà écarté à l'étape 1 pour `PartnersManager` (§ 7.5), ici
structurel à `ImageSlot` plutôt que ponctuel à un écran.

**`profiles.cover_url` n'a, comme les deux pictos de l'étape 1, aucun chemin
d'écriture applicatif** — confirmé par `docs/note-regression-cache.md` :
« `cover_url` n'est lu nulle part dans le code applicatif ». Rien à basculer
côté code ; la colonne est vide de toute façon (§ 7.5, mesure du B0), donc
sans objet pour le B3 non plus.

**`comments.photo_urls` ne s'écrit pas depuis un composant client, mais
depuis une route serveur** (`submitOrUpdateReview`, `lib/reviews-data.ts`,
clé service_role — cf. CLAUDE.md « Avis sur une recette »). Le dépôt ne peut
donc pas se faire là : la route ne voit jamais les octets d'une image
(§ 3, même doctrine que l'upload direct navigateur → bucket), et c'est
justement ce qu'on veut préserver. Le dépôt se fait **avant** l'appel réseau,
dans `BatchReview.submit()` (le formulaire d'avis) — chaque photo de l'avis
est déposée sur le stockage objet, et c'est l'URL renvoyée qui part dans le
corps JSON de `POST /api/fournee/[id]/avis`, à la place de la data-URL.
Sans ce changement, la route aurait continué à écrire des data-URL dans
`comments.photo_urls` en toute discrétion — la bascule d'une colonne ne
suffit pas si elle ne remonte pas jusqu'au point où la donnée est produite.

#### Étape 4 (dernière du B2) : `contact_*`, sur le conteneur privé

La plus différente des quatre : `jp-contact` est **privé**, et le dépôt
initial (`/api/contact`) est le **seul point d'écriture anonyme** de tout le
site. Ni `televerserImage()` ni la route de présignature ne pouvaient être
réutilisées telles quelles.

**`urlFinale` généralisée plutôt que conditionnée au conteneur.** Avant cette
étape, la route ne rendait une `urlFinale` que pour `jp-photos`
(`CONTENEUR_PUBLIC[conteneur] ? urlPublique(cle) : null`) — `jp-contact`
recevait `null`, sur lequel `televerserImage()` lève. `urlCanonique(conteneur,
cle)` (`lib/storage-data.ts`) rend désormais la même forme stable pour les
deux conteneurs : directement fonctionnelle sur `jp-photos`, **pas** sur
`jp-contact` (un `GET` nu y échoue sans signature) mais stable et
décomposable — `cleDepuisUrlCanonique` en retrouve la clé, ce qui permet de la
re-signer à la lecture (`urlAffichablePrivee`, `EXPIRATION_LECTURE_S`) **sans
colonne séparée pour la clé**. `televerserImage()` n'a donc pas eu à changer :
il reçoit toujours une `urlFinale`, quel que soit le conteneur.

**La route de présignature s'ouvre à un appelant sans session, mais
seulement pour `contact`, et seulement en réutilisant la chaîne existante**
— jamais improvisée ici (§ 5.5) :
- le même jeton signé que `/api/contact` (`formToken`, vérifié par
  `verifierOuverture` + `verdictDelaiOuverture`) prouve que l'appel vient
  d'un formulaire resté ouvert au moins trois secondes, pas d'un script qui
  viserait la route directement ;
- le même compteur, `debitIpDepasse` sur `contact_messages` par IP — une IP
  déjà au plafond de demandes ne peut pas non plus obtenir de nouvelles URLs
  de dépôt.

`clientIp()` (lecture de `x-forwarded-for`), auparavant locale à
`/api/contact`, est montée dans `lib/contact-data.ts` pour être partagée par
les deux routes plutôt que dupliquée.

Les réponses (admin `envoyerReponse`, membre `envoyerReponseMembre`) sont, à
l'inverse, déjà authentifiées : elles suivent la branche normale de la
route (comme un usage `membre`), sans jeton ni débit à vérifier.

**Le piège du § 5.2 est corrigé : `validerPhotos` accepte maintenant deux
formes**, une data-URL (repli si le dépôt a échoué avant l'appel — le client
envoie alors la valeur d'origine plutôt que de perdre la photo) et une URL de
stockage de `jp-contact`. **Jamais une URL externe quelconque** : la nouvelle
fonction pure `estUrlDuConteneur(conteneur, prefixe, valeur)`
(`lib/storage.ts`) vérifie que le chemin contient bien `/jp-contact/contact/`
— sans ce filtre, `/api/contact` étant anonyme, un appel direct aurait pu
glisser une image hébergée ailleurs, qui se serait chargée dans le panneau
d'administration au moment de la modération (fuite d'IP pour la personne qui
modère). `lib/contact.test.ts` verrouille les deux formes ET ce refus.

**Lecture : re-signature systématique avant rendu.** `contact_message_photos`
et `contact_reply_photos` sont lues à quatre endroits (`getContactPhotos`,
`getContactReplies` côté admin ; `getMesPhotos`, `getMesReponses` côté
membre) qui rendaient jusqu'ici `url` telle quelle à un `<img>` — vrai tant
que c'était une data-URL, faux dès qu'une URL de `jp-contact` y arrive sans
signature (403). `signerPhotoContact()` (`lib/contact-data.ts`, partagée par
les deux modules de lecture) appelle `urlAffichablePrivee` sur chaque ligne
avant de la rendre ; une data-URL (ligne pas encore reprise par le B3)
traverse inchangée.

#### Deux pièges déjà documentés, à ne pas perdre en route

Le § 5.2 en nomme deux. **Le premier est corrigé ci-dessus** (étape 4) :
`validerPhotos` distingue maintenant proprement les deux formes plutôt que
d'écarter en silence tout ce qui n'est pas `data:`. Reste le second, encore
ouvert — le **cycle de vie** : aujourd'hui la cascade FK supprime les images
avec la recette ; avec un bucket, les objets survivent aux lignes. **Le B1 a
posé la condition qui le rendra possible** — clés d'objet en UUID plutôt
qu'adressage par contenu, pour que la propriété d'un objet reste lisible —
mais **le mécanisme de réconciliation lui-même (lister, comparer aux
références en base, supprimer les orphelins de plus de 24 h) reste à
écrire**, au B4.

---

### 7.6 Lot B3 — reprise des ≈360 objets déjà en base (fait le 05/09)

Le B2 a basculé les écritures ; le B3 reprend ce qui existait déjà — les
colonnes qui portent encore une data-URL, tables mesurées au B0 (§ 7.5), hors
`imports.recette` (hors périmètre, § 5.3) et `profiles.cover_url` (vide).
**La colonne est écrasée dès que le dépôt réussit** — cf. la correction
posée au § 8 : il n'y a pas d'étape séparée « supprimer la data-URL » au B4,
contrairement à ce qu'annonçait la doctrine de départ (§ 7.5).

**Différence structurelle avec le B2 : ici le serveur a déjà la donnée.** Le
B2 résolvait « le navigateur a la data-URL, comment la déposer sans la faire
transiter par l'application » — d'où la présignature et le `PUT` direct
depuis le poste du visiteur. Le B3 lit la data-URL depuis la base : le
serveur peut donc la déposer lui-même, sans aller-retour navigateur ni
présignature — `lib/backfill-data.ts` signe et exécute le `PUT` dans la même
fonction (`deposerDataUrlServeur`), pendant serveur de `televerserImage()`.

**Clé service_role partout, plutôt qu'une vérification RLS table par
table.** `RecipeImageBackfill` (étape 1 du B2) prouve que la RLS de
`recipes` autorise déjà l'admin à écrire sur la recette d'un autre auteur —
mais rien d'équivalent n'est établi pour `profiles`, `comments`, `ads`,
`site_settings`, `articles`, `tags`, `allergens`, et **aucune policy
d'écriture n'existe** sur `contact_message_photos` / `contact_reply_photos`
« pour personne, admin compris » (CLAUDE.md). Plutôt que vérifier neuf
policies une par une, le B3 écrit uniformément avec la clé service_role
(`createAdminClient()`) : cohérent avec sa nature — une reprise
d'administration cross-auteur n'est pas un geste de membre ordinaire, même
doctrine que l'impersonation et les réponses admin du module contact.

**Une déclaration de cibles, pure, séparée de l'écriture** —
`lib/backfill.ts` (dix cibles « scalaires » : table, colonne(s) texte,
usage) / `lib/backfill-data.ts` (server-only : la clé service_role et la
signature TempURL). Même séparation que `ideas.ts` / `ideas-data.ts` :
l'écran admin importe la déclaration pure pour afficher la liste des cibles,
sans jamais tirer la clé service_role dans son bundle.

**Une ligne partiellement migrée s'auto-cicatrise, sans état à suivre entre
deux lots.** Une cible peut porter plusieurs colonnes (`recipes` en a
quatre) migrées indépendamment ; le filtre de sélection (`colonne.like.
data:%` sur au moins une des colonnes) resélectionne toute ligne encore
partiellement en data-URL, et seule la colonne qui l'est encore repasse par
le dépôt — `estDataUrlImage` reconnaît une colonne déjà migrée et la laisse
inchangée. Une ligne où une seule colonne échoue au dépôt (réseau, format)
reste donc sélectionnée au lot suivant sans dupliquer ce qui a réussi.

**`comments.photo_urls` est la seule cible en tableau JSON**, traitée à part
(`traiterLotCommentairesPhotos`) plutôt que généralisée dans le moteur
scalaire : sa forme (`{ url, ai_retouched }[]`) est spécifique aux avis pour
un unique appelant, une abstraction commune n'aurait rien simplifié.

**`tags.category_picto` et `allergens.picto` sont couvertes malgré
l'absence d'écran** (§ 7.5 étape 1 du B2, corrigé au § 8) : le B3 lit et
écrit directement en base, il n'a besoin d'aucun chemin d'écriture
applicatif pour ça — contrairement au B2, dont chaque étape bascule un
écran réel.

**Un nouvel usage, `referentiel`** (`lib/storage.ts`), couvre ces deux
pictogrammes : `acces: 'admin'` par cohérence avec le reste du conteneur
public, sans effet réel puisque le B3 ne passe jamais par la route de
présignature (il signe lui-même, côté serveur).

**Écran unique** (`/admin/photos`, `StorageBackfillManager`), motif
`RecipeImageBackfill` étendu aux onze cibles (dix scalaires + les avis) :
un bouton par cible, compteurs repris/échecs, reprenable à tout moment. Une
différence assumée avec `RecipeImageBackfill` : chaque lot est traité par
une route serveur (`POST /api/admin/backfill-photos`, clé service_role)
plutôt que par le client Supabase du navigateur, pour la raison exposée
plus haut (écriture cross-auteur, RLS non vérifiée table par table).

---

### 7.7 Lot B4 (partie 1/2) — vérification a posteriori (faite le 05/09)

**Ce que le B3 protège réellement, une fois la correction du § 8 posée : plus
rien.** La donnée d'origine est déjà écrasée au moment où le B3 rend la main
— il n'y a plus de décision d'effacement à retarder. Ce qui reste possible,
et que cette partie du B4 fait : **détecter après coup** un objet déposé
mais devenu illisible (échec silencieux du dépôt, objet supprimé côté
stockage entre-temps…). Un échec ici n'a pas de remède automatique : il
désigne la ligne à corriger à la main, en redéposant la photo depuis son
écran d'origine — il n'y a plus de data-URL de repli.

**Un bouton « Vérifier » par cible**, à côté de « Lancer »
(`StorageBackfillManager`) : relit chaque URL de stockage déjà écrite (`GET
https://…` en `HEAD`, jamais les data-URL restantes — hors périmètre de
cette vérification) et rend `OK` / `introuvable`. Un seul appel par cible
plutôt qu'un lot paginé comme la reprise : les volumes mesurés au B0 (≈360
objets au total, aucune cible n'en approchant l'ensemble) tiennent
largement sous le plafond de sécurité (`PLAFOND_VERIFICATION = 1000`) — un
outil de vérification est un geste ponctuel après coup, pas un traitement
en continu qui justifierait une pagination.

**Re-signature avant lecture sur le conteneur privé.** Une URL de
`jp-contact` stockée en base n'est, comme pour l'affichage (`signerPhotoContact`,
lib/contact-data.ts), pas directement lisible — `urlRepond()`
(`lib/backfill-data.ts`) la fait passer par `urlAffichablePrivee()` avant
le `HEAD`, exactement comme la lecture des photos de contact.

**Toujours en lecture seule** : aucun résultat de vérification n'écrit quoi
que ce soit, échec compris — la doctrine « aucune écriture cross-auteur non
justifiée » du B3 n'a même pas à se poser ici.

### 7.8 Lot B4 (partie 2/2) — réconciliation des orphelins (écrite le 05/09)

Dernière pièce du lot B (§ 7.1) : les objets présents sur le stockage mais
sans plus aucune ligne qui les référence — un objet peut se retrouver
orphelin si sa ligne est supprimée après coup (une recette effacée, par
exemple), condition posée dès le B1 en choisissant des clés d'objet en UUID
plutôt qu'un adressage par contenu, précisément pour que la propriété d'un
objet reste lisible le jour où ce mécanisme s'écrirait.

**Hors de portée de l'application elle-même.** `lib/storage-data.ts` sait
signer un dépôt ou une lecture pour une clé déjà connue ; il n'existe aucun
chemin pour LISTER le contenu d'un conteneur — ni dans l'app, ni dans la
route de présignature. Lister exige l'API Swift complète (authentification
Keystone, pas seulement une signature TempURL) : c'est un outillage
d'infrastructure, pas un écran admin de plus. D'où le choix d'un workflow
GitHub Actions, motif des trois workflows du B0
(`object-storage-cors.yml`, `object-storage-tempurl-cles.yml`,
`object-storage-tempurl-sonde.yml`) plutôt qu'une route Next.js.

**`.github/workflows/object-storage-reconciliation.yml`** +
**`.github/scripts/reconcilier_stockage.py`** : liste le conteneur choisi
(`python-swiftclient`, mêmes secrets `OS_*` que les trois workflows du B0),
interroge l'API REST de Supabase (`SUPABASE_SERVICE_ROLE_KEY` — **nouveau
secret GitHub à poser**, même valeur que sur Vercel) pour rassembler
**toutes** les clés d'objet réellement référencées, tous les couples
table/colonne mesurés au B0 confondus, et calcule la différence.

**La clé d'un objet se retrouve dans son URL sans connaître
`SWIFT_STORAGE_URL`** : `cle_depuis_url()` prend simplement ce qui suit
`/<conteneur>/` dans la valeur stockée — inverse du même principe que
`cleDepuisUrlCanonique()` côté application (`lib/storage-data.ts`), sans
avoir besoin de reconstruire la racine complète.

**Marge de grâce (24 h par défaut, réglable)** : un objet non référencé
mais déposé il y a moins de `heures_grace` heures n'est jamais compté comme
orphelin — le temps qu'un dépôt tout juste réussi voie son écriture en base
aboutir. Vérifié par un test manuel (trois objets simulés : référencé,
orphelin vieux, orphelin récent — seul le second est retenu).

**Rapport à sec systématique, suppression sur confirmation exacte
séparée** — jamais un seul geste, comme convenu : le script supprime
uniquement si `confirmer_suppression` vaut EXACTEMENT `SUPPRIMER`, et
recalcule alors la liste à neuf avant d'agir plutôt que de réutiliser un
rapport d'une exécution précédente. La pratique recommandée (documentée
dans l'en-tête du workflow) est de le lancer une première fois sans cette
valeur, lire le rapport, puis le relancer une seconde fois séparément si le
rapport est satisfaisant.

**Colonnes couvertes** : les mêmes que `lib/backfill.ts` `CIBLES_BACKFILL`
plus `comments.photo_urls` — recopiées à la main dans le script (Python, pas
TypeScript : aucun moyen de partager la déclaration entre les deux
langages), avec un commentaire pointant vers `lib/backfill.ts` comme source
de vérité à tenir synchronisée si une colonne image est ajoutée côté
application.

**Exécuté le 05/09, en rapport à sec, sur les deux conteneurs** :

```
jp-photos  : 355 objets · 355 clés référencées · 0 orphelin
jp-contact :  10 objets ·  10 clés référencées · 0 orphelin
```

Les deux nombres égaux verrouillent les deux sens à la fois : aucun objet
sans référence en base (rien à nettoyer), aucune référence pointant dans le
vide (rien de perdu à la reprise). **Aucune suppression n'a donc jamais eu
besoin d'être lancée** — le mode `confirmer_suppression` reste inutilisé à
ce jour, et le lot B se clôt sans qu'un seul objet ait été effacé.

Ces totaux recoupent exactement la mesure du B0 (§ 7.5) : 355 pour
`jp-photos`, et 8 + 2 = 10 pour les deux tables de contact.

---

### 7.9 Lot C — découpage et C0 (05/09)

Le lot 0-bis a tranché le DDL, et rien d'autre (§ 7.4) : ni les **données**,
ni les **7 identités** (bcrypt, `provider_id` Google), ni **GoTrue**, dont la
phase 3 n'a jamais été jouée. C'est là qu'est tout le risque restant, et le
découpage ci-dessous le prend dans cet ordre.

#### Ce que le C0 a fermé, sans toucher à une ligne de code

**1. Les clés JWT asymétriques survivent à l'auto-hébergement — le risque le
plus sérieux, et il est écarté.** `lib/auth.ts` et `lib/supabase/middleware.ts`
reposent sur `getClaims()`, qui vérifie le jeton **localement contre le JWKS**
du projet : c'est ce qui a supprimé ~65 % du trafic base
(`docs/note-regression-cache.md`). Le middleware documente lui-même la
condition : *« le gain suppose des clés de signature asymétriques ; sur
l'ancien secret partagé (HS256), `getClaims()` retombe tout seul sur
`getUser()` »*. Un GoTrue auto-hébergé en HS256 aurait donc **réintroduit un
aller-retour serveur à chaque rendu de page, sans une seule erreur visible**.

Vérifié sur la documentation officielle plutôt que supposé : l'auto-hébergé
sait signer en asymétrique (ES256/RS256) et **expose le JWKS au chemin exact
que `supabase-js` interroge** :

| Service | Variable | Contenu |
|---|---|---|
| Auth (GoTrue) | `GOTRUE_JWT_KEYS` | JWK privée EC **+** l'ancienne clé symétrique |
| PostgREST | `PGRST_JWT_SECRET` | accepte un JWKS entier, pas seulement un secret |
| — | endpoint | `/auth/v1/.well-known/jwks.json` |

La clé symétrique héritée reste incluse dans le jeu de clés : les jetons déjà
émis continuent d'être vérifiés pendant la bascule. Aucune déconnexion de
masse à prévoir de ce fait.

**2. L'application ne parle jamais à PostgreSQL en direct.** Vérifié :
aucune dépendance `pg`/`postgres`/ORM dans `package.json`, aucune chaîne
`postgres://` dans le code. Tout passe par HTTPS vers PostgREST et GoTrue.
Deux conséquences, et la seconde décide du séquencement :

- **Le port 5432 n'a jamais à être exposé en production.** Le lot 0-bis l'a
  ouvert par un Endpoint TCP le temps d'une restauration (§ 7.2, arbitrage 2)
  ; le lot C n'a pas à reconduire cette exception au-delà de la bascule.
- **Garder Vercel devant une base à Genève est tenable** : ~10 ms de latence
  supplémentaire sur des appels HTTPS, et la bascule se réduit à trois
  variables d'environnement.

**Arbitrage retenu : C d'abord, A ensuite.** Deux basculements petits et
réversibles valent mieux qu'un grand. Le § 7.3 note à juste titre que A et C
atterrissent sur la même plateforme et gagnent à être enchaînés — c'est vrai
de l'apprentissage de la plateforme, pas du risque : les mener le même jour
additionne deux causes de panne sans rien simplifier.

**3. `COMING_SOON` est déjà le mode maintenance de la bascule.** La variable
existe (§ variables d'environnement) et sert la page d'attente à la place du
site. Gelée pendant la bascule, elle rend le **retour arrière gratuit** : sans
écriture pendant la fenêtre, revenir à Supabase ne perd rien et ne demande
aucun rejeu. C'est ce qui transforme le C3 d'un saut sans filet en une
opération réversible. À poser sur `dev.jepatisse.com` aussi, que `middleware.ts`
exempte justement de cette page (§ Domaines) — l'exemption est à neutraliser
le temps de la fenêtre, sans quoi les testeurs écriraient dans la base qu'on
est en train de migrer.

#### Ce que le C0 a mesuré (05/09, après le lot B)

| Mesure | Valeur | Lecture |
|---|---|---|
| `pg_database_size` | **27 Mo** | contre 57 Mo au § 2.1 — le lot B a fait son travail |
| Colonnes image de `recipes`, vivantes | **20 ko** / 58 recettes | ≈ 350 octets par recette : ce sont des URL, plus une seule data-URL |
| `imports.recette`, vivant | **4 674 ko** / 32 lignes | dont **18 lignes contenant `data:image/`** |

Les 27 Mo sont la taille **sur disque**, lignes mortes comprises : les 12 Mo
de TOAST que `recipes` traînait encore sont des data-URL écrasées, que le
dump ne lira pas. Le dump réel sera donc nettement en dessous.

**`imports` est le dernier gisement d'images resté en base**, et ce n'est
pas un oubli du lot B : `imports.recette` est un JSON, pas une colonne image
scalaire, et il a été exclu en connaissance de cause (§ 7.6). Ce JSON porte
`photo_principale`, `photo_principale_original`, les `etapes[].photos[]` et,
pour un import PDF, la banque `photos_pdf` des pages pas encore placées.
`RelectureEditor` ne dépose ces images sur le stockage objet **qu'à la
validation** (`televerserImage`, § 7.5) : un brouillon jamais relu garde donc
tout en base, indéfiniment. C'est cohérent — le brouillon est un tampon de
travail — mais **aucune rétention n'existe**, et la table ne fait que croître :
4,7 Mo aujourd'hui, soit 17 % de la base, pour 32 brouillons dont le plus
ancien date du 13/07/2026.

#### La contrainte de calendrier

**L'essai Virtuozzo a démarré le 05/09 — il est borné à 14 jours, donc il
expire le 19/09.** C'est la seule échéance dure du lot C, et elle décide du
séquencement : le C1 (répétition GoTrue) doit tenir dans cette fenêtre, sinon
il faudra basculer en payant (≈ 16 €/mois avant ouverture, § 4.5) pour le
mener. Ce n'est pas un drame — c'est le tarif prévu de toute façon (§ 4.6) —
mais mieux vaut le décider que le subir.

Corollaire de méthode, déjà appris au lot 0-bis (§ 7.4) : **tout ce qui peut
être préparé hors chrono doit l'être avant de monter l'environnement.**

#### La rétention d'`imports` — traitée (06/09)

30 jours **depuis la dernière activité**, pas depuis la création. Le repère
compte : `RelectureEditor` écrit dans la table à chaque enregistrement
intermédiaire, si bien qu'`updated_at` suit l'activité réelle, alors que
`created_at` purgerait un brouillon repris hier mais commencé il y a cinq
semaines — c'est-à-dire détruire une saisie en cours, le seul vrai risque de
cette fonctionnalité. D'où une colonne et un trigger plutôt qu'un simple
filtre sur la date de création.

Trois décisions qui se lisent mal dans le code sans leur raison :

- **La purge vit dans `/api/cron/abonnements`, pas dans son propre cron.** Le
  plan Vercel Hobby plafonne le nombre de tâches planifiées et `vercel.json`
  en déclare déjà deux : une troisième entrée serait refusée. La passe est
  isolée (son échec est rapporté, jamais propagé aux notifications
  d'abonnement) et l'anomalie est écrite en tête de la route, pour qu'on la
  redécoupe le jour du passage en Pro plutôt que de s'en étonner.
- **Le trigger est une fonction plpgsql écrite à la main, pas `moddatetime`.**
  Sur ce projet les extensions vivent hors du schéma `public` (cf. `pg_trgm`
  et le `set search_path` de `suggest_similar_ideas`) : une dépendance de plus
  à ce détail se paierait au restore du lot C.
- **Les brouillons déjà anciens ont reçu une fenêtre pleine, une fois.**
  `updated_at` ayant été initialisée sur `created_at`, la rétention se
  comportait pour les lignes existantes exactement comme si elle comptait
  depuis la création : le premier passage aurait supprimé trois brouillons
  jamais relus, sans qu'aucun préavis n'ait pu s'afficher. Un `update … set
  updated_at = now()` sur ces seules lignes les remet à trente jours réels.
  Les treize autres lignes purgeables sont des imports **relus** — leur
  recette est au carnet, la copie de travail ne sert plus, rien à annoncer.

Relevé au moment de la bascule : 16 lignes sur 32 expirées, **1 922 ko
libérés** — pas les 4,7 Mo, le reste vivant dans des imports récents qui
vieilliront à leur tour. C'est le régime permanent qui compte, pas ce premier
passage.

#### Exigence produit posée au C2 : ce que le visiteur lit chez Google

Au moment du « Se connecter avec Google », l'écran de consentement affiche
aujourd'hui l'identifiant du projet Supabase — une chaîne opaque, qui n'évoque
rien au visiteur et qui, sur un écran où on lui demande ses identifiants,
**ressemble à ce qu'on lui apprend à fuir**. Ce n'est pas un détail cosmétique
mais un signal de confiance au pire endroit du parcours.

Ce n'est pas « le nom de la base » : c'est **l'hôte de l'URI de redirection
OAuth**. Le parcours réel est
`app → <hôte auth>/auth/v1/authorize → Google → <hôte auth>/auth/v1/callback →
/auth/callback`, et c'est cet hôte, enregistré dans la console Google, que
l'écran de consentement montre. Le `redirectTo` du code
(`components/LoginForm.tsx`) porte déjà notre domaine — il n'intervient qu'à la
toute fin, après Google.

Deux leviers, à ne pas confondre :

| Levier | Où | Quand |
|---|---|---|
| **Nom d'application** affiché (« Je pâtisse ! ») | Google Cloud Console → écran de consentement OAuth | **dès maintenant**, indépendant de la migration |
| **Hôte affiché** dans l'URI de redirection | dépend de l'hébergeur de GoTrue | **au C2** |

Donc : **exposer GoTrue auto-hébergé sur un sous-domaine de `jepatisse.com`**
(`auth.jepatisse.com`, par exemple), jamais sur le nom d'hôte générique que
Virtuozzo attribue à l'environnement — sinon on remplace une chaîne opaque par
une autre. Cet hôte devient la valeur de `NEXT_PUBLIC_SUPABASE_URL` au C3, et
c'est lui qu'il faut déclarer dans les URI de redirection autorisées côté
Google **avant** la bascule, pas pendant.

#### Ce que le C0 laisse ouvert

- Plus rien qui bloque le C1.

#### Découpage

| Sous-lot | Contenu | Livrable |
|---|---|---|
| **C0** | Mesures et arbitrages, aucun code | Cette section |
| **C1** | Répétition GoTrue (phase 3 jamais jouée) + migration des 7 identités sur un environnement de test | Le vrai Go/No-Go restant — **phase 0 en § 7.10** |
| **C2** | Infrastructure : nœuds Postgres, PostgREST, GoTrue ; SMTP via Brevo (§ 7.9 bis, SES retiré) ; OAuth Google ; clés JWT asymétriques | Environnement reproductible, sans bascule |
| **C3** | Bascule : `COMING_SOON` → dump → restore → trois variables → vérification → réouverture | Le seul moment risqué, et il est réversible |
| **C4** | `wal-g` (PITR, § 4.5), retrait de Supabase | Définition de terminé |

**Dépendances codées en dur à reprendre au C3**, repérées maintenant pour ne
pas les découvrir en pleine bascule : `NEXT_PUBLIC_SUPABASE_URL` et la clé
publique sont **inlinées au build** (reconstruction sans cache obligatoire),
l'URL Supabase est écrite en dur dans
`.github/scripts/reconcilier_stockage.py` (lot B4), et les **URI de
redirection autorisées côté Google** doivent porter le nouvel hôte d'auth
avant la bascule (voir l'exigence produit ci-dessus) — les déclarer pendant
la fenêtre casserait la connexion Google le temps de la propagation.

### 7.9 bis Retrait d'AWS SES, remplacé par Brevo (11/09)

Une tâche de préparation banale — configurer le SMTP de GoTrue pour le C3 —
a fait remonter un blocage qui n'avait rien à voir avec la migration : **le
compte AWS SES restait en bac à sable, sans perspective de sortie**, exactement
le point que docs/contact-jira.md § 2.1 signalait comme « conséquence à
connaître » depuis l'écriture du module contact. Tant que le site n'est pas
ouvert, ça ne se voit pas — six comptes, tous vérifiés à la main. Ça serait
devenu un mur au premier inscrit inconnu.

**Décision : un remplacement complet, pas une cohabitation qui traînerait.**
Le site n'étant pas en production, aucune raison de ménager un retour arrière
long — la seule prudence gardée a été de prouver Brevo avant de couper SES,
jamais l'inverse.

#### Pourquoi avant le C3, pas pendant

Même raisonnement que l'arbitrage « C d'abord, A ensuite » du § 8 : mener la
bascule d'infrastructure et un changement de fournisseur d'e-mail le même jour
additionne deux causes de panne possibles sans rien simplifier. Brevo est
éprouvable **dès aujourd'hui sur la production actuelle**, sans rien attendre
du C3 :

- les e-mails applicatifs partent de Vercel par SMTP nu (`lib/email.ts`,
  aucun SDK AWS) → cinq variables à changer, sans toucher une ligne de code ;
- les e-mails d'authentification partent du SMTP configuré **dans le tableau
  de bord Supabase** → un formulaire à remplir, pas un déploiement.

Résultat : la configuration SMTP posée sur GoTrue au C2 sera une configuration
**déjà prouvée en production**, pas une inconnue de plus le jour de la bascule.

#### DNS : trois enregistrements déjà en place, un seul manquant

Mesuré plutôt que supposé, en reprenant la même méthode qu'au § 7.11 — la
résolution DNS depuis l'extérieur plutôt qu'une capture d'écran :

| Enregistrement | État constaté |
|---|---|
| Code de vérification Brevo (`brevo-code:…`) | déjà posé |
| DKIM (`brevo1._domainkey` → CNAME `b1.jepatisse-com.dkim.brevo.com`) | déjà posé, clé RSA 400 caractères servie par la cible |
| DMARC (`p=none`, `rua` vers Brevo) | déjà posé — le bon réglage pendant un changement de fournisseur : collecte des rapports sans rien rejeter |
| SPF | **Brevo absent** — seule pièce manquante |

**Le SPF s'est modifié en deux temps, jamais en un seul geste avec la coupure
de SES.** D'abord l'ajout, SES conservé :

```
v=spf1 include:spf.infomaniak.ch include:amazonses.com include:spf.brevo.com -all
```

Avant d'ajouter un troisième `include`, le compte de résolutions DNS a été
mesuré — au-delà de 10, SPF tombe en `PermError` et invalide **tous** les
envois, Brevo comme Infomaniak :

```
include:spf.infomaniak.ch  = 3 résolutions
include:amazonses.com      = 1 résolution
include:spf.brevo.com      = 1 résolution
                              ─────────────
                              5 sur 10 — marge large
```

Puis, une fois les deux tests réels passés (ci-dessous), le retrait de SES,
en modifiant le **même** enregistrement TXT plutôt qu'en en créant un second
— deux `v=spf1` sur le même nom produisent le même `PermError` :

```
v=spf1 include:spf.infomaniak.ch include:spf.brevo.com -all
```

#### Deux pièges payés en configurant les clés SMTP

**Le blocage par IP autorisées, activé par défaut à la création d'une clé
SMTP Brevo, est structurellement incompatible avec un envoi depuis Vercel.**
Les fonctions serverless sortent par un pool d'adresses partagées, changeantes
à chaque invocation — aucune liste à déclarer ne peut le satisfaire. Piège
sérieux : l'interrupteur se présente comme une bonne pratique de sécurité, pas
comme un interrupteur d'arrêt. **À retenir pour le C2** : ce blocage
redeviendra utilisable une fois GoTrue sur Infomaniak, qui a des IP stables
(`185.172.100.59` / `.60`) — mais toujours pas pour les e-mails applicatifs
tant qu'ils partent de Vercel.

**Le champ « Connexion » (login SMTP) n'est pas l'adresse du compte Brevo.**
Brevo génère un login de la forme `bNNNNNNNN@smtp-brevo.com`, visible sur le
même écran que le mot de passe SMTP — mais rien n'empêche de saisir l'adresse
e-mail du compte à la place, qui a la même forme superficielle. Les deux
erreurs (blocage IP actif, mauvais login) produisaient le même symptôme :
`535 5.7.8 Authentication failed`, un refus **au niveau SMTP** — donc hôte et
port déjà corrects, connexion et TLS déjà négociés, seule l'authentification
rejetée. Corrigés un par un, jamais ensemble, pour savoir lequel des deux
avait agi.

#### La preuve retenue : l'e-mail reçu, jamais la réponse de l'API

Même doctrine que pour GoTrue auto-hébergé (§ 7.11) : une réponse vide de
l'API de réinitialisation ne prouve rien — elle est volontairement identique
qu'une adresse existe ou non. **Seul l'e-mail effectivement reçu compte.**
Deux tests réels, sur deux chemins distincts :

| Chemin | Test | Résultat |
|---|---|---|
| `lib/email.ts` (Vercel) | `/admin/test-email` vers une adresse réelle | reçu (en spam, cf. ci-dessous) |
| Supabase Auth (tableau de bord) | vrai flux « mot de passe oublié » sur `dev.jepatisse.com` | reçu |

**Le premier message est arrivé dans les spams, et c'est attendu, pas un
échec.** Un domaine qui vient d'ajouter un nouveau fournisseur d'envoi part
sans réputation pour cette route, même avec SPF/DKIM corrects — Gmail applique
une méfiance transitoire. `p=none` en DMARC est justement le réglage qui
convient pendant cette phase. Rien à corriger : le volume et la régularité
d'envoi construisent la réputation avec le temps, sans action sur le DNS ni
le code.

#### Nettoyage du code — une PR séparée, après les deux tests

Retiré : `lib/ses-webhook.ts`, `lib/ses-notifications-data.ts`,
`lib/ses-types.ts`, `app/api/ses/webhook/route.ts` (308 lignes), les deux
points d'appel dans `lib/email.ts` (`estSupprimee`, `SuppressedEmailError`).
Renommé, dans le même mouvement : `SES_SMTP_*` / `SES_SENDER_EMAIL` →
`SMTP_*` / `EMAIL_SENDER` — un nom neutre vis-à-vis du fournisseur, puisque
`lib/email.ts` n'a jamais rien connu d'AWS (SMTP nu depuis l'origine, cf.
docs/abonnements.md § 7).

**Ce renommage n'a PAS été répercuté sur Vercel, et ça s'est vu le 11/09**
(§ 7.14) : les variables y sont restées sous leurs anciens noms, l'outil de
test du back-office est tombé sur un `Configuration SMTP manquante` en pleine
bascule, et le test Brevo qui avait validé le fournisseur tournait sur le code
d'avant cette PR. **Une PR qui renomme une variable d'environnement doit
nommer explicitement le geste correspondant côté hébergeur.**

**`email_suppressions` reste en base, mais n'est plus ni lue ni écrite** —
même doctrine que `profiles.followers_count` (CLAUDE.md, « Réglages du
compte ») : supprimer une table est une migration séparée, jamais un
sous-produit d'un autre chantier. Ce n'est pas une régression de protection :
Brevo tient sa propre liste de suppression côté serveur et refuse de
lui-même les adresses ayant rebondi. Ce qui disparaît, c'est la *visibilité
locale* sur ces adresses, pas la protection de la réputation du domaine. Un
webhook Brevo pour la réalimenter reste possible, non entamé, sans urgence.

**Conséquence collatérale, positive** : le dossier portait une doctrine
entière sur le motif `AKIA[0-9A-Z]{16}` que GitHub scanne sur les dépôts
publics (§ 7.10). Elle reste valable en principe, mais n'a plus d'objet
concret — l'application ne détient plus aucun identifiant AWS, nulle part.

### 7.10 Lot C1 — phase 0 : ce qui se prépare hors chrono (06/09)

Le lot 0-bis a mesuré ce que vaut une phase 0 : trois faux départs absorbés
**avant** de monter l'environnement, et tout le reste joué en une matinée
(§ 7.4). Même méthode ici, avec une raison de plus — l'essai expire le 19/09.

#### Le blocage à poser avant d'écrire quoi que ce soit

**Ce dump-là ne peut pas passer par GitHub.** Le lot 0-bis dumpait du DDL :
aucune donnée. Le C1 dumpe `auth.users` et `auth.identities`, c'est-à-dire des
**adresses e-mail et des empreintes bcrypt de mots de passe**. Le dépôt
`fabien5111/mc` est **public** : un artefact d'un dépôt public se télécharge
sans authentification, et un journal de job se lit de même.

Conséquence directe sur le mode opératoire : le C1 **ne peut pas reprendre le
motif « dump → artefact → restore »** du § 7.2. Il lui faut un job unique qui
dumpe et restaure dans la même exécution, sans `upload-artifact`, sans
`pg_dump` redirigé vers un fichier conservé, et sans qu'aucune ligne de
données n'atteigne la sortie standard. C'est faisable — la restauration du lot
0-bis enchaînait déjà les deux — mais c'est une contrainte à poser avant
d'écrire le workflow, pas à découvrir en le relisant.

#### Ce que le C1 doit prouver (les critères de Go/No-Go)

Une répétition qui ne dit pas d'avance ce qu'elle vérifie ne prouve rien :

1. **GoTrue démarre sur le schéma restauré** sans rejouer ni casser ses
   propres migrations.
2. **Un compte e-mail + mot de passe se connecte** — les empreintes bcrypt de
   Supabase sont lisibles telles quelles par le GoTrue auto-hébergé.
3. **Un compte Google se reconnecte et retombe sur la MÊME ligne `profiles`.**
   C'est le critère le plus important et le plus silencieux : si
   `auth.identities.provider_id` n'a pas suivi, la connexion Google **crée un
   nouvel utilisateur**, donc un nouveau profil — et le membre perd son carnet
   entier sans qu'aucune erreur ne s'affiche. À tester **en priorité sur le
   compte qui porte deux identités** (mesure ci-dessous) : c'est le seul où
   les deux portes d'entrée doivent aboutir au même `user_id`.
4. **Le JWKS est servi au chemin qu'interroge `supabase-js`**
   (`/auth/v1/.well-known/jwks.json`) et `getClaims()` vérifie localement,
   sans aller-retour (c'est le gain de ~65 % du trafic base, § 7.9 point 1).
5. **PostgREST accepte le jeton et la RLS s'applique** : une lecture qui doit
   échouer échoue. Un jeton accepté sans RLS serait pire qu'un jeton refusé.

#### Les mesures à prendre maintenant, dans l'éditeur SQL Supabase

Trois lectures, aucune écriture. **Ne recopier que les décomptes et les
numéros de version** — jamais une adresse e-mail ni une empreinte.

```sql
-- A. Quelles tables du schéma auth portent réellement des données.
select relname as tab, n_live_tup as lignes
  from pg_stat_user_tables
 where schemaname = 'auth' and n_live_tup > 0
 order by n_live_tup desc;

-- B. Le niveau de migration de GoTrue : c'est lui qui désigne la version à
--    déployer. Un GoTrue plus ancien que le schéma qu'on lui donne rejouera
--    des migrations sur une base qui les a déjà.
select version from auth.schema_migrations order by version desc limit 5;

-- C. La forme des 7 identités (décomptes seulement).
select provider, count(*) from auth.identities group by provider;
select count(*) as total,
       count(*) filter (where encrypted_password is not null) as avec_mot_de_passe
  from auth.users;
```

#### Ce que les mesures ont donné (06/09)

| Table `auth` | Lignes | Sort |
|---|---|---|
| `schema_migrations` | 77 | gérée par GoTrue lui-même — **pas des données** |
| `refresh_tokens` | 50 | **non migrée** (décision ci-dessous) |
| `flow_state` | 34 | non migrée — états PKCE transitoires |
| `sessions` | 15 | **non migrée** |
| `mfa_amr_claims` | 15 | non migrée — adossée aux sessions |
| `identities` | **7** | **migrée** |
| `users` | **6** | **migrée** |
| `one_time_tokens` | 1 | non migrée — jeton en cours de validité, transitoire |

Deux enseignements, dont un qui n'était pas prévu.

**1. Il y a 6 comptes pour 7 identités : un compte porte à la fois un mot de
passe et un compte Google.** Le dossier écrivait « 7 identités » en pensant
« 7 comptes » depuis le début — l'écart n'est pas cosmétique, c'est le cas
limite du critère 3. Sur ce compte-là, la connexion Google doit retrouver
l'utilisateur **déjà créé par le mot de passe**, ce qui suppose que les deux
lignes d'`identities` aient suivi *et* pointent vers le même `user_id`. Si le
lien casse, le membre se retrouve avec deux comptes — et le carnet reste
attaché à celui qu'il n'utilisera pas. **La répétition doit tester ce compte
en priorité, et par ses deux portes d'entrée.** À vérifier aussi côté GoTrue
auto-hébergé : le rattachement automatique d'identités par adresse e-mail n'y
a pas forcément le même réglage par défaut que chez Supabase.

**2. Aucun facteur MFA n'est enrôlé** — `mfa_factors` n'apparaît pas dans les
tables peuplées, seule `mfa_amr_claims` l'est (elle enregistre *comment* une
session s'est authentifiée, pas un second facteur). Une inconnue de moins.

**Le niveau de migration de GoTrue est `20260625000000`** (77 lignes dans
`auth.schema_migrations`). C'est ce numéro, et non une version marketing, qui
désigne l'image à déployer — la correspondance est établie ci-dessous.

**Conséquence sur la stratégie de restauration** : plutôt que de restaurer le
schéma `auth` de Supabase (DDL + `schema_migrations`), **laisser le GoTrue
aligné créer son propre schéma au démarrage**, puis n'insérer que `users` et
`identities`. Deux avantages décisifs :
- aucun conflit possible entre les migrations dumpées et celles que GoTrue
  veut appliquer ;
- la charge de données sensibles tombe à **13 lignes**, ce qui rend le
  blocage GitHub ci-dessus trivial à contourner (un job unique, quelques
  `insert`, rien à stocker).

#### Quelle image `supabase/auth` déployer (mesuré le 06/09)

Le numéro relevé (`20260625000000`) a été retrouvé dans le dépôt amont plutôt
que deviné — la méthode se rejoue telle quelle si la question se repose :

```bash
git clone --filter=blob:none --no-checkout https://github.com/supabase/auth.git
git sparse-checkout set --no-cone migrations && git checkout
# le commit qui introduit la migration, puis les tags qui le contiennent
git log -1 --format=%H -- migrations/20260625000000_*.up.sql
git tag --contains <ce commit> --sort=creatordate | head
```

| Repère | Valeur |
|---|---|
| Migration en tête chez Supabase | `20260625000000_add_custom_claims_allowlist` |
| Première release stable qui la contient | **`v2.192.0`** |
| Migration **suivante** en amont | `20260821000000_add_scim_users` |
| Première release stable qui contient celle-là | `v2.197.0` |

**Fenêtre compatible : `v2.192.0` à `v2.196.0` incluse.** Dans cette fenêtre,
le jeu de migrations se termine exactement là où Supabase s'est arrêté — le
schéma produit est celui d'aujourd'hui, ni en avance ni en retard.
**`v2.196.0` est la version retenue** : dernière du créneau, donc corrections
les plus récentes, sans le saut de schéma qu'introduit la 2.197.

À partir de `v2.197.0`, GoTrue appliquerait de lui-même les migrations SCIM et
codes de secours au démarrage. Ce n'est pas dangereux en soi — c'est une
montée de version ordinaire — mais ça ferait diverger le schéma de la source
**pendant la répétition**, c'est-à-dire au seul moment où l'on veut comparer
deux états identiques. À faire après la bascule, séparément.

#### Un écart de sept migrations, levé

`auth.schema_migrations` compte **77 lignes** chez Supabase, alors que
`v2.196.0` n'embarque que **70 fichiers** de migration. L'explication probable
est le fichier `00_init_auth_schema` : GoTrue a fusionné à un moment ses
migrations les plus anciennes en une seule, mais une base créée **avant** cette
fusion conserve les lignes d'origine, une par migration jouée à l'époque. Le
décompte serait alors un artefact d'ancienneté, sans conséquence.

**Probable n'est pas mesuré**, et l'autre explication possible — Supabase
applique sur `auth` des migrations qui lui sont propres — aurait, elle, des
conséquences directes : une colonne présente à la source et absente en amont
ferait échouer l'insertion des 13 lignes, ou pire, la ferait réussir en
perdant silencieusement une valeur. La liste des 77 versions appliquées a donc
été comparée aux 70 de `v2.196.0`.

**Verdict : c'est bien la fusion, et l'écart est clos.** Les sept versions
inconnues du dépôt amont sont `20171026211738`, `20171026211808`,
`20171026211834`, `20180103212743`, `20180108183307`, `20180119214651` et
`20180125194653` — **toutes d'octobre 2017 à janvier 2018**, c'est-à-dire
exactement les migrations d'origine que `00_init_auth_schema` a plus tard
absorbées. La base date d'avant la fusion et en garde la trace.

Le contrôle inverse compte autant, et il est vide : **aucune des 70 migrations
de `v2.196.0` ne manque à l'appel.** Le schéma `auth` de ce projet est donc du
GoTrue amont pur, arrêté exactement à `20260625000000` — aucune migration
propre à Supabase, rien de spécifique à désamorcer, et `v2.196.0` produira le
même schéma colonne pour colonne.

#### Les clés de signature ES256 — procédure, mesurée contre le code

Tout ce qui suit a été vérifié en exécutant le décodeur de `supabase/auth`
v2.196.0 sur les formes en question, et la documentation de PostgREST lue dans
ses sources. Rien n'y est de mémoire : ces formats ne se devinent pas et se
trompent sans message d'erreur.

**Outil : `scripts/jwt-es256.mjs`**, sans dépendance (Node exporte nativement
une clé au format JWK) :

```bash
node scripts/jwt-es256.mjs generer mc-es256-2026-09 > prive.json   # GOTRUE_JWT_KEYS
node scripts/jwt-es256.mjs public < prive.json                     # PGRST_JWT_SECRET
```

**Deux formes différentes pour la même matière, et c'est voulu par les deux
logiciels** :

| Variable | Forme attendue | Contenu |
|---|---|---|
| `GOTRUE_JWT_KEYS` | **tableau** `[{…}]` | JWK **privées** |
| `PGRST_JWT_SECRET` | **objet** `{"keys": […]}` | JWK **publiques** |

Se tromper de forme produit un 401 sans explication. PostgREST accepte aussi
`@fichier.json`, et — point d'exploitation à retenir — **il ne va jamais
chercher un JWKS par URL** : la valeur est statique, une rotation de clé
impose donc de la remettre à jour et de recharger la configuration.

**Trois contraintes de GoTrue, mesurées :**

1. **Une seule clé peut porter `sign`.** Zéro → « no signing key detected » ;
   deux → « multiple signing keys detected, only 1 signing key is supported ».
   Une clé héritée qu'on garderait pour vérifier d'anciens jetons doit donc
   porter `key_ops: ["verify"]` **seul**.
2. **Le champ `alg` n'est pas décoratif.** Sans lui, GoTrue démarre, valide sa
   configuration **sans broncher** et sert correctement la clé publique sur son
   JWKS — puis échoue à la **première émission de jeton** : `key is of invalid
   type: HMAC sign expects []byte`. Il est retombé sur HS256 avec une clé
   elliptique entre les mains. Le contrôle au démarrage ne l'attrape pas ; la
   première tentative de connexion, si.
3. **`GOTRUE_JWT_SECRET` reste obligatoire** (`required:"true"`) même quand
   `GOTRUE_JWT_KEYS` est renseigné. Il sert de clé de vérification de repli
   pour un jeton dont le `kid` vaut `GOTRUE_JWT_KEY_ID`.

Bonne nouvelle au passage : **l'endpoint JWKS n'expose jamais une clé
symétrique** — le gestionnaire écarte explicitement les clés de type `oct`. Un
secret hérité laissé dans le jeu de clés ne fuit pas par cette porte.

#### Correction au § 7.9 : il y aura bien une déconnexion

Le § 7.9 écrivait : « la clé symétrique héritée reste incluse dans le jeu de
clés : les jetons déjà émis continuent d'être vérifiés pendant la bascule.
Aucune déconnexion de masse à prévoir de ce fait. »

**Ce raisonnement ne vaut que si le projet signe aujourd'hui en HS256.** Or il
signe en ES256 — c'est la condition même du gain de ~65 % que `getClaims()` a
apporté (`lib/supabase/middleware.ts`, point 2). Et la clé privée
correspondante vit dans l'infrastructure de Supabase : **elle ne s'exporte
pas.** On générera donc une paire neuve, avec un `kid` neuf, et tous les jetons
en circulation deviendront invérifiables à la bascule.

**Sans conséquence pratique** — on a déjà tranché de ne pas migrer les sessions,
donc tout le monde se reconnecte une fois de toute façon. Mais la *raison*
avancée au § 7.9 était fausse, et quelqu'un pourrait s'y appuyer pour décider
l'inverse en croyant les jetons préservés.

**Vérifié le 06/09** sur `/auth/v1/.well-known/jwks.json` du projet : le jeu de
clés contient **une seule clé, `EC` / `P-256` / `ES256`**, `use: "sig"`,
`key_ops: ["verify"]`, `kid` `ae1c8c47-e33b-479b-80e8-38c53132ef72`. Le projet
signe donc bien en asymétrique, la correction ci-dessus s'applique, et ce `kid`
est celui qui disparaîtra à la bascule.

Détail qui corrobore autre chose au passage : cette forme est **exactement**
celle que produit `decodePublicKey` de `supabase/auth` (`use` posé à `sig`,
`key_ops` réduit à `verify`). Le service hébergé tourne donc sur le même GoTrue
que celui qu'on déploiera — ce qui recoupe le constat du schéma `auth` amont
pur ci-dessus.

#### Ce qui protège réellement le compte à double identité

Le critère 3 se formulait comme une inquiétude ; le code le rend vérifiable.
`GetAccountLinkingResult` (`internal/models/linking.go`) commence par :

```go
if identity, terr := FindIdentityByIdAndProvider(tx, sub, providerName); terr == nil {
    // account exists  →  Decision: AccountExists, User: <l'utilisateur de cette identité>
```

**La toute première recherche porte sur `(provider, provider_id)`.** Si la ligne
`auth.identities` existe avec le bon `provider_id` — le `sub` que Google
renvoie — GoTrue rend l'utilisateur rattaché, et **toute la configuration de
liaison de comptes devient hors sujet** : elle ne gouverne que le cas où
l'identité est *absente*.

Conséquence pratique, et elle simplifie le C1 : **ce qui protège le compte à
double identité, c'est la fidélité de la colonne `provider_id`, pas un
réglage.** Il n'y a pas de `GOTRUE_*` à trouver pour ça — il y a une colonne à
migrer sans l'abîmer.

Et l'inverse explique pourquoi la panne serait silencieuse : identité absente
ou `provider_id` faux, GoTrue passe au rattrapage par adresse e-mail
(`IsDuplicatedEmail` dans le domaine de liaison) — qui peut retrouver le bon
utilisateur, ou en créer un nouveau, selon la configuration. Ça n'échoue pas,
ça diverge.

#### Inventaire des réglages — mesuré le 06/09 sur les sept écrans

Les sept écrans de `Authentication` ont été capturés et lus un par un. Noms de
variables extraits des sources de `supabase/auth` v2.196.0 (préfixe `GOTRUE_`).
Un réglage oublié ne provoque pas d'erreur : il change le comportement de
l'authentification, silencieusement.

**Doctrine posée à cette occasion, à ne jamais rouvrir** : ce dépôt est
**public**, et GitHub scanne activement les dépôts publics à la recherche du
motif d'une clé d'accès AWS (`AKIA[0-9A-Z]{16}`) — avec un partenariat AWS qui
peut **révoquer automatiquement** la clé dès détection. Committer un
identifiant SMTP SES dans ce fichier casserait donc l'envoi d'e-mail en
production, sans lien avec la migration. **Aucune valeur de ce motif ne doit
jamais apparaître dans ce dossier ni dans le dépôt** — même l'identifiant seul,
sans le secret.

**Sans objet depuis le retrait de SES** (§ 7.9 bis) : l'application ne détient
plus aucun identifiant AWS, nulle part. La classe de risque entière a disparu,
pas seulement été gérée. Le principe général — ne jamais faire transiter un
secret par ce dépôt, quel qu'en soit le fournisseur — reste, lui, valable pour
toujours.

**Socle — sans équivalent dans le tableau de bord, à poser au C2 :**

| Variable | Contenu |
|---|---|
| `API_EXTERNAL_URL` | **obligatoire** — `https://auth.jepatisse.com` (§ exigence produit du C2) |
| `GOTRUE_DB_DATABASE_URL` | **obligatoire** — connexion PostgreSQL, en `supabase_auth_admin` (§ séquence du C3) |
| `GOTRUE_DB_NAMESPACE` | schéma, défaut `auth` — à laisser tel quel |
| `GOTRUE_SITE_URL` | **obligatoire** — voir ci-dessous, ce n'est pas ce qui était supposé |
| `GOTRUE_JWT_SECRET` / `_KEY_ID` / `_KEYS` | cf. la procédure ES256 ci-dessus |
| `GOTRUE_API_PORT` | défaut `8081` |

**Correction : le Site URL réel n'est pas celui qui avait été supposé.** Une
version antérieure de cette section portait `https://www.jepatisse.com` — une
projection vers le domaine canonique visé, pas une lecture. La mesure donne
**`https://dev.jepatisse.com/`**, cohérent avec `CLAUDE.md` : `www` sert encore
`COMING_SOON`, `dev` est la vraie URL de production pour les testeurs. Aucune
entrée `www.jepatisse.com` dans les Redirect URLs ne le contredit.

**Point laissé ouvert, à trancher avant le C3, pas avant** : `www.jepatisse.com`
sera-t-il ouvert au public au moment de la bascule, ou `dev.jepatisse.com`
restera-t-il l'unique porte d'entrée ? La réponse décide de la valeur réelle de
`GOTRUE_SITE_URL` et `GOTRUE_URI_ALLOW_LIST` sur la cible.

**Providers → Email (+ User Signups, en haut de la même page) :**

| Réglage | Valeur mesurée | Variable |
|---|---|---|
| Allow new users to sign up | activé | `GOTRUE_DISABLE_SIGNUP=false` |
| Allow manual linking | désactivé | `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED=false` |
| Allow anonymous sign-ins | désactivé | *(pas de connexion anonyme en usage)* |
| Confirm email | activé | `GOTRUE_MAILER_AUTOCONFIRM=false` |
| Secure email change | activé | `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED=true` |
| Secure password change | désactivé | `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false` |
| Require current password when updating | désactivé | `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=false` |
| Prevent use of leaked passwords | désactivé (Pro requis) | `GOTRUE_PASSWORD_HIBP_ENABLED=false` |
| Minimum password length | 6 | `GOTRUE_PASSWORD_MIN_LENGTH=6` |
| Password requirements | aucun | `GOTRUE_PASSWORD_REQUIRED_CHARACTERS=` (vide) |
| Email OTP expiration | 3600 s | `GOTRUE_MAILER_OTP_EXP=3600` |

**Correction** : `UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` et son voisin
vivent sur l'écran **Email**, pas sous *Attack Protection* comme la première
passe de cette section le classait — corrigé ci-dessus et dans le tableau des
écrans à relever plus bas.

**Providers → Google — le client a changé depuis la première mesure (07/09).**

Le client mesuré le 06/09 (`183044094481-…`) appartenait à un projet Google
Cloud lié au compte `contact@jepatisse.com`, **suspendu par Google** (appel en
cours, issue et délai inconnus). Plutôt que de dépendre de l'issue de cet
appel — un processus externe, sans garantie de délai — la connexion a été
**basculée dès maintenant** sur un nouveau client, créé sous le projet Google
Cloud « Je pâtisse ! » (`722174024982`, ex-« Maryse-club-com »), que le compte
qui opère ce dépôt contrôle directement. Testé et fonctionnel le 07/09.

| Réglage | Valeur mesurée | Variable |
|---|---|---|
| Enable Sign in with Google | activé | `GOTRUE_EXTERNAL_GOOGLE_ENABLED=true` |
| Client IDs | `722174024982-ipls9f17v63a5ilvomodb232qtqriv2u.apps.googleusercontent.com` | `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` (non secret — Google le conçoit pour apparaître côté client) |
| Allow users without an email | désactivé | `GOTRUE_EXTERNAL_GOOGLE_EMAIL_OPTIONAL=false` |
| Callback URL actuelle | `https://acbabqolghhyxksouaye.supabase.co/auth/v1/callback` | — |
| Callback URL future (C2/C3) | `https://auth.jepatisse.com/auth/v1/callback` | **déjà ajoutée** aux URI de redirection autorisées de ce client |

**Les deux callback URLs sont déjà enregistrées sur le nouveau client** — pas
seulement l'actuelle : ça évite un second aller-retour dans Google Cloud
Console au moment du C3, où il ne restera qu'à poser
`GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI = https://auth.jepatisse.com/auth/v1/callback`
côté GoTrue. Le Client Secret se reprend directement depuis Google Cloud
Console (ou, plus simple, depuis le bouton *Reveal* du champ *Client Secret*
sur cet écran de Supabase lui-même, qui le stocke indépendamment de l'accès au
compte Google) — jamais capturé (protocole ci-dessous).

**Point cosmétique laissé ouvert, sans conséquence fonctionnelle** : le nom
d'application (« Je pâtisse ! », réglé dans `Branding` du nouveau projet) ne
remplace pas encore le domaine brut sur l'écran de consentement Google. C'est
un comportement documenté comme non garanti tant que la redirection reste sur
un sous-domaine partagé `*.supabase.co`, y compris après vérification de
domaine — un
[ticket resté sans réponse chez Supabase](https://github.com/supabase/supabase/issues/33387)
le confirme. Attendu pour se résoudre proprement une fois la redirection
passée sur `auth.jepatisse.com` au C2 ; pas de raison de s'y acharner avant.

**Sessions :**

| Réglage | Valeur mesurée | Variable |
|---|---|---|
| Enforce single session per user | désactivé | `GOTRUE_SESSIONS_SINGLE_PER_USER=false` |
| Time-box user sessions | 0 (never) | `GOTRUE_SESSIONS_TIMEBOX` — voir correction ci-dessous |
| Inactivity timeout | 0 (never) | `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT` — idem |
| Access token expiry time | 900 s | `GOTRUE_JWT_EXP=900` |
| Detect and revoke compromised refresh tokens | activé | `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true` |
| Refresh token reuse interval | 10 s | `GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL=10` |

**Correction au piège annoncé plus haut dans cette section.** Il avait été
présenté comme un risque de régression introduit par la migration. La capture
dit autre chose : le panneau porte la mention *« Configuring user sessions is
only available on the Pro Plan »* — ces deux réglages sont **déjà** figés à
« never » aujourd'hui, non par choix mais parce que le plan actuel ne permet
pas de les régler. **Ne rien renseigner sur la cible reproduit exactement le
comportement actuel** ; ce n'est plus un piège à éviter, c'est une parité à
préserver. Amélioration possible, hors sujet de la migration : régler un vrai
TTL devient possible une fois auto-hébergé, ce que le plan Supabase actuel
interdit.

**Emails → SMTP :**

| Réglage | Valeur mesurée | Variable |
|---|---|---|
| Sender email address | `noreply@jepatisse.com` | `GOTRUE_SMTP_ADMIN_EMAIL` |
| Sender name | `Fabien - Je pâtisse !` | `GOTRUE_SMTP_SENDER_NAME` |
| Host | `email-smtp.eu-west-3.amazonaws.com` | `GOTRUE_SMTP_HOST` |
| Port | 465 | `GOTRUE_SMTP_PORT` |
| Minimum interval per user | 60 s | `GOTRUE_SMTP_MAX_FREQUENCY=60s` — **l'unité est obligatoire**, c'est un `time.Duration` (§ 7.14) |
| Username | *(identifiant AWS — jamais dans ce dépôt, cf. doctrine ci-dessus)* | `GOTRUE_SMTP_USER` |
| Password | masqué, **irrécupérable** une fois enregistré | `GOTRUE_SMTP_PASS` |

Le panneau Supabase l'écrit lui-même : *« this password cannot be viewed once
saved »* — confirmation directe du protocole déjà posé.

**Ce qui a effectivement été fait diffère de ce qui était prévu ici, et en
mieux : pas une nouvelle paire SES, un changement de fournisseur.** Voir
§ 7.9 bis — Brevo remplace SES, à la fois pour `lib/email.ts` et pour ce
panneau SMTP. Les lignes `GOTRUE_SMTP_*` ci-dessus restent justes dans leur
structure (mêmes noms de variables côté GoTrue), seules les valeurs
`Host`/`Username`/`Password` changent de fournisseur.

**Rate Limits** — tous les chiffres mesurés coïncident avec les valeurs par
défaut de GoTrue :

| Réglage | Valeur | Variable | Défaut |
|---|---|---|---|
| Sending emails | 30/h | `GOTRUE_RATE_LIMIT_EMAIL_SENT` | 30 |
| Sending SMS | 30/h | `GOTRUE_RATE_LIMIT_SMS_SENT` | 30 |
| Token refreshes | 150/5min | `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` | 150 |
| Token verifications | 30/5min | `GOTRUE_RATE_LIMIT_VERIFY` | 30 |
| Anonymous users | 30/h | `GOTRUE_RATE_LIMIT_ANONYMOUS_USERS` | 30 |
| Web3 sign-ups/sign-ins | 30/5min | `GOTRUE_RATE_LIMIT_WEB3` | 30 |
| IP Address Forwarding | désactivé | `GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED=false` | false |

Une ligne (« Rate limit for sign-ups and sign-ins », 30/5min) n'a pas de
correspondance certaine dans les champs relevés dans le code — sa valeur
coïncide de toute façon avec le défaut probable, donc sans conséquence
pratique ; le nom exact reste à confirmer au C2. **Conséquence générale** :
aucune de ces variables n'est strictement nécessaire sur la cible, tout
coïncidant avec les défauts — les documenter explicitement évite qu'un défaut
qui change de valeur dans une future version de GoTrue rompe silencieusement
la parité.

**Attack Protection :**

| Réglage | Valeur mesurée | Variable |
|---|---|---|
| Enable Captcha protection | désactivé | `GOTRUE_SECURITY_CAPTCHA_ENABLED=false` |
| Prevent use of leaked passwords | désactivé | `GOTRUE_PASSWORD_HIBP_ENABLED=false` (doublon de l'écran Email) |

Captcha désactivé : aucun secret de ce type à gérer, une inconnue de moins.

**Protocole de relevé — ce qui se capture, et ce qui ne se capture JAMAIS.**

Les écrans à relever contiennent des secrets. Une capture d'écran finit dans
un fil de conversation, parfois dans un dépôt, souvent dans un dossier
« Téléchargements » qu'on oublie. La règle est donc binaire :

| Écran | À capturer | À NE PAS capturer |
|---|---|---|
| Providers → Email (+ User Signups) | tout | — |
| Providers → Google | *Client ID*, *Callback URL* | **le Client Secret** |
| Sessions | tout | — |
| URL Configuration | tout | — |
| Emails → SMTP | hôte, port, expéditeur | **le nom d'utilisateur ET le mot de passe** (§ doctrine AWS ci-dessus — l'identifiant seul suffit à déclencher un scan) |
| Rate Limits | tout | — |
| Attack Protection | l'état des interrupteurs | **le secret du captcha**, s'il est activé |

**Les secrets ne se relèvent pas depuis Supabase, ils se reprennent à la
source** — ce qui vaut mieux, parce que le tableau de bord les masque de toute
façon :

- `GOTRUE_EXTERNAL_GOOGLE_SECRET` → Google Cloud Console, écran des
  identifiants OAuth. C'est le même secret, il n'y a rien à régénérer.
- `GOTRUE_SMTP_USER` / `_PASS` → identifiants SMTP Brevo (§ 7.9 bis), pris
  directement dans leur console. L'ancienne paire SES est irrécupérable de
  toute façon, et un identifiant AWS ne doit jamais transiter par ce dépôt
  même seul — mais la question ne se pose plus, SES étant retiré.
- `GOTRUE_SECURITY_CAPTCHA_SECRET` → sans objet, captcha désactivé.

Ces valeurs vont **directement** du tableau de bord ou de la console d'origine
aux variables d'environnement de la cible. Elles ne transitent ni par une
capture, ni par ce dépôt, ni par une conversation.

#### Le workflow du transfert — `migration-identites-c1.yml`

Écrit en phase 0, pour ne pas l'écrire sous la pression de l'essai. Deux
modes : `verifier` (aucune écriture, à jouer avant **et** après) et
`transferer`, qui exige le mot exact `REMPLACER` — même doctrine que la
réconciliation du lot B4, un geste destructeur ne se déclenche pas par
inadvertance.

**Le blocage du dépôt public est tenu par la construction du fichier**, pas
seulement par l'intention : aucun `upload-artifact`, aucune ligne de données
sur la sortie standard, et `-v VERBOSITY=terse` sur les `psql` qui écrivent —
sans lui, une erreur de `COPY` réaffiche la **ligne fautive**, c'est-à-dire une
adresse e-mail et une empreinte bcrypt.

**Trois gardes avant la moindre écriture**, chacune adossée à un échec qu'on
préfère lire là plutôt que diagnostiquer après :

1. **Niveaux de migration identiques** des deux côtés. C'est le contrôle
   automatique de l'alignement de version : un GoTrue en retard produit des
   colonnes manquantes, un ≥ v2.197.0 ajoute SCIM et fait diverger le schéma
   pendant la répétition.
2. **Empreinte des colonnes** des deux tables, comparée sans être affichée. Un
   `COPY` sur des colonnes divergentes échoue au milieu — ou réussit en
   perdant une valeur.
3. **Signalement des triggers portés par `auth.users`** — voir ci-dessous.

Le chargement se fait en **deux fichiers séparés, users puis identities** :
`auth.identities` porte une clé étrangère vers `auth.users` et
`pg_dump --data-only` n'ordonne pas ses tables selon les dépendances. Séparer
garantit l'ordre sans recourir à `--disable-triggers`, qui exigerait le
superutilisateur. Chaque fichier est chargé en une transaction : un chargement
à moitié fait laisserait des comptes **sans identité** — exactement l'état où
GoTrue fabrique un doublon à la première connexion Google.

La preuve finale est une requête jouée à l'identique des deux côtés (motif du
lot 0-bis, transposé aux données) : décomptes, nombre de comptes à identités
multiples, et **empreintes md5** de `provider|provider_id|user_id` et de
`id|email|a_un_mot_de_passe`. Publiable telle quelle dans un journal, et
suffisante pour dire que `provider_id` est arrivé intact.

#### Le trigger `handle_new_user` — la vraie question, et elle n'est pas celle qu'on croit

`handle_new_user` est un trigger `after insert on auth.users` qui crée la ligne
`public.profiles` correspondante (cf. `CLAUDE.md`, « Pseudo »). En écrivant le
workflow, il a d'abord été traité comme un risque de **collision** : insérer
les 6 comptes le ferait feu 6 fois, et les profils qu'il fabrique se
percuteraient avec les vrais profils restaurés au C3.

**Cette lecture repose sur une supposition, et elle est probablement fausse.**
Le lot 0-bis a restauré le DDL via `supabase db dump` sans sélection de schéma
— ce qui produit le schéma **`public`**. Le *corps* de la fonction
`public.handle_new_user()` est donc bien passé (elle compte parmi les 252
fonctions inventoriées), mais **le trigger, lui, est un objet du schéma
`auth`** : rien ne dit qu'il figure dans ce dump, et l'inventaire du lot 0-bis
ne pouvait pas s'en apercevoir puisqu'il ne compte que
`nspname = 'public'` (`migration-restauration-repetition.yml`).

Si c'est le cas, le risque s'inverse et devient plus sérieux qu'une collision :
**le trigger ne traverse pas du tout**, personne ne le remarque — et la
**première inscription après la bascule** crée un compte sans profil. Une
panne qui ne se voit qu'au premier nouveau membre, c'est-à-dire au pire moment
et sur la pire personne.

**Mesuré le 06/09 sur la source** (les trois requêtes ci-dessous) :

| Question | Réponse |
|---|---|
| Trigger sur `auth.users` | **`on_auth_user_created` → `public.handle_new_user`** |
| Propriétaire de `auth.users` | **`supabase_auth_admin`** |
| FK de `public.profiles` | **`profiles_id_fkey` → `auth.users`** |

Les trois se combinent en une seule contrainte, et elle décide de la séquence
du C3 — voir la sous-section suivante. Les requêtes, conservées pour être
rejouables :

```sql
-- 1. Quels triggers auth.users porte-t-elle réellement, et vers quoi ?
select t.tgname, n.nspname || '.' || p.proname as fonction
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace nc on nc.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = p.pronamespace
 where nc.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;

-- 2. Qui possède auth.users ? C'est ce rôle, et lui seul, qui pourra
--    désactiver le trigger le temps d'un chargement — `postgres` n'étant PAS
--    superutilisateur sur la cible (mesuré au lot 0-bis, § 7.4).
select tableowner from pg_tables where schemaname = 'auth' and tablename = 'users';

-- 3. `public.profiles` référence-t-elle `auth.users` ? C'est ce qui impose
--    l'ordre de chargement au C3.
select conname, confrelid::regclass as vers
  from pg_constraint
 where conrelid = 'public.profiles'::regclass and contype = 'f';
```

Les trois réponses tranchent la séquence du C3 : s'il faut recréer le trigger
à la main sur la cible, s'il faut le désactiver le temps du chargement, et
dans quel ordre `auth.users` et `public.profiles` doivent arriver.

La garde 3 du workflow reste utile telle quelle : elle **liste** les triggers
côté cible avant d'écrire, donc elle dira l'état réel au lieu de le supposer —
mais elle ne remplace pas la lecture de la source ci-dessus, qui seule dit ce
qui **devrait** s'y trouver.

#### La séquence de chargement du C3, désormais déterminée

Les trois mesures ci-dessus s'enchaînent en un raisonnement qui ne laisse
qu'une porte :

1. **`profiles.id` référence `auth.users`** → `auth.users` doit être chargée
   **avant** `public.profiles`. Pas de choix.
2. **`on_auth_user_created` fait feu `after insert on auth.users`** et crée la
   ligne `profiles` correspondante → charger `auth.users` avec le trigger en
   place fabrique 6 profils squelettes.
3. **Charger ensuite les vrais `public.profiles`** buterait donc sur la clé
   primaire des 6 mêmes lignes.
4. **Le désactiver n'est pas gratuit** : `auth.users` appartient à
   `supabase_auth_admin`, et `postgres` **n'est pas superutilisateur** sur la
   cible (§ 7.4). Il faudrait que `postgres` soit membre de ce rôle pour
   `set role` puis `alter table … disable trigger` — vraisemblable, mais à
   vérifier plutôt qu'à espérer au milieu d'une fenêtre de maintenance.

**Séquence retenue — créer le trigger en DERNIER.** Elle contourne le
problème au lieu de le désamorcer, et referme du même coup le risque
d'absence silencieuse :

| # | Étape | Pourquoi là |
|---|---|---|
| 1 | GoTrue v2.196.0 démarre et crée le schéma `auth` | il en est le maître, § 7.10 |
| 2 | Restauration du DDL `public` | tables et contraintes en place, **sans données** |
| 3 | Chargement de `auth.users` puis `auth.identities` | FK respectée ; **aucun trigger encore posé, donc aucun profil fabriqué** |
| 4 | Chargement des données `public`, `profiles` comprise | les `auth.users` existent : la FK passe |
| 5 | **Création de `on_auth_user_created`** | dernier geste, explicite et vérifiable |

L'étape 5 n'est pas une formalité : c'est elle qui garantit que le trigger
existe **après** la migration. Sans elle, la panne décrite plus haut — une
première inscription qui crée un compte sans profil — passerait inaperçue
jusqu'au premier nouveau membre. En faire une étape numérotée, c'est la rendre
impossible à oublier.

Deux corollaires pour le C2 :

- **GoTrue doit se connecter en `supabase_auth_admin`**, pas en `postgres` :
  c'est le propriétaire de `auth.users` sur la source, et les `GRANT`
  restaurés au lot 0-bis s'y adossent. Un schéma `auth` créé sous un autre
  rôle produirait des droits divergents, sans erreur visible.
- **Les définitions exactes du trigger et de sa fonction** (`pg_get_triggerdef`,
  `pg_get_functiondef`) sont à relever sur la source au moment du C3 et à
  garder hors du dépôt : ce dépôt est public, et le lot 0-bis a précisément
  pris soin (`VERBOSITY=terse`) de ne pas y publier de corps de fonction.

#### Les décisions de phase 0

- **`auth.sessions` (15) et `auth.refresh_tokens` (50) ne sont pas migrées.**
  Les migrer éviterait toute déconnexion ; ne pas les migrer force une
  reconnexion unique. À six comptes, la reconnexion est indolore et supprime
  une classe entière de risque — des sessions pointant vers un serveur d'auth
  qui ne les connaît pas. **Tranché : on ne les migre pas, on prévient.** À
  noter que ce
  n'est pas contradictoire avec le § 7.9 point 1 : la clé symétrique conservée
  fait que les jetons déjà émis restent *vérifiables*, mais leur
  rafraîchissement, lui, a besoin de la ligne de session.
- **Le sous-domaine `auth.jepatisse.com` ne se « réserve » pas** — correction
  d'une formulation antérieure de ce dossier, qui le rangeait à tort parmi les
  gestes de phase 0. Un nom DNS n'est pas une ressource qu'on revendique : le
  domaine `jepatisse.com` étant déjà possédé, le sous-domaine l'est aussi, et
  personne ne peut le prendre entre-temps. **Ce qui est contraint, c'est
  l'ordre** :
  1. le C2 monte l'environnement, qui reçoit alors un nom d'hôte public ;
  2. le CNAME `auth.jepatisse.com` peut alors pointer vers ce nom d'hôte ;
  3. Let's Encrypt peut alors seulement émettre le certificat — sa validation
     HTTP exige que le domaine résolve **déjà** vers l'environnement.

  Créer l'enregistrement avant l'étape 1 le ferait pointer dans le vide et
  imposerait de le refaire. **Le seul vrai prérequis de phase 0** était donc de
  savoir où est gérée la zone DNS de `jepatisse.com` — et **c'est mesuré
  (07/09) : la zone est chez Infomaniak**, les serveurs de noms déclarés étant
  `ns11.infomaniak.ch` et `ns12.infomaniak.ch`. Ni Vercel, ni un registrar
  tiers. **Le DNS et l'environnement Virtuozzo vivront donc dans le même
  manager**, sans aller-retour entre deux fournisseurs au moment du C2.

  Piège de navigation constaté au passage, à connaître pour ne pas le
  rechercher deux fois : l'écran « Serveur DNS » du manager ne liste que les
  enregistrements **NS** (la déclaration des serveurs de noms). Les
  enregistrements A/CNAME — `www`, `dev`, et bientôt `auth` — vivent dans
  l'**éditeur de zone**, un écran distinct.
- **Conséquence de topologie pour le C2 : il faut un nœud Load Balancer devant
  GoTrue.** Le § 4.3 note que Virtuozzo fournit Let's Encrypt gratuitement
  « sur le nœud Load Balancer » ; exposer GoTrue par un Endpoint TCP nu — comme
  le lot 0-bis l'avait fait pour Postgres (§ 7.2) — ne permettrait pas de
  terminer le TLS sur `auth.jepatisse.com`. Ce n'est pas un détail de
  configuration mais une contrainte d'architecture, qui découle directement de
  l'exigence produit du C2 (un domaine à nous sur l'écran Google).
- **La paire ES256** (`GOTRUE_JWT_KEYS`) se génère hors ligne, et le jeu de
  clés doit contenir **aussi** le secret symétrique actuel.
- **Sur les quatre secrets GitHub du lot 0-bis (§ 10.3), un seul est créable
  en phase 0.** Correction d'une consigne trop large, du même travers que celle
  sur le DNS ci-dessus : `VZ_PG_HOST`, `VZ_PG_PORT` et `VZ_PG_PASSWORD`
  décrivent l'environnement Virtuozzo, supprimé à la fin du lot 0-bis et qui ne
  réexistera qu'au C2. Ils n'ont aucune valeur à recevoir avant.

  **Seul `SUPABASE_DB_URL` est actionnable**, et c'est celui qui porte la
  rotation du mot de passe restée en suspens. Dans cet ordre : renouveler le
  mot de passe d'abord (Supabase → Project Settings → Database), composer la
  chaîne ensuite — le secret ne contient ainsi jamais un mot de passe ayant
  déjà transité par un secret précédent.

  **La rotation est sans risque pour le site** : vérifié le 07/09, aucune
  chaîne `postgres://` n'existe dans le code applicatif (cf. § 7.9, point 2 —
  l'application ne parle à la base que par HTTPS). Seuls `psql`/`pg_dump` s'en
  servent, c'est-à-dire l'outillage de migration lui-même. Reste à vérifier
  hors dépôt : un client SQL de bureau qui porterait ce mot de passe.

  **La chaîne doit être celle du « Session pooler », port 5432** — la connexion
  directe ne résout qu'en IPv6 (les runners GitHub sont en IPv4) et le pooler
  transactionnel (6543) coupe les sessions longues et fait échouer `pg_dump`.
  Les workflows portent une garde qui refuse les deux mauvaises formes avant de
  tirer quoi que ce soit.

### 7.11 Lot C — exécution par paliers (06/09)

**Le découpage C1 / C2 ne tient pas à l'usage, et c'est mesuré.** Les cinq
critères de Go/No-Go (§ 7.10) ne sont pas testables au même moment : le critère
3 — la connexion Google, le plus important — exige une URI de redirection
**HTTPS**, donc le Load Balancer, le DNS et Let's Encrypt que le C2 devait
apporter. Le critère 5 exige PostgREST. Répétition et montage s'entremêlent
donc nécessairement.

**Un seul environnement, monté par paliers**, chacun validant ce qu'il rend
testable :

| Palier | Contenu | Critères couverts | État |
|---|---|---|---|
| **1** | Postgres + restauration du DDL | — | **Fait le 06/09** |
| **2** | + GoTrue v2.196.0 + transfert des identités | **1 ✅, 3 ✅** (donnée) | **Fait le 06/09** |
| **3** | + Load Balancer, DNS, TLS, clés ES256 | **2 ✅, 3 ✅** (bout en bout), **4 ✅** | **Fait le 07/09** |
| **4** | + PostgREST | **5 ✅** | **Fait le 08/09** |

Le critère 2 glisse au palier 3 : éprouver une connexion e-mail + mot de passe
demande d'atteindre l'API de GoTrue, donc l'exposition HTTPS que le palier 3
apporte.

#### Palier 1 — le résultat

Environnement **`jepatisse`** (et non `mc-restore-test` : celui-ci a vocation à
devenir réel), Genève DC2, `supabase/postgres:17.6.1.165`, 1 cloudlet réservé /
8 dynamiques, disque plafonné à 10 Go — l'essai est borné à 10 Go, et 50 Go
n'apporteraient rien à une base de 27 Mo.

```
source : 951 objets — cible : 951 objets — manquants : 0
GO — inventaire complet, aucune erreur de restauration.
```

951 contre les **949 du lot 0-bis** : les deux de plus sont `imports.updated_at`
et son trigger, posés le matin même (§ 7.9). Durées : dump 1 min 29,
restauration 4 min 53.

**Les quatre épreuves de fonctionnement passent** — un DDL restauré n'est pas un
DDL qui marche :

| Épreuve | Résultat |
|---|---|
| `unaccent` → `mc_norm('Crème brûlée')` | `creme brulee` |
| `pg_trgm` → `'chronomètre' % 'chrono'` | `t` |
| Colonne générée `recipes.fts` | présente |
| `btree_gist` dans `public` | confirmé |

Et `set role anon` puis lecture de `recipes` rend **`0` sans
`permission denied`** : les `GRANT` ont voyagé, ce qui conditionne la lecture
anonyme par PostgREST au palier 4.

#### Ce que le journal d'initialisation a appris, et qui dérisque le palier 2

**`POSTGRES_PASSWORD` n'est lu qu'au tout premier démarrage**, quand le
répertoire de données est vide. Le journal montre que l'image a d'abord
**refusé de démarrer** (`Database is uninitialized and superuser password is
not specified`) — c'est précisément ce refus qui a laissé le répertoire vide et
permis à la variable, posée ensuite, d'être prise en compte. Poser le mot de
passe sur une base déjà initialisée n'aurait rien fait, silencieusement.

**L'image crée un schéma `auth` d'époque 2021** : cinq tables (`users`,
`refresh_tokens`, `audit_log_entries`, `instances`, `schema_migrations`),
**pas d'`auth.identities`**, et surtout **`schema_migrations` vide**. GoTrue
v2.196.0 va donc croire qu'aucune migration n'a été appliquée et tenter de
rejouer les 70 sur des tables existantes.

**Vérifié dans les sources plutôt que supposé : ça passe.** La première
migration (`00_init_auth_schema.up.sql`) est écrite en
`CREATE TABLE IF NOT EXISTS`, avec le même DDL que celui que l'image vient de
poser. Elle glissera sans rien casser, puis les migrations 2 à 70 ajouteront
`identities`, le téléphone, la MFA, jusqu'à `20260625000000`. **L'état actuel
de la base est exactement le point de départ attendu par GoTrue** — le critère
1 est dérisqué avant même de l'avoir lancé.

**Le rôle `supabase_auth_admin` est créé par l'image**, possède les tables
`auth` et porte `search_path = "auth"`. C'est le rôle que la séquence du C3
impose pour `GOTRUE_DB_DATABASE_URL` : rien à créer à la main.

#### L'incident `VZ_PG_HOST`, et la méthode qui l'a réglé en deux minutes

Le premier lancement a échoué en 12 secondes :
`could not translate host name to address`. Cause : le champ *URL d'accès* de
l'interface Jelastic est **tronqué à l'affichage**
(`node216075-jepatisse.jcloud-ver-jpe.ik-s…`), et la valeur recopiée l'était
aussi.

Plutôt que de faire deviner, la résolution DNS a été **mesurée** :
`node216075-jepatisse.jcloud-ver-jpe.ik-server.com` → `185.172.100.60`. Le nom
existait, seule la valeur du secret était incomplète. À retenir pour les trois
autres endpoints des paliers suivants : **copier l'URL d'accès depuis la liste
des Endpoints, jamais depuis le champ du formulaire de création.**

#### L'Endpoint TCP est temporaire, et son nom le dit

Nommé **`pg-migration-temporaire`** exprès : le § 7.9 pose que le port 5432 n'a
jamais à être exposé en production. Il ne l'est ici que le temps des opérations
(restauration, répétition C1, chargement C3), et sa suppression fait partie de
la définition de terminé du lot C.

#### Palier 2 — GoTrue et les identités (06/09)

**Deux critères de Go/No-Go tombent, dont le plus redouté.**

##### Critère 1 — mesuré, et meilleur qu'espéré

```
 migrations |    derniere        identities
------------+--------------      ------------
         77 | 20260625000000      identities
```

**77, pas 70.** Le § 7.10 prévoyait 70 (le jeu de `v2.196.0`) et se demandait
d'où venaient les 7 migrations de 2017-2018 en trop côté Supabase, mises sur le
compte de l'ancienneté de la base. **L'explication est autre, et elle est
mesurée** : c'est l'image `supabase/postgres` qui les sème dans
`auth.schema_migrations` à l'initialisation. GoTrue a posé ses 70 par-dessus.

Conséquence bien plus forte que le critère ne demandait : **le registre de
migrations de la cible est identique à celui de la production, à la ligne
près.** Et `auth.identities`, absente de ce que l'image pose, est née.

##### Critère 3 — la donnée est intacte

Le transfert (`migration-identites-c1.yml`, mode `transferer`) rend deux
colonnes identiques :

```
──────── source ────────        ──────── cible ─────────
avec_mot_de_passe:5             avec_mot_de_passe:5
comptes:6                       comptes:6
comptes_multi_identites:1       comptes_multi_identites:1
empreinte_comptes:386877f1…     empreinte_comptes:386877f1…
empreinte_identites:a77c3035…   empreinte_identites:a77c3035…
identites:7                     identites:7
```

**Les empreintes md5 coïncident** — donc `provider_id` a traversé intact, et le
compte à double identité a gardé ses deux lignes rattachées au même `user_id`.
C'était le vrai risque du lot C.

**Nuance à ne pas gommer** : le critère 3 est vert *sur la fidélité de la
donnée*, pas encore de bout en bout. Un vrai « Se connecter avec Google » qui
retombe sur le bon compte exige le HTTPS du palier 3.

Les trois gardes du workflow ont toutes passé — niveaux de migration
identiques, empreintes de colonnes identiques, triggers signalés.

#### Six pièges de la plateforme, payés au prix fort

Aucun n'était dans le dossier ; tous se reproduiront aux paliers 3 et 4.

**1. `postgres` n'est pas superutilisateur, `supabase_admin` l'est.** Un
`alter user supabase_auth_admin …` en tant que `postgres` échoue :
*« is a reserved role, only superusers can modify it »*, et l'invite affiche
`postgres=>` au lieu de `postgres=#`. L'image applique une migration nommée
`demote-postgres.sql`. **Tout geste d'administration sur ce cluster passe par
`supabase_admin`** — ce qui vaudra aussi pour la création du trigger
`on_auth_user_created` en dernière étape du C3 (§ 7.10). Penser aussi à
`-d postgres` : `psql -U supabase_admin` seul cherche une base du nom de
l'utilisateur.

**2. Le rôle `supabase_auth_admin` naît sans mot de passe.** L'image le crée en
`CREATE USER … NOINHERIT CREATEROLE LOGIN NOREPLICATION`, sans secret. GoTrue ne
peut donc pas s'y connecter tant qu'on ne lui en pose pas un.

**3. Jelastic ne reprend pas l'`ENTRYPOINT` de l'image, et n'applique pas les
variables à un simple redémarrage.** Deux symptômes distincts, une seule cause
de fond — la plateforme gère les conteneurs Docker personnalisés autrement
qu'un `docker run` :
- le conteneur démarrait sur l'init de Jelastic (`jelinit`, `getty`, `sshd`)
  **sans lancer GoTrue** ; le Dockerfile officiel se termine par `CMD ["auth"]`,
  qu'il a fallu redéclarer dans **« CMD / Point d'entrée »** ;
- les variables saisies restaient invisibles du conteneur après un
  **redémarrage** : il faut **redéployer le conteneur** (recréation) pour
  qu'elles soient injectées.

À noter pour ne pas s'y perdre : `/proc/1/environ` reste vide de `GOTRUE_*`
même quand tout fonctionne — Jelastic injecte les variables dans le processus
applicatif, pas dans l'init. **Le seul juge fiable est le journal du nœud.**

**4. Les chevrons des exemples finissent dans les valeurs.** L'URL de base a
été posée avec `host=<10.101.32.133>` — chevrons compris — d'où un
`hostname resolving error` parfaitement lisible. Même famille que les crochets
`[YOUR-PASSWORD]` de la chaîne Supabase. **Écrire les gabarits sans
délimiteurs.**

**5. Sans volume déclaré, un redéploiement du nœud Postgres détruit la base.**
`/var/lib/postgresql/data` vit dans la couche du conteneur : un
**redéploiement** — c'est-à-dire une recréation depuis l'image — le remplace
par un répertoire vide, où l'image rejoue son initialisation. Constaté le 07/09
au prix fort : `auth.users` vide, `public` sans une seule table, et
`pg_postmaster_start_time()` calé sur l'heure du redéploiement.

Le piège se referme d'autant plus facilement que le piège 3 ci-dessus impose le
redéploiement comme **seul** moyen d'appliquer une variable au nœud Auth :
lancé au niveau de l'**environnement** plutôt que depuis la ligne du nœud, il
emporte Postgres avec lui. Deux règles, non négociables :

- déclarer `/var/lib/postgresql/data` en volume (nœud → *Paramètres
  additionnels* → *Volumes*) **avant tout chargement** ;
- le nœud Postgres se **redémarre**, ne se redéploie jamais — et un
  redéploiement se lance depuis la ligne d'un nœud, jamais depuis
  l'environnement.

Et la persistance se **prouve** plutôt qu'elle ne se suppose : créer une table
témoin, redéployer, la relire. Trois commandes, avant de recharger 951 objets
sur une hypothèse.

**6. `host all all 127.0.0.1/32 trust` rend tout test de mot de passe local
sans valeur.** Le `pg_hba.conf` de l'image accepte la boucle locale **sans
vérifier**. Un `psql -U <rôle> -h 127.0.0.1 -W` affiche pourtant une invite —
c'est psql qui la produit, avant de se connecter — et réussit quelle que soit
la valeur saisie. D'où une conclusion tirée à tort le 07/09 (« le mot de passe
est bon ») alors qu'il était faux, et une heure perdue à chercher ailleurs.
**Éprouver un mot de passe passe par l'IP du nœud** (`-h 10.101.32.133`), qui
tombe sur `host all all 10.0.0.0/8 scram-sha-256` — la règle qu'empruntent
réellement les autres nœuds.

#### La méthode qui a fait gagner le plus de temps

Le journal du nœud restant vide tant que GoTrue ne démarrait pas, c'est le
**lancement manuel du binaire** (`/usr/local/bin/auth` en Web SSH) qui a tout
débloqué : il a affiché en une ligne
`required key API_EXTERNAL_URL missing value`, prouvant du même coup que
l'image était saine et que seul l'acheminement de la configuration était en
cause. **Devant un conteneur muet, lancer le processus à la main plutôt que
d'interroger la plateforme.**

#### Paliers 3 et 4 (07-08/09) — les cinq critères, après un effacement complet

##### `GOTRUE_JWT_AUD` n'a pas de valeur par défaut

Première connexion e-mail + mot de passe : `invalid_credentials`, sur un compte
dont l'état était pourtant irréprochable en base (confirmé, empreinte `$2a$`,
ni banni ni supprimé). La cause est dans les sources de GoTrue, pas dans la
donnée : le champ `Aud` de la configuration JWT
(`internal/conf/configuration.go`) ne porte **aucune balise de défaut**, et
`requestAud()` (`internal/api/helpers.go`) se termine par `return config.JWT.Aud` — la chaîne vide, quand la requête n'a ni
en-tête `X-JWT-AUD` ni jeton. GoTrue cherchait donc `aud = ''` quand les comptes
transférés portent `aud = 'authenticated'`, et signalait l'absence par le même
message générique qu'un mot de passe faux.

**`GOTRUE_JWT_AUD=authenticated` est donc à poser dès le montage du nœud Auth**,
au même titre que `API_EXTERNAL_URL`. À retenir aussi comme méthode : l'en-tête
`X-JWT-AUD` est lu **avant** la configuration, ce qui permet de trancher en une
requête entre « la variable n'est pas reprise » et « le mot de passe est faux »
— deux causes que l'API rend volontairement indiscernables.

##### La base effacée sous les pieds, et ce qu'elle a appris

Entre deux redéploiements du nœud Auth, la base a été réinitialisée : zéro
compte, zéro identité, **zéro table dans `public`** — les paliers 1 et 2
intégralement perdus. Cause : les pièges 5 et 6 ci-dessus, le premier pour
l'effacement, le second pour l'heure passée à chercher ailleurs.

Rien n'était irréparable, et c'est le point à retenir : **tout ce qui avait été
chargé était reproductible**, le DDL depuis un dump de production, les identités
depuis `migration-identites-c1.yml`. La production n'a jamais été touchée. Coût
réel : du temps.

##### La reconstruction, éprouvée en une heure

Séquence exacte, à rejouer telle quelle en cas de récidive — et qui vaut mode
opératoire pour le chargement du C3 :

1. déclarer le volume, redéployer une dernière fois **volontairement** (c'est ce
   redéploiement qui le crée), puis **prouver** la persistance par une table
   témoin ;
2. relever l'état de la base neuve — attendu `0 | 5 | 7` (tables `public`,
   tables `auth`, migrations) : le schéma `auth` d'époque 2021 que pose l'image ;
3. vérifier que l'Endpoint `pg-migration-temporaire` porte toujours le même
   *Public Port* qu'avant le redéploiement, et le reporter dans les secrets ;
4. `migration-restauration-repetition.yml` en mode `restaurer` — le DDL de
   `public`. Le workflow joint la cible **avant** de tirer le dump de
   production : un port ou un mot de passe faux échoue en quelques secondes,
   sans consommer de quota Supabase ;
5. `migration-identites-c1.yml` en mode `transferer`.

Deux étapes du plan initial se sont révélées inutiles, et pour la même raison :
GoTrue avait déjà rejoué ses migrations sur la base neuve (**23 tables `auth`,
77 migrations**), ce qui prouvait *du même coup* qu'il ouvrait sa connexion —
donc que le mot de passe de `supabase_auth_admin` était cohérent avec
`GOTRUE_DB_DATABASE_URL`. **Un effet observé vaut vérification** : inutile de
tester ce dont on vient de constater la conséquence.

Nuance d'ordre, sans conséquence mesurée : la restauration s'est cette fois
exécutée sur une base où GoTrue était **déjà passé**, alors qu'au palier 1 elle
le précédait. L'inventaire est resté complet — `supabase db dump` ne sort pas le
schéma `auth`, et la restauration n'emploie ni `--clean` ni `drop schema`.

##### Ce que le jeton prouve, au-delà du critère 2

| Constat dans la charge utile | Ce qu'il valide |
|---|---|
| `"aud":"authenticated"` | la variable est prise en configuration, pas seulement forçable par en-tête |
| `identities` porte `email` **et** `google` | le compte à double identité a gardé ses deux lignes |
| `sub` / `provider_id` identiques sur les deux | la clé de rattachement Google a traversé intacte — le vrai risque du lot C |
| même `user_id` sur les deux identités | le rattachement n'a pas été rompu par le transfert |
| `created_at` / `email_confirmed_at` d'origine | ce n'est pas un compte recréé, les horodatages ont voyagé |
| `last_sign_in_at` à l'instant du test | GoTrue **écrit** aussi dans la base, pas seulement lit |
| en-tête `{"alg":"HS256"}` | la signature est encore symétrique : le critère 4 reste devant |

##### L'exposition HTTPS — DNS, certificat, et le rôle de Kong

Quatre gestes, dans un ordre que rien ne permet d'intervertir : chacun est le
prérequis du suivant.

1. **Relever le nom d'hôte de l'environnement** — `jepatisse.jcloud-ver-jpe.ik-server.com`,
   lu dans *Paramètres → Domaines personnalisés*, jamais dans un champ de
   formulaire. C'est le nom de l'**environnement**, pas celui du nœud : il suit
   automatiquement le point d'entrée si la topologie bouge, quand un
   `node216115-…` se périmerait.
2. **Le CNAME**, dans l'**éditeur de zone** du manager Infomaniak (l'écran
   « Serveur DNS » ne liste que les NS et ne sait pas créer un CNAME). TTL à
   300 s le temps de la mise au point.
3. **Affecter le domaine à l'environnement.** Sur un équilibreur **partagé**,
   l'aiguillage se fait par l'en-tête `Host` : sans cette déclaration, la
   plateforme reçoit la requête — le DNS y mène — mais ne sait à quel
   environnement la remettre.
4. **Let's Encrypt**, par le module (survol de la ligne du nœud → *Modules
   complémentaires*, ou le Marketplace ; il n'est **pas** dans le panneau
   *Paramètres*). Il renomme `ssl.conf.disabled` en `ssl.conf` et réécrit la
   configuration : **ne pas y toucher à la main**, ce serait écrasé au premier
   renouvellement.

Mesuré à chaque étape plutôt que supposé : la résolution DNS depuis l'extérieur
(`auth.jepatisse.com` → CNAME → `185.172.100.59` / `.60`, sans domaine dupliqué
en fin de cible, le piège classique du point final manquant), puis le JSON de
GoTrue en clair, puis en HTTPS avec cadenas.

**L'Équilibrage doit tenir le rôle de Kong.** L'URI de redirection enregistrée
chez Google est `https://auth.jepatisse.com/auth/v1/callback`, or GoTrue sert son
retour sur `/callback` : en relayant la racine telle quelle, Google aurait
renvoyé le navigateur sur un chemin inconnu — 404, tout à la fin du parcours,
après le consentement. Le préfixe `/auth/v1` n'est pas propre à Google : c'est la
forme que prend toute l'API Supabase côté application (`supabase-js` appelle
`<url>/auth/v1/token`, PostgREST sera sur `/rest/v1/`). D'où, dans
`conf.d/ssl.conf`, **avant** la `location /` :

```nginx
    location /auth/v1/ {
        set $upstream_name common;
        rewrite ^/auth/v1/(.*)$ /$1 break;
        …
        include conf.d/ssl.upstreams.inc;
        proxy_pass http://$upstream_name;
    }
```

Deux points non évidents. **`$upstream_name` est posé DANS la `location /`**
(`set $upstream_name common;`), pas au niveau du `server` : une nouvelle
`location` ne l'hérite pas, et l'oublier enverrait le relais vers une valeur
vide — panne qui ne se verrait qu'au retour de Google. Et **la réécriture est
obligatoire** : `proxy_pass` portant une *variable* et aucune URI, NGINX
transmet le chemin tel quel ; le `proxy_pass http://amont/;` qui retire
habituellement le préfixe est ici inutilisable.

Ce bloc vit dans un fichier géré par le module Let's Encrypt : **à revérifier
après toute réinstallation ou reconfiguration du module**, même vigilance que
pour les lignes `upstream` de `nginx-jelastic.conf`.

**Deux détails d'exploitation, payés en tours de boucle** : l'icône
*Configuration* d'un nœud n'apparaît qu'au survol, à l'extrémité droite de la
ligne du **groupe** (pas de la sous-ligne « ID nœud »), et `sudo` n'est pas
utilisable en Web SSH — le compte du conteneur n'a pas de mot de passe. Un
rechargement de NGINX passe donc par le bouton *Redémarrer* de l'interface.
Sur l'Équilibrage, ce redémarrage est sans enjeu : le nœud ne porte aucune
donnée.

##### Critère 3, de bout en bout — et l'asymétrie qui coûte un tour

Variables Google posées sur le nœud Auth, puis **redéploiement** (piège 3,
troisième récidive : un `provider is not enabled` persistant venait de là).

**`GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` mais `GOTRUE_EXTERNAL_GOOGLE_SECRET`** —
sans `CLIENT_` sur le second. Google nomme pourtant ses deux champs *Client ID*
et *Client Secret* : écrire `…_CLIENT_SECRET` est l'erreur naturelle, et elle ne
produit aucun avertissement — la variable est ignorée, le champ reste vide, et
l'erreur (`missing OAuth secret`) n'arrive qu'à la première tentative.

`GOTRUE_SITE_URL` a été réglé **provisoirement** sur
`https://auth.jepatisse.com/auth/v1/health` : c'est là que GoTrue renvoie le
navigateur avec le jeton dans le fragment. Le renvoyer sur `https://dev.jepatisse.com/`
— sa vraie valeur — aurait déposé un jeton signé par **cette** instance sur un
site qui tourne encore sur Supabase, où `supabase-js` l'aurait ramassé.

**La preuve se lit en base, jamais à l'écran.** Un parcours qui aboutit a
exactement le même aspect qu'il ait reconnu le compte ou qu'il en ait créé un
septième :

```
avant : comptes 6 | identites 7 | derniere_connexion 11:40:49
après : comptes 6 | identites 7 | derniere_connexion 19:16:54
```

Comptes et identités inchangés : `provider_id` a bien servi de clé de
rattachement. C'était le vrai risque du lot C.

##### Critère 4 — les clés ES256, générées dans le navigateur

`scripts/jwt-es256.mjs` suppose un terminal avec Node : inutilisable ici (§ 10.1).
La paire est donc générée **dans la console du navigateur** par `crypto.subtle`,
ce qui règle les trois contraintes d'un coup — la clé naît sur le poste, ne passe
ni par ce dépôt public, ni par une capture, ni par une conversation, et ne sort
que vers le champ Jelastic :

```js
(async()=>{const kid='mc-es256-2026-09';const kp=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const priv=await crypto.subtle.exportKey('jwk',kp.privateKey);const pub=await crypto.subtle.exportKey('jwk',kp.publicKey);Object.assign(priv,{kid,alg:'ES256',use:'sig',key_ops:['sign','verify']});Object.assign(pub,{kid,alg:'ES256',use:'sig',key_ops:['verify']});console.log('GOTRUE_JWT_KEYS = '+JSON.stringify([priv]));console.log('PGRST_JWT_SECRET = '+JSON.stringify({keys:[pub]}));})()
```

**Deux mesures, pas une** — parce qu'un JWKS irréprochable ne prouve rien sur la
signature réellement émise, et que c'est exactement là que se referme le piège du
champ `alg` :

| Mesure | Résultat |
|---|---|
| `/auth/v1/.well-known/jwks.json` | une clé `EC` / `P-256` / `ES256`, `use: "sig"`, `key_ops: ["verify"]`, `kid` `mc-es256-2026-09` |
| en-tête d'un `access_token` réel | `{"alg":"ES256","kid":"mc-es256-2026-09","typ":"JWT"}` |

La forme du JWKS est **identique** à celle relevée le 06/09 sur le projet
Supabase — ce que `getClaims()` consomme déjà, sans autre changement côté
application que l'URL. Le `"ext":true` que republie GoTrue est un résidu du
drapeau *extractable* de WebCrypto, sans effet sur la vérification.

##### Palier 4 (08/09) — PostgREST, et le lot C au complet

L'image officielle `postgrest/postgrest` est `FROM scratch` (un binaire
Haskell statique, sans système de base) : Jelastic refuse de la déployer en
conteneur personnalisé, exactement le message qui avait accueilli la
première tentative (*« L'image repose sur un modèle de système d'exploitation
non pris en charge »*). Plutôt que de sortir ce nœud du cycle commun
« variable → redéploiement » en le passant sur un Docker Engine à part, un
`Dockerfile` (`docker/postgrest/Dockerfile`) repose le binaire officiel, pris
tel quel dans l'image épinglée `v12.2.12`, sur `debian:bookworm-slim`.
`.github/workflows/image-postgrest.yml` la construit, la publie sur GHCR, puis
**exécute réellement `postgrest --version`** sur l'image publiée — un build
réussi ne prouve pas que le binaire tourne, le chemin copié pouvant être bon
et une bibliothèque manquer.

**La version `v12.2.12` a été choisie par prudence, pas par obligation** :
`db-use-legacy-gucs` a disparu en v13, mais la fonction `auth.uid()` restaurée
depuis la production gère déjà les deux formes (`request.jwt.claim.sub` et
`request.jwt.claims`), mesuré avant de choisir :

```sql
select pg_get_functiondef('auth.uid'::regproc);
```

Reste à généraliser cette mesure aux autres fonctions `auth.*` et aux
fonctions maison (`is_admin_user()`, `owns_recipe()`…) avant d'envisager une
montée en version — hors périmètre du lot C.

**Piège 3, quatrième récidive.** Le conteneur créé sans que le champ
« CMD / Point d'entrée » soit renseigné démarre sur l'init de Jelastic seul
(`systemd`, `jelinit`) sans jamais lancer PostgREST — `ps aux` le montre
directement, sans même avoir besoin du lancement manuel qui avait servi pour
GoTrue. `postgrest` suffit comme valeur.

**Le mot de passe d'`authenticator` révèle une variante du piège 4.**
`authenticator`, comme `supabase_auth_admin` la veille, naît sans mot de
passe : posé, puis vérifié par `-h 10.101.32.133` (jamais `127.0.0.1`, en
`trust`). Premier essai en échec — `password authentication failed` — avec un
symptôme qui a évité un débogage à l'aveugle :

```
echo -n "$PGRST_DB_URI" | sed -E 's|^postgres://[^:]+:||; s|@.*$||' | wc -c
```

rendait **18**, pas 48. Un `sed` coupant au *premier* `@` plutôt qu'au
*dernier* aurait pu tronquer un mot de passe contenant lui-même ce caractère —
la variante de la famille des délimiteurs (chevrons, crochets) déjà repérée
deux fois. Résolu en repartant d'une valeur hexadécimale, posée aux deux bouts
sans jamais transiter par la conversation.

**Le bloc `/rest/v1/` diffère de `/auth/v1/` sur un point assumé** : l'amont y
est écrit **en dur** (`proxy_pass http://10.101.27.200:3000;`), l'indirection
`$upstream_name` de GoTrue ne s'appliquant qu'au nœud désigné par `common`.
**Conséquence à retenir** : recréer le nœud PostgREST change son IP interne,
et cette ligne devra suivre — contrairement au bloc `/auth/v1/`, protégé par
l'indirection.

##### Le septième piège — un trigger qu'aucune restauration ne couvre

Le test du critère 5 a d'abord semblé bloqué par l'absence de recette à
tester (base neuve, DDL seul) — en cherchant un `author_id` pour insérer une
ligne de test, `select count(*) from public.profiles` a rendu **0**, alors
que `auth.users` en porte 6.

**Ce n'était pas un manque de données de test, mais une vraie panne
silencieuse.** La fonction `public.handle_new_user()` existait bien — restaurée
avec le DDL, elle vit dans `public` — mais le **trigger** `on_auth_user_created`
sur `auth.users`, lui, était absent :

```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- (0 rows)
```

**La cause tient à la frontière que chaque outil du dossier respecte
scrupuleusement, et qui a fini par créer un angle mort entre eux.**
`supabase db dump` ne restaure que ce qui vit dans `public` : la fonction est
passée, la déclaration du trigger sur `auth.users` — objet du schéma `auth` —
non. `migration-identites-c1.yml`, de son côté, se cantonne exactement à
`auth.users` et `auth.identities`, par doctrine de sécurité (aucune donnée
`public` n'a à transiter par un workflow qui manipule des empreintes bcrypt).
**Aucun des deux ne pouvait, par construction, poser ce trigger** — ni ne s'en
attribuait la responsabilité. C'est exactement le risque déjà pointé comme
non mesuré au § 7.9 (« le trigger a été restauré » affirmé sans preuve) : cette
fois la preuve existe, et confirme l'absence.

**Conséquence, avant correction** : les 6 comptes migrés s'authentifiaient
(critères 2 et 3, tous deux verts) mais n'avaient **aucune ligne `profiles`**
— `getProfile()`, l'accesseur unique du profil courant dont dérivent
`requireUser()`, `isAdmin()`, `isManager()`, aurait rendu `null` pour chacun
d'eux au premier chargement de page réel. L'authentification fonctionnait,
le compte derrière aurait été inutilisable.

**Correctif en deux temps, parce qu'un trigger ne joue qu'à l'insertion** —
le recréer seul n'aurait rien fait pour les 6 comptes déjà présents :

```sql
-- 1. Rattraper les 6 profils manquants, avec la MÊME logique que le trigger
insert into public.profiles (id, full_name, avatar_url, email, provider)
select
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'avatar_url',
  u.email,
  coalesce(u.raw_app_meta_data->>'provider', 'email')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do update
  set email    = coalesce(excluded.email, profiles.email),
      provider = coalesce(excluded.provider, profiles.provider);

-- 2. Recréer le trigger, pour les connexions futures
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Vérifié : 6 profils, trigger `tgenabled = 'O'`.

**À reporter dans la définition de terminé du lot C** : ce trigger devra être
posé sur l'environnement de production réelle au moment de la bascule finale,
par le même geste — aucun des deux workflows existants ne le fera à sa place.

##### Le critère 5, mesuré par différence plutôt que par comptage

Un `count()` seul ne prouve rien sur une base vide : la même valeur (`0`)
sortirait que la RLS fonctionne ou qu'elle soit absente. La preuve retenue
isole la variable voulue — deux recettes de statuts différents, un seul rôle
interrogé :

```sql
insert into public.recipes (author_id, title, status)
select id, 'TEST RLS — publiée', 'published' from public.profiles limit 1;
insert into public.recipes (author_id, title, status)
select id, 'TEST RLS — brouillon', 'draft' from public.profiles limit 1;
```

(`has_hero_image` volontairement omise : colonne **générée**, une deuxième
lecture de `information_schema.columns` restée incomplète la veille — je
n'avais lu que `column_default`, pas `is_generated`.)

```
https://auth.jepatisse.com/rest/v1/recipes?select=title,status
→ [{"title":"TEST RLS — publiée","status":"published"}]
```

Seule la ligne publiée apparaît en `anon` : PostgREST fait respecter la RLS de
bout en bout. Les deux lignes de test sont supprimées immédiatement après
lecture — aucune trace ne subsiste.

##### Le lot C au complet — cinq critères sur cinq

| Critère | Preuve |
|---|---|
| 1 — registre de migrations identique | `77 / 20260625000000` |
| 2 — e-mail + mot de passe | `access_token` valide, `aud: authenticated` |
| 3 — Google, bout en bout | 6 comptes / 7 identités inchangés, `last_sign_in_at` avancé |
| 4 — signature ES256 + JWKS | `{"alg":"ES256","kid":"mc-es256-2026-09"}` |
| 5 — PostgREST + RLS | brouillon invisible en anonyme, publié visible |

### 7.12 Le workflow qui transporte les données (11/09)

Les deux workflows de migration existants ne couvrent pas les données
applicatives : celui du lot 0-bis ne transporte que du **DDL**
(`migration-restauration-repetition.yml`), celui des identités que le schéma
**`auth`** (`migration-identites-c1.yml`). Recettes, profils, fournées, idées
et messages de contact n'avaient aucun véhicule — la pièce manquante du C3,
écrite dans `migration-donnees-c3.yml`. Le détail complet (SQL, garde par
garde) vit dans les commentaires du fichier ; ce qui suit en retient les
décisions.

**Sa place dans la séquence du § 7.10** — étapes 4 et 5, les deux dernières :

```
1. GoTrue crée le schéma auth                    (fait, palier 2)
2. DDL public, sans données                       (migration-restauration-repetition.yml)
3. auth.users puis auth.identities                (migration-identites-c1.yml)
4. Données public, profiles comprise              ← ce workflow
5. Création de on_auth_user_created               ← ce workflow, dernier geste
```

**Ce qui a décidé de la conception : faire taire les triggers de
l'application pendant le chargement.** Pas un confort — le dump porte le
*résultat* des triggers, pas leur déclencheur ; les rejouer, c'est les
appliquer deux fois. `ideas_check_quota` (5 idées / 24 h / membre) ferait
carrément **échouer** un chargement en masse. `comments_recompute_recipe_rating`
réécrirait les notes moyennes par-dessus celles du dump. D'où
`session_replication_role = replica` le temps du chargement — qui se délègue
proprement, contrairement à `--disable-triggers` qui exigerait le
superutilisateur que `postgres` n'est pas sur cette image (§ 7.11, piège 1).

**Cinq gardes avant la première écriture** : `auth.users` déjà chargée et à
parité de comptes avec la source (l'ordre du § 7.10 rendu mécanique) ; les
tables de `public` identiques des deux côtés ; `postgres` capable de régler
`session_replication_role` et membre de `supabase_auth_admin` — sinon le
message rend la commande `GRANT` exacte à jouer une fois — ; et aucune clé
étrangère hors de `public` ne référençant `public`, pour borner le
`truncate … cascade`.

**Une étape écrite puis retirée, avant le commit.** Une « revalidation des
clés étrangères » par `ALTER TABLE … VALIDATE CONSTRAINT` aurait été un
**no-op silencieux** : le mode `replica` contourne les FK sans les marquer
invalides, donc PostgreSQL les croit déjà valides et ne revérifie rien.
L'étape aurait affiché « tout tient » sans avoir rien mesuré — un contrôle
faux est pire qu'un contrôle absent (même doctrine que les compteurs par
facette de la recherche avancée, CLAUDE.md). Remplacée par le seul contrôle
qui ait du sens : les profils sans compte `auth`, la couture entre les deux
chargements séparés dans le temps.

**La preuve** : un décompte exact par table, `query_to_xml` plutôt que
`n_live_tup` — ce dernier est une estimation de l'autovacuum, fausse de
plusieurs pourcents juste après un chargement en masse, précisément le moment
où on l'interroge.

Doctrine de confidentialité reprise à l'identique de
`migration-identites-c1.yml` : aucun `upload-artifact`, aucune ligne de
données sur la sortie standard, `-v VERBOSITY=terse` sur tout `psql`
écrivant, et la définition du trigger lue sur la source puis appliquée
**sans être affichée**.

---

### 7.13 Le gel des écritures, et le déroulé du C3 (11/09)

En relisant `middleware.ts` avant de lancer la bascule, un trou est apparu que
rien dans ce dossier n'avait relevé — et il aurait produit une perte de données
silencieuse.

#### `COMING_SOON` ne gèle rien de ce qu'il faut geler

```js
if (process.env.COMING_SOON === 'true' && host !== TESTER_HOST) {
```

**`dev.jepatisse.com` est explicitement exempté**, par conception : c'est ce
qui permet aux testeurs de travailler pendant que la page d'attente couvre le
grand public. Sauf que `dev.jepatisse.com` **est** la seule production réelle à
ce stade (`CLAUDE.md`, § Domaines). Engager `COMING_SOON` pour une bascule
aurait donc laissé les testeurs écrire sur l'**ancien** Supabase pendant toute
la fenêtre — des écritures absentes du dump final, donc perdues à la
réouverture, et invisibles jusqu'au jour où quelqu'un chercherait une recette
qu'il croit avoir enregistrée.

D'où `MAINTENANCE_FREEZE`, ajoutée pour cette fenêtre : un **503** sur tous les
domaines, sans exemption. Le 503 plutôt qu'une page d'attente n'est pas
cosmétique — c'est le code d'une indisponibilité planifiée, et il évite qu'un
moteur d'indexation prenne la page pour le nouveau contenu du site.

#### Trois canaux d'écriture, trois protections différentes

Le point à ne pas se raconter : **aucun middleware ne peut geler la totalité
des écritures**, parce que toutes ne passent pas par Vercel.

| Canal | Gelé par | Reste à faire |
|---|---|---|
| Chargements de page (les deux domaines) | `MAINTENANCE_FREEZE` | — |
| Crons Vercel (`/api/cron/*`) | **rien** — `/api/*` est hors du `matcher` du middleware | Choisir une fenêtre qui évite **02:00 et 02:30 UTC** (`vercel.json`) |
| Navigateur → Supabase en direct (`supabase-js`) | **rien** — ces appels ne transitent jamais par Vercel | Demander la fermeture des onglets ; fenêtre courte ; **vérifier les décomptes après le dump** |

Le troisième canal est le seul qui ne se ferme pas techniquement. Il se traite
par la mesure, pas par la confiance : les décomptes par table du workflow de
chargement (§ 7.12) sont rejoués **après** la bascule contre l'ancienne base,
et toute divergence désigne une écriture tardive, nommément.

#### Déroulé, avec ses points d'arrêt

Écrit avant l'exécution, pour ne pas l'improviser sous pression — même méthode
que la phase 0 du § 7.10.

| # | Étape | Point d'arrêt |
|---|---|---|
| 1 | `MAINTENANCE_FREEZE=true` sur Vercel + redéploiement | Vérifier un 503 sur **les deux** domaines avant de continuer |
| 2 | Prévenir les testeurs, fermeture des onglets | — |
| 3 | `migration-restauration-repetition.yml` mode `restaurer` — DDL frais | `951 objets sur 951`, zéro erreur |
| 4 | `migration-identites-c1.yml` mode `transferer` | Les six lignes de preuve identiques des deux côtés |
| 5 | `migration-donnees-c3.yml` mode `verifier` **d'abord** | Lecture seule : confirme que les cinq gardes passent |
| 6 | `migration-donnees-c3.yml` mode `charger` | Décompte par table identique + trigger recréé |
| 7 | `GOTRUE_SITE_URL` remis sur `https://dev.jepatisse.com/` (nœud Auth), redéploiement | Il porte encore la valeur de test du palier 3 |
| 8 | Les trois variables Vercel vers la nouvelle instance | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 9 | Redéploiement **sans cache de build** | Les `NEXT_PUBLIC_*` sont inlinées au build (§ 7.9) |
| 10 | Vérifications : connexion e-mail, connexion Google, une lecture, une écriture | **Infaisable sous gel** — découpée en 10a (sondes `/api/*`, hors `matcher`) et 10b fusionnée avec l'étape 11, cf. § 7.14 |
| 11 | Retirer `MAINTENANCE_FREEZE` + redéploiement | Réouverture |
| 12 | Rejouer les décomptes contre l'**ancienne** base | Toute divergence = écriture tardive à reporter à la main |

**Le retour arrière reste gratuit jusqu'à l'étape 11** : tant que
`MAINTENANCE_FREEZE` tient et qu'aucune écriture n'a eu lieu sur la nouvelle
base, revenir consiste à remettre les trois anciennes variables et à
redéployer. C'est ce qui fait du C3 une opération réversible plutôt qu'un saut.

**Les dépendances codées en dur du § 7.9** restent à reprendre dans la foulée,
hors fenêtre : `.github/workflows/object-storage-reconciliation.yml` porte
l'URL Supabase en dur, et `scripts/gen-types.mjs` interroge l'API de Supabase
par `--project-id` — `npm run gen:types` cessera de fonctionner et devra
passer à `--db-url`.

---

### 7.14 Le C3 exécuté — ce que la bascule a appris (11/09)

Le lot C est **terminé** : `dev.jepatisse.com` tourne sur la base Infomaniak.
Le déroulé du § 7.13 a tenu dans ses grandes lignes ; ce qui suit consigne les
écarts, parce qu'ils se reproduiront.

#### Ce qui a été mesuré

| Contrôle | Résultat |
|---|---|
| DDL `public` transporté | `951 objets sur 951`, aucun manquant |
| Épreuves fonctionnelles | `mc_norm`, `pg_trgm`, `recipes.fts`, `btree_gist@public` |
| Identités | 6 comptes, 7 identités, 1 compte à double identité, empreintes `md5` identiques |
| Données `public` | décompte identique table par table |
| `on_auth_user_created` | reposé et vérifié |
| Connexion e-mail, connexion Google | ✅ |
| Lecture anonyme, lecture authentifiée, écriture navigateur | ✅ |
| E-mail sortant (Brevo) | ✅ |
| Étape 12 — écritures ayant franchi le gel | **aucune** |

L'étape 12 mérite sa ligne : `ad_events` +11 et `visit_sessions` +2 **côté
cible**, aucune table où la source soit devant. Le troisième canal d'écriture
du § 7.13 — navigateur → Supabase en direct, celui qu'aucun middleware ne peut
fermer — n'a rien laissé passer.

#### Trois verdicts rouges par construction

Trois fois dans la journée, un workflow a rendu un échec alors que la mesure
qu'il portait était bonne. Chaque fois, le même défaut : **un critère écrit
pour un seul état du système, appliqué à un autre.**

1. **`migration-restauration-repetition.yml`, mode `restaurer`** — « NO-GO,
   661 erreurs », quand l'inventaire disait 951 objets sur 951 et que les
   quatre épreuves passaient. Les 661 étaient des `already exists` : la cible
   portait déjà le DDL depuis le palier 2. Un verdict qui ne peut
   structurellement pas être vert au second passage n'est pas un garde-fou.
   **Corrigé** : les collisions sont comptées à part et ne bloquent plus.
2. **`migration-donnees-c3.yml`, mode `verifier` avant chargement** — la
   comparaison table par table n'est pas conditionnée par le mode, et la cible
   était encore vide. Rouge obligatoire.
3. **Le même, en étape 12** — cette fois la cible est en avance, légitimement,
   puisque le site tourne dessus. **Corrigé** : ce qui compte n'est pas
   l'écart mais son **sens**. `source > cible` est un échec (une écriture a
   franchi le gel, à reporter à la main) ; `cible > source` est la production
   qui vit. L'égalité stricte n'est exigée qu'en mode `charger`.

Leçon générale : **un contrôle doit énoncer l'état dans lequel il est valable**,
sinon il consomme, en pleine fenêtre, le temps de démontrer qu'il se trompe.

#### `truncate … cascade` sort de `auth`

`migration-identites-c1.yml` vide la cible par
`truncate auth.identities, auth.users cascade`. Or `public.profiles.id`
référence `auth.users` : la cascade emporte `profiles`, et de proche en proche
**tout le schéma `public`**.

Inoffensif dans l'ordre du C3 — les données arrivent après — et
**catastrophique ensuite** : rejouer ce mode une fois le site basculé viderait
le carnet entier, sans confirmation autre que le `REMPLACER` déjà tapé. Le
champ de confirmation l'annonce désormais, et le mode `charger` du workflow de
données porte le même avertissement.

#### Les durées de GoTrue exigent une unité

Le § 7.11 relevait `GOTRUE_SMTP_MAX_FREQUENCY=60` depuis le panneau Supabase,
qui affiche « 60 » sous un libellé en secondes. `MaxFrequency` est un
`time.Duration` côté Go : `envconfig` refuse la valeur nue, GoTrue s'arrête au
démarrage, et l'équilibreur sert une page « temporarily unavailable » qui ne
dit rien de la cause.

```
fatal — assigning GOTRUE_SMTP_MAX_FREQUENCY to MaxFrequency:
converting '60' to type time.Duration: missing unit in duration "60"
```

La valeur juste est **`60s`**. À vérifier de la même façon sur
`GOTRUE_SESSIONS_TIMEBOX` et `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`, mêmes types.

**Le diagnostic qui a fonctionné, et qui vaut d'être répété** : un `curl` local
sur le nœud (`http://127.0.0.1:9999/health`) sépare en une commande « le
service est mort » de « le service tourne mais l'équilibreur ne le joint pas ».
Deux causes, symptômes identiques.

#### Renommer une variable dans le code ne la renomme pas dans Vercel

La PR de retrait d'AWS SES (§ 7.9 bis) a renommé `SES_SMTP_*` /
`SES_SENDER_EMAIL` → `SMTP_*` / `EMAIL_SENDER`. Les variables Vercel sont
restées sous leurs anciens noms. Personne ne l'a vu parce que le test Brevo qui
avait validé la bascule tournait sur le code d'**avant** cette PR : l'outil de
test du back-office est tombé le jour de la migration, sur un
`Configuration SMTP manquante` qu'on a d'abord pris pour un dégât collatéral.

**Règle à tenir : une PR qui renomme une variable d'environnement doit nommer
explicitement le geste correspondant côté hébergeur**, et l'énoncer dans sa
description. Le code et la configuration ne sont pas dans le même dépôt.

#### Chez Vercel, un `NEXT_PUBLIC_*` ne peut plus être de type `Secret`

Les deux variables publiques dataient de juillet, avant la distinction
`Secret` / `Config`, et Vercel **refuse désormais l'enregistrement** de cette
combinaison : un `NEXT_PUBLIC_` est inliné dans le bundle navigateur, le
marquer secret est un mensonge que l'outil ne laisse plus passer. Et un secret
enregistré ne se convertit pas en place — il faut **supprimer puis recréer** en
`Config`.

Sans conséquence de sécurité : la clé `anon` est publique par construction,
c'est la RLS qui protège. `SUPABASE_SERVICE_ROLE_KEY`, elle, reste `Secret` et
ne doit jamais recevoir ce préfixe.

#### Le trou qui n'était nulle part dans ce dossier : CORS

**Supabase ne fournissait pas seulement une base, il fournissait une
passerelle.** Kong posait les en-têtes `Access-Control-*` sur chaque réponse.
En la remplaçant par un nginx qui relaie, personne n'a repris ce rôle — et
**tout le chemin navigateur → API** est tombé : `getUser()`, les écritures de
`useMutation`, les favoris, les votes.

Ce qui a rendu le diagnostic long, c'est que **rien de ce qu'on avait éprouvé
ne touchait ce chemin** :

- les sondes `/api/*` partent de Vercel, pas d'un navigateur ;
- les `fetch` de vérification étaient joués depuis la console **sur
  `auth.jepatisse.com`** — même origine, donc pas de préflight ;
- les connexions e-mail et Google passent par `/auth/callback`, côté serveur.

Trois contrôles verts, et le geste le plus banal du site cassé. **Un test
depuis la bonne origine n'est pas un détail de mise en œuvre, c'est ce qui
distingue le test du chemin réel.**

Et le symptôme trompait : cliquer un cœur renvoyait à l'**accueil**.
`FavoriteHeart` appelle `supabase.auth.getUser()` (réseau, bloqué par CORS),
n'obtient rien, et pousse vers `/connexion` ; or `/connexion` voit la session
par `getCurrentUser()` — claims vérifiés **localement**, sans réseau — et
redirige vers `/`. Les deux niveaux de vérification du § Authentification de
`CLAUDE.md` divergeaient, et le rebond ressemblait à une déconnexion.

##### Le piège dans le correctif : `rewrite … break` coupe `if` et `set`

Le bloc CORS posé **après** la ligne déjà présente —

```nginx
rewrite ^/auth/v1/(.*)$ /$1 break;
```

— est resté sans effet. `break` termine le traitement du **module rewrite**
dans ce `location` : les `if` et les `set` qui suivent ne s'exécutent jamais.
Les `add_header`, eux, appartiennent au module *headers* et s'appliquaient
quand même — d'où une réponse qui portait `Access-Control-Allow-Credentials`
mais **pas** `Access-Control-Allow-Origin` (variable jamais affectée), et un
préflight relayé à l'amont qui répondait `405`.

**Le bloc CORS doit être en tête du `location`, avant `set $upstream_name` et
avant `rewrite`.** Et il en faut un dans **chacun** des deux blocs, `/auth/v1/`
et `/rest/v1/` : le premier porte l'authentification, le second l'écriture.

Deux commandes ont tranché là où le navigateur ne disait rien d'utile :

```sh
nginx -T | grep -n "cors_origin"          # la configuration EFFECTIVE, includes résolus
curl -sSI -X OPTIONS <url> -H 'Origin: …' -H 'Access-Control-Request-Method: GET'
```

`nginx -t` valide la syntaxe ; `nginx -T` montre ce que nginx a réellement en
mémoire. La distinction a évité de chercher un rechargement manquant qui
n'existait pas.

#### L'étape 10 du § 7.13 est infaisable telle qu'écrite

Elle demande de vérifier connexion et écriture **pendant** le gel. Or
`MAINTENANCE_FREEZE` répond 503 sur tout chargement de page, sans exemption —
c'est sa raison d'être. Deux ajustements, à reporter dans le mode opératoire :

- **`/api/*` est hors du `matcher` du middleware**, donc les Route Handlers
  répondent sous gel. `GET /api/ingredients?q=far` et
  `GET /api/recherche/compte` éprouvent URL, clé `anon`, vérification ES256,
  RLS, RPC et données chargées — **sans rouvrir le site**. C'est le contrôle
  qui a pris la place de l'étape 10a.
- **Ce que ces sondes ne couvrent pas** : le bundle **navigateur** (elles sont
  serveur), et tout ce qui est inter-origines. D'où la fusion 10b + 11 — lever
  le gel, être le premier visiteur, prévenir les testeurs seulement ensuite.

**Attention à la lecture des sondes** : `lib/search.ts` **avale** les erreurs
(`console.error` puis `return []`). Un `200 {"items":[]}` ne distingue donc pas
« aucun résultat » de « la base a refusé ». Les journaux d'exécution Vercel
portent le vrai message, et c'est là qu'on a lu le `JWSError` qui a désigné une
clé `anon` fausse.

#### Frapper les jetons applicatifs n'était outillé nulle part

`scripts/jwt-es256.mjs` générait la paire de clés et sa forme publique, mais
pas les jetons `anon` / `service_role`. Il a fallu les produire dans la console
du navigateur par `crypto.subtle`, en pleine bascule.

Le script porte désormais un verbe **`frapper`**. Le piège à ne pas réintroduire
est écrit dans son commentaire : **`dsaEncoding: 'ieee-p1363'`**. JWS attend la
signature en `R||S` brut ; sans ce réglage Node produit du DER, revérifie son
propre jeton sans broncher, et PostgREST le refuse par un `401` sans message.

Et un rappel qui a fait perdre du temps : **ces jetons ne sont pas des secrets
à retrouver**, ce sont des affirmations signées. PostgREST ne tient aucune liste
de jetons valides, il vérifie une signature contre le JWKS. Un jeton refrappé
vaut l'original ; seule la **clé privée** est irremplaçable.

#### Deux gabarits, deux faux diagnostics

`TON_JETON_ANON` collé tel quel dans un `fetch`, comme `LA_CLE_` au palier 3, a
produit une erreur (`Expected 3 parts; got 1`) qu'on a d'abord prise pour un
symptôme. **Ne pas donner de texte à substituer** : faire déclarer la valeur
dans une variable d'abord (`const A = "…"`), puis l'utiliser — il n'y a alors
plus rien à remplacer au milieu d'une commande.

#### Ce qui reste

- **Lot A** — Vercel → Node.js sur Virtuozzo, délibérément après le lot C.
- **`wal-g`** (PITR), décommissionnement de Supabase, fermeture de l'Endpoint
  `pg-migration-temporaire`, remontée du TTL du CNAME (300 s pendant la
  bascule).
- **Dépendances codées en dur** :
  `.github/workflows/object-storage-reconciliation.yml` porte l'URL Supabase,
  et `scripts/gen-types.mjs` interroge l'API par `--project-id` — `npm run
  gen:types` cessera de fonctionner et devra passer à `--db-url`.
- **`CLAUDE.md` décrit encore Supabase comme l'hébergeur de la base.** C'est
  désormais faux et ça induira en erreur une session future : à reprendre une
  fois le lot A tranché, pour ne pas écrire deux fois la même section.
- **`revoke supabase_auth_admin from postgres`** si on veut resserrer après
  coup — le droit n'était nécessaire qu'à la création du trigger final.
- **Les jetons `anon` / `service_role` expirent en 2036.** Rien ne le
  rappellera.

---

### 7.15 Sauvegarde et PITR — pgBackRest (12/09)

La bascule du C3 a laissé la base sans aucune sauvegarde : Supabase en gardait
une copie figée au midi du 11/09, et ce filet disparaîtra avec le
décommissionnement. Le § 4.5 annonçait `wal-g` en « une demi-journée ». Ce
qui suit consigne ce qui a réellement été fait, et pourquoi ce n'est pas
`wal-g`.

#### Ce n'est pas wal-g, parce que le conteneur est en Alpine

```
NAME="Alpine Linux" 3.23.5   ·   musl libc 1.2.5   ·   x86_64
```

Les binaires publiés par wal-g sont liés à la **glibc**. Sur musl, l'éditeur
de liens refuse — ce n'est pas une incompatibilité subtile. Restaient : le
compiler sur le conteneur de la base de production (avec une chaîne Go qui
disparaîtrait au premier redéploiement), le compiler en statique ailleurs, ou
`gcompat`. Aucune de ces voies n'est raisonnable pour l'outil dont dépend la
reprise.

**`pgbackrest` est packagé par Alpine** (`apk add pgbackrest`, version 2.57.0).
Un `apk add` au lieu d'une chaîne de compilation sur une base de production :
l'arbitrage n'a pas demandé longtemps. C'est un outil de PITR d'un sérieux
équivalent, avec S3 natif, rétention et restauration documentée.

#### L'architecture retenue

| Élément | Valeur |
|---|---|
| Dépôt | S3, conteneur **privé** `jp-pgbackup` (jamais `jp-photos`, public) |
| Endpoint | `s3.pub1.infomaniak.cloud`, `uri-style=path` (obligatoire hors AWS) |
| Identifiants | Paire EC2 créée par `openstack ec2 credentials create`, **sur le nœud** |
| Configuration | `/etc/pgbackrest/pgbackrest.conf`, **volume déclaré** |
| Réglages PostgreSQL | `ALTER SYSTEM` → `postgresql.auto.conf`, dans le volume de données |
| Archivage | continu, `archive_timeout = 300` (perte bornée à cinq minutes) |
| Rétention | 7 sauvegardes complètes |

**La configuration ne doit PAS vivre dans le répertoire de données**, bien
qu'il soit le seul volume préexistant : `pgbackrest restore` vide `PGDATA`
avant de le reconstruire. La configuration y serait détruite au moment précis
où l'on en a le plus besoin. D'où le second volume — ce n'est pas de
l'élégance, c'est une condition de la restauration.

#### Trois clients OpenStack, trois endpoints — la cause enfin comprise

Le § 8 consignait depuis le 05/09 que « l'endpoint est `pub1`, pas `pub2` »,
avec pour explication une lecture d'écran erronée. **L'explication était
incomplète, et la vraie cause a coûté une heure ce matin.**

| Client | Endpoint atteint |
|---|---|
| `openstack container create` | **pub2** |
| `swift`, avec `OS_REGION_NAME=dc4-a` | **pub2** |
| Horizon (Stockage d'objet) | **pub2** |
| `swift` sur le runner GitHub, avec la région du secret | **pub1** |
| L'application et les clés TempURL | **pub1** |

**C'est `OS_REGION_NAME` qui choisit le cluster de stockage.** Le catalogue ne
ment pas : il contient plusieurs régions, chacune avec son endpoint. La valeur
`dc4-a` relevée au § 10.2 est celle du *compute* ; appliquée au stockage, elle
mène à un cluster où les conteneurs du projet n'existent pas. Même identifiant
de projet des deux côtés, deux espaces de noms distincts.

Conséquence concrète : un `jp-pgbackup` a été créé sur pub2, visible dans
Horizon, **et invisible de pgBackRest**, qui répondait `NoSuchBucket` sur
pub1. Le conteneur `test-photos` supprimé depuis Horizon existe toujours sur
pub1, pour la même raison.

**Le seul geste fiable** — celui qui ne dépend d'aucune résolution de
catalogue — est une requête Swift directe sur l'URL forcée :

```sh
TOK=$(swift auth | sed -n 's/^export OS_AUTH_TOKEN=//p')
curl -X PUT -H "X-Auth-Token: $TOK" \
  https://s3.pub1.infomaniak.cloud/object/v1/AUTH_<projet>/jp-pgbackup
```

`s3cmd mb` avait été tenté d'abord et échoue en `SignatureDoesNotMatch` — alors
que `s3cmd ls` passe avec les mêmes clés. La création de bucket envoie un corps
XML (`LocationConstraint`) que s3cmd et le middleware `s3api` de Swift ne
signent pas de la même façon. Un `PUT` Swift avec un jeton n'a aucune signature
à calculer : c'est ce qui a marché.

#### Ce que la plateforme impose, et qui n'était écrit nulle part

**`postgres` n'est pas superutilisateur** (piège 1 du § 7.11, qui ressort) :
`ALTER SYSTEM SET archive_command` est refusé. Le geste passe par
`supabase_admin`, joignable sans mot de passe sur la boucle locale.

**pgBackRest exige cinq privilèges** pour un utilisateur non superutilisateur.
Les poser d'un coup évite de les découvrir un par un, chacun au prix d'un
échec :

```sql
grant pg_read_all_settings to postgres;
grant execute on function pg_catalog.pg_create_restore_point(text) to postgres;
grant execute on function pg_catalog.pg_backup_start(text, boolean) to postgres;
grant execute on function pg_catalog.pg_backup_stop(boolean) to postgres;
grant execute on function pg_catalog.pg_switch_wal() to postgres;
```

**`apk add pgbackrest` tire `postgresql18`** en dépendance et se déclare
« version par défaut », sur un conteneur qui sert PostgreSQL 17.6. **Sans
effet** : l'image supabase/postgres sert ses binaires par Nix, qui passe devant
dans le `PATH` (`command -v psql` → `/nix/var/nix/profiles/default/bin/psql`,
en 17.6). Vérifié plutôt que déduit des deux avertissements de `pg_versions`.

**`SHOW archive_command` affiche `(disabled)`** tant que `archive_mode` est à
`off` — c'est une convention d'affichage, pas une valeur manquante. La valeur
réelle se lit dans `postgresql.auto.conf`. Le temps perdu à croire que
l'`ALTER SYSTEM` avait échoué se compte en minutes, mais il se répétera si ce
n'est pas écrit.

**`archive_command` doit porter un chemin absolu** (`/usr/bin/pgbackrest`) :
elle s'exécute avec l'environnement du serveur, pas celui du shell.

#### La procédure, telle qu'elle a fonctionné

1. Déclarer le volume `/etc/pgbackrest`, **redéployer** le nœud (un volume ne
   prend effet qu'au redéploiement).
2. `apk add pgbackrest` — **après** le redéploiement, sinon il est perdu.
3. Créer la paire EC2 sur le nœud, et le conteneur par `PUT` Swift sur l'URL
   forcée (ci-dessus).
4. Écrire `/etc/pgbackrest/pgbackrest.conf` (`chown postgres`, `chmod 600`).
5. **`pgbackrest repo-ls`** — éprouve le dépôt S3 **sans toucher à
   PostgreSQL**. C'est le contrôle qui a évité tous les risques : trois
   erreurs de configuration ont été corrigées ici, archivage encore éteint.
6. `ALTER SYSTEM` (`archive_command`, `archive_timeout`) en `supabase_admin`,
   puis `pg_reload_conf()`.
7. **`stanza-create` AVANT le redémarrage** — pgBackRest l'accepte avec
   `archive_mode = off`, ce qui réduit à zéro la fenêtre où des WAL
   s'accumuleraient sans dépôt structuré.
8. `ALTER SYSTEM SET archive_mode = 'on'`, puis **redémarrer le nœud** —
   « Redémarrer », jamais « Redéployer » : un redémarrage conserve le système
   de fichiers, donc `pgbackrest`.
9. Les cinq `GRANT`, puis `check`, puis `backup --type=full`.

Résultat mesuré :

```
WAL segment 000000010000000000000004 successfully archived to
  '/pgbackrest/archive/jepatisse/17-1/…gz' on repo1

full backup: 20260912-102023F
database size: 39.5MB → repo1 backup size: 7.9MB
```

#### Ce qui est protégé, et ce qui ne l'est pas

| | État |
|---|---|
| Archivage continu des WAL vers S3 | ✅ automatique, réglé dans le volume, survit aux redémarrages |
| Une sauvegarde complète | ✅ 12/09 10:20 |
| **Restauration éprouvée** | ✅ **jouée le 12/09** — voir ci-dessous |
| PITR depuis cette sauvegarde | ✅ mesuré, WAL rejoués depuis S3 |
| Sauvegarde complète périodique | ✅ planifiée le 12/09 avec `pg_cron` — voir ci-dessous |
| Résistance au redéploiement | ❌ le binaire est un paquet `apk` |

#### La restauration, éprouvée pour de bon

Une sauvegarde jamais restaurée est une hypothèse. Celle-ci ne l'est plus :
restaurée sur le nœud lui-même, dans un répertoire à part, avec un second
postmaster — la base fait 40 Mo, le disque en a 2,5 Go de libre, l'exercice
tient sur place. C'est rare, et il faut en profiter tant que c'est vrai.

**Ce que le journal a montré**, et qui est la moitié qu'aucune sauvegarde ne
prouve toute seule :

```
restored log file "000000010000000000000007" from archive
restored log file "000000010000000000000008" from archive
redo done at 0/8000168
selected new timeline ID: 2
archive recovery complete
database system is ready to accept connections
```

`archive-get` est allé chercher les WAL sur S3 et les a rejoués. La chaîne
fonctionne dans les deux sens.

| Contrôle | Résultat |
|---|---|
| Base restaurée | `recipes=72`, `profiles=6`, `auth_users=6` — identiques à la production |
| Production pendant l'exercice | intacte |
| Dépôt après la promotion de la copie | `0000000100000000` seul — **aucune trace de la ligne temporelle 2** |

##### Les trois garde-fous, et pourquoi chacun

L'instance d'essai démarre avec ces options **en ligne de commande**, qui
priment sur `postgresql.conf` comme sur le `postgresql.auto.conf` restauré :

| Option | Ce qu'elle empêche |
|---|---|
| `-c data_directory=<répertoire d'essai>` | **La plus importante.** `postgresql.conf` porte `data_directory = '/var/lib/postgresql/data'` (ligne 42) — et cette directive **l'emporte sur le `-D`**. Sans cette option, l'instance d'essai démarrerait sur la base **vivante**. |
| `-c archive_mode=off` | Que la copie, une fois promue sur une nouvelle ligne temporelle, pousse ses propres WAL dans le dépôt et brouille l'historique. Vérifié après coup : le dépôt ne porte aucun `00000002`. |
| `-c shared_preload_libraries=` | Que `pg_cron` et `pg_net` — tous deux préchargés en production — lancent des tâches planifiées et des appels réseau sortants depuis une copie. |

Trois autres options isolent sans protéger : `port=5433`,
`unix_socket_directories=/tmp/pgrestore`, `listen_addresses=` (aucune écoute
TCP).

##### Le mode opératoire, réutilisable

1. `install -d -o postgres -g postgres -m 700 <répertoire d'essai> /tmp/pgrestore`
2. Garde : vérifier que la cible **n'est pas** `/var/lib/postgresql/data` et
   qu'elle est vide.
3. `pgbackrest --stanza=jepatisse --pg1-path=<répertoire d'essai> restore` —
   **`--pg1-path` explicite**, sans quoi pgBackRest viderait la production.
4. Démarrer avec `pg_ctl -D <répertoire d'essai>` et les six options
   ci-dessus, `config_file` pointant sur celui de la production (il n'est pas
   dans la sauvegarde, vivant hors du répertoire de données).
5. Comparer les décomptes, vérifier que le dépôt n'a pas reçu de nouvelle
   ligne temporelle.
6. `pg_ctl -m fast stop`, puis effacer le répertoire d'essai.

**Un piège de forme, rencontré à l'étape 4** : le Web SSH insère une ligne
vide entre les lignes collées. Une commande écrite sur plusieurs lignes avec
des barres obliques inverses de continuation se coupe donc à la première —
`pg_ctl` reçoit ses options mais pas son verbe (`pg_ctl: no operation
specified`). Écrire ce genre de commande **sur une seule ligne**, ou la
générer par `printf`.

#### ⚠️ Après tout redéploiement du nœud Postgres

`pgbackrest` est installé par `apk` : **un redéploiement l'efface.**
`archive_mode` reste actif (il vit dans `postgresql.auto.conf`, donc dans le
volume), la commande d'archivage échoue à chaque segment, et `pg_wal` grossit
**sans qu'aucun message ne le signale** — jusqu'à saturer les 2,7 Go et bloquer
les écritures.

```sh
apk add --no-cache pgbackrest
su postgres -c 'pgbackrest --stanza=jepatisse check'
```

À faire immédiatement, avant toute autre vérification. C'est le défaut résiduel
de cette installation, et il est nommé plutôt que contourné par un bricolage.

#### La planification, posée avec `pg_cron`

Un calque Docker de Virtuozzo **n'a pas de démon cron** (`crond` absent, rien
dans `/etc/crontabs` qui soit lu) et **le menu du calque n'offre aucun
planificateur** — Jelastic n'en propose que pour ses piles natives, ce qui
explique le dossier `cron` du nœud Équilibrage.

| Voie | Pour | Contre |
|---|---|---|
| Lancer `crond` dans le conteneur | Cinq minutes | Meurt à chaque redémarrage, panne silencieuse |
| **`pg_cron` + `COPY … TO PROGRAM`** | La planification vit dans `cron.job`, donc **dans le répertoire de données** — elle survit à tout redéploiement du nœud, y compris à la perte de `pgbackrest` lui-même (§ ci-dessus). `pg_cron` est déjà dans `shared_preload_libraries` (relevé le 12/09) : aucun redémarrage à prévoir. Les échecs sont journalisés dans `cron.job_run_details`, sans rien à interroger côté système | Détourne un mécanisme SQL pour lancer un shell |
| pgBackRest en « repo host » depuis le nœud Équilibrage, qui a un vrai cron | L'architecture prévue par l'outil | SSH entre nœuds, clé à poser des deux côtés, **et une configuration qui vivrait hors de tout volume déclaré** — donc effacée au premier redéploiement du nœud Équilibrage, exactement le défaut qu'on cherche à éviter |

**C'est `pg_cron` qui a été retenu**, en sens inverse du jugement porté ici la
veille (§ 8) : la troisième voie a l'architecture la plus propre, mais elle
range l'état qui compte (la planification) dans un endroit qui ne survit pas
à un redéploiement — le même défaut que celui déjà nommé pour `pgbackrest`.
« Détourner un mécanisme SQL » était le moindre défaut.

**Mode opératoire, joué le 12/09 :**

```sh
psql -h 127.0.0.1 -U supabase_admin -d postgres <<'SQL'
create extension if not exists pg_cron;
select cron.schedule('sauvegarde-quotidienne', '30 3 * * *',
  $$copy (select 1) to program '/usr/bin/pgbackrest --stanza=jepatisse backup --type=full'$$);
SQL
```

Le worker de fond de `pg_cron` a été vérifié en conditions réelles, pas
supposé actif : une tâche jetable (`select cron.schedule('essai-planificateur',
'* * * * *', 'select 1')`) a produit cinq lignes `succeeded` consécutives dans
`cron.job_run_details` avant d'être retirée (`cron.unschedule`).

| Contrôle | Résultat |
|---|---|
| `cron.timezone` | `GMT` — `30 3 * * *` tombe donc à 5 h 30 heure française en été, 4 h 30 en hiver |
| `cron.job` | une seule ligne : `sauvegarde-quotidienne`, `username = supabase_admin`, `database = postgres`, `active = t` |

**Le rôle appelant compte.** `cron.schedule` enregistre le rôle qui l'a
invoqué, et c'est sous lui que la commande est rejouée chaque nuit.
`COPY … TO PROGRAM` exige `pg_execute_server_program` : `supabase_admin` l'a
par sa superutilisation. Programmée par `postgres` (non superutilisateur sur
cette image, cf. § 7.15 plus haut), la tâche aurait échoué chaque nuit, sans
autre trace que `cron.job_run_details` — table que personne ne consulte sans
raison de le faire.

**Ce que la planification apportait aussi, sans qu'on l'ait cherché en premier
lieu : la rétention.** `repo1-retention-full=7` ne s'évalue qu'à l'occasion
d'une sauvegarde complète — sans point de départ périodique, aucune expiration
n'avait jamais eu lieu, et les WAL se seraient accumulés indéfiniment dans le
dépôt S3. La planification ne posait donc pas seulement le point de reprise
du PITR, elle était la condition pour que la rétention existe.

---

### 7.16 Lot A — Vercel → Node.js sur Virtuozzo (plan, 12/09)

Le lot A n'avait jamais été instruit : le § 7.3 le dimensionne (1-2 jours,
aucune dépendance) et le § 1.1 énumère ses sept accroches, mais rien n'avait
été vérifié sur la plateforme. Cette section porte la reconnaissance faite le
12/09 et le plan qui en découle. **Rien n'a encore été créé** — le solde du
compte Virtuozzo est à €45,52, et la première décision est de le recharger.

#### Ce que la reconnaissance a établi

| Question | Réponse mesurée |
|---|---|
| Pile Node.js native | ✅ **disponible**, versions 22.x LTS (jusqu'à 22.23.2), variante **`-pm2`** |
| L'application peut-elle rejoindre l'environnement `jepatisse` ? | ❌ **Non en pile native** — voir ci-dessous |
| Planificateur de tâches natif | ❌ **inexistant** — voir le faux ami ci-dessous |
| `GOTRUE_SITE_URL` | ✅ correct (`https://dev.jepatisse.com/`), la note du § 10.5 est antérieure à la bascule |
| Projet Vercel `dev_jp` | ✅ **détaché du dépôt** — le point ouvert du § 6.2 se referme sans travail |
| Solde Virtuozzo | **€45,52** — quelques semaines à la consommation actuelle |

**La topologie réelle de `jepatisse`**, relevée au passage et utile à toute
session future :

| Étage | Rôle | Nœud | Version |
|---|---|---|---|
| Équilibrage | NGINX, terminaison TLS de `auth.jepatisse.com` | **216115** | `1.30.4-almalinux-9` |
| Serveurs d'application | PostgreSQL | **216075** | `17.6.1.165` |
| Image Docker | GoTrue | **216114** | `v2.196.0` |
| Image Docker 2 | PostgREST | **216242** | `v12.2.12` |

#### Pourquoi l'application ne peut pas rejoindre `jepatisse`

Le moteur d'un environnement Jelastic est **figé à sa création**. L'éditeur de
topologie d'un environnement existant n'ajoute que ce qui est compatible avec
ce moteur — conteneurs Docker, base, cache, stockage, équilibreur, VPS — et
les onglets de piles par langage y sont grisés. Ici l'étage « Serveurs
d'application » est occupé par une **image Docker personnalisée**
(`supabase/postgres`), ce qui verrouille toutes les piles natives.

Les onglets ne redeviennent actifs que dans l'assistant **« Nouvel
environnement »**.

**Ce que ça change par rapport au § 7.3**, qui annonçait « application et base
colocalisées » : elles le seront sur la même **plateforme** et dans la même
région (Genève DC2), pas dans le même **environnement**. C'est une contrainte
subie, mais elle se lit aussi comme une protection : le § 7.11 (piège 5)
raconte qu'un redéploiement du nœud Postgres a effacé la base. Un
redéploiement applicatif — le geste le plus fréquent de la vie du site — ne
peut structurellement pas atteindre la base s'il vit dans un autre
environnement.

#### Le faux ami du planificateur

Les add-ons d'un nœud natif proposent un **« Env Start/Stop Scheduler »**. Ce
n'est **pas** un planificateur de tâches : il met l'environnement entier en
veille et le réveille à heure fixe, pour économiser des ressources. L'installer
en croyant y gagner un cron reviendrait à programmer l'extinction du site.

Aucun planificateur de tâches n'est proposé, ni sur la pile native, ni sur le
calque Docker (§ 7.15). La question se règle donc ailleurs — et mieux.

#### Décision 1 — un nouvel environnement, pile Node.js 22.x native

Retenu contre l'alternative « un conteneur Docker de plus dans `jepatisse` »,
qui reproduirait exactement la contrainte du § 7.15 (runtime et outils
effacés à chaque redéploiement, image à construire et à maintenir) sans rien
apporter que l'illusion d'un environnement unique.

La pile native apporte pm2 (redémarrage automatique du processus), le
déploiement Git intégré, et un runtime tenu par la plateforme.

**Contrainte de configuration à ne pas manquer** : le redimensionnement
horizontal doit rester à **une seule instance**. `unstable_cache` et
`revalidateTag` (8 fichiers, cf. § 1.1) sont mémorisés **par processus** :
à deux instances, une invalidation prononcée sur l'une laisserait l'autre
servir la valeur périmée, sans erreur ni symptôme visible. Passer à plusieurs
instances impose d'abord un `cacheHandler` partagé (Redis) — un chantier à
part entière, hors périmètre du lot A.

#### Décision 2 — les crons portés par GitHub Actions

Les deux tâches de `vercel.json` sont de simples routes HTTP protégées par un
en-tête `Authorization: Bearer $CRON_SECRET` (`app/api/cron/abonnements`,
`app/api/cron/contact-jira`). N'importe quel appelant HTTP à heure fixe
convient. Jugés sur les deux critères que le § 7.15 a établis pour les
sauvegardes :

| Mécanisme | Survit à un redéploiement | Échec visible |
|---|---|---|
| `crond` sur le nœud (dossier `cron` du gestionnaire de configuration) | à vérifier | ❌ silencieux — le défaut même de `pgbackrest` |
| `pg_cron` + `pg_net` sur le nœud Postgres | ✅ | ⚠️ dans `cron.job_run_details`, que rien ne signale |
| **Workflow GitHub Actions planifié** | ✅ **indépendant de l'infrastructure** | ✅ **onglet Actions + e-mail automatique** |

La troisième est retenue. Elle est aussi la seule qui ne dépende pas de ce
qu'on est précisément en train de changer.

Deux réserves, ni l'une ni l'autre bloquante : les tâches planifiées de GitHub
peuvent partir avec 15 à 30 minutes de retard aux heures chargées — sans effet
sur un travail nocturne dont les passes sont idempotentes et bornées, ce que
l'en-tête de `abonnements/route.ts` documente déjà ; et GitHub désactive un
workflow planifié après 60 jours sans activité sur le dépôt.

**Bénéfice secondaire** : le plafond du plan Vercel Hobby disparaît. C'est lui
qui avait forcé la purge des imports à s'installer dans la route des
abonnements plutôt que dans son propre cron — arbitrage explicitement assumé
en tête de ce fichier, et désormais réversible.

#### Décision 3 — déploiement Git, construction sur le nœud

Trois voies étaient possibles :

| Voie | Où vivent les `NEXT_PUBLIC_*` | Coût |
|---|---|---|
| **Git natif, `npm ci && npm run build` sur le nœud** | **Un seul endroit** : les Variables du nœud | Ressources de construction sur le nœud |
| Construction dans Actions, artefact déposé | GitHub **et** nœud | `output: 'standalone'` à ajouter, pipeline à écrire |
| Image Docker via GHCR (motif éprouvé pour PostgREST, `image-postgrest.yml`) | GitHub **et** nœud | Retour au calque Docker, Dockerfile à maintenir |

**La première est retenue, et le critère est l'historique de ce dossier.** La
famille d'erreurs qui a coûté le plus cher pendant le lot C est celle des
variables d'environnement éclatées entre deux endroits : `SES_SMTP_*` renommées
dans le code mais pas chez l'hébergeur (§ 7.14), la clé `anon` fausse pendant
une heure, le refus Vercel des `NEXT_PUBLIC_*` de type `Secret`. Les
`NEXT_PUBLIC_*` étant **inlinées au build**, toute voie qui construit ailleurs
que sur le nœud impose de les tenir à jour à deux endroits, avec la garantie
qu'un jour l'un des deux sera oublié.

**Le risque à surveiller est la mémoire de construction.** Un `next build`
demande couramment 1 à 2 Go ; le nœud est proposé à 4 cloudlets réservés
(512 Mio). La parade tient à la facturation à l'usage : **réserver bas et
plafonner haut** — les cloudlets dynamiques ne sont facturés que consommés,
donc une limite de mise à l'échelle à 16 ou 24 cloudlets ne coûte rien au
repos et donne au build la mémoire dont il a besoin. Si ça ne suffit pas, la
voie de repli est la deuxième du tableau, avec sa contrepartie assumée.

#### Les sept accroches du § 1.1, revisitées

| Accroche | Ce qu'elle devient |
|---|---|
| `vercel.json` — 2 crons | Workflow GitHub Actions planifié (décision 2). Le fichier disparaît |
| `maxDuration` (20 routes) | Déclarations inertes hors serverless, à laisser en place. **`HARD_DEADLINE_MS = 54_000` (`app/api/moderation-recette/route.ts`) peut être relevé** — c'est le bénéfice fonctionnel annoncé au § 1.1 |
| `VERCEL_GIT_COMMIT_SHA` (`app/sw.js/route.ts`, `app/contact/page.tsx`) | **À remplacer — le nom du cache PWA en dépend.** Sans valeur, tous les déploiements partageraient un nom de cache et le service worker cesserait de se purger (§ « Installation (PWA) » de `CLAUDE.md`) |
| `VERCEL_URL` (`lib/site-url.ts`) | À remplacer par une variable posée sur le nœud |
| Middleware `runtime: 'nodejs'` | Natif, rien à faire |
| `unstable_cache` + `revalidateTag` | OK **à une seule instance** — cf. la contrainte de la décision 1 |
| `next/image` | 0 fichier. Reste à nettoyer : `next.config.mjs` déclare encore `images.remotePatterns` vers `acbabqolghhyxksouaye.supabase.co`, inerte mais faux depuis le C3 |

#### Mode opératoire

**Phase 0 — hors chrono, rien de public**
1. Recharger le solde Virtuozzo (€45,52 ne tient pas la durée du lot).
2. Créer l'environnement : pile **Node.js 22.x LTS**, variante `pm2`,
   4 cloudlets réservés, **limite de mise à l'échelle haute** (16-24),
   redimensionnement horizontal **non dynamique, 1 instance**. Le nommer
   explicitement plutôt que d'accepter `env-XXXXXXX`.
3. Poser **toutes** les variables d'environnement sur le nœud. La liste de
   référence est la table de `CLAUDE.md` — **pas celle de `DEPLOY.md`**, restée
   sur l'ancien Supabase.
4. Brancher le dépôt Git, déployer, vérifier que `npm ci && npm run build`
   passe sur le nœud. **C'est le point qui peut échouer** ; il échoue
   gratuitement, sur le domaine `*.jcloud-ver-jpe.ik-server.com` fourni avec
   l'environnement.

**Phase 1 — parité fonctionnelle, sur le domaine de l'environnement**
La checklist de `DEPLOY.md` (accueil, connexion e-mail et Google, `/profil`,
`/creer`, `/importer`, `/admin`) plus ce que le C3 a appris à ne pas
supposer : une écriture depuis le navigateur (favori, vote) pour éprouver le
chemin CORS, et un envoi d'e-mail réel.
**Piège hérité du § 7.14** : une sonde `/api/*` qui rend `200` ne prouve rien,
`lib/search.ts` avalant ses erreurs. Lire les journaux du nœud.

**Phase 2 — les crons**
Écrire le workflow planifié, le déclencher **à la main** d'abord
(`workflow_dispatch`), vérifier les deux routes contre le domaine de
l'environnement avant toute bascule DNS.

**Phase 3 — bascule DNS**
Abaisser le TTL avant, `dev.jepatisse.com` d'abord — c'est l'URL des testeurs
et la seule qui compte à ce stade —, puis `www.jepatisse.com` et les
redirections. Remonter le TTL une fois éprouvé. **À faire au même passage** :
remonter le TTL du CNAME `auth.jepatisse.com`, resté à 300 s depuis le C3.

**Phase 4 — décommissionnement et documentation**
Retirer le projet Vercel, supprimer `vercel.json`, réécrire `DEPLOY.md` (il
documente encore Vercel *et* l'ancien Supabase), et reprendre `CLAUDE.md` —
que le § 7.14 laissait justement en attente du lot A « pour ne pas écrire deux
fois la même section ».

#### Phase 0 exécutée le 12/09 — le risque principal est levé

L'environnement **`jepatisse-app`** (nœud **216658**, Node.js **22.23.2-pm2**,
Genève DC2) est créé, le dépôt branché en Git sur `main`, et **le build passe
sur le nœud**.

| Mesure | Résultat |
|---|---|
| Compilation | ✅ **25,7 s**, aucun `Killed`, aucun dépassement de tas |
| Mémoire du nœud | 3072 Mo au total, **3015 Mo disponibles** — le plafond à 24 cloudlets est effectif (24 × 128 Mio) |
| Reproductibilité | Empreintes des chunks partagés **identiques** à un build joué ailleurs sur le même verrouillage |
| Coût mesuré | plancher **€0,009/h** (≈ 6,60 €/mois), plafond théorique €0,074/h |

**Le plancher ne bouge pas quand on relève le plafond** : à 8 cloudlets de
limite la fourchette était €0,009–€0,024, à 24 elle est €0,009–€0,074. La
stratégie « réserver bas, plafonner haut » du § 7.16 est donc vérifiée, pas
seulement plausible — et le `next build`, quelques minutes à pleine charge,
coûte moins d'un centime par déploiement.

##### Piège 1 — `NODE_ENV=development` fait échouer le build en accusant le code

La pile Node.js de Jelastic pose `NODE_ENV=development` par défaut. Avec cette
valeur, `next build` compile puis **échoue à la génération des pages
statiques** :

```
✓ Compiled successfully in 25.7s
Error: <Html> should not be imported outside of pages/_document.
Error occurred prerendering page "/404".
Export encountered an error on /_error: /404, exiting the build.
```

**Le message désigne le code, la cause est l'environnement.** Aucun fichier du
projet n'importe `next/document`, et il n'existe pas de dossier `pages/`.
Établi par expérience contrôlée — même code, même `node_modules`, seule la
variable change :

| `NODE_ENV` | Résultat |
|---|---|
| non défini | build complet, code de sortie 0 |
| `development` | échec identique à celui du nœud, code de sortie 1 |

Next.js le signale d'ailleurs en amont du journal (`⚠ You are using a
non-standard "NODE_ENV" value`), mais la ligne se perd dans la sortie.

**Couplage à connaître** : poser `NODE_ENV=production` réarme le piège
inverse — `npm install` saute alors les `devDependencies`, dont dépendent
`tailwindcss`, `postcss` et `typescript`, tous nécessaires au build. La
séquence cohérente est donc :

| Étape | Commande |
|---|---|
| Installation | `npm ci --include=dev` — le drapeau explicite, indépendant de `NODE_ENV` |
| Construction | `NODE_ENV=production npm run build` |
| Exécution | `NODE_ENV=production` |

##### Piège 2 — la pile ne lit jamais `scripts.start`

Le service `nodejs` refusait de démarrer sur un « Failed to start » sans
détail. La cause est dans `/usr/local/sbin/nodejs`, ligne 224 :

```sh
[ ! -f "${ROOT_DIR}/${PROCESS_MANAGER_FILE}" ] && ( [ -z "${APP_FILE}" ] || [ ! -f "${ROOT_DIR}/${APP_FILE}" ] ) && { echo_failure; return 1; }
```

En variante **pm2**, `PROCESS_MANAGER_FILE` vaut `ecosystem.config.js`
(ligne 88) ; `APP_FILE` est détecté **par nom de fichier** parmi `server.js`,
`app.js`, `index.js` et leurs variantes CoffeeScript (ligne 80). Un projet App
Router n'en a aucun, et **le script ne consulte jamais `scripts.start` sur ce
chemin**. Il manquait donc un seul fichier.

D'où **`ecosystem.config.js`**, à la racine du dépôt. Un `server.js` aurait
aussi satisfait la pile, mais un serveur Next.js personnalisé désactive une
partie de l'optimisation statique. Trois choses y sont inscrites, et c'est
l'intérêt de ce fichier par rapport à un réglage de console :

- **`instances: 1`** — la contrainte du cache (`unstable_cache` mémorisé par
  processus) devient une ligne versionnée accompagnée de son explication,
  plutôt qu'un réglage qu'on relève un jour en croyant bien faire ;
- **`NODE_ENV: 'production'`**, pour que le piège 1 ne dépende pas d'une
  variable de console ;
- **`max_memory_restart: '2G'`** — redémarrer avant la limite du conteneur
  plutôt que se faire tuer par le noyau, qui ne laisse aucune trace lisible.

Bon à savoir pour la suite : la pile **détecte elle-même** le port écouté par
l'application et installe une redirection `nft` du 80 vers lui (lignes
185-198). Aucun port n'est imposé — on le fixe seulement pour rendre cette
détection déterministe.

##### Un effet de bord à ne pas reproduire

Un `pm2 list` lancé pour diagnostiquer **crée un démon pm2**. La ligne 213 du
script détecte tout processus `pm2` de l'utilisateur `nodejs` et en conclut que
l'application tourne : le démarrage suivant répond alors « NodeJS application
is already started » sans rien lancer. Nettoyer par `pm2 kill` avant tout
nouvel essai.

#### Phase 1 — la bascule de `dev.jepatisse.com` (12-13/09)

**Où ça en est : c'est fait.** `dev.jepatisse.com` est servi par
`jepatisse-app` en **HTTPS**, certificat Let's Encrypt valide, derrière son
propre équilibreur NGINX. Le TLS a bloqué une soirée sur une cause qui n'était
pas celle qu'on croyait — voir la fin de section, c'est la trouvaille la plus
réutilisable du lot.

Décision prise en cours de route, et qui a bien tenu : plutôt que de tester sur
le domaine technique de l'environnement, **avancer la bascule de
`dev.jepatisse.com`**. Le motif CORS du nœud Équilibrage de `jepatisse`
n'autorise que `^https://(dev|www)\.jepatisse\.com$` et `GOTRUE_SITE_URL` vaut
déjà `https://dev.jepatisse.com/` : sur le domaine technique, **aucune écriture
ni aucune connexion n'aurait pu être testée**. Les deux rustines qu'il aurait
fallu poser (motif nginx, liste GoTrue) touchaient des nœuds de production pour
un domaine jetable.

##### Les 34 variables, et pourquoi la table de `CLAUDE.md` ne suffisait pas

L'inventaire a été refait **depuis le code** (`process.env.`, destructurations,
et l'accesseur `env()` de `lib/storage-data.ts`) plutôt que recopié depuis la
documentation. Bien lui en a pris : **six variables lues par l'application ne
figuraient pas** dans la table de `CLAUDE.md` — `EXTERNAL_SEARCH_MODEL`,
`MODERATION_MODEL`, `IMPORT_USD_EUR`, `TRIAL_EMAIL_SALT`, et les quatre
`JIRA_STATUS_IN_PROGRESS` / `IN_TEST` avec leurs `_ID`.

Deux points de vigilance sur les secrets, Vercel ne réaffichant jamais une
valeur marquée *Sensitive* :

- **`TRIAL_EMAIL_SALT` est le seul irrécupérable.** Il sale les empreintes
  d'e-mail de `trials` (éligibilité à l'essai gratuit) : ni retrouvable, ni
  recalculable. Mesuré avant de trancher — **une seule ligne dans la table,
  rattachée à un compte connu** — d'où la régénération sans risque. À traiter
  autrement une fois le site ouvert.
- Les jetons `anon` / `service_role` ne sont pas des secrets à retrouver mais
  des affirmations signées (§ 7.14) : refrappables tant qu'on a la clé privée.

##### Trois environnements qui ne se synchronisent pas

C'est le piège qui a coûté le plus de tours de boucle de la journée. Sur cette
pile, une variable existe dans **trois endroits distincts**, et ils divergent :

| Endroit | Ce qui l'alimente |
|---|---|
| Le panneau **Variables** de la console | la saisie |
| Le **processus applicatif** (pm2) | le panneau, au démarrage du nœud **ou** via `pm2 restart --update-env` |
| La **session Web SSH** | le panneau, **à l'ouverture de la session seulement** |

Et le point non évident : **`pm2 restart --update-env` propage l'environnement
du shell qui lance la commande**, pas celui du panneau. Depuis une session
ouverte avant la modification, il repropage donc l'ancienne valeur — en donnant
toutes les apparences d'avoir agi. Le remède est d'**ouvrir une session
neuve** ; le redémarrage du nœud depuis la console marche aussi.

Corollaire pour les builds : **construire depuis une session dont on a vérifié
l'environnement complet**, en une ligne :

```sh
printenv NEXT_PUBLIC_SUPABASE_URL; printenv NEXT_PUBLIC_SITE_URL; printenv NEXT_PUBLIC_SUPABASE_ANON_KEY | cut -c1-15
```

Passer *une* variable explicitement en laissant les autres à l'héritage est
pire que tout : ça produit un build mi-juste, mi-vide — ce qui est exactement
arrivé (ci-dessous).

##### `pm2 env` affiche `CLÉ: valeur`

Pas `CLÉ=valeur`. Un contrôle par motif ancré sur `NOM=` ne trouve rien et fait
conclure à une variable absente. Deux fausses alertes payées à ce détail.

##### Les `NEXT_PUBLIC_*` comptent aux DEUX moments

Idée reçue corrigée en cours de route : ces variables ne sont pas seulement
« inlinées au build ». Elles le sont **pour le bundle navigateur**, mais le
code serveur **relit `process.env` à l'exécution**. D'où deux pannes distinctes,
toutes deux silencieuses :

- **Bonne au build, absente du panneau** → le rendu serveur régénère avec
  l'ancienne valeur. Constaté sur `sitemap.xml` : le module compilé portait la
  bonne URL, le corps servi la mauvaise. Les horodatages l'ont prouvé — le
  `.body` était **postérieur au build**, régénéré par la revalidation ISR
  d'une minute.
- **Absente au build** → le bundle navigateur fige `undefined`, et
  `createBrowserClient` lève : **« Application error: a client-side exception »**,
  sans la moindre erreur côté serveur.

**Le contrôle qui marche est fonctionnel, jamais textuel.** Un `grep` sur le
bundle aurait dit « tout va bien » dans les deux cas. C'est `curl` sur
`/sitemap.xml` — construit à partir de `siteUrl()` — qui a révélé l'écart.
Piège dans le piège : chercher le domaine dans `.next/server` donne un faux
positif, `middleware.js` le portant **en dur** (exemption de la page d'attente).

##### Tout redémarrage du nœud élague les devDependencies

`NODE_ENV=production` étant désormais permanente, l'installation que la pile
relance à chaque démarrage saute les `devDependencies`. Le build suivant échoue
alors sur `Can't resolve '@/lib/...'` — message qui accuse le code du projet,
alors que la cause est l'absence de `typescript`, sans lequel Next ne lit plus
les alias de chemins de `tsconfig.json`. **Troisième message trompeur de la
série.**

D'où la **commande canonique de construction sur ce nœud** :

```sh
cd /home/jelastic/ROOT && npm ci --include=dev && rm -rf .next && NODE_ENV=production npm run build
```

Rencontré deux fois : après un redémarrage du nœud, puis après l'installation
de Let's Encrypt qui en provoque un.

##### La bascule DNS elle-même — sans accroc

Le § 7.11 avait raison sur toute la ligne, et son insistance a payé :

- **le CNAME vise le nom d'hôte de l'ENVIRONNEMENT**, jamais celui du nœud.
  Quand l'ajout de l'équilibreur a déplacé le point d'entrée, l'IP est passée
  de `195.15.233.39` à `195.15.204.255` **sans aucune modification DNS** ;
- **affecter le domaine à l'environnement** (Paramètres → Domaines
  personnalisés) est un geste distinct du DNS, à faire avant : sur équilibreur
  partagé, l'aiguillage se fait par l'en-tête `Host` ;
- pas de domaine dupliqué en fin de cible, le piège du point final évité.

##### Le TLS : ce qu'on a appris, et le blocage

**Un nœud applicatif Node.js natif ne peut pas terminer le TLS.** Le module
Let's Encrypt est bien proposé sur un tel environnement et s'installe sans
erreur — mais il n'a aucun serveur web à configurer. Mesure sans appel : après
installation, **seul le 3000 écoutait**, rien en 443. Le port 80 répondait grâce
à la redirection `nft` que la pile installe (80 → port applicatif détecté) ; il
n'existe **aucun équivalent pour le 443**.

*Leçon de méthode* : la présence d'un module dans la liste ne dit pas qu'il a de
quoi travailler. Ce point avait été identifié comme risque avant la bascule,
puis écarté à tort en voyant le module proposé — il aurait fallu vérifier ce qui
écoutait sur 443 **avant** de basculer le DNS, pas après.

D'où l'ajout d'un **nœud Équilibrage NGINX** (216664, 1 cloudlet réservé). Son
chaînage interne est vérifié : `10.101.29.249:80` **et** `:3000` répondent 200
depuis l'équilibreur.

**Un nœud à qui l'on ajoute une IP publique APRÈS sa création perd sa sortie
réseau.** C'est ce qui a bloqué le TLS pendant une soirée, et la cause n'a rien
d'un défaut de la plateforme : c'est un **ordre d'opérations**.

Le premier équilibreur (216664) a été créé en mode **SLB** — accès par
l'équilibreur partagé de la plateforme, sans IP publique. L'IP dédiée lui a été
attribuée ensuite. Or les deux modes sont exclusifs, et la console le dit
elle-même au moment de la bascule : *« L'option Accès via les SLB pour la couche
Équilibrage a été automatiquement désactivée. »* Faite après coup, cette
bascule ne recâble que **l'entrant**.

| Fait mesuré sur 216664 | Résultat |
|---|---|
| Trafic **entrant** depuis Internet | ✅ **200** sur `http://dev.jepatisse.com/` |
| Réseau **interne** | ✅ 200 vers l'application |
| Sortie **externe** (80 et 443) | ❌ délai dépassé, alors que le DNS résout |
| Adresses | `195.15.204.255/32` sur `venet0:0`, `10.101.13.230/16` sur `venet0:1` |
| Redémarrage du nœud | sans effet |

**La mesure qui a isolé la variable** : le nœud **216115**, l'équilibreur de
l'environnement `jepatisse`, est de **même type** et porte lui aussi une **IP
publique** — il joint `https://fastly.jsdelivr.net/` en 301 sans difficulté.
Un équilibreur à IP publique sort donc parfaitement sur cette plateforme, et le
216664 était bien anormal. Sans cette comparaison, on aurait conclu à une
restriction générale.

**Le remède, et la règle à retenir** : supprimer l'étage Équilibrage, le
recréer **avec l'IPv4 publique cochée dès l'écran de création**. Le nouveau
nœud sort immédiatement (301 vers jsDelivr), Let's Encrypt s'installe, et
`https://dev.jepatisse.com` répond avec un certificat valide.

> **Sur cette plateforme, l'IP publique se pose à la création d'un nœud, jamais
> après.** L'ajouter ensuite laisse le routage sortant à moitié appliqué, sans
> qu'aucun message ne le signale.

**Le CNAME a suivi trois fois sans intervention** — IP partagée, puis
`195.15.204.255`, puis `84.16.70.52` — parce qu'il vise le **nom d'hôte de
l'environnement** et non celui d'un nœud. C'est l'insistance du § 7.11 qui paie,
et elle a évité trois modifications DNS dans une phase déjà chargée.

**Résultat mesuré depuis l'extérieur :**

```
https://dev.jepatisse.com/ → 200, 181 608 octets
subject : CN=dev.jepatisse.com
issuer  : Let's Encrypt
expire  : 12/12/2026
```

*Deux erreurs de méthode payées ici, et consignées parce qu'elles se
ressemblent.* `ip route` avait fait conclure que l'IP publique n'était pas liée
— seul `ip addr` le dit. Et le diagnostic « défaut de plateforme, ticket
support » a été formulé **avant** d'avoir lu la documentation de l'éditeur et
avant d'avoir isolé la variable : le ticket serait parti pour rien. La
documentation confirmait par ailleurs que l'ajout d'un équilibreur NGINX **avec
IP publique** est la configuration prescrite pour Let's Encrypt sur une pile
Node.js — ce qu'on avait déduit de la mesure, mais qu'une lecture aurait donné
d'emblée.

**Quota Let's Encrypt** : 5 certificats identiques par semaine et par nom.
Trois tentatives consommées le 12/09, une réussie le 13/09.

##### Deux réglages repérés pour la suite, non instruits

- **Git-Push-Deploy Add-On** (« Simple CI/CD pipeline for Git projects »), à
  comparer au sondage périodique du gestionnaire de déploiement pour la phase 4.
- **`HOT_DEPLOY`** et **`APP_FILE`**, variables de la pile vues au panneau.
  `APP_FILE` aurait été une alternative à `ecosystem.config.js` — écartée à
  raison : elle vit dans la console, le fichier vit dans le dépôt.

#### Ce qui reste non vérifié

- ~~La mémoire de construction sur le nœud~~ — **tranché en phase 0** : 25,7 s
  de compilation, 3 Go disponibles. La voie de repli (construction dans
  GitHub Actions) n'a pas lieu d'être.
- **Le TLS du nouvel environnement** : add-on Let's Encrypt ou SSL intégré,
  non instruit.
- ~~Le déclenchement du déploiement Git~~ — **les deux existent** : déploiement
  manuel, ou « Vérifier et auto-déployer les mises à jour » par sondage
  périodique (intervalle réglable). Laissé manuel tant que la validation est
  en cours ; à trancher en phase 4.
- ~~La variante `-pm2` en 22.x~~ — **confirmée** : `22.23.2-pm2` retenue.
- **Les preview deployments par branche disparaissent** (§ 1.1). Aucune
  reconstruction n'est prévue par ce plan ; c'est une perte assumée, à
  réexaminer si elle se fait sentir.

#### Définition de terminé

`www.jepatisse.com` et `dev.jepatisse.com` servis depuis Virtuozzo, les deux
crons exécutés au moins une fois par GitHub Actions avec leur trace,
le projet Vercel retiré, `vercel.json` supprimé, `DEPLOY.md` et `CLAUDE.md`
remis à l'état réel.

### 7.17 Vérification fonctionnelle post-lot A (13/09)

Six points contrôlés sur `dev.jepatisse.com` après la bascule de l'application
(§ 7.16) : connexion e-mail, connexion Google, mot de passe oublié, dépôt de
photo, une route IA, le lien « en tant que ». Deux échecs, un seul traité ici.

**Le dépôt de photo échouait en « CORS Missing Allow Origin »** sur le `PUT`
signé vers `s3.pub1.infomaniak.cloud`, alors que le préflight `OPTIONS`
répondait `200` avec `access-control-allow-origin: *`. Le conteneur `jp-photos`
a été vérifié conforme (métadonnées CORS posées le 05/09, relues à l'identique)
et `SWIFT_STORAGE_URL` correct sur le nœud — les deux hypothèses les plus
probables, écartées par la mesure plutôt que supposées bonnes.

**La cause réelle : `SWIFT_TEMPURL_KEY_PHOTOS` sur le nœud Virtuozzo ne
correspondait plus à la clé posée sur le conteneur.** Une signature refusée
par le middleware `tempurl` sort en 401 **avant** le contrôleur d'objet — donc
avant que Swift n'ajoute les en-têtes CORS de la réponse. Le navigateur ne
voit alors aucun `Access-Control-Allow-Origin` sur un 401 qui, sans CORS, se
présente comme s'il n'existait pas : Chrome l'affiche comme un refus CORS,
jamais comme un 401. **Un refus de signature TempURL se déguise en panne CORS
dès qu'il ne porte pas lui-même les en-têtes CORS.**

Diagnostic mené depuis le nœud applicatif lui-même (`node -e`, en réutilisant
l'environnement réel via `pm2 env 0` plutôt que celui, différent, du shell de
la console — cf. § 7.16), en reproduisant exactement le chemin et la forme de
signature validés le 05/09 (§ 8) : chemin, condensat et forme identiques,
horloges du nœud et du cluster concordantes à la seconde. Seule la clé
différait — 20 caractères non hexadécimaux sur le nœud, quand la clé valide
fait 64 caractères hexadécimaux. Résolu par une **rotation complète** (nouvelle
paire de clés, posée dans cet ordre : secrets GitHub, conteneurs via
*Poser les clés TempURL des conteneurs*, variables du nœud, redémarrage) plutôt
que par une restauration de l'ancienne valeur — un secret GitHub ne se relit
pas, rien n'aurait permis de vérifier qu'une valeur notée à la main était la
bonne. Confirmé par un dépôt réel (`201`) avant de rouvrir le navigateur.
Aucun code n'a changé : `lib/storage-data.ts` signait déjà juste.

**Leçon de méthode** : sur cette panne comme sur celle du 401 de préfixe/forme
de signature (§ 8, 05/09), le symptôme visible (CORS) et la cause réelle
(authentification) appartiennent à deux couches différentes de la même
requête. Le réflexe qui a tranché les deux fois est le même : mesurer la paire
OPTIONS/PUT réelle avec les en-têtes complets plutôt que de raisonner sur ce
que le navigateur affiche.

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
| « Sur les plans gratuits, la migration ajoute un coût » | **Faux.** Les alertes de dépassement se déclenchent déjà : la trajectoire réelle est Vercel Pro + Supabase Pro, ~40 €/mois. Infomaniak à 16-28 € est **moins cher** (§ 4.6). |
| Le chantier photos est justifié par l'écologie et le coût futur | **Sous-estimé.** C'est la **cause** des alertes actuelles. Migrer sans le traiter déplacerait le problème (§ 4.6, § 7.1). |
| Le prix Virtuozzo est une estimation à confirmer | **Mesuré** au configurateur le 04/09/2026 : 1,13 € par cloudlet et par mois, soit 16 €/mois avant l'ouverture et 28 € après (§ 4.5). |
| L'image apporte les extensions « exactement dans la disposition du § 2.3 » | **Faux pour deux d'entre elles.** `pg_trgm` et `unaccent` ne sont pas créées par `supabase/postgres:17.6.1.165` (§ 2.6) — les deux que le § 2.3 dit critiques. Le workflow pose désormais les cinq lui-même, sans rien supposer de l'image. |
| Le § 2.2 énumère les colonnes image de la base | **Incomplet de trois colonnes** — `imports.recette`, `tags.category_picto`, `allergens.picto` (§ 7.5). Elles ont été trouvées en balayant tout le schéma plutôt qu'en listant à la main. Une énumération manuelle de colonnes est une hypothèse, pas une mesure. |
| Le stockage objet d'Infomaniak est un Ceph RadosGW (donc pas de clé TempURL par conteneur) | **Faux** — c'est du Swift natif avec le middleware `s3api` (§ 7.5). Le nom d'hôte en `s3.` désigne un protocole servi, pas l'implémentation. Les clés par conteneur fonctionnent, le cloisonnement `jp-photos` / `jp-contact` tient. |
| `tags.category_picto` et `allergens.picto` se bascule via un écran d'admin, comme les autres colonnes image de l'étape 1 du B2 | **Faux** — aucune des deux tables n'a d'écran d'administration ; elles s'éditent directement en base (§ 7.5). Rien à basculer côté code, le B3 reprendra leurs data-URL telles quelles. |
| La cible est « `supabase/postgres` 15+ » | **17.6.** La source tourne sur PostgreSQL 17.6 (§ 2.5) : restaurer son dump dans un 15 serait une rétrogradation, que `pg_dump` ne promet nulle part. Le tag à déployer est `supabase/postgres:17.6.1.165`. |
| La base porte 31 triggers | **25**, mesuré le 04/09 sur la requête que le § 7.2 documente (schéma `public`, triggers internes exclus). Les 320 policies et 252 fonctions, elles, sont confirmées. Sans effet sur le Go/No-Go : la comparaison joue la même requête des deux côtés (§ 7.2). |
| « On n'efface jamais une data-URL avant d'avoir relu l'objet distant » (§ 7.5) — le B3 déposerait puis vérifierait, le B4 n'effacerait qu'ensuite | **Ce n'est pas ce qui a été construit.** `traiterLotScalaire` (B3) écrase la colonne dès que le dépôt répond `ok`, sans relecture intermédiaire — il n'y a donc plus de data-URL à effacer une fois une ligne migrée : le B3 l'a déjà fait, en un seul geste. Le B4 (§ 7.7) ne protège plus une décision d'effacement, il détecte seulement après coup un objet devenu illisible, sans repli possible en cas d'échec. |
| L'endpoint du stockage objet est `s3.pub2.infomaniak.cloud` (§ 10.2, retenu depuis le B0) | **Faux — c'est `s3.pub1`.** Découvert le 05/09 en testant le B3 en production : tous les dépôts signés échouaient en 401 malgré des clés TempURL correctement posées et identiques des deux côtés (Vercel, conteneur). La cause était `SWIFT_STORAGE_URL` sur Vercel, réglée sur `pub2` — un hôte qui ne connaît ni les conteneurs ni les clés du bon compte. Confirmé en comparant à la sortie réelle de `swift auth` (`object-storage-afficher-url.yml`, nouveau workflow diagnostique). Aucune vérification directe contre le cluster n'avait été faite avant cette valeur : elle avait été retenue par déduction/lecture d'écran, jamais mesurée comme le reste du § 10.2. |
| La signature TempURL est émise **préfixée** du nom du condensat (`sha256:<hex>`), « la forme documentée par Swift », la forme nue n'étant qu'une tolérance | **Exactement l'inverse sur ce cluster.** La forme préfixée est refusée en 401 — encodée (`sha256%3A…`, ce que produit `URLSearchParams`) comme non encodée — et seule la forme **nue** est acceptée. Mesuré le 05/09 en tentant un dépôt réel sur les douze combinaisons possibles (`object-storage-diagnostic-signature.yml`), après que trois hypothèses successives (clé, hôte, préfixe `/object`) eurent été écartées une à une. Le commentaire d'origine raisonnait sur la documentation Swift générique, jamais sur une mesure — et `allowed_digests`, que la sonde du B0 avait bien lu, dit quels condensats sont acceptés, pas sous quelle forme. Verrouillé par un test (`lib/storage.test.ts`). |
| Le chemin signé commence par `/v1/AUTH_<projet>` | **Chez Infomaniak il commence par `/object/v1/AUTH_<projet>`**, et ce segment fait partie intégrante du chemin à signer : une signature calculée sans lui est refusée en 401 (même diagnostic). `SWIFT_STORAGE_URL` doit donc reprendre telle quelle la racine rendue par `swift auth`, sans rien y retrancher. |
| Le mot de passe de `supabase_auth_admin` est bon — « mesuré » par `psql -h 127.0.0.1 -W` | **Le test ne prouvait rien.** Le `pg_hba.conf` de l'image accepte `127.0.0.1/32` en `trust`, donc sans vérifier : l'invite affichée vient de psql, pas du serveur, et n'importe quelle valeur passe. Le mot de passe était faux, et l'heure suivante a été perdue à chercher ailleurs. **Un test d'authentification doit emprunter le même chemin réseau que le client qu'il simule** (§ 7.11, piège 6). |
| La paire ES256 se génère avec `scripts/jwt-es256.mjs` (§ 7.10) | **Inutilisable en pratique** : le script suppose un terminal avec Node, or tout le développement se fait en ligne (§ 10.1) — la contrainte la plus structurante du dossier, oubliée au moment d'écrire l'outil. La paire est générée dans la **console du navigateur** par `crypto.subtle`, ce qui satisfait mieux la doctrine de départ : la clé privée naît sur le poste et ne passe ni par ce dépôt public, ni par une capture, ni par une conversation. Le script reste valable pour qui dispose d'un terminal. |
| `recipes.has_hero_image` est une colonne ordinaire, insérable comme les autres (§ 7.11, mesuré via `information_schema.columns`) | **Incomplet.** La requête ne lisait que `column_default`, jamais `is_generated` : c'est une colonne **générée** (`GENERATED ALWAYS AS … STORED`), que PostgreSQL refuse en écriture directe (`cannot insert a non-DEFAULT value into column`). Sans conséquence pour le critère 5 — il suffisait de l'omettre de l'insertion de test — mais une leçon générale : une colonne `NOT NULL` sans `column_default` visible n'est pas forcément « à fournir soi-même », elle peut être générée. |
| Le verdict d'un workflow de migration est un garde-fou | **Trois fois rouge par construction le 11/09** (§ 7.14). Un critère écrit pour un seul état du système — cible vierge, cible fraîchement chargée — devient un faux négatif dès qu'on rejoue. Un contrôle doit énoncer l'état dans lequel il est valable, sinon il coûte, en pleine fenêtre, le temps de démontrer qu'il se trompe. |
| `truncate auth.identities, auth.users cascade` ne vide que ces deux tables | **La cascade sort de `auth`.** `public.profiles.id` référence `auth.users` : le truncate emporte `profiles`, et de proche en proche tout `public`. Sans effet dans l'ordre du C3 (les données arrivent après), destructeur ensuite — ce mode ne doit plus jamais être rejoué une fois le site basculé (§ 7.14). |
| `GOTRUE_SMTP_MAX_FREQUENCY=60`, relevé du panneau Supabase | **`60s`.** C'est un `time.Duration` : `envconfig` refuse la valeur nue et GoTrue s'arrête au démarrage, l'équilibreur servant une page d'erreur qui ne dit rien de la cause. Le panneau Supabase affiche « 60 » sous un libellé en secondes — l'unité est perdue à la lecture (§ 7.14). |
| Retirer AWS SES, c'est changer le code (§ 7.9 bis) | **Incomplet** : les variables Vercel sont restées sous leurs anciens noms `SES_SMTP_*`, et l'envoi d'e-mail est tombé le jour de la bascule. Le test Brevo qui avait validé le fournisseur tournait sur le code d'avant la PR. Une PR qui renomme une variable d'environnement doit nommer le geste côté hébergeur (§ 7.14). |
| Changer la valeur d'une variable Vercel est un geste anodin | **Faux pour un `NEXT_PUBLIC_*` de type `Secret`** : Vercel refuse désormais cette combinaison, et un secret enregistré ne se convertit pas en place — il faut supprimer puis recréer en `Config` (§ 7.14). |
| Remplacer Supabase par GoTrue + PostgREST derrière nginx suffit à servir l'API | **Il manquait CORS.** Supabase ne fournissait pas qu'une base : sa passerelle posait les en-têtes `Access-Control-*`. Sans eux, tout le chemin navigateur → API tombe — favoris, votes, écritures de `useMutation` — alors que les lectures serveur, la connexion e-mail et la connexion Google continuent de fonctionner. Le trou n'était nulle part dans ce dossier (§ 7.14). |
| Un `fetch` de vérification depuis la console prouve que l'API répond | **Pas s'il part de la même origine.** Les essais joués depuis `auth.jepatisse.com` ne déclenchent aucun préflight : ils ne touchaient pas le chemin cassé. Un test doit emprunter l'origine réelle du client qu'il simule — même famille que le `psql -h 127.0.0.1` du § 7.11. |
| L'étape 10 du § 7.13 se joue pendant le gel | **Infaisable** : `MAINTENANCE_FREEZE` renvoie 503 sur toute page, sans exemption. Les sondes `/api/*` (hors `matcher`) couvrent la lecture sous gel ; le reste impose de lever le gel et d'être le premier visiteur (§ 7.14). |
| Une sonde `/api/*` qui rend `200` prouve que la lecture fonctionne | **Non** : `lib/search.ts` avale ses erreurs (`console.error` puis `return []`). Un `200 {"items":[]}` ne distingue pas « aucun résultat » de « la base a refusé ». Le vrai message est dans les journaux d'exécution Vercel (§ 7.14). |
| L'endpoint de stockage `pub2` avait été retenu « par déduction / lecture d'écran » (§ 8, 05/09) | **Explication incomplète.** La vraie cause est `OS_REGION_NAME` : le catalogue contient plusieurs régions, chacune avec son endpoint de stockage. `dc4-a` (la région *compute* du § 10.2) mène à pub2, où les conteneurs du projet n'existent pas. Trois clients, trois résultats : `openstack` et Horizon → pub2, `swift` selon sa région, l'application → pub1 (§ 7.15). |
| Le PITR se fera avec `wal-g`, « une demi-journée » (§ 4.5) | **Ni l'outil ni la durée.** Les binaires wal-g sont liés à la glibc, le conteneur est en Alpine/musl : c'est **pgBackRest** qui a été retenu, packagé par Alpine. Et la matinée est passée sur les endpoints de stockage, pas sur l'outil (§ 7.15). |
| Un réglage PostgreSQL se pose dans `postgresql.conf` | **Pas sur cette plateforme.** `/etc/postgresql/` n'est pas un volume déclaré : un réglage y disparaîtrait au redéploiement. `ALTER SYSTEM` écrit dans `postgresql.auto.conf`, **dans le répertoire de données**, seul chemin persistant — et il faut le rôle `supabase_admin`, `postgres` n'étant pas superutilisateur (§ 7.15). |
| Un conteneur Docker de Virtuozzo peut exécuter une tâche planifiée | **Faux** : pas de démon cron, et le menu du calque n'offre aucun planificateur — Jelastic n'en propose que pour ses piles natives. La sauvegarde complète périodique reste à construire autrement (§ 7.15). |
| pgBackRest en « repo host » est la seule voie de planification qui ne soit pas un contournement | **Arbitrage inversé le 12/09.** Le repo host suppose une configuration côté nœud Équilibrage qui ne vivrait dans aucun volume déclaré — effacée au premier redéploiement, exactement le défaut qu'on reproche par ailleurs à `pgbackrest` lui-même. `pg_cron` range la planification dans `cron.job`, dans le répertoire de données : c'est la seule des trois voies qui survive à un redéploiement. « Détourner un mécanisme SQL » était le moindre défaut (§ 7.15). |
| Les piles natives de Jelastic offrent un planificateur de tâches, contrairement au calque Docker (§ 7.15) | **Faux sur cette offre.** Le seul « scheduler » proposé aux add-ons d'un nœud natif est **Env Start/Stop**, qui met l'environnement en veille et le réveille — l'installer en croyant y gagner un cron programmerait l'extinction du site. Aucun planificateur de tâches nulle part : les deux crons applicatifs passent donc par un workflow GitHub Actions, seul mécanisme qui survive à l'infrastructure et dont l'échec se voie (§ 7.16). |
| « A et C atterrissent sur la même plateforme, donc application et base colocalisées » (§ 7.3) | **Pas dans le même environnement.** Le moteur d'un environnement Jelastic est figé à sa création, et celui de `jepatisse` est verrouillé par l'image Docker `supabase/postgres` occupant l'étage applicatif : les piles natives y sont grisées. Application et base partageront la plateforme et la région, pas l'environnement — ce qui protège au passage la base d'un redéploiement applicatif, le geste le plus fréquent du site (§ 7.16). |
| Le module Let's Encrypt étant proposé sur un environnement Node.js natif, le TLS y est réalisable | **Non — il n'a rien à configurer.** Un nœud applicatif natif n'embarque aucun serveur web : après installation, seul le port applicatif écoutait, rien en 443. Le port 80 ne répondait que par la redirection `nft` de la pile, qui n'a pas d'équivalent en 443. **La présence d'un module dans la liste ne dit pas qu'il a de quoi travailler** — ce risque, identifié avant la bascule, a été écarté à tort en voyant le module proposé, au lieu de vérifier ce qui écoutait sur 443 (§ 7.16). |
| Les `NEXT_PUBLIC_*` sont « inlinées au build », donc un changement impose une reconstruction — et rien d'autre | **Elles comptent aux deux moments.** Inlinées pour le bundle **navigateur**, mais le code **serveur** relit `process.env` à l'exécution. D'où deux pannes distinctes et silencieuses : bonne au build mais absente du panneau → le rendu serveur régénère avec l'ancienne valeur ; absente au build → le bundle fige `undefined` et le navigateur lève une exception, sans aucune erreur côté serveur. Le contrôle qui vaut est fonctionnel (`curl` sur une page qui en dérive), jamais un `grep` sur le bundle (§ 7.16). |
| `pm2 restart --update-env` recharge les variables du panneau | **Il propage l'environnement du shell appelant.** Depuis une session ouverte avant la modification, il repropage l'ancienne valeur avec toutes les apparences d'avoir agi. Ouvrir une session neuve, ou redémarrer le nœud (§ 7.16). |
| Un nœud Virtuozzo sans connectivité sortante est un défaut de la plateforme, à porter au support | **C'est un ordre d'opérations.** Une IP publique **ajoutée après** la création d'un nœud ne recâble que l'entrant : le sortant reste muet, sans message. Posée **dès l'écran de création**, tout fonctionne immédiatement. Isolé en comparant avec un équilibreur de même type et à IP publique, qui sortait très bien. Le ticket support était rédigé et serait parti pour rien (§ 7.16). |
| `pg_ctl -D <répertoire>` désigne le répertoire de données de l'instance qu'on démarre | **Pas si `postgresql.conf` porte `data_directory`** — et celui de cette image le porte (ligne 42, vers `/var/lib/postgresql/data`). La directive du fichier l'emporte sur `-D`. Une instance de restauration d'essai démarrée sans `-c data_directory=…` aurait tourné sur la base **vivante** (§ 7.15). |
| Une sauvegarde restaurable se déduit d'un `backup` réussi | **Non** : elle se joue. La restauration du 12/09 est ce qui a prouvé `archive-get`, c'est-à-dire la moitié de la chaîne qu'un `archive-push` vert ne dit rien de (§ 7.15). |
| Un dépôt de photo qui échoue en « CORS Missing Allow Origin » désigne une panne de configuration CORS | **Pas forcément.** Un refus de signature TempURL (401) sort du middleware `tempurl`, **avant** le contrôleur d'objet qui pose les en-têtes CORS de la réponse — le navigateur affiche alors un refus CORS, jamais le 401 réel. La cause était `SWIFT_TEMPURL_KEY_PHOTOS` désynchronisée entre le nœud Virtuozzo et le conteneur, le CORS du conteneur étant, lui, correctement posé depuis le 05/09 (§ 7.17). |

---

## 9. Références

- `docs/audit-egress-supabase.md` — audit egress du 25/08/2026, dont ce
  document prolonge les constats sur les images.
- `docs/note-regression-cache.md` — doctrine de cache des référentiels.
- `DEPLOY.md` — configuration Vercel actuelle, dont la région de Francfort et
  sa justification (§ 4.1).
- PR #201 — correctif `crossOrigin` et workflow CORS Object Storage.
- PR #205 — ce document.
- PR #207 — correctif § 5.1 (portées de lecture) et mise à jour du prix.
- PR #209 — mode opératoire du lot 0-bis et ses deux workflows (§ 7.2).

---

## 10. Reprendre ce dossier

Ce chantier se mène sur plusieurs sessions de travail et plusieurs semaines.
Cette section porte ce qui, sans elle, se perdrait entre deux : l'état réel des
comptes, ce qui est déjà en place, et la contrainte de travail qui a orienté
toute l'architecture.

### 10.1 La contrainte qui a tout décidé

**Le développement se fait exclusivement en ligne, sans terminal local.**

C'est l'information la plus structurante du dossier, et la moins évidente à
deviner en lisant le reste. C'est elle qui fait préférer un PaaS piloté depuis
une interface web à une instance nue en SSH (§ 4.2), elle qui a fait passer la
configuration CORS par un workflow GitHub Actions plutôt que par un `swift post`
en ligne de commande (§ 3.1), et elle qui doit trancher tout arbitrage
ultérieur entre deux solutions techniquement équivalentes.

Corollaire : **toute procédure écrite ici doit être exécutable depuis un
navigateur** — console web du fournisseur, éditeur SQL, onglet Actions de
GitHub. Une procédure qui suppose `psql` ou `docker compose` sur un poste n'est
pas applicable telle quelle.

### 10.2 État des comptes et ressources

| Élément | Valeur |
|---|---|
| Organisation Infomaniak | « Je pâtisse », ID 23470 |
| Projet Public Cloud | `PCP-BXPGU6A` |
| Utilisateur OpenStack | `PCU-BXPGU6A` (Horizon n'accepte pas les identifiants du compte Infomaniak) |
| Région | `dc4-a` |
| Endpoint stockage objet | `s3.pub1.infomaniak.cloud` (corrigé le 05/09, § 8 — `pub2` était faux) |
| Crédit d'essai Public Cloud | 300 € jusqu'au **31/12/2026**, facturation ensuite |
| Projet Supabase | `acbabqolghhyxksouaye`, région Francfort |

### 10.3 Ce qui est déjà en place

- **Conteneur `test-photos`** dans le Public Cloud, deux photos de test, accès
  public **et CORS configuré et vérifié** (§ 3.1). Ne pas le refaire.
- **Sept secrets GitHub `OS_*`** (`OS_AUTH_URL`, `OS_PROJECT_NAME`,
  `OS_USERNAME`, `OS_PASSWORD`, `OS_REGION_NAME`, `OS_USER_DOMAIN_NAME`,
  `OS_PROJECT_DOMAIN_NAME`) déjà renseignés. Ne pas les redemander.
- **Workflow `.github/workflows/object-storage-cors.yml`**, sur `main`,
  rejouable sur n'importe quel conteneur.
- **`lib/images.ts`** pose déjà `crossOrigin = 'anonymous'` (§ 3.1).
- **Le § 5.1 est corrigé et déployé** (PR #207) : `getRecipeFull` prend une
  portée `lecture` / `edition` / `texte`. Ne pas le refaire.
- **Le projet `test-migration`** du Public Cloud est à supprimer une fois le
  prototypage terminé, avant le 31/12/2026.
- **Le prix est mesuré** (§ 4.5) : inutile de consommer des jours d'essai pour
  l'obtenir. Seul manque le tarif au Go du stockage objet, facturé à part.
- **Les deux workflows du lot 0-bis** sont écrits et commentés :
  `.github/workflows/migration-dump-schema.yml` (dump seul, se joue **avant**
  l'essai) et `.github/workflows/migration-restauration-repetition.yml` (dump +
  restauration + inventaire + verdict). Mode opératoire complet en § 7.2.
- **Les quatre secrets du lot 0-bis ont été créés, utilisés, puis supprimés**
  le 05/09 : `SUPABASE_DB_URL` (source) et `VZ_PG_HOST` / `VZ_PG_PORT` /
  `VZ_PG_PASSWORD` (cible). Un secret sans usage est une surface d'attaque sans
  contrepartie. **Le lot C devra les recréer** — la forme exacte est en § 7.2
  phase 0, et le signe qui distingue les trois chaînes de connexion Supabase y
  est écrit noir sur blanc, c'est le piège qui a coûté un premier lancement.
- **L'environnement d'essai `mc-restore-test` est supprimé**, Endpoint compris.
  Le mot de passe de la base Supabase n'a **pas** été renouvelé : il n'est
  jamais apparu en clair (GitHub masque les secrets dans les journaux), et le
  secret qui le portait n'existe plus. À renouveler par hygiène si l'occasion se
  présente, sans urgence.
- **Les jours d'essai Virtuozzo restants** n'ont pas été consommés par le lot
  0-bis : tout s'est joué en une matinée du 05/09, la phase 0 ayant absorbé
  hors chrono les trois faux départs (§ 7.4).
- **Lot B, B0-B1 et le B2 COMPLET en place** (§ 7.5) : conteneurs `jp-photos`
  (public, CORS posé) et `jp-contact` (privé), mécanisme **Swift TempURL**
  vérifié par sonde, `lib/storage.ts` / `lib/storage-data.ts` /
  `lib/storage-client.ts` écrits et testés, route
  `/api/stockage/televersement` (ouverte à un appelant SANS session pour le
  seul usage `contact`, protégée par la même chaîne anti-spam que
  `/api/contact`), dix écrans/routes basculés (`BannerManager`,
  `PartnersManager`, `BlogEditor`, `CreerForm`, `RelectureEditor`,
  `RecipeImageBackfill`, `ProfileHeader`, `BatchReview`, `ContactForm`,
  `ContactDetail`/`MaDemandeDetail`), lecture re-signée à quatre endroits
  (`signerPhotoContact`, `lib/contact-data.ts`). **Les trois variables
  d'environnement sont posées sur Vercel** (`SWIFT_STORAGE_URL`,
  `SWIFT_TEMPURL_KEY_PHOTOS`, `SWIFT_TEMPURL_KEY_CONTACT`) et les mêmes clés
  existent en secrets GitHub. Sans elles, la route de présignature (B2) ET
  le dépôt serveur direct (B3) échouent à l'exécution (`env()` lève), pas à
  la compilation — à reposer telles quelles le jour de la bascule vers
  Virtuozzo (lot A).
- **Piège opérationnel sur les clés TempURL, payé une fois** : changer le
  secret GitHub (ou la variable Vercel) **ne pose rien** sur le conteneur.
  C'est `object-storage-tempurl-cles.yml` qui écrit la clé côté stockage —
  toute rotation exige donc trois gestes coordonnés (secret GitHub, variable
  Vercel, workflow rejoué), sans quoi la signature est calculée avec une clé
  que le conteneur ne connaît pas et tout dépôt tombe en 401. Le diagnostic
  `object-storage-diagnostic-signature.yml` compare précisément ces deux
  valeurs, par empreinte, quand le doute revient.
- **Lot B3 fait ET exécuté le 05/09** (§ 7.6) : `lib/backfill.ts` (dix
  cibles, pur) / `lib/backfill-data.ts` (dépôt direct serveur + clé
  service_role) / route `POST /api/admin/backfill-photos` / écran
  `StorageBackfillManager` (`/admin/photos`). **Passé en production sur les
  onze cibles** : 365 objets déposés, plus aucune data-URL dans les colonnes
  mesurées au B0.
- **B4, partie 1/2 (vérification) faite le 05/09** (§ 7.7) : bouton
  « Vérifier » sur le même écran, relit chaque URL déjà migrée et signale
  ce qui ne répond plus. **Correction à connaître** (§ 8) : le B3 écrase la
  data-URL dès le dépôt réussi, sans relecture intermédiaire — il n'y a donc
  plus de data-URL à « nettoyer » pour les colonnes déjà migrées, la
  vérification ne fait que détecter après coup un objet devenu illisible,
  sans pouvoir revenir en arrière.
- **B4, partie 2/2 (réconciliation des orphelins) faite ET exécutée le
  05/09** (§ 7.8) : `.github/workflows/object-storage-reconciliation.yml` +
  `.github/scripts/reconcilier_stockage.py`, lancée en rapport à sec sur les
  deux conteneurs — 355/355 et 10/10, **0 orphelin**. Le secret GitHub
  `SUPABASE_SERVICE_ROLE_KEY` est posé. Le mode `confirmer_suppression`
  n'a jamais servi et n'a pas eu à servir.
- **Trois workflows de diagnostic** ajoutés en cours de mise en service, à
  garder pour le lot A/C (mêmes questions se reposeront sur un autre
  hébergement) : `object-storage-afficher-url.yml` (racine réelle rendue par
  `swift auth`), `object-storage-diagnostic-signature.yml` (compare la clé
  du secret à celle du conteneur, et essaie les douze formes de signature),
  et le rapport à sec de la réconciliation.
- **`lib/contact-types.ts` et `lib/ses-types.ts` sont devenus redondants** : ils
  déclaraient à la main des tables absentes de `lib/database.types.ts`, qui y
  sont depuis la régénération du 05/09. Nettoyage possible, sans urgence —
  `npm run typecheck` passe en l'état.
- **Le dépôt est public**, et ça a valeur de contrainte : journaux et artefacts
  de workflow y sont téléchargeables par n'importe qui. Aucun workflow de
  migration ne doit déposer un dump en artefact ni l'afficher (§ 7.2).

### 10.4 Où en est la migration

**Le lot C est TERMINÉ** — bascule exécutée le 11/09/2026 :
`dev.jepatisse.com` tourne sur la base Infomaniak (Virtuozzo Cloud), GoTrue
auto-hébergé et PostgREST derrière `auth.jepatisse.com`. Les mesures de
clôture, les sept trouvailles de l'exécution et ce qui reste à faire sont au
**§ 7.14** — à lire avant toute reprise.

**Sauvegarde et PITR : posés et ÉPROUVÉS le 12/09 avec pgBackRest**
(§ 7.15) — archivage continu vers le stockage objet, une sauvegarde complète,
et une **restauration réellement jouée** : WAL rejoués depuis S3, décomptes
identiques à la production, dépôt non pollué. L'Endpoint temporaire a été
fermé.

**Planification : posée le 12/09 avec `pg_cron`** (§ 7.15) — sauvegarde
complète quotidienne à 3 h 30 GMT, portée par `cron.job` dans le répertoire de
données, vérifiée par un job d'essai avant d'être retirée. C'était le dernier
manque nommé du dispositif PITR.

**Il reste un manque nommé** : `pgbackrest` est un paquet `apk`, effacé par
tout redéploiement du nœud Postgres — la tâche planifiée échouerait alors
chaque nuit sans autre trace que `cron.job_run_details`, table que rien ne
signale à consulter. Exposer la fraîcheur de la dernière sauvegarde par une
route `/api/cron/*` reste à construire.

**Le lot A est instruit et planifié** (§ 7.16, 12/09) : reconnaissance faite
sur la plateforme, trois décisions structurantes arrêtées — nouvel
environnement en pile Node.js 22.x native, crons portés par GitHub Actions,
déploiement Git construisant sur le nœud. **Rien n'est encore créé.**

**La phase 0 est franchie et la bascule de `dev.jepatisse.com` est faite**
(§ 7.16, 12/09) : l'environnement `jepatisse-app` sert l'application, les
34 variables sont posées, le DNS pointe sur Virtuozzo et **le HTTP répond de
bout en bout**. Un nœud Équilibrage NGINX a été ajouté, son chaînage interne
vérifié.

**Le HTTPS fonctionne depuis le 13/09** : `https://dev.jepatisse.com` répond 200
avec un certificat Let's Encrypt valide. Le blocage de la veille n'était pas un
défaut de plateforme mais un ordre d'opérations — **une IP publique ajoutée
après la création d'un nœud lui coupe sa sortie réseau** ; posée dès la
création, tout fonctionne du premier coup (§ 7.16).

**Vérification fonctionnelle en cours** (§ 7.17, 13/09) : connexion e-mail et
Google OK. Le dépôt de photo, en échec apparent CORS, était en réalité une
clé TempURL désynchronisée entre le nœud et le conteneur — **résolu** par
rotation complète. **Reste ouvert** : le mot de passe oublié (GoTrue renvoie
500 sur `/auth/v1/recover`, cause non encore établie — le journal du nœud
GoTrue **216114** reste à lire), une route IA (import copier/coller), et le
lien « en tant que » (jamais vu fonctionner depuis sa correction à l'aveugle,
PR #259). Puis le décommissionnement de Supabase — en vérifiant d'abord si
l'ancienne base porte ses propres tâches `pg_cron` avant de la couper.

Ce qui suit décrit le plan du lot C tel qu'il a été conçu, et reste utile pour
comprendre pourquoi il a cette forme.

**Le lot 0-bis est terminé, et c'est un GO** (§ 7.4). **Le lot B est
TERMINÉ**, écrit *et* exécuté en production le 05/09 (§ 7.5 à § 7.8) :
mesure exhaustive, conteneurs, CORS, sonde du mécanisme de signature,
socle TempURL, bascule complète des écritures (des trois écrans à faible
enjeu au `contact_*` anonyme sur conteneur privé), reprise des images déjà
en base, vérification a posteriori, et réconciliation des orphelins.

**Résultat mesuré, les deux conteneurs réconciliés :**

```
jp-photos  : 355 objets · 355 clés référencées · 0 orphelin
jp-contact :  10 objets ·  10 clés référencées · 0 orphelin
```

Plus aucune image en data-URL dans les onze cibles du B0. La cause
dominante d'egress identifiée au § 4.6 est donc traitée à la source — ce
qui était la **priorité 1** du § 7.1.

**Mise en service : quatre hypothèses fausses, écartées une à une.** Le
premier dépôt réel a échoué en 401, et il a fallu quatre tours pour en
sortir — clé désynchronisée, mauvais hôte (`pub2` au lieu de `pub1`),
préfixe `/object` cru superflu, et enfin la forme de la signature. Les
quatre sont consignées au § 8, et deux enseignements de méthode en
ressortent :
- **ce qu'un cluster déclare accepter ne dit pas sous quelle forme
  l'envoyer** — `allowed_digests` avait bien été lu au B0, et n'a pourtant
  rien empêché ;
- **arrêter de modifier la configuration à l'aveugle** dès la deuxième
  hypothèse fausse : c'est un diagnostic qui mesure le cluster
  (`object-storage-diagnostic-signature.yml`, douze combinaisons) qui a
  tranché en une exécution ce que trois tours de tâtonnement n'avaient pas
  réglé.

**La prochaine action est le lot C** — la migration de la base elle-même
vers Virtuozzo Cloud, dont le lot 0-bis a validé la faisabilité (949
objets restaurés sur 949, zéro erreur). **Son découpage et son C0 sont en
§ 7.9** : les clés JWT asymétriques survivent à l'auto-hébergement (le
risque majeur, écarté), le port 5432 n'a jamais à être exposé en
production, et `COMING_SOON` sert de fenêtre de maintenance qui rend la
bascule réversible. Le mode opératoire de la restauration reste celui du
§ 7.2 ; les quatre secrets qu'il réclame ont été supprimés après usage et
sont à recréer (§ 10.3).

**Les mesures du C0 sont prises** (§ 7.9) : la base est passée de 57 à
**27 Mo**, les colonnes image de `recipes` ne pèsent plus que **20 ko** — le
lot B n'a rien laissé derrière. **L'essai Virtuozzo a démarré le 05/09 : il
expire le 19/09**, seule échéance dure du lot C.

**La rétention d'`imports` est en place** (§ 7.9) : 30 jours depuis la
dernière activité, purge en quatrième passe du cron des abonnements,
annoncée au membre dans « Mes imports ».

**Le lot C est franchi — les cinq critères de Go/No-Go au vert** (§ 7.11).
L'environnement `jepatisse` tourne à Genève, le DDL y est restauré à
**951 objets sur 951**, GoTrue v2.196.0 a hissé le schéma `auth` jusqu'à
`20260625000000` (**77 migrations, identique à la production**), les
**6 comptes / 7 identités** ont été transférés avec des **empreintes md5
identiques des deux côtés**, et PostgREST fait respecter la RLS de bout en
bout. `https://auth.jepatisse.com` est servi en TLS par le nœud Équilibrage,
qui tient le rôle de Kong sur `/auth/v1/` et `/rest/v1/`.

| Critère | Preuve |
|---|---|
| 1 — registre de migrations | `77 / 20260625000000` |
| 2 — e-mail + mot de passe | `access_token` portant les deux identités du même `user_id` |
| 3 — Google, bout en bout | comptes et identités **inchangés** (6 / 7), `last_sign_in_at` avancé |
| 4 — signature asymétrique | `{"alg":"ES256","kid":"mc-es256-2026-09"}` et JWKS conforme |
| 5 — PostgREST + RLS | brouillon invisible en anonyme, publié visible |

Tout cela a dû être **rechargé une fois** au palier 3 : un redéploiement du
nœud Postgres sans volume déclaré avait effacé la base (§ 7.11, piège 5). La
reconstruction complète prend une heure et sa séquence est écrite.

**Un septième piège, découvert au palier 4** : le trigger `on_auth_user_created`
sur `auth.users` n'est couvert par **aucun** des deux outils de migration
d'origine — la restauration DDL s'arrête à `public`, le transfert d'identités
se cantonne à `auth.users`/`auth.identities` par doctrine de sécurité. Sans
lui, les comptes migrés s'authentifient mais n'ont aucune ligne `profiles` :
`getProfile()` y rendrait `null`. **Réglé pour la vraie bascule** : le
workflow `migration-donnees-c3.yml` (§ 7.12) le recrée lui-même comme dernier
geste, sa définition lue sur la source et jamais affichée. `jepatisse` a été
remis dans l'état que ce workflow attend le 11/09 — trigger et 6 profils
supprimés, `auth.users` inchangée à 6 comptes.

**La préparation du C3, entièrement close le 11/09** : conversion de l'essai
en payant, workflow de chargement des données écrit et fusionné, clés `anon`
et `service_role` frappées et éprouvées (`anon` → 1 recette visible,
`service_role` → 2 — RLS respectée pour l'une, contournée pour l'autre),
SMTP basculé sur Brevo et testé deux fois en réel (§ 7.9 bis), `jepatisse`
remis à l'état attendu. **Rien ne reste à préparer hors chrono avant la
bascule elle-même.**

**Trois choses à ne pas perdre entre deux sessions** :
- **`GOTRUE_SITE_URL` porte une valeur de test** (`https://auth.jepatisse.com/auth/v1/health`)
  et doit reprendre `https://dev.jepatisse.com/` à la bascule — la laisser
  ainsi renverrait les membres sur une page de santé après connexion ;
- le **TTL du CNAME est à 300 s**, à remonter une fois la bascule éprouvée ;
- l'**Endpoint `pg-migration-temporaire`** est toujours ouvert : sa suppression
  fait partie de la définition de terminé du lot C (§ 7.9). Contrainte à ne pas perdre de vue — **le dump des identités ne peut
pas passer par un artefact GitHub** : il porte des adresses e-mail et des
empreintes bcrypt, sur un dépôt public.

**Point resté ouvert, à ne pas perdre** : `BlogEditor.insertImage()` écrit une
data-URL dans `articles.content` (jsonb), hors périmètre de la bascule par
colonne — non traité (§ 7.5).

**À faire avant d'oublier** : supprimer l'environnement `mc-restore-test` et son
Endpoint (§ 7.2 phase 4), et faire tourner le mot de passe de la base Supabase,
qui a transité par un secret GitHub.

*Ce qui suit décrivait l'action d'avant, conservé pour le raisonnement qui l'a
cadrée.* Le lot 0-bis était à mener pendant l'**essai 14 jours de Virtuozzo
Cloud**. Le prix, lui, est mesuré (§ 4.5) : rien n'oblige à consommer des jours
d'essai pour l'obtenir.

**Le mode opératoire est écrit, phase par phase, en § 7.2** — s'y reporter
plutôt que de le reconstruire. Il commence par une phase 0 qui se joue
**avant** de commander l'essai : elle vaut à elle seule un jour de chrono
économisé, et elle échoue gratuitement.

Rappel de priorité (§ 7.1) : le **lot B** — photos vers le stockage objet —
passe devant la migration elle-même. C'est lui qui traite la cause des alertes
de dépassement, et il ne dépend d'aucun fournisseur.

**Deux objectifs seulement pendant l'essai** : la répétition de restauration, et
le prix au simulateur (§ 4.5). Les lots A, B et C n'y rentrent pas et n'ont pas
à y rentrer.

**Le test se fait sur un `pg_dump --schema-only`.** Ce qu'on vérifie — 320
policies, 252 fonctions, 25 triggers — est du DDL : aucune donnée n'est
nécessaire pour savoir si la restauration passe. C'est plus rapide, et ça évite
de poser les e-mails et les noms des 7 comptes sur un environnement d'essai
temporaire. La restauration des données se testera au lot C, sur l'environnement
définitif.

### 10.5 Amorcer une nouvelle session

Le contexte utile vit dans le dépôt, pas dans l'historique de conversation :
`CLAUDE.md` pour la doctrine du projet, ce document pour le chantier. Un premier
message suffit :

> Lis `docs/migration-infomaniak.md`. Je démarre l'essai 14 jours de Virtuozzo
> Cloud chez Infomaniak. On attaque le lot 0-bis : la répétition de
> restauration.

**Un point de méthode à connaître** : `www.infomaniak.com`, `docs.infomaniak.cloud`
et `s3.pub2.infomaniak.cloud` ont longtemps été bloqués par la politique réseau
des sessions, ce qui a obligé à décrire les procédures Infomaniak en termes
génériques plutôt qu'écran par écran. Ces domaines ont depuis été autorisés — une
session ouverte **après** ce changement peut lire leur documentation directement,
et devrait le faire plutôt que de deviner les libellés d'interface.
