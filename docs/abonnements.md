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
- **Erreur corrigée après coup** : les trois lignes `fusion_listes_courses`,
  `reordonnancement_etapes` et `affichage_patissiers` avaient été seedées
  `visible = false` au lot 0, sur l'hypothèse — fausse — qu'aucune
  fonctionnalité ne leur correspondait dans le produit. Les trois existent
  réellement : fusionner deux listes de courses (`CuisineContent`,
  `MergeListRow` / `mergeShoppingLists`), réordonner les étapes d'une
  journée par glisser-déposer entre recettes (`PlanningDayView`,
  `day_order_index`), rechercher des pâtissiers (`/recherche`,
  `AuthorCard`). Les trois sont repassées à `visible = true`. Voir §9 pour
  le câblage des deux premières (la troisième est `OUI` sur les trois
  plans, aucun contrôle d'accès à poser).

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
| `reordonnancement_etapes` | binaire | `PlanningDayView` (`/en-cuisine`) |
| `fusion_listes_courses` | binaire | `CuisineContent` (`/en-cuisine`) |
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
- **`profiles.plan` et `allowlist.plan` sont mortes, décommissionnées au
  lot 4.** `/admin/membres` affichait et modifiait ces deux colonnes
  (`free` / `paid`) ; l'écran lit désormais `subscriptions` (badge de plan
  réel, filtre « Essai en cours ») et la fiche membre écrit exclusivement via
  les fonctions `mc_admin_*` (motif obligatoire + journal), jamais plus une
  ligne `plan` directement. Les deux colonnes restent en base, comme
  `profiles.followers_count`, et ne doivent plus être lues ni écrites — y
  compris à l'invitation, qui ne pose plus de plan (`allowlist.plan` retombe
  sur son défaut `free`, sans conséquence puisqu'il n'est plus lu).
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
| 2a | Moteur pur + tests + règle ESLint | `lib/entitlements.ts` |
| 2b | Couche de lecture, cache de la grille | `lib/entitlements-data.ts`, `lib/data/reference.ts` |
| 3 | Back-office de paramétrage des plans | `/admin/abonnements`, `lib/plans-admin.ts` |
| 4 | Fiche abonnement d'un membre, historique, actions manuelles | `/admin/membres`, `lib/subscriptions-admin.ts`, `mc_admin_*` |
| 5a | Cinq limites de stock câblées + message éducatif générique | `mc_enforce_stock` attachée, `lib/quota-message-client.ts`, `useMutation` |
| 5b | Quotas de flux sur les cinq routes IA | `lib/quota-route.ts` + routes |
| 5c | `mode_projet` en lecture seule pour un projet en cours, plus les cinq derniers droits binaires (voir §9) | `/projets/[id]`, `PreparerView`, `/importer`, `/relecture/[id]`, `PartnerSlot` |
| 6 | Page publique des plans, bascule mensuel/annuel, essai, demandes | `/plans`, `lib/trial.ts`, `subscription_requests` |
| 8 | Cron d'expiration, notifications in-app + e-mail | `/api/cron/abonnements`, `NotificationBell`, `lib/mail.ts` |
| 7 | Jauges « Mon utilisation » | `/reglages`, `components/profile/UsageCard.tsx` |
| 9 | Tableau de bord administrateur | `/admin/abonnements/tableau-de-bord` |

### Objets SQL en place

Tables : `plans`, `plan_versions`, `features`, `plan_features`, `subscriptions`,
`trials`, `usage_counters`, `admin_events`, `subscription_requests`,
`notifications`, `notifications_sent`. Colonne `profiles.notify_email`.

Fonctions : `mc_anchor_date`, `mc_period_bounds`, `mc_renewal_anchor`,
`mc_effective_rights`, `mc_usage`, `mc_check_quota`, `mc_usage_report`,
`mc_consume`, `mc_refund`, `mc_enforce_stock` (attachée à `recipes`,
`favorites`, `batches`, `shopping_lists`, `book_shares`), `mc_start_trial`,
`mc_publish_plan_version`, `mc_attach_default_plan`,
`mc_enforce_project_access` (attachée à `recipe_steps`, `ingredient_groups`,
`ingredients`, `recipe_project_components`, `recipe_projects`, `recipes`),
`mc_admin_grant_subscription`, `mc_admin_extend_subscription`,
`mc_admin_cancel_subscription`, `mc_admin_reset_trial`.

### À faire

Plus rien : les onze droits binaires de la grille (§4) sont tous câblés,
`fusion_listes_courses` et `reordonnancement_etapes` compris (§9, ajoutés
après coup — l'hypothèse initiale de leur absence était fausse, cf. §2).

### Une question tranchée, plus aucune ouverte

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
     qu'un appel direct depuis la console ne contourne pas la page.

   **Portée volontairement stricte** : la validation (`wizard → ready`, §8)
   est elle aussi bloquée — un membre rétrogradé ne peut ni continuer ni
   clôturer son projet, seulement le consulter. Si ça s'avère trop dur en
   usage réel, la validation est le seul geste qu'il serait raisonnable
   d'excepter (elle *sort* le projet de l'état surveillé plutôt que d'y
   ajouter du travail).
   La réversion `ready → wizard` (`ProjectMarking`, §8.5) n'est PAS concernée :
   au moment de ce geste, l'état encore en base est `ready`, pas `wizard`.

## 7. Lot 8 — cron, notifications, e-mail : décisions

### Prestataire retenu : AWS SES en SMTP

Choix du produit, pas le mien : SES exposé en SMTP standard, donc
`lib/mail.ts` ne connaît rien d'AWS — cinq variables génériques (`SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`). Changer de
prestataire un jour ne touchera que l'environnement, jamais le code.

**Best-effort**, même doctrine que la modération IA : SMTP absent ou en panne
→ l'envoi échoue silencieusement (loggé), jamais un blocage. Un e-mail non
parti dégrade l'information du membre, il ne doit jamais faire échouer le
cron qui l'accompagne.

### Le cron ne peut pas être précis à l'heure près

Vercel exécute les crons en UTC. « 03:00 Europe/Paris » n'a pas de traduction
fixe : 02:00 UTC en hiver (CET), 01:00 UTC en été (CEST). `vercel.json` est
figé à `02:00 UTC`, ce qui fait réellement tourner le job à 03:00 heure de
Paris en hiver et 04:00 en été. Assumé : c'est un travail de fond quotidien,
pas un rendez-vous à l'heure pour un membre — la précision n'a pas de valeur
ici, contrairement à ce qu'aurait coûté un luxe de précision non tenable.

### Idempotence : réserver plutôt que vérifier-puis-écrire

`claimNotification` (`lib/notifications-data.ts`) fait les deux en une seule
opération — un `upsert` avec `ignoreDuplicates` sur la contrainte d'unicité
`(subscription_id, notification_type)` — plutôt qu'un `select` suivi d'un
`insert`. Même raison que `mc_consume` au lot 1 : un `select` puis un
`insert` séparés laisseraient une fenêtre où deux exécutions concurrentes du
cron enverraient chacune leur e-mail. Le critère d'acceptation 7 (« le cron
exécuté deux fois de suite ne produit pas de notification en double ») est
donc porté par une contrainte de base, pas par une vérification applicative.

### Fenêtres bornées, pas un balayage complet

Les deux passes de notification ne relisent jamais la table entière :
l'expiration ne regarde que les sept derniers jours, l'échéance à venir que
les trois prochains. Une notification qui aurait dû partir mais que ces
fenêtres ratent — plusieurs jours de cron manqués d'affilée — ne part plus
jamais. Assumé : un retard de cette ampleur est une anomalie à traiter à la
main (le cron a de toute façon cessé de tourner pour une autre raison), pas
un cas que le job doit rattraper indéfiniment au prix d'un balayage complet
quotidien.

### La règle « moins de 3 jours → seulement J-1 » porte sur la DURÉE, pas sur le jour de lecture

Relire la spécification à la lettre (« un abonnement de moins de 3 jours ne
doit pas déclencher J-3 et J-1 simultanément ») laissait deux lectures
possibles. Retenue : la durée TOTALE de l'abonnement (`ends_at − starts_at`)
décide si le point J-3 existe seulement dans son calendrier — un essai de
2 jours n'a pas de « moment à 3 jours de la fin » qui tombe après son début,
donc ce point n'est jamais atteint, jamais notifié. Un abonnement de 14 jours,
lui, traverse les deux points l'un après l'autre, à des jours différents, et
reçoit légitimement les deux notifications. La condition
`dureeTotaleJours >= 3` avant d'autoriser J-3 (dans
`app/api/cron/abonnements/route.ts`) porte exactement cette règle.

### « Ce qui sera perdu » : deux précisions différentes pour deux moments différents

Avant échéance (J-3/J-1), l'abonnement est encore actif : comparer aux droits
de la GRILLE COURANTE de son plan est une approximation assumée (un
avertissement, pas un fait consommé). Après expiration (J+1), la question a
une vraie réponse et `getRightsForVersion()` lit la version EXACTEMENT
souscrite — un membre qui a souscrit avant un relèvement de plafond ne doit
pas se voir annoncer la perte d'un droit qu'il n'a jamais eu.

### Notifications in-app : nouveau sous-système, volontairement minimal

Aucune notion de notification n'existait dans le produit. `notifications`
(table) + `NotificationBell` (cloche de l'en-tête) couvrent exactement le
besoin de ce chantier — pas un centre de notifications extensible à toute
future fonctionnalité du site. Photographie prise au rendu serveur, comme le
reste du site : pas de canal temps réel, une nouvelle notification apparaît
à la prochaine navigation.

La création est réservée au serveur (`createAdminClient()`, aucune policy RLS
d'insertion pour un membre) : personne ne doit pouvoir s'écrire ses propres
alertes. Seul le marquage comme lue est un geste membre.

### Préférence e-mail : un seul réglage

`profiles.notify_email` (défaut `true`) ne conditionne QUE l'envoi d'e-mail —
les notifications in-app d'expiration restent affichées quoi qu'il arrive
(spec §10), puisqu'elles conditionnent l'accès au service. Lu à part de
`getProfile()` (`getNotifyEmailPreference`, `lib/notifications-data.ts`) :
l'ajouter à la liste énumérée de `lib/auth.ts` la ferait relire à chaque
rendu de page pour un réglage qui ne sert qu'à `/reglages` et au cron.

## 9. Les cinq derniers droits binaires — décisions

### Proportionnalité assumée : UI seule, pas de trigger SQL

`mode_projet` et les cinq limites de stock ont un garde-fou en base
(`mc_enforce_project_access`, `mc_enforce_stock`) parce qu'ils protègent une
ressource — le nombre d'objets créés, l'accès à un mode entier. Les cinq
points ci-dessous n'ont **que** le contrôle côté interface (`canAccess()`
lu côté serveur, prop transmise aux composants client) :

- `remplacement_ingredient_par_recette`, `notes_personnelles`,
  `sous_etapes_sequencement` : un membre qui forcerait l'écriture depuis la
  console du navigateur ajouterait une note ou une sous-étape sans y avoir
  droit. Sans coût, sans effet sur d'autres membres, sans dépense d'API —
  contrairement à un stock illimité de recettes ou un mode projet entier.
  Un garde-fou en base coûterait un trigger de plus par table concernée pour
  un risque qui n'en est pas un.
- `ecran_relecture_import` : le contrôle réel — l'appel à l'API Anthropic —
  est déjà côté serveur depuis le lot 5b (`import_ia_mensuel`). Ce que ce
  lot ajoute n'est qu'un meilleur MOMENT pour le dire (à l'ouverture de la
  page, pas après une tentative d'import ratée en profondeur).
- `navigation_sans_pub` : aucune écriture, une pure question d'affichage —
  masquer localement ses propres publicités depuis les outils de
  développement du navigateur n'apporte rien qu'un bloqueur de publicité
  n'offre déjà.

Si l'un de ces points s'avérait un jour un vecteur d'abus réel, le motif à
suivre est déjà écrit : `mc_enforce_project_access` (lot 5c) pour le modèle
d'un trigger conditionnel sur `kind`/`project_stage`, adaptable à
`batch_steps.user_note` et `batch_substeps`.

### `notes_personnelles` / `sous_etapes_sequencement` : l'existant reste, l'ajout est bridé

Deux surfaces distinctes portent ces droits : la note d'étape
(`BatchStepDonePanel`) et la note de fournée (`BatchNotes`) pour les notes ;
les sous-étapes n'existent que dans `BatchStepDonePanel`. Dans les trois cas,
la règle est la même (§7.4, l'existant est préservé) : une note ou une liste
de sous-étapes déjà saisies AVANT une rétrogradation restent affichées et
modifiables en lecture — seul le bouton de CRÉATION (nouvelle note quand
aucune n'existe, nouvelle sous-étape) disparaît, remplacé par un message bref
et un lien vers `/plans`. Un droit rétabli fait réapparaître le bouton sans
rien à migrer : rien n'a jamais été supprimé.

### `ecran_relecture_import` : portée volontairement stricte, comme `mode_projet`

`/importer` masque le formulaire (`ImporterForm`) mais garde la liste des
imports passés visible — c'est de l'historique, jamais concerné par un
contrôle de création. `/relecture/[id]`, en revanche, est bloquée
**entièrement** pour un brouillon existant sans le droit, sans vue en
lecture seule : un import non publié est un artefact intermédiaire d'un
parcours interrompu, pas un contenu que le membre consulte ou dont il aurait
besoin — contrairement à un projet en cours (§5c, `mode_projet`), qui reste
lisible parce qu'il porte une intention et une structure déjà investies.
Rien n'est supprimé pour autant : la ligne `imports` / `recipes` (brouillon)
reste en base, seulement inatteignable tant que le droit n'est pas rétabli.

### `navigation_sans_pub` : un seul point de contrôle, pas trois

Trois emplacements diffusent des publicités hors accueil
(`recipe_inline`, `search_list`, `sidebar`). Le contrôle est posé une seule
fois, dans `PartnerSlot` lui-même (déjà un Server Component qui résout
`getCurrentUser()`/`isAdmin()` en interne) — jamais dans les trois pages
appelantes, qui n'ont pas à savoir que ce droit existe. `home_top` et
`home_mid` sont explicitement exemptés : `pub_accueil` reste `OUI` pour tout
le monde (§2, écarts de grille), la page d'accueil n'est gouvernée par aucun
plan. Le repère « Emplacement libre » réservé à l'administration
(`EmptySlot`) n'est pas concerné : le nouveau contrôle n'intervient qu'une
fois qu'une campagne existe réellement à afficher.

## 8. Reprise

`npm run test` (moteur pur), `npm run typecheck`, `npm run lint` (dont la
règle anti-`plan === 'PRO'`), `npm run build`.

Toute migration SQL se livre **dans la conversation**, jamais en fichier
`db/*.sql` — et `npm run gen:types` la suit, sans quoi les nouvelles fonctions
et tables restent invisibles au typage (c'est pourquoi `mc_publish_plan_version`,
`notifications` et `notifications_sent` sont encore appelées par un cast
local, même motif que `ads` dans `PartnersManager`).

Variables d'environnement à configurer avant mise en production (cf.
`.env.local.example`) : `TRIAL_EMAIL_SALT` (essai gratuit, lot 6), `CRON_SECRET`
(tâche planifiée), `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` /
`MAIL_FROM` (e-mail, AWS SES). Sans elles : l'essai gratuit refuse de démarrer,
le cron refuse toute requête (503, jamais une route ouverte par défaut), et
les e-mails ne partent pas silencieusement — rien de tout cela n'empêche le
reste du site de fonctionner.

## 10. `/reglages` — annulation en libre-service (hors spécification V1)

La spécification ne prévoyait, en V1, que des actions **administrateur**
manuelles (§8.3 : attribuer, prolonger, changer de plan, annuler). Aucun
membre ne pouvait agir sur son propre abonnement. Ajouté sur demande, en
plus de la refonte de « Mon utilisation » en « Mon forfait » (bandeau
d'état, jauges en cartes plutôt qu'en liste, liens contextuels vers `/plans`
pour l'essai et la montée en gamme).

### Toujours à échéance, jamais immédiate

`mc_cancel_own_subscription()` (SECURITY DEFINER, `auth.uid()` seul contrôle
d'accès — un membre n'agit que sur SA propre ligne `ACTIVE` non-`DEFAULT`)
ne retire jamais un service déjà en cours : l'abonnement continue jusqu'à sa
date de fin, réelle si elle existe déjà, sinon fixée à la fin du mois
calendaire en cours — c'est la seule période implicite qu'on puisse lui
attribuer en l'absence de toute facturation réelle en V1 (aucun cycle de
renouvellement n'existe à interrompre).

### Marqueur d'intention, jamais lu par le moteur de droits

`subscriptions.cancel_requested_at` ne change rien à `mc_effective_rights` :
c'est une trace pour l'administrateur (visible dans l'historique de la fiche
membre), qui lui évite de prolonger par erreur un abonnement que le membre a
déjà choisi de ne pas reconduire. Le calcul des droits continue de ne
dépendre que de `status` et `ends_at`, comme documenté au §1.2 — aucune
exception introduite pour cette fonctionnalité.

### Pas de réactivation en libre-service

Une fois cliqué, seul un administrateur peut revenir en arrière (fiche
membre, « Prolonger », déjà en place depuis le lot 4). Annuler puis
prolonger `ends_at` à la fin du mois courant pour un abonnement qui n'en
avait pas ne serait pas réversible sans perdre l'information « il n'avait
pas de date de fin » — au lieu de modéliser cette réversibilité, plus
complexe qu'utile pour un cas rare, le changement d'avis passe par le même
canal que toute autre exception commerciale : contacter l'administrateur.

### Actions dupliquées vers `/plans`, pas réimplémentées

« Essayer une formule payante » et « Passer à une formule supérieure »
renvoient vers `/plans` plutôt que d'agir sur place : la page publique porte
déjà l'intégralité de cette logique (comparaison, tarifs, confirmation de
rétrogradation, file de demandes). Dupliquer une version simplifiée ici
aurait créé deux chemins à maintenir pour le même geste, avec le risque
qu'ils divergent. `UsageCard` ne fait que déterminer QUAND proposer chaque
lien (`grid.plans` + `orderIndex` pour « supérieure », `trialConsumed` +
`trialAllowed` pour l'essai), jamais comment l'exécuter.

## 11. Correction — `fusion_listes_courses` et `reordonnancement_etapes` existaient

Le lot 0 avait posé `visible = false` sur ces deux lignes (et sur
`affichage_patissiers`) en affirmant qu'aucune fonctionnalité ne leur
correspondait dans le produit. **C'était faux pour les trois**, repéré par
l'auteur du projet en relisant l'écran de paramétrage, pas par une relecture
du code — l'erreur venait d'avoir généralisé un commentaire sur UN écran
(« pas de fusion ici » dans `ArchivedShoppingLists.tsx`, qui ne vaut que pour
les listes archivées) à l'ensemble du produit, sans vérifier ailleurs.

- **`fusion_listes_courses`** : fusionner une liste de courses dans une autre
  (`CuisineContent.tsx`, bouton « Fusionner avec une autre liste »,
  `MergeListRow` / `mergeShoppingLists`) — distinct de « ajouter les
  ingrédients d'une recette à une liste existante » (`ShoppingWidget.tsx`),
  qui reste ouvert à tous : ce n'est pas fusionner *plusieurs listes*, c'est
  la création normale d'une liste.
- **`reordonnancement_etapes`** : glisser-déposer les étapes d'une même
  journée entre plusieurs fournées, dans le planning du jour
  (`PlanningDayView.tsx`, `batch_steps.day_order_index`).

### Câblage, même proportionnalité que le §9

Contrôle côté interface uniquement, pas de trigger SQL — même raisonnement
qu'au §9 : ni l'une ni l'autre ne protège une ressource ou un coût. Les deux
droits sont calculés une fois dans `app/en-cuisine/page.tsx` et transmis en
prop (`CuisineContent` → `PlanningDayView` pour le réordonnancement, gardé
sur place pour la fusion). Sans le droit :
- le bouton de fusion (icône `call_merge`) ne s'affiche pas — la suppression
  d'une liste, elle, reste toujours possible ;
- la poignée de glisser-déposer (icône `drag_indicator`) est remplacée par
  un espace inerte de même largeur, pour ne pas décaler la mise en page ;
  `onDragOver` / `onDrop` du parent restent de toute façon sans effet tant
  qu'aucun glissé n'a pu démarrer.

### Grille corrigée

```sql
update public.features
   set visible = true
 where key in ('fusion_listes_courses', 'reordonnancement_etapes', 'affichage_patissiers');
```

`affichage_patissiers` (recherche de pâtissiers, `/recherche`,
`AuthorCard.tsx`) est `OUI` sur les trois plans : rendue visible sur `/plans`
pour la lisibilité de l'offre, sans aucun contrôle d'accès à poser — elle ne
gouverne rien.
