# Migration Vercel + Supabase → Infomaniak

Étude et vérifications préalables à la sortie de Vercel et de Supabase Cloud,
au profit d'une infrastructure hébergée chez **Infomaniak**, en Suisse. La
localisation dépend du produit : le Public Cloud est à Genève et Winterthour,
**Virtuozzo Cloud (ex-Jelastic) à Genève uniquement** (§ 4.3).

État au **04/09/2026**. Le lot 0 est terminé — prix compris (§ 4.5) — à la
seule exception de la répétition de restauration (§ 7.2). Les chiffres des
§ 2 et 4.5 sont des mesures réelles, pas des estimations.

**Motif du chantier** : l'empreinte écologique, avant le coût et avant la
souveraineté. C'est ce critère qui a désigné Infomaniak plutôt que Scaleway,
Clever Cloud ou Hetzner — datacenters en propre, 100 % d'énergie renouvelable,
récupération de chaleur revendue au réseau urbain, certifications ISO 14001 et
50001, infrastructure passée sous le contrôle d'une fondation en mai 2026.

---

## 0. Résumé

| Chantier | Verdict au 04/09/2026 |
|---|---|
| Images inutiles transportées (§ 5.1) | **Fait** — premier poste d'egress, corrigé sans migration |
| Photos hors base → stockage objet | **Validé de bout en bout**, CORS compris. **Priorité 2**, 7-10 j |
| Sortie de Vercel | **Faisable, 1-2 j** — couplage faible, sept accroches identifiées |
| Sortie de Supabase Cloud | **Débloquée** — Virtuozzo Cloud fournit PostgreSQL (§ 4). 5-8 j |
| Quitter l'API Supabase (PostgREST/GoTrue) | **Écarté** — réécriture de fond, § 1.3 |
| Coût de la cible | **Mesuré** : ≈ 16 €/mois avant l'ouverture, ≈ 28 € après (§ 4.5) |

**Deux faits structurants.** La base pèse **57 Mo** et compte **7 comptes** :
tout ce dossier a été réévalué à leur lumière, et plusieurs conclusions posées
avant de les connaître étaient fausses (§ 8). Et **les plans gratuits saturent
déjà**, sur un site non ouvert — la migration ne coûte donc pas plus cher que
la trajectoire actuelle, elle coûte moins (§ 4.6).

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

- **La restauration du dump Supabase n'a jamais été tentée** — c'est le seul
  Go/No-Go qui reste (§ 7.2).
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
| « Sur les plans gratuits, la migration ajoute un coût » | **Faux.** Les alertes de dépassement se déclenchent déjà : la trajectoire réelle est Vercel Pro + Supabase Pro, ~40 €/mois. Infomaniak à 16-28 € est **moins cher** (§ 4.6). |
| Le chantier photos est justifié par l'écologie et le coût futur | **Sous-estimé.** C'est la **cause** des alertes actuelles. Migrer sans le traiter déplacerait le problème (§ 4.6, § 7.1). |
| Le prix Virtuozzo est une estimation à confirmer | **Mesuré** au configurateur le 04/09/2026 : 1,13 € par cloudlet et par mois, soit 16 €/mois avant l'ouverture et 28 € après (§ 4.5). |

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
- **Le projet `test-migration`** du Public Cloud est à supprimer une fois le
  prototypage terminé, avant le 31/12/2026.

### 10.4 Prochaine action — le lot 0-bis

Le seul Go/No-Go qui reste (§ 7.2), à mener pendant l'**essai 14 jours de
Virtuozzo Cloud**. Le prix, lui, est mesuré (§ 4.5) : rien n'oblige à consommer
des jours d'essai pour l'obtenir.

Rappel de priorité (§ 7.1) : le **lot B** — photos vers le stockage objet —
passe devant la migration elle-même. C'est lui qui traite la cause des alertes
de dépassement, et il ne dépend d'aucun fournisseur.

**Deux objectifs seulement pendant l'essai** : la répétition de restauration, et
le prix au simulateur (§ 4.5). Les lots A, B et C n'y rentrent pas et n'ont pas
à y rentrer.

**Le test se fait sur un `pg_dump --schema-only`.** Ce qu'on vérifie — 320
policies, 252 fonctions, 31 triggers — est du DDL : aucune donnée n'est
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
