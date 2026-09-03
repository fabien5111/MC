# Migration Vercel + Supabase → Infomaniak

Étude et vérifications préalables à la sortie de Vercel et de Supabase Cloud,
au profit d'une infrastructure hébergée chez **Infomaniak** (Genève /
Winterthour).

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
| Sortie de Supabase Cloud | **Décalé** — PostgreSQL managé pas encore disponible chez Infomaniak (§ 4) |
| Quitter l'API Supabase (PostgREST/GoTrue) | **Écarté** — réécriture de fond, § 1.3 |

**Le fait structurant** : la base pèse **57 Mo** et compte **7 comptes**. Tout
ce dossier a été réévalué à la lumière de ces deux chiffres — plusieurs
conclusions posées avant de les connaître étaient fausses (§ 8).

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

**Ce qu'on perd** : les *preview deployments* par branche. Coolify sait les
recréer, à prévoir explicitement.

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

## 4. Le blocage PostgreSQL

**Au 03/09/2026, le Database Service d'Infomaniak ne propose que MySQL.**
PostgreSQL, MariaDB, OpenSearch et Redis sont annoncés « Bientôt disponible »,
sans échéance publiée.

MySQL n'est pas une option : la sécurité repose sur la RLS PostgreSQL, plus 252
fonctions, 320 policies, `pg_trgm`, `jsonb` et les colonnes générées. Ce serait
une réécriture du produit, pas une migration.

### 4.1 Les trois voies, et pourquoi une seule tient

**Attendre.** « Bientôt » n'est pas une date. À demander au support — c'est
l'information la moins chère du dossier — mais on ne planifie pas contre ça.

**Séparer la base du reste** (application et photos à Genève, PostgreSQL managé
à Paris ou maintenu sur Supabase à Francfort). **Écartée**, et pour une raison
inscrite dans `DEPLOY.md` : les fonctions ont été déplacées de Washington à
Francfort précisément pour coller à la base, parce qu'*« une page en enchaîne
plusieurs, dont certaines en série »*. Genève ↔ Paris ou Genève ↔ Francfort,
c'est ~10 ms d'aller-retour contre moins de 2 ms aujourd'hui. Cette voie
régresse exactement sur l'axe qui avait été optimisé.

**PostgreSQL auto-hébergé sur une instance Infomaniak.** La seule qui garde
application, base et stockage dans le même datacenter, chez le même hébergeur.

### 4.2 Pourquoi l'auto-hébergement est raisonnable ici

Cette voie avait d'abord été qualifiée de « repli à +2-3 jours avec
l'exploitation à votre charge ». Les chiffres de la § 2 changent le jugement :

- **57 Mo, 7 comptes.** Une sauvegarde `pg_dump` nocturne vers le bucket Object
  Storage — validé au § 3, CORS compris — prend quelques secondes et pèse
  quelques mégaoctets. Ce n'est pas une infrastructure de sauvegarde, c'est une
  ligne de cron.
- **Superutilisateur.** Tous les points de rupture redoutés d'un service managé
  — `BYPASSRLS`, `CREATE ROLE`, schéma `auth`, `unaccent`, `btree_gist` dans
  `public` — disparaissent. Ils n'existaient que parce qu'un managé bride ces
  droits.
- **Ce n'est pas une impasse.** Le jour où Infomaniak sort son PostgreSQL
  managé, passer de l'instance à leur service est un `pg_dump`/restore **dans
  le même datacenter**.
- **On est avant l'ouverture.** Seul moment où apprendre à exploiter un
  PostgreSQL coûte zéro.

Ce qui reste réellement à charge : sauvegardes (et leur **restauration
testée** — une sauvegarde jamais restaurée n'est pas une sauvegarde), absence
de haute disponibilité sur instance unique, correctifs de sécurité.

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

- **Échéance du PostgreSQL managé Infomaniak** — question posée au support.
- **Prix Infomaniak** — le calculateur n'a pas été consulté. Ordre de grandeur
  retenu : 45-85 €/mois pour instance + base + stockage objet, **à confirmer**.
- **La restauration du dump Supabase n'a jamais été tentée** — c'est le
  Go/No-Go réel (§ 7.2).
- **RGPD / nLPD** : la Suisse est hors UE mais couverte par une décision
  d'adéquation. Transfert licite, à documenter au registre, dans la politique
  de confidentialité et les mentions légales **avant l'ouverture**.
- **Pas de CDN à points de présence mondiaux** chez Infomaniak. Non-sujet pour
  un public francophone (Genève ≈ 10-25 ms), sujet réel pour une audience
  mondiale.
- **Le projet Vercel `dev_jp`** construit le même dépôt sur la même base. À
  trancher **avant** toute bascule, sinon deux applications écriront dans deux
  bases différentes.

---

## 7. Plan

### 7.1 Immédiat

E-mail au support Infomaniak : échéance du PostgreSQL managé, accès bêta ?
La réponse peut réordonner tout ce qui suit.

### 7.2 Lot 0-bis — répétition de restauration (1 j)

Le Go/No-Go a changé de nature, et y a gagné. Plutôt que de vérifier des
permissions une à une sur un service managé, on répète le lot C pour de vrai :

> Monter une instance Infomaniak, y installer PostgreSQL 15+ et GoTrue, puis
> **restaurer le dump Supabase** et vérifier que les 320 policies, les 252
> fonctions et les 31 triggers passent.

Ce test répond à toutes les questions d'un coup — extensions, rôles, schéma
`auth`, objets spécifiques à Supabase — et produit directement le mode
opératoire du lot C.

Ordre impératif : **rôles et extensions d'abord, schéma ensuite.**

```sql
-- Rôles supposés par les 320 policies
create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

-- Extensions, dans les schémas d'origine (cf. § 2.3)
create schema if not exists extensions;
create extension if not exists pg_trgm     with schema extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists unaccent    with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists btree_gist  with schema public;
```

### 7.3 Lots

| Lot | Contenu | Estimation | Dépendances |
|---|---|---|---|
| **A** | Vercel → instance Infomaniak | 1-2 j | Aucune |
| **B** | Photos → Object Storage | 7-10 j | Aucune |
| **C** | Base → PostgreSQL sur instance | 5-8 j | Lot 0-bis |

**Les lots B et C sont indépendants** (§ 8) : l'ordre est libre.

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
| Scénario « tout chez Infomaniak, base managée » | **Indisponible** : PostgreSQL managé pas encore sorti (§ 4). |

---

## 9. Références

- `docs/audit-egress-supabase.md` — audit egress du 25/08/2026, dont ce
  document prolonge les constats sur les images.
- `docs/note-regression-cache.md` — doctrine de cache des référentiels.
- `DEPLOY.md` — configuration Vercel actuelle, dont la région de Francfort et
  sa justification (§ 4.1).
- PR #201 — correctif `crossOrigin` et workflow CORS Object Storage.
