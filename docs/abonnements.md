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

Total seedé : **44 fonctionnalités**, 10 sections, 5 limites de stock,
3 quotas de flux.

---

## 3. Les seize points de contrôle réels

Sur 44 lignes de grille, 28 valent `OUI` sur les trois plans : elles existent
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
  moteur. La règle est en place (`no-restricted-syntax` dans `.eslintrc.json`)
  et échoue au `npm run lint`, dans les deux sens de la comparaison.
- **Le calcul des droits effectifs n'existe qu'en SQL.** `lib/entitlements.ts`
  ne fait que consommer le résultat de `mc_effective_rights` : deux
  implémentations de la règle du maximum auraient divergé au premier
  changement, et c'est la version SQL qui fait foi puisque c'est elle que les
  triggers appliquent. Les tests (`npm run test`) ne couvrent donc que le pur :
  verdicts, seuils de jauge, diff de versions, contrôle de cohérence, messages.
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

---

## 6. État du chantier

### Livré (branche `claude/spec-analysis-plan-ucdmvl`, PR #169)

| Lot | Contenu | Où |
|---|---|---|
| 0 | Arbitrages, mesure du parc | ce document |
| 1 | Schéma, RLS, moteur SQL, seeds | base (SQL joué à la main) |
| 2a | Moteur pur + 29 tests + règle ESLint | `lib/entitlements.ts` |
| 2b | Couche de lecture, cache de la grille | `lib/entitlements-data.ts`, `lib/data/reference.ts` |
| 3 | Back-office de paramétrage des plans | `/admin/abonnements`, `lib/plans-admin.ts` |
| 5b | Quotas de flux sur les cinq routes IA | `lib/quota-route.ts` + routes |
| 5c (anticipé) | Lecture seule d'un projet en cours sans `mode_projet` | `/projets/[id]`, `ProjectReadOnly`, `mc_enforce_project_access` |

### Objets SQL en place

Tables : `plans`, `plan_versions`, `features`, `plan_features`, `subscriptions`,
`trials`, `usage_counters`, `admin_events`, `subscription_requests`.

Fonctions : `mc_anchor_date`, `mc_period_bounds`, `mc_renewal_anchor`,
`mc_effective_rights`, `mc_usage`, `mc_check_quota`, `mc_usage_report`,
`mc_consume`, `mc_refund`, `mc_enforce_stock`, `mc_start_trial`,
`mc_publish_plan_version`, `mc_attach_default_plan`.

**`mc_enforce_stock` n'est rattachée à aucune table.** C'est délibéré : posée
avant les messages d'interface du lot 5a, elle produirait une erreur brute au
membre. Le lot 5a l'attache aux cinq tables (`recipes`, `favorites`, `batches`,
`shopping_lists`, `book_shares`) en même temps qu'il pose les blocages
éducatifs.

### À faire

| Lot | Contenu | Note |
|---|---|---|
| 4 | Fiche abonnement d'un membre, historique, actions manuelles | étend `/admin/membres` ; y retirer le sélecteur `profiles.plan` |
| 5a | Rattacher `mc_enforce_stock` aux cinq tables + blocage éducatif | |
| 5c | Sept droits binaires restants + `notes_personnelles` / `sous_etapes_sequencement` en lecture seule | le cas `mode_projet` est traité, ci-dessus |
| 6 | Page publique des plans, bascule mensuel/annuel, essai | `mc_start_trial` attend `TRIAL_EMAIL_SALT` |
| 7 | Jauges « Mon utilisation » | `getUsageReport` est prête |
| 8 | Cron, notifications in-app, e-mail | trois sous-systèmes inexistants |
| 9 | Tableau de bord | |

### Une question tranchée, une encore ouverte

1. **Un membre PRO rétrogradé garde des projets en cours : lecture seule.**
   `/projets/[id]` reste accessible et montre tout — intention, format,
   composants et leur résolution — mais n'écrit plus rien tant que le droit
   `mode_projet` n'est pas rétabli (`components/projets/ProjectReadOnly.tsx`).
   Ni dissolution forcée, ni redirection vers la fiche recette : un projet en
   cours n'est pas une recette utilisable en l'état, c'est un dialogue
   inachevé, et le figer en lecture ne lui fait perdre aucune donnée.

   Le contrôle est à deux niveaux, même doctrine que le reste du chantier :
   - **côté page**, `/projets/[id]` bascule sur `ProjectReadOnly` dès que
     `canAccess(droits, 'mode_projet')` est faux — c'est la voie normale ;
   - **côté base**, `mc_enforce_project_access()` bloque toute écriture sur
     `recipe_steps`, `ingredient_groups`, `ingredients` (via `group_id`),
     `recipe_project_components`, `recipe_projects` et `recipes` (colonnes de
     format) tant que la recette est `kind = 'project'` et
     `project_stage = 'wizard'` et que le propriétaire n'a pas le droit — pour
     qu'un appel direct depuis la console ne contourne pas la page. C'est du
     lot 5c anticipé, posé ici parce que la règle vient d'être tranchée et
     que les écritures du parcours guidé sont, comme partout ailleurs, des
     appels `supabase-js` directs du navigateur.

   **Portée volontairement stricte** : la validation (`wizard → ready`, §8)
   est elle aussi bloquée — un membre rétrogradé ne peut ni continuer ni
   clôturer son projet, seulement le consulter. Si ça s'avère trop dur en
   usage réel, la validation est le seul geste qu'il serait raisonnable
   d'excepter (elle *sort* le projet de l'état surveillé plutôt que d'y
   ajouter du travail).
   La réversion `ready → wizard` (`ProjectMarking`, §8.5) n'est PAS concernée :
   au moment de ce geste, l'état encore en base est `ready`, pas `wizard`.

   Page publique `/plans` référencée par le lien de l'écran : route à créer
   au lot 6, nom retenu pour cohérence.

2. **`reordonnancement_etapes` n'a pas de geste identifié** dans le produit.
   La ligne est seedée `visible = false` en attendant.

### Reprise

`npm run test` (moteur pur), `npm run typecheck`, `npm run lint` (dont la
règle anti-`plan === 'PRO'`), `npm run build`.

Toute migration SQL se livre **dans la conversation**, jamais en fichier
`db/*.sql` — et `npm run gen:types` la suit, sans quoi les nouvelles fonctions
restent invisibles au typage (c'est pourquoi `mc_publish_plan_version` est
encore appelée par un cast local dans `PlansManager`).
