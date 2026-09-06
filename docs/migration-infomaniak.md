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
l'archivage WAL (`wal-g`) représente une demi-journée. Il appartient à la
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
| **C2** | Infrastructure : nœuds Postgres, PostgREST, GoTrue ; SMTP via SES (déjà en place) ; OAuth Google ; clés JWT asymétriques | Environnement reproductible, sans bascule |
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

#### Inventaire des réglages à reporter (les valeurs restent à relever)

Noms extraits des sources de `supabase/auth` v2.196.0 (préfixe `GOTRUE_`,
`envconfig` en majuscules avec `_`). Un réglage oublié ne provoque pas
d'erreur : il change le comportement de l'authentification, silencieusement.

**Socle — sans équivalent dans le tableau de bord, à poser au C2 :**

| Variable | Contenu |
|---|---|
| `API_EXTERNAL_URL` | **obligatoire** — `https://auth.jepatisse.com` (§ exigence produit du C2) |
| `GOTRUE_DB_DATABASE_URL` | **obligatoire** — connexion PostgreSQL |
| `GOTRUE_DB_NAMESPACE` | schéma, défaut `auth` — à laisser tel quel |
| `GOTRUE_SITE_URL` | **obligatoire** — `https://www.jepatisse.com` |
| `GOTRUE_JWT_SECRET` / `_KEY_ID` / `_KEYS` | cf. la procédure ES256 ci-dessus |
| `GOTRUE_API_PORT` | défaut `8081` |

**À relever écran par écran dans Supabase → Authentication :**

| Écran | Variables correspondantes |
|---|---|
| Providers → Email | `GOTRUE_MAILER_AUTOCONFIRM`, `GOTRUE_DISABLE_SIGNUP`, `GOTRUE_MAILER_SECURE_EMAIL_CHANGE_ENABLED`, `GOTRUE_MAILER_OTP_EXP`, `GOTRUE_PASSWORD_MIN_LENGTH`, `GOTRUE_PASSWORD_REQUIRED_CHARACTERS`, `GOTRUE_PASSWORD_HIBP_ENABLED` |
| Providers → Google | `GOTRUE_EXTERNAL_GOOGLE_ENABLED`, `_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI` |
| Sessions | `GOTRUE_SESSIONS_TIMEBOX`, `GOTRUE_SESSIONS_INACTIVITY_TIMEOUT`, `GOTRUE_SESSIONS_SINGLE_PER_USER`, `GOTRUE_JWT_EXP` |
| URL Configuration | `GOTRUE_SITE_URL`, `GOTRUE_URI_ALLOW_LIST` |
| Emails → SMTP | `GOTRUE_SMTP_HOST`, `_PORT`, `_USER`, `_PASS`, `_ADMIN_EMAIL`, `_SENDER_NAME`, `_MAX_FREQUENCY` |
| Rate Limits | `GOTRUE_RATE_LIMIT_EMAIL_SENT` (défaut 30), `_VERIFY` (30), `_TOKEN_REFRESH` (150), `_OTP` (30), `_ANONYMOUS_USERS` (30) |
| Attack Protection | `GOTRUE_SECURITY_CAPTCHA_ENABLED` / `_PROVIDER` / `_SECRET`, `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED` (défaut **true**), `_REFRESH_TOKEN_REUSE_INTERVAL`, `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION` |

**Trois valeurs par défaut qui piègent si on ne les regarde pas :**

- `GOTRUE_SESSIONS_TIMEBOX` et `_INACTIVITY_TIMEOUT` sont des **pointeurs sans
  valeur par défaut** : non renseignés, les sessions **n'expirent jamais**. Le
  TTL réglé côté Supabase — celui dont dépend la fenêtre de révocation
  documentée dans `CLAUDE.md` — doit donc être reporté explicitement, sinon la
  contrepartie assumée de `getClaims()` passe de « quelques heures » à
  « jamais ».
- `GOTRUE_MAILER_AUTOCONFIRM` à `true` **supprime la confirmation d'adresse à
  l'inscription**. C'est un `false` par défaut, donc l'oubli va dans le bon
  sens — mais un report machinal depuis un `.env` d'exemple, non.
- `GOTRUE_SMTP_*` doit viser **SES**, déjà en production pour les
  notifications d'abonnement et le module contact (`lib/email.ts`). Pas de
  second fournisseur à introduire ici.

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
- **Le sous-domaine `auth.jepatisse.com`** est à réserver côté DNS dès la
  phase 0 : il conditionne l'exigence produit du C2 ci-dessus et la
  déclaration des URI de redirection Google, qui doit précéder la bascule.
- **La paire ES256** (`GOTRUE_JWT_KEYS`) se génère hors ligne, et le jeu de
  clés doit contenir **aussi** le secret symétrique actuel.
- **Les quatre secrets GitHub du lot 0-bis sont à recréer** (§ 10.3) — dont le
  mot de passe de la base Supabase, qui n'a toujours pas été renouvelé depuis.
  L'occasion de le faire est ici : le recréer d'abord, l'enregistrer ensuite.

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

### 10.4 Prochaine action — le lot C (migration de la base)

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

**La prochaine action est la phase 0 du C1 (§ 7.10)** : trois lectures SQL à
prendre, la version de GoTrue à relever, le sous-domaine `auth.jepatisse.com`
à réserver, les quatre secrets du lot 0-bis à recréer. Et une contrainte à ne
pas manquer — **ce dump-là ne peut pas passer par un artefact GitHub** : il
porte des adresses e-mail et des empreintes bcrypt, sur un dépôt public.

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
