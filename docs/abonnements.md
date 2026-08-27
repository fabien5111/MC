# Abonnements — socle et règles

Chantier « gestion des abonnements » (spécification v1.0). Ce document porte
les **décisions** et les **invariants** ; les migrations SQL sont jouées à la
main dans l'éditeur Supabase (règle du dépôt : aucun `.sql` dans `db/`).

Portée du lot 1 : modèle de données, RLS, moteur de droits en SQL, seeds.
Le rattachement des contrôles aux écrans existants est le lot 5.

---

## 1. Les cinq arbitrages structurants

### 1.1 Le plan par défaut ne bénéficie JAMAIS du gel des conditions

La spécification protégeait les abonnés en cours de toute modification
défavorable (§6.1), en calculant le droit effectif comme le **maximum** entre
la version souscrite et la version courante. Appliquée telle quelle à la ligne
`DEFAULT` — qui n'est *jamais* clôturée (§7.1) —, cette règle fige chaque
membre gratuit sur la version du plan FREE en vigueur le jour de son
inscription, **à vie**. Comme les seeds livrent les limites non renseignées
(donc illimitées), tout le parc existant serait resté illimité pour toujours,
sans qu'aucune action d'administration puisse le corriger.

Règle retenue : **la préservation des conditions ne vaut que pour les
abonnements `TRIAL`, `PAID` et `GIFT`.** En l'absence d'un tel abonnement
actif, les droits sont ceux de la **version courante** du plan par défaut.
On ne « souscrit » pas à la gratuité ; elle se redéfinit.

Conséquence pratique : baisser une limite FREE prend effet immédiatement pour
tout le monde. C'est exactement ce que `mc_effective_rights` implémente, et
c'est ce qui rend acceptable de livrer les limites non paramétrées.

### 1.2 Le contrôle vit dans PostgreSQL, pas dans TypeScript

Dans ce dépôt, **toutes** les créations concernées partent du navigateur en
`supabase-js` sous RLS : recettes (`CreerForm`, `RelectureEditor`), fournées
(`lib/batch-write.ts`), favoris, listes de courses (`ShoppingWidget`), partages
de carnet (`ShareBookButton`). Il n'existe aucune route serveur à instrumenter,
sauf pour les routes IA. Un contrôle écrit en TypeScript serait donc, au mieux,
un confort d'interface — le critère d'acceptation §13-12 (« un contrôle
contourné côté client est refusé côté serveur ») serait faux.

Le contrôle est donc porté par un **trigger `BEFORE INSERT`** appelant
`mc_enforce_stock()`, doublé des policies existantes. Même motif que
`is_read_only_session()` pour l'impersonation : la garantie est en SQL, l'UI
n'en est que la traduction lisible. Aucun chemin d'écriture n'est réécrit, et
tout futur point de création est couvert sans y penser.

Le TypeScript ne fait que **lire** (jauges, page des plans, blocage éducatif)
et traduire les erreurs `MC_QUOTA_*` en messages.

### 1.3 Vérifier et consommer sont une seule opération

`supabase-js` parle REST : il ne sait pas enchaîner deux instructions dans une
transaction. Un `checkQuota()` suivi d'un `consume()` laisse passer deux imports
simultanés sur le dernier crédit disponible.

`mc_consume(cle, n)` vérifie **et** incrémente en un aller-retour, sous verrou
de ligne (`for update`), et lève `MC_QUOTA_EXCEEDED` sinon. `mc_refund()` rend
le crédit quand l'action échoue après consommation. `mc_check_quota()` demeure,
mais pour l'affichage uniquement — jamais comme garde avant écriture.

### 1.4 L'essai consommé est tracé par un hachage, pas par une adresse

La spécification conservait l'e-mail normalisé d'un compte supprimé, avec
`membre_id` en clé primaire **et** clé étrangère — ce qui, précisément,
empêchait la ligne de survivre à la suppression du compte.

Retenu : clé primaire propre, `user_id` en `on delete set null`, et unicité
portée par `email_hash` — un SHA-256 salé (`TRIAL_EMAIL_SALT`, serveur
uniquement) de l'adresse normalisée. Conserver une empreinte plutôt qu'une
adresse évite de garder une donnée personnelle en clair après suppression du
compte, sans rien perdre de la fonction de blocage.

À savoir : la normalisation (minuscules, points et suffixe `+` retirés) ne vaut
que pour Gmail, et un autre fournisseur suffit à obtenir un second essai. C'est
un ralentisseur, pas un verrou.

### 1.5 Un état « non paramétré » explicite, distinct de « illimité »

`LIMIT` avec `limit_value` nul signifiait « illimité » dans la spécification,
ce qui rendait impossible le contrôle de cohérence demandé par ailleurs (§8.2 :
signaler toute limite non configurée). Les deux états sont désormais distincts :

| `value` | `unlimited` | `limit_value` | Sens |
|---|---|---|---|
| `NO` | false | null | Pas d'accès |
| `YES` | false | null | Accès, non plafonnable (`limit_type = NONE`) |
| `LIMIT` | true | null | Illimité, assumé |
| `LIMIT` | false | *n* | Plafonné à *n* |
| `LIMIT` | false | null | **Non paramétré** — signalé à l'admin |

Le cas « non paramétré » est traité comme illimité au runtime : une case oubliée
en back-office ne doit pas fermer le site. C'est la doctrine générale du moteur —
**échouer en ouvert sur une erreur de configuration, en fermé sur une limite
réellement atteinte.** Une seule exception : une fonctionnalité **absente** de
la grille est refusée (sans quoi il suffirait d'oublier une ligne pour ouvrir
un droit payant à tous).

---

## 2. Écarts assumés par rapport à la grille de la spécification

- **`pub_hors_accueil` devient `navigation_sans_pub`**, avec FREE = `NO`.
  La spécification prévoyait un drapeau « affichage inversé » pour présenter à
  l'endroit une ligne dont `OUI` était un désavantage. On inverse la **clé**,
  pas l'affichage : le code lit `canAccess('navigation_sans_pub')` pour *masquer*
  les encarts, la page publique n'a aucun cas particulier, et le back-office ne
  propose pas de case dont le sens est contraire à son libellé.
- **`pub_accueil` est retirée** : `OUI` sur les trois plans et invisible sur la
  grille publique, elle ne gouvernait rien.
- **`listes_courses_actives_max` devient `listes_courses_max`** : « active »
  n'existe pas en base — `shopping_lists` n'a ni statut ni archivage, une liste
  est réputée archivée quand tous ses items sont cochés (`ArchivedShoppingLists`).
  Un plafond sur le total est calculable par un simple comptage, compréhensible
  par le membre, et n'ajoute pas d'agrégat à chaque insertion.
- **`fournees_actives_max`** : « active » = `batches.status = 'planifiee'`
  (les autres valeurs sont `terminee` et `abandonnee`).
- **Trois lignes sont seedées en `visible = false`**, faute de fonctionnalité
  correspondante dans le produit : `fusion_listes_courses`,
  `reordonnancement_etapes`, `affichage_patissiers`. Une grille publique
  générée depuis la base afficherait sinon des promesses non tenues. Les
  repasser à `visible = true` le jour où la fonctionnalité existe.

Total seedé : **43 fonctionnalités**, 10 sections, 5 limites de stock,
3 quotas de flux.

---

## 3. Les seize points de contrôle réels

Sur 43 lignes de grille, 27 valent `OUI` sur les trois plans : elles existent
pour la page publique et ne demandent aucun code. Les points à câbler (lot 5) :

| Clé | Type | Rattachement |
|---|---|---|
| `recettes_max` | STOCK | trigger sur `recipes` |
| `favoris_max` | STOCK | trigger sur `favorites` |
| `fournees_actives_max` | STOCK | trigger sur `batches` |
| `listes_courses_max` | STOCK | trigger sur `shopping_lists` |
| `partage_carnet_prive_max` | STOCK | trigger sur `book_shares` |
| `import_ia_mensuel` | FLUX | `/api/import-url`, `/api/transcribe-photo` |
| `ajustement_ia_mensuel` | FLUX | `/api/scale-recipe` |
| `mode_projet_ia_mensuel` | FLUX | `/api/projet/structure`, `/api/projet/composant` |
| `mode_projet` | binaire | `/projets/*`, `/api/projet`, portée « Projets » du carnet |
| `ecran_relecture_import` | binaire | `/importer`, `/relecture` |
| `remplacement_ingredient_par_recette` | binaire | `IngredientExpandDialog` |
| `notes_personnelles` | binaire | `BatchStepDonePanel`, `BatchNotes` |
| `sous_etapes_sequencement` | binaire | `BatchStepDonePanel` |
| `reordonnancement_etapes` | binaire | à définir |
| `fusion_listes_courses` | binaire | fonctionnalité à créer |
| `navigation_sans_pub` | binaire | `PartnerSlot` hors accueil |

---

## 4. Cache — ce qui peut l'être et ce qui ne le doit pas

Règle héritée de `docs/note-regression-cache.md`, à ne pas enfreindre :

- **La grille** (`plans`, `plan_versions`, `features`, `plan_features`) est un
  référentiel : lecture publique, donc éligible à `unstable_cache` via
  `lib/data/reference.ts`, avec étiquette et `revalidateReference()` à chaque
  écriture du back-office.
- **L'abonnement d'un membre** dépend de l'utilisateur : `cache()` React par
  requête **uniquement**. Jamais `unstable_cache`, qui lit au rôle `anon` et
  servirait les droits d'un membre à un autre.

---

## 5. Doctrine restante

- **Aucun test de plan en dur.** Pas de `plan === 'PRO'` : tout passe par le
  moteur. Une règle ESLint locale l'interdira (lot 2).
- **`profiles.plan` et `allowlist.plan` sont morts** dès le lot 4. Ces deux
  colonnes (`free` / `paid`) sont aujourd'hui affichées et modifiables dans
  `/admin/membres` ; elles deviennent une seconde vérité dès que
  `subscriptions` existe. Elles restent en base, comme
  `profiles.followers_count`, et ne doivent plus être lues.
- **`IMPORT_DAILY_QUOTA` reste**, comme garde-fou technique anti-emballement,
  derrière la limite d'abonnement — il borne le coût Anthropic quel que soit
  l'état de la grille.
- **Les écrans d'abonnement du back-office appellent `requireFullAdmin()`** en
  première ligne : une page ajoutée sous `app/admin/` est ouverte au
  gestionnaire tant qu'on ne l'a pas refermée.
- **Impersonation** : le moteur rend les droits du membre *incarné* ;
  `is_read_only_session()` et `useWriteGuard` continuent de primer sur toute
  autorisation d'abonnement.
