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
| Photos hors base → stockage objet | **Priorité 1** (§ 7.1). **B0 fait le 05/09** : 360 objets, 40 Mo, mécanisme de signature vérifié (§ 7.5). Reste B1-B4 |
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

- **7 identités** : 4 e-mail, 3 Google.
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

### 7.5 Lot B — découpage et décisions (B0, B1, B2 étapes 1-3 terminés le 05/09)

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
| **B2** | Bascule des écritures, par risque croissant | **Étapes 1-3 faites le 05/09** — reste étape 4 |
| **B3** | Reprise des ≈ 360 objets, **sans supprimer les data-URL** | À faire |
| **B4** | Nettoyage des data-URL après vérification + cycle de vie | À faire |

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

**On n'efface jamais une data-URL avant d'avoir relu l'objet distant** — d'où B3
et B4 séparés. C'est ce qui garde le chantier réversible jusqu'au dernier
moment.

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

#### Deux pièges déjà documentés, à ne pas perdre en route

Le § 5.2 en nomme deux qui mordront : **`lib/contact.ts:198` écarte une photo
non-`data:` sans erreur** — une photo migrée disparaîtrait en silence, et
`lib/contact.test.ts` verrouille ce comportement, à reprendre avec le contrat.
Et le **cycle de vie** : aujourd'hui la cascade FK supprime les images avec la
recette ; avec un bucket, les objets survivent aux lignes. **Le B1 a posé la
condition qui le rendra possible** — clés d'objet en UUID plutôt qu'adressage
par contenu, pour que la propriété d'un objet reste lisible — mais **le
mécanisme de réconciliation lui-même (lister, comparer aux références en base,
supprimer les orphelins de plus de 24 h) reste à écrire**, au B4.

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
| Endpoint stockage objet | `s3.pub2.infomaniak.cloud` |
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
- **Lot B, B0-B1-B2 étapes 1-3 en place** (§ 7.5) : conteneurs `jp-photos`
  (public, CORS posé) et `jp-contact` (privé), mécanisme **Swift TempURL**
  vérifié par sonde, `lib/storage.ts` / `lib/storage-data.ts` /
  `lib/storage-client.ts` écrits et testés, route
  `/api/stockage/televersement`, huit écrans/routes basculés
  (`BannerManager`, `PartnersManager`, `BlogEditor`, `CreerForm`,
  `RelectureEditor`, `RecipeImageBackfill`, `ProfileHeader`, `BatchReview`).
  **Reste à poser les deux secrets `SWIFT_TEMPURL_KEY_PHOTOS` /
  `SWIFT_TEMPURL_KEY_CONTACT` et la variable `SWIFT_STORAGE_URL`** — sans eux,
  la route de présignature échoue à l'exécution (`env()` lève), pas à la
  compilation.
- **`lib/contact-types.ts` et `lib/ses-types.ts` sont devenus redondants** : ils
  déclaraient à la main des tables absentes de `lib/database.types.ts`, qui y
  sont depuis la régénération du 05/09. Nettoyage possible, sans urgence —
  `npm run typecheck` passe en l'état.
- **Le dépôt est public**, et ça a valeur de contrainte : journaux et artefacts
  de workflow y sont téléchargeables par n'importe qui. Aucun workflow de
  migration ne doit déposer un dump en artefact ni l'afficher (§ 7.2).

### 10.4 Prochaine action — le lot B2, étape 4

**Le lot 0-bis est terminé, et c'est un GO** (§ 7.4). **Le B0, le B1 et les
étapes 1-3 du B2 sont terminés** (§ 7.5) : mesure exhaustive, conteneurs, CORS,
arbitrages, sonde du mécanisme de signature, socle de signature TempURL,
bascule des trois écrans à faible enjeu (`BannerManager`, `PartnersManager`,
`BlogEditor`), du gros du chantier — `recipes` et `step_photos`
(`CreerForm`, `RelectureEditor`, `RecipeImageBackfill`), 35 Mo et 322 objets —
puis de `profiles` (`ProfileHeader`) et `comments.photo_urls` (`BatchReview`,
déposé avant l'appel à la route serveur qui écrit avec la clé service_role).

**La prochaine action est l'étape 4 du B2**, la dernière : `contact_*`, ce qui
suppose d'ouvrir l'usage `contact` fermé au B1 (route de présignature refusée
avec un 501) en réutilisant la chaîne anti-spam existante du formulaire
(piège, délai signé, limitation de débit comptée en base — cf. CLAUDE.md
« Contact et suivi Jira ») avant de la câbler au conteneur privé
`jp-contact`. Le § 7.5 porte le découpage complet et l'ordre du B2. Une fois
l'étape 4 posée, le B2 est terminé et le B3 (reprise des ≈360 objets déjà en
base) peut commencer.

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
