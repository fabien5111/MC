# Maryse Club — Documentation technique

Site de partage de recettes de pâtisserie. Application web full-stack
TypeScript, déployée sur Vercel, avec Supabase comme backend (base de
données, authentification).

## Repères pour travailler sur ce dépôt

- **Production** : la branche `main` est déployée automatiquement sur Vercel
  (projet `mc`). Ne pousser sur `main` que du code vérifié.
- **Vérification** avant tout push : `npm run typecheck` (et `npm run build`
  pour les changements structurels).
- **Langue** : code commenté en français, UI en français ; les messages de
  commit sont en français.
- **Types Supabase** : ne jamais éditer `lib/database.types.ts` à la main —
  le régénérer (`npm run gen:types` ou workflow GitHub Actions).
- **Images** : stockées en data-URL en base (pas de bucket) — compression
  côté client via `lib/images.ts` / composant `ImageSlot`.
- **Scripts SQL** : ne pas créer de fichier `.sql` dans `db/`. Toute
  migration ou requête SQL doit être affichée directement dans la
  conversation (bloc de code SQL), pour être copiée-collée dans l'éditeur
  SQL de Supabase.

---

## Stack

| Couche | Technologie | Version |
|---|---|---|
| Framework | **Next.js** (App Router, Route Handlers) | 15.x |
| Langage | **TypeScript** (mode strict) | 5.7 |
| UI | **React** (Server + Client Components) | 19 |
| Styles | **Tailwind CSS** (design tokens dans `tailwind.config.ts`) | 3.4 |
| Backend | **Supabase** (PostgreSQL, Auth, RLS) | — |
| Client Supabase | `@supabase/supabase-js` + `@supabase/ssr` (auth par cookies) | 2.x / 0.12 |
| IA | **API Anthropic (Claude)** — import et ajustement de recettes | `claude-haiku-4-5` (structuration) / `claude-sonnet-5` (lecture de photos) |
| Hébergement | **Vercel** (fonctions serverless, projet `mc`, région Francfort) | Node 22.x |

## Architecture

```
app/                    Pages et routes (App Router)
├── page.tsx            Accueil
├── connexion/          Connexion / inscription (e-mail + OAuth)
├── creer/              Éditeur de recette (création + édition)
├── recette/[id]/       Fiche recette (consultation, création d'une fournée)
├── fournee/[id]/       Fiche + mode Cuisiner d'une fournée (Préparer/Cuisiner)
├── execution/[id]/     Ancienne URL d'une session — redirection vers /fournee/[id]
├── courses/[id]/       Liste de courses
├── profil/             Profil (recettes, favoris, fournées, listes)
├── recherche/          Recherche avancée (facettes + résultats)
├── idees/              Boîte à idées (liste + tri + votes)
├── idees/nouvelle/     Proposer une idée (formulaire + prévention des doublons)
├── projets/[id]/       Mode projet — parcours guidé (intention → format →
│                       structure → recettes des composants)
├── importer/           Import de recette par IA (texte collé)
├── relecture/[id]/     Relecture d'un brouillon importé
├── admin/              Back-office (layout partagé + 5 sous-écrans)
├── api/
│   ├── projet/           POST — création d'un projet (recette + satellites)
│   ├── projet/structure/ POST — format visé + composants proposés (IA)
│   ├── projet/composant/ POST — recette de base proposée pour un composant (IA)
│   ├── import-url/       POST — analyse IA d'une recette (texte) → brouillon
│   ├── transcribe-photo/ POST — lecture IA d'UNE photo de page → texte
│   ├── scale-recipe/     POST — coefficient IA d'ajustement des quantités
│   ├── recherche/compte/ GET  — compte seul des résultats (tiroir mobile)
│   ├── ingredients/      GET  — autocomplétion des ingrédients
│   ├── idees/similaires/ GET  — suggestions anti-doublons (titre en cours de saisie)
│   ├── recipes/          GET  — pagination de l'accueil
│   ├── recipes/picker/   GET  — recherche de recettes (remplacement d'un ingrédient)
│   ├── admin/impersonate/ POST — lien de connexion « en tant que »
│   └── impersonation/    POST — fin de session / journal d'audit
├── auth/callback/      Callback OAuth / confirmation e-mail
└── auth/impersonation/ Consommation d'un lien « en tant que »

components/             Composants React (client pour l'interactif)
lib/                    Accès données typés + logique métier pure
├── supabase/           Clients navigateur / serveur / middleware
├── database.types.ts   Types générés depuis la base Supabase
└── *.ts                recipes, profile, executions, admin, recipe-plan…
                        (ideas.ts / ideas-data.ts : logique pure vs RPC serveur)
middleware.ts           Auth : protège les routes privées (runtime Node)
```

### Principes

- **Server Components** pour la lecture des données (requêtes Supabase côté
  serveur, RLS appliquée via la session en cookies) ; **Client Components**
  (`'use client'`) pour l'interactivité, avec mutations Supabase côté
  navigateur puis `router.refresh()` pour resynchroniser le rendu serveur.
- **Toute écriture doit resynchroniser le serveur.** Les lectures étant
  rendues côté serveur, une écriture sans invalidation laisse les vues déjà
  rendues figées jusqu'à un rechargement complet (carnet, favoris, listes,
  compteurs…). Utiliser le hook `useMutation` (`lib/use-mutation.ts`) :
  écriture + `confirm` optionnel + alerte d'erreur + `router.refresh()`.
- **Logique métier pure** isolée dans `lib/` (ex. `recipe-plan.ts`,
  `recipe-view.ts`) : fonctions sans effet de bord, utilisables côté serveur
  comme côté client.
- **Alias d'import** `@/*` → racine du projet (`tsconfig.json`).
- **Spinner.** Pour toute action asynchrone susceptible de prendre du temps
  (écriture serveur suivie d'une navigation, traitement IA, import…), utiliser
  le spinner maison « Le Fouet » (`components/Spinner.tsx`) via l'overlay
  plein écran `components/LoadingOverlay.tsx` — jamais un indicateur local
  (icône qui tourne dans un bouton, texte « Chargement… »). Cet overlay est
  déjà déclenché automatiquement sur les navigations par lien/formulaire
  (`components/NavigationSpinner.tsx`) ; pour une action déclenchée par du
  code (mutation suivie d'un `router.push`, appel IA...), afficher
  `<LoadingOverlay visible={busy} />` explicitement le temps de l'opération
  (cf. `components/recipe/DuplicateButton.tsx`).
- **`busy` couvre aussi la resynchronisation.** `router.refresh()` ne rend pas
  de promesse : émis tel quel, il laissait `useMutation` éteindre le spinner
  dès l'écriture réseau aboutie, alors que le rendu serveur n'était pas encore
  revenu — les modifications apparaissaient une seconde plus tard, sur une
  interface redevenue active. `useMutation` l'enveloppe donc dans une
  transition (`useTransition`) et garde `busy` vrai jusqu'à ce que le nouveau
  rendu soit appliqué. Conséquence à connaître : le spinner d'une écriture
  reste affiché plus longtemps qu'avant, et d'autant plus que la page à
  re-rendre est lourde (la fiche recette planifiée, par exemple) — c'est le
  temps réel de l'opération, pas une régression.
- **Une fenêtre modale ne porte jamais sa propre resynchronisation.** Une
  transition meurt avec le composant qui la porte : si la modale se ferme
  aussitôt l'écriture faite, son `pending` disparaît, le spinner s'éteint et
  les modifications n'apparaissent qu'une seconde plus tard. Écrire avec
  `refresh: false`, puis laisser le **parent** — qui reste monté — appeler le
  `refresh()` rendu par `useMutation`, émis de façon synchrone avant la
  fermeture pour que son voile soit déjà en place au rendu qui démonte la
  modale (cf. `IngredientExpandDialog` / `PlanIngredientsEditor`
  `onExpansionDone`).
- **Suppression optimiste dans une liste.** Doubler malgré tout `useMutation`
  d'un état local initialisé depuis les props (`useState` + `useEffect` de
  resynchronisation) et filtrer l'élément supprimé au succès de la mutation :
  la liste se met à jour dès la fin de l'écriture, sans attendre le rendu
  serveur (cf. `ProfileTabs.tsx` `delRecipe` / `components/ImporterList.tsx`
  `supprimer`).

## Authentification

- Supabase Auth par **cookies** (`@supabase/ssr`), vérifiable côté serveur.
- **Deux niveaux de vérification, à ne pas confondre.** `getCurrentUser()`
  (`lib/auth.ts`) et le middleware lisent les claims du JWT, **vérifiés
  localement** (`getClaims()`, signature ES256 contre le JWKS du projet) :
  aucun aller-retour vers le serveur d'authentification. Un `getUser()` en
  coûtait onze instructions SQL côté GoTrue, à chaque rendu de page — ~65 % du
  trafic base restant une fois les référentiels mis en cache. Contrepartie
  assumée : une session révoquée reste acceptée jusqu'à l'expiration de son
  jeton (TTL réglé dans Supabase → Authentication → Sessions). Le back-office
  refuse cette fenêtre : ses trois gardes passent par `getVerifiedUser()`, qui
  interroge réellement le serveur. Un seul `getUser()` existe dans tout le
  site, dans `getAuthUser()` — ne pas en ajouter. Cf.
  `docs/note-regression-cache.md`.
- **Campagnes publicitaires (`ads`) en cache** comme un référentiel
  (`lib/ads.ts`), avec la **date du jour dans la clé** : sans elle, une
  campagne programmée n'apparaîtrait qu'à l'expiration du cache et une campagne
  terminée continuerait de s'afficher. Invalidation depuis `/admin/partenaires`
  via `revalidateReference('ads')`.
- Fournisseurs : **e-mail/mot de passe** (avec confirmation par e-mail) et
  **OAuth Google** (callback : `/auth/callback`).
- `middleware.ts` (runtime **Node.js**) protège `/profil`, `/reglages`,
  `/choix-pseudo`, `/creer`, `/admin`, `/execution`, `/courses`, `/importer`,
  `/relecture`, `/idees/nouvelle` → redirection vers `/connexion?next=…` si non
  connecté. Tolérant aux pannes : une erreur Supabase transitoire ne bloque pas
  le site, le contrôle fin restant assuré dans chaque page (`requireUser`,
  `requireAdmin`).
- **`getProfile()` est le seul accesseur du profil courant** (`lib/auth.ts`) :
  `getRole` / `isAdmin` / `isManager` en dérivent, sans requête propre. Les deux
  lectures d'origine visaient la même ligne (`select role` et `select *`) avec
  chacune son `cache()` React — elles ne se dédupliquaient donc jamais, et le
  `Header` appelait les deux sur chaque page (9 878 requêtes au relevé du
  25/08/2026). Ne pas rajouter de lecture directe de `profiles` visant
  l'utilisateur courant ; les colonnes sont énumérées (`PROFILE_COLUMNS`), la
  table portant trois colonnes d'image en data-URL. Cf.
  `docs/note-regression-cache.md`.
- Rôles applicatifs dans `profiles.role` : `admin` (accès complet) et
  `gestionnaire` (back-office restreint) — voir ci-dessous. Toute autre valeur
  (`member`, `null`…) vaut membre ordinaire.

### Pseudo (création de compte)

L'inscription demande un **pseudo**, et non plus un « nom complet ». Un seul
geste de saisie alimente **deux colonnes**, et c'est la clé du dispositif :

```
saisie « Fabien Chenu »
  → profiles.full_name = "Fabien Chenu"   (nom affiché, casse et accents gardés)
  → profiles.username  = "fabien-chenu"   (adresse du profil public /u/…)
```

- **L'unicité insensible à la casse est portée par le SLUG**, pas par le texte
  affiché : « Fabien » et « fabien » produisent tous deux `fabien`, et l'index
  unique sur `username` refuse le second sans qu'aucun code ne s'en occupe. Le
  même mécanisme attrape gratuitement « Élise » vs « Elise » et « Fabien » vs
  « Fabien! ». Ne pas ajouter de second dispositif d'unicité sur `full_name`
  côté application : la comparaison `ilike` de `pseudoDisponible` est un
  confort d'affichage (message clair avant l'envoi), la contrainte est en base.
- **Longueur 3 à 20** (`PSEUDO_MIN_LENGTH` / `PSEUDO_MAX_LENGTH`). Ce n'est pas
  la base qui a décidé, c'est la carte de recette : l'auteur y est affiché en
  `text-xs` sous un titre déjà serré (`RecipeCardLayout`), et au-delà d'une
  vingtaine de caractères le nom tronque sur mobile. 20 tient par ailleurs sous
  le plafond de 30 du slug — aucun pseudo valide ne peut donc produire un
  handle tronqué, ce qui ferait coller deux pseudos distincts sur la même URL.
- **Pas de contrainte CHECK sur `full_name`** : le trigger `handle_new_user` y
  recopie le nom du compte Google, qui peut dépasser 20 caractères. Une
  contrainte ferait échouer l'insertion dans `auth.users` — c'est-à-dire
  casser la connexion Google entière. La longueur est tenue par l'application ;
  la base ne contraint que `username`.
- **Casse** : un pseudo saisi entièrement en majuscules est ramené à une
  capitale par mot (`FABIEN` → `Fabien`). Seulement s'il compte au moins
  3 lettres — `JP` et `MC` sont des initiales, pas un cri — et seulement à la
  **sortie du champ**, jamais à la frappe : corriger « FAB » en « Fab » dès la
  troisième lettre empêcherait de taper « FABIEN ».
- **Contrôle IA** (`lib/ai/pseudo-moderation.ts`, modèle `claude-haiku-4-5`) :
  grossièreté, propos haineux, diffamation, personnalité non recommandable,
  usurpation. Un seul message côté visiteur — « Pseudo non autorisé » —, jamais
  le motif : l'expliciter, c'est apprendre à contourner. Le motif part dans les
  journaux serveur avec la version du prompt. **Best-effort** (même doctrine que
  `/api/idees/verifier-doublon`) : clé absente, panne ou réponse illisible →
  on autorise, parce que bloquer l'inscription sur une panne de l'API Anthropic
  reviendrait à fermer le site. D'où le filet **local** de `lib/pseudo.ts`
  (noms réservés + grossièretés évidentes), qui ne dépend d'aucun réseau — il
  compare **mot à mot le slug**, jamais par sous-chaîne, sinon « con » refuserait
  « Constance ».
- **`lib/pseudo.ts` (pur) / `lib/pseudo-data.ts` (base + IA, serveur)** : même
  séparation que `ideas.ts` / `ideas-data.ts`, sans quoi le formulaire client
  tirerait `next/headers` et casserait le build.
- **Les contrôles client ne prouvent rien** : `supabase.auth.signUp()` est
  appelable depuis la console du navigateur. Le formulaire appelle donc
  `POST /api/pseudo/verifier` **avant** de créer le compte (unicité + IA), et
  `/choix-pseudo` passe par `POST /api/pseudo/choisir`, qui **revalide tout**
  puis écrit avec la clé service_role — le navigateur n'écrit jamais
  `full_name` / `username` lui-même sur ce chemin. Vérifier avant plutôt
  qu'après la création du compte évite de brûler une adresse e-mail (Supabase
  la refuserait ensuite) pour un pseudo qu'il suffisait de changer.

### `/choix-pseudo` — passage obligé

Écran de choix du pseudo, imposé à tout compte qui n'en a pas — en pratique
toute première connexion Google, où le trigger `handle_new_user` recopie le nom
du compte Google dans `full_name` : un état civil que personne n'a choisi
d'afficher à côté de ses recettes. Pré-rempli avec ce nom (nettoyé, tronqué,
dé-doublonné par `suggestionPseudoLibre`), modifiable — c'est l'objet de l'écran.

- **La marque « a un pseudo » est `profiles.username`**, pas `full_name` : le
  slug n'est écrit que par les chemins qui ont validé le pseudo, alors que
  `full_name` se remplit tout seul. Conséquence directe : **vider l'adresse du
  profil depuis `/reglages` renverrait le membre ici** — `ProfileEditor` refuse
  donc un champ vide.
- **La garde vit dans `requireUser()`** (`lib/auth.ts`), pas dans le
  middleware : toutes les pages privées y passent, `getProfile` est mémoïsé par
  requête, et la poser dans le middleware coûterait une requête base sur
  **chaque** requête HTTP du site. `/choix-pseudo` n'appelle donc pas
  `requireUser` — ce serait une boucle de redirection.
- `/auth/callback` est le seul endroit où le pseudo d'une inscription par
  e-mail peut être écrit : au moment du `signUp` il n'y a pas encore de session.
  Le pseudo validé voyage jusque-là dans les métadonnées du compte, et sa
  disponibilité est **revérifiée** — plusieurs jours peuvent séparer
  l'inscription de la confirmation de l'adresse.

### Rôles du back-office

| Rôle | Périmètre |
|---|---|
| `admin` | Tout : back-office complet, plus les privilèges d'édition disséminés dans le site (publication directe d'une recette, création de référentiels depuis l'éditeur, « connexion en tant que »). |
| `gestionnaire` | Back-office restreint : modération des recettes (`/admin/recettes`) et rédaction du blog (`/admin/blog`). Ni membres, ni référentiels, ni paramètres du site, ni impersonation. |

- `isAdmin()` garde **exactement** son ancien sens (`role === 'admin'`) : tous
  les appels existants hors `/admin` (publication directe, création de tags,
  régie publicitaire…) restent réservés à l'admin complet.
- `isManager()` / `requireManager()` = admin **ou** gestionnaire — c'est la
  garde du layout `/admin`.
- **Le layout `/admin` est volontairement ouvert aux deux rôles ; chaque écran
  réservé à l'admin complet se referme lui-même** par `requireFullAdmin()` en
  première ligne. Conséquence à connaître : **une page ajoutée sous
  `app/admin/` sans cette garde est ouverte au gestionnaire.** Le périmètre
  autorisé est déclaré au même endroit que la barre latérale, dans
  `lib/admin-access.ts` (`ADMIN_NAV`, champ `manager`).
- Le filtrage des entrées de `AdminSidebar` est un confort d'affichage, jamais
  la sécurité : celle-ci est côté serveur (gardes de page + RLS).
- Les routes `/api/admin/*` vérifient elles-mêmes `role === 'admin'` : elles
  restent fermées au gestionnaire.

### Connexion « en tant que » (impersonation)

- **Niveau d'accès hérité**, jamais choisi au clic : `profiles.impersonation_access`
  (`read_only` par défaut, ou `write`) de l'admin qui déclenche l'action se
  réglant depuis Admin → Membres → fiche d'un admin.
- **Lien temporaire** : `POST /api/admin/impersonate` génère un jeton
  Supabase à usage unique (clé service_role, `generateLink`), consommé par
  `/auth/impersonation` qui pose la session en cookies. L'admin doit ouvrir ce
  lien via **clic droit → fenêtre de navigation privée**, sinon la session du
  membre remplace la sienne.
- **Session active** = ligne de `impersonation_sessions` visant l'utilisateur
  courant (`started_at` non nul, `ended_at` nul, non expirée — TTL 60 min).
  C'est la table qui décide, jamais le navigateur, et la même condition est
  réutilisée en SQL par `public.is_read_only_session()` dans les policies RLS
  d'écriture — c'est là qu'est la garantie réelle.
- **Cookie témoin `mc_imp`** (`IMPERSONATION_COOKIE`) : posé par
  `/auth/impersonation`, retiré par `/api/impersonation/end`, calé sur
  `expires_at`. **Indice d'aiguillage négatif, jamais source de vérité** :
  absent → on n'interroge pas la table ; présent → elle tranche avec
  exactement les mêmes prédicats qu'avant. Sa valeur est opaque (`'1'`) : rien
  à y lire, rien à falsifier. Sans lui, `impersonation_sessions` était lue à
  **chaque rendu de page pour 100 % des membres** (3 871 requêtes au relevé du
  25/08/2026) pour un cas qui ne concerne qu'une poignée de sessions
  d'administration.
  Nuance à connaître, par rapport à la doctrine antérieure (« pas de cookie
  dédié ») : le supprimer — il est `httpOnly`, donc hors de portée d'un script
  — ferait disparaître le bandeau et les gardes **client**. Ça ne débride rien
  pour autant : la RLS lit la table en SQL et refuse les écritures. On y perd
  un message clair, pas une protection.
- **Bandeau persistant** (`components/ImpersonationBanner.tsx`) monté dans le
  layout racine ; `ImpersonationProvider` expose le mode aux composants
  client.
- **Bridage lecture seule** : `useMutation` refuse toute écriture,
  `useWriteGuard()` couvre les écritures hors `useMutation`,
  `requireWritableSession()` protège `/creer`, `/importer`, `/relecture`, et
  `/api/import-url` comme `/api/transcribe-photo` renvoient 403.
- **Audit** : `impersonation_sessions` (connexions) + `impersonation_events`
  (écritures abouties ou refusées), consultables en bas d'Admin → Membres.

## Recherche avancée

Écran `/recherche` : huit facettes (ingrédients à inclure / exclure, type,
difficulté, temps total, catégories, note de la recette, note de l'auteur,
allergènes à exclure), colonne persistante au-dessus de **1024 px**, **tiroir
remontant** en dessous.

- **L'URL est le seul état de l'écran** (`lib/search-params.ts`, fonctions
  pures) : rechargement, partage de lien et retour arrière restituent la même
  recherche. Les facettes réécrivent l'URL (`router.replace` débouncé, 300 ms)
  et le Server Component re-rend — **pas d'API de résultats, pas de seconde
  grille côté client**. `RecipeCard`, les pictos d'allergènes et le bandeau
  publicitaire toutes les deux lignes restent donc calculés à un seul endroit.
  Les requêtes concurrentes sont gérées par le routeur (une navigation en
  remplace une autre), sans `AbortController`.
- **Une seule requête SQL** : la RPC `search_advanced_recipes` renvoie la page
  **et** le total (compte fenêtré), en respectant la RLS (`SECURITY INVOKER`).
  Elle remplace les trois requêtes de l'ancien `searchRecipes`.
- **Filtre temps** : la fonction SQL reproduit `effectiveTimes()` (temps saisi,
  sinon somme des étapes) — sinon les résultats contrediraient le temps affiché
  sur les cartes. La butée haute du curseur (8 h) vaut « sans limite ».
- **Allergènes** : le filtre interroge **les deux sources** — la référence
  (`ingredient_refs.allergen_id`) et le texte libre (`ingredients.allergen`),
  qui est ce qui alimente les pictos des cartes. Présenté comme une aide au
  tri, jamais comme une garantie de sécurité alimentaire.
- **Note de l'auteur** : vue `author_ratings` (moyenne des notes de ses
  recettes publiées). Pas de colonne dénormalisée, donc pas de trigger à
  maintenir ni de dérive silencieuse.
- **Compteurs par facette** : volontairement absents. Un compteur juste se
  calcule « tous les filtres sauf celui-ci » ; un compteur faux est pire
  qu'absent.
- **Spinner** : le fouet plein écran couvre tout rafraîchissement des
  résultats — réglage d'une facette, validation du tiroir, « Charger plus ».
  Il est déclaré à un seul endroit (`components/search/SearchResults.tsx`) :
  plusieurs `LoadingOverlay` montés en même temps empileraient leurs voiles.
  Un délai de 120 ms avant affichage (le même que `NavigationSpinner`) évite
  le clignotement sur un rafraîchissement instantané.
- **Compatibilité** : `?category=` (liens de catégorie de l'accueil) est un
  alias de `cat`, fusionné à la lecture — aucune redirection.

## Fournées (batches)

Une **fournée** (table `batches`, + `batch_steps`, `batch_substeps`,
`batch_ingredients`, `batch_utensils`) est une **copie matérialisée** de la
recette au moment de sa création, pas un diff appliqué sur la recette
vivante — mono-recette : une fournée, une recette adaptée, un jour. L'ancien
modèle (`planning.overrides` référençant les `id` de `ingredients` /
`recipe_steps` de la recette) se corrompait silencieusement dès que l'auteur
ré-enregistrait sa recette (`CreerForm` fait un `delete` + `insert` complet à
chaque sauvegarde, ce qui change tous les `id`). Le modèle matérialisé
corrige ça en rendant la fournée indépendante de la recette de base dès sa
création.

**Fusion plan + session (migration « Fournées »)** : l'ancien modèle portait
deux objets successifs — un `planning` (intention) et une `executions`
(réalisation, plusieurs sessions possibles par plan, chaque ligne figée à son
démarrage). Ils sont fusionnés en un seul : une fournée **est** sa propre
réalisation, `batch_steps.done` est la seule case à cocher d'une étape, que
ce soit avant le jour J (« déjà fait en amont ») ou pendant (mode Cuisiner de
l'écran `/fournee/[id]`, cf. `components/batch/BatchView.tsx`). Conséquences
directes :
- **Aucune session à démarrer** : passer en mode Cuisiner ne matérialise
  plus rien (l'ancien `insertMaterializedExecution` a disparu) — la fournée
  porte déjà tout ce qu'il faut cocher depuis sa création. `BatchView` se
  contente de poser `batches.date_debut` à la première entrée en mode
  Cuisiner.
- **Aucune session figée à proposer de supprimer** : modifier un ingrédient
  ou déplacer une étape se reflète instantanément partout, il n'y a plus de
  copie séparée à désynchroniser. Les anciens avertissements (« une session
  en cours ne reflète pas cette modification ») ont disparu de
  `BatchIngredientsEditor` et `BatchStepDonePanel`.
- **Une fournée est toujours supprimable d'un geste** : l'ancienne
  contrainte `executions.planning_id ON DELETE RESTRICT` (qui forçait à
  archiver plutôt que supprimer un plan déjà cuisiné) n'a plus lieu d'être —
  desserrée en `ON DELETE SET NULL` sur `executions_legacy` à la migration.
  `CuisineContent` n'a donc plus qu'une seule action de sortie du planning
  actif (« Supprimer la fournée »), plus de distinction archiver/supprimer.
- **Perte assumée** : plus de trace immuable du jour J (corriger une fournée
  après coup réécrit ce qui a été réellement fait) ni d'historique
  multi-sessions sur un même objet — remplacés par la chaîne de fournées
  successives via « Refaire cette fournée » (`batches.source_plan_id`, posé
  à la duplication dans `CuisineContent.refaireBatch`).
- L'historique de l'ancien modèle (`executions`, `execution_steps`,
  `execution_substeps`, `execution_ingredients`, `execution_utensils`) a été
  renommé `*_legacy` et conservé en base, sans être ni lu ni écrit par
  l'application — une suppression réelle est une migration séparée, à ne
  lancer qu'une fois cette bascule éprouvée.

- **`batches.recipe_id`** est en `ON DELETE SET NULL` (`recipe_title`
  dénormalisé prend le relais pour l'affichage si la recette est supprimée).
  `batch_ingredients.batch_step_id` est une vraie clé étrangère vers
  `batch_steps` — contrairement à l'ancien appariement par `order_index`
  entre `ingredient_groups` et `recipe_steps` (aucune FK), ce qui permet
  d'insérer les étapes d'une sous-recette sans désynchroniser le lien étape ↔
  ingrédients. `order_index` est `numeric` (pas `integer`) pour pouvoir
  intercaler une insertion sans renuméroter toute la suite.
- **Contenu texte de la recette copié, jamais ses images.** `batches` porte
  sa propre copie de `description`, `tips` (`recipe_description`,
  `recipe_tips`), `serving_advice` (`recipe_serving_advice`), rendement
  (`measure_type`, `yield_qty`, `yield_unit`, `yield_desc`, `yield_notes`),
  provenance (`recipe_source`, `recipe_source_url`, `recipe_video_url`),
  difficulté (`difficulty_name`, `difficulty_level`) et moule
  (`mold_type_name`, `mold_forme`, `mold_dims`, `tags_text`) — posée une fois
  pour toutes à la création (`BatchWidget`), jamais resynchronisée après. Une
  fournée reste ainsi complète et lisible même si la recette de base est
  ensuite dépubliée ou supprimée. **Les photos ne sont jamais copiées**
  (data-URL en base, trop lourdes à dupliquer par fournée et par « Refaire ») :
  l'image d'en-tête et les photos d'étape sont relues en direct sur la
  recette de base (via `batch_steps.source_step_id`), avec dégradation propre
  (absence, pas d'erreur) si elle n'est plus accessible. Un bandeau sur
  `/fournee/[id]` signale si la recette de base a été modifiée depuis la
  création de la fournée (comparaison `recipes.updated_at` /
  `batches.created_at`, calculée à la lecture, sans colonne dédiée).
- **Étape « déjà faite / réalisée »** (`batch_steps.done`,
  `batch_ingredients.excluded_when_done`, `batch_substeps.excluded_when_done`) :
  l'utilisateur signale qu'il a réalisé une étape en amont (« la pâte sucrée
  est déjà au congélateur ») ou la coche pendant qu'il cuisine — c'est la
  même case. `done` sort les ingrédients et sous-étapes de l'étape des
  courses et de la mise en place. `batch_ingredients.excluded_when_done` /
  `batch_substeps.excluded_when_done` (par défaut `true` chacune) permettent
  une exception ligne par ligne : un ingrédient ou une sous-étape de l'étape
  restent dans le parcours malgré `done` si l'utilisateur l'a explicitement
  décoché (ex. l'œuf de dorure d'une pâte déjà façonnée mais pas encore
  badigeonnée ni cuite, ou la puce « Porter à ébullition » d'une étape dont
  le mélange initial est déjà fait) — un ingrédient ou une sous-étape
  conservés gardent aussi leur étape affichée normalement. **Une étape n'est
  jamais retirée du déroulé** : une fois entièrement traitée (`done`, sans
  aucun ingrédient/sous-étape gardé), elle reste affichée, simplement barrée
  (`stepFullyDone`) — pour que la progression reste visible et qu'une case
  cochée par erreur se corrige sans faire disparaître l'étape. **Ne jamais
  implémenter ça en basculant `batch_ingredients.removed`** : ça écraserait
  les suppressions faites à la main ligne par ligne, et décocher l'étape les
  rétablirait silencieusement — c'est la même corruption que l'ancien modèle
  `overrides` (`batch_substeps` n'a pas cette colonne : rien à y écraser).
  Les filtres concernés sont centralisés dans `lib/recipe-plan.ts`
  (`batchIngredientExcluded`, `batchSubstepExcluded`, `stepFullyDone`,
  `remainingStepTimes`) : tout l'aval (courses, mise en place, temps affiché,
  tempo de cuisson) en découle.
- **Deux notes par étape**, distinctes : `batch_steps.user_note` porte
  l'intention (écrite en amont, éditable depuis le mode Préparer,
  `BatchStepDonePanel`) ; `batch_steps.commentaire` porte le constat du jour
  J (saisi en mode Cuisiner, `BatchView`). Ne jamais les fusionner en un seul
  champ : l'une prépare, l'autre relate.
- **Remplacer un ingrédient par une recette** (`batch_ingredients.expanded_into_recipe_id`,
  `batch_steps.source_ingredient_id`) : « j'ai du praliné dans ma recette,
  mais je le fais moi-même ». Les étapes de la sous-recette sont **copiées**
  dans la fournée (comme le reste : la sous-recette peut évoluer ou
  disparaître ensuite sans rien changer), à la position et au jour choisis
  étape par étape dans `IngredientExpandDialog`. La ligne d'ingrédient n'est
  ni supprimée ni modifiée, seulement **marquée** : `batchIngredientExcluded`
  la sort des courses et de la mise en place (on ne l'achète plus, on la
  fabrique), et elle reste affichée barrée avec le renvoi vers la recette —
  annuler le remplacement la rétablit intacte. Deux choix structurants :
  - Les ingrédients insérés portent **`added = true`**. Même sens que pour un
    ingrédient ajouté à la main (« absent de la recette de base »), même
    couleur verte, et surtout même conséquence : `rescaleBatchIngredients` ne
    touche jamais une ligne `added`. Sans ça, un changement d'ajustement
    global de la fournée recalculerait `quantité = base × facteur` et
    **écraserait le coefficient propre à la sous-recette** — exactement la
    corruption silencieuse que le modèle matérialisé a corrigée.
  - Le jour proposé pour une étape insérée est
    `jour de l'étape consommatrice + day_offset de l'étape dans sa recette`
    (`suggestedExpansionDay`) : le `day_offset` d'une recette compte à rebours
    depuis **sa propre** dégustation, ici le moment où la préparation doit être
    prête. Une nuit de repos recule donc l'étape d'un jour, toute seule. Ce jour
    proposé est figé dans `base_day_offset`, ce qui permet de le rétablir depuis
    la fiche comme pour n'importe quelle étape déplacée.
  L'intercalation utilise `computeInsertOrderIndexes` : `batch_steps.order_index`
  étant `numeric`, on calcule des valeurs intermédiaires plutôt que de
  renuméroter la fournée (ce qui invaliderait les positions retenues
  ailleurs). Un ingrédient déjà remplacé ne propose plus le picto : il faut
  d'abord annuler.
- **« Refaire cette fournée »** (`CuisineContent.refaireBatch`) duplique
  toutes les lignes `batch_*` d'une fournée vers une nouvelle, avec une
  nouvelle `planned_date` (`batches.source_plan_id` trace la filiation) —
  état d'avancement (`done`, `mep_done`, quantités réelles, commentaires)
  remis à zéro, tout le reste (ajustements, ingrédients ajoutés/retirés,
  étapes déplacées, remplacements par une sous-recette, notes) repris tel
  quel. Ça ne requête jamais la recette de base — la fournée copiée est déjà
  autonome, et ça fonctionne même si cette recette a disparu depuis.
- **RLS à deux couches**, motif repris de `shopping_lists` : une policy
  `<table>_proprietaire` (`FOR ALL`, rôle `public`, basée sur `owns_plan()`)
  + trois policies `impersonation_ro_*` (`RESTRICTIVE`, rôle `authenticated`)
  qui bloquent toute écriture en session « en tant que » lecture seule, quel
  que soit le propriétaire. `owns_execution()` ne sert plus qu'aux policies
  des tables `*_legacy`.

## Avis sur une recette (note + commentaire)

Une fournée **terminée** (`batches.status = 'terminee'`) propose de noter et
commenter la recette d'origine — réutilise la table `comments` déjà en place
(modération admin déjà câblée avant même cette fonctionnalité) plutôt que
d'en créer une nouvelle.

- **Un seul avis par recette et par membre** (index unique
  `comments(recipe_id, user_id)`), jamais un avis par fournée : une même
  recette cuisinée plusieurs fois n'accumule pas les avis du même membre.
  Conséquence directe sur l'affichage : le bouton « Donner votre avis »
  apparaît sur **toute** fournée terminée de cette recette tant qu'aucun avis
  n'existe (`BatchReview`), et disparaît des autres dès qu'un avis est
  déposé, quel que soit son statut. `comments.batch_id` trace la fournée
  d'origine — seule elle rouvre le formulaire en cas de refus.
- **La carte d'avis est au-dessus des onglets Préparer/Cuisiner**, et son
  affichage (`canReview`) ne dépend **ni de `readOnly` ni de `lecture`** :
  une fournée terminée est toujours en lecture seule pour ses étapes, et
  « Fournées terminées » (`/en-cuisine`) l'ouvre justement en `?lecture=1` —
  s'adosser à l'un ou l'autre rendait la carte invisible depuis son point
  d'entrée principal. Donner son avis n'est pas modifier la fournée. Seule
  l'impersonation lecture seule reste bloquante côté client ; la propriété
  de la fournée et la session sont revérifiées par la route serveur.
- **« Ne plus afficher » est porté par la fournée** (`batches.review_dismissed`),
  jamais par la recette : masquer la carte sur une fournée n'empêche pas une
  AUTRE fournée terminée de la même recette de la proposer — sinon un membre
  qui masque une fois se fermerait définitivement la porte de l'avis sur
  cette recette. La mutation vit dans `BatchView` et non dans `BatchReview`
  (masquage optimiste + `router.refresh()`) : la carte se démonte aussitôt, et
  une transition déclarée en son sein mourrait avec elle — même motif que les
  fenêtres modales.
- **Commentaire obligatoire sous 3/5** (`lib/reviews.ts`
  `reviewCommentRequired`) : une note basse sans explication n'aide ni
  l'auteur ni les futurs lecteurs. Validé côté client ET dans la route
  serveur (`POST /api/fournee/[id]/avis`) — jamais uniquement côté client,
  même doctrine que la vérification de pseudo.
- **Écriture par la route, jamais directement par le membre** : `comments`
  n'a pas de policy RLS d'écriture pour un membre ordinaire — seule la route
  serveur écrit, avec la clé service_role (`lib/reviews-data.ts`
  `submitOrUpdateReview`), après avoir vérifié la propriété de la fournée, son
  statut `terminee`, et l'absence d'un avis concurrent pour cette recette.
  Même doctrine que `enregistrerPseudo` : le navigateur ne pose jamais lui-
  même `status`, `ai_score` ou `batch_id`.
- **Score IA indicatif, jamais bloquant** (`lib/ai/comment-moderation.ts`,
  modèle `COMMENT_MODERATION_MODEL`) : 0 à 100, probabilité que le texte soit
  injurieux ou inapproprié — affiché à l'admin (Admin → Commentaires) pour
  prioriser sa file, jamais utilisé pour publier ou refuser automatiquement :
  **tout** avis commenté passe devant un modérateur humain. Best-effort,
  comme la modération des pseudos : clé absente, panne ou réponse illisible →
  score neutre (50), l'avis part quand même en modération.
- **Modération humaine à deux issues** (`/admin/commentaires`,
  `CommentsManager`) : Approuver (`status = 'approved'`, publié) ou Refuser
  avec motif (`status = 'rejected'`, `rejection_reason`) — motif saisi par
  `dialog.prompt`, même geste que « Rejeter avec motif » sur les recettes
  (`RecipesManager`). Spam et Supprimer restent disponibles pour l'abus
  manifeste, sans motif à donner. **Écran dédié, trois files** (à valider /
  refusés / publiés) comme `RecipesManager`, et non une section du tableau
  de bord : la modération y vivait sous une simple ancre `/admin#comments`,
  qui ne menait à aucun écran depuis la barre latérale et laissait un refus
  prononcé introuvable ensuite. Réservé à l'admin complet
  (`requireFullAdmin()` en tête de page, cf. « Rôles du back-office »).
- **Le motif de refus atterrit sur la fournée d'origine**, pas seulement sur
  la ligne `comments` : le trigger SQL `comments_sync_batch_review` recopie
  `status`/`rejection_reason` vers `batches.review_status` /
  `review_rejection_reason` à chaque changement (et réinitialise à `none` si
  la ligne est supprimée). C'est ce qui permet à `BatchReview` de rouvrir un
  formulaire pré-rempli avec le motif, sans requête supplémentaire ni lien
  entre écrans à maintenir à la main.
- **Note moyenne recalculée, jamais accumulée à la main** : le trigger SQL
  `comments_recompute_recipe_rating` réécrit `recipes.rating_avg` /
  `rating_count` depuis les commentaires `approved` à chaque changement —
  même doctrine que `author_ratings` (pas de dérive silencieuse possible).
  Ces deux colonnes existaient déjà et étaient déjà affichées sous le titre
  de la fiche recette ; c'est l'absence d'écriture dans `comments` qui les
  laissait à zéro jusqu'ici.
- **Affichage** : note + nombre d'avis sous le titre (`app/recette/[id]`,
  déjà en place), avis publiés en bas de fiche (`RecipeComments`, section
  `#sec-commentaires`, uniquement les `approved` — filtré par la RLS, pas
  par le composant).

## Mode projet (socle)

Troisième mode de création, à côté de la saisie manuelle et de l'import IA :
composer un dessert à partir de plusieurs recettes de base (pâte sucrée,
crème d'amande, insert…), les dimensionner, les mettre au point sur des
fournées d'essai, puis figer le tout en une recette du carnet. **Seul le
socle de données est en place** — le parcours guidé, les quantités, les
essais et la validation arrivent par lots successifs.

- **Un projet est une recette dès sa création**, pas une entité séparée
  convertie à la fin : sans ça, le moteur de fournée devrait gérer deux types
  de source, et la validation impliquerait une migration d'identifiants qui
  casserait le lien avec les fournées déjà réalisées. La validation n'est
  donc qu'un changement d'état, sans copie ni changement d'`id`.
- **Deux axes indépendants sur `recipes`, à ne jamais confondre** :
  `status` (modération : `draft` → `pending` → `published`/`rejected`, qui
  existe depuis toujours) et `kind` + `project_stage` (mode projet). Une
  recette peut être un projet finalisé et non publié. En particulier,
  `status = 'draft'` — le brouillon affiché dans le carnet sous
  « Brouillons » — n'a rien à voir avec `project_stage = 'wizard'`.
- **`isProjectDraft()` (`lib/projects.ts`) est le seul prédicat
  d'étanchéité.** Un projet **en cours** (`wizard`) ne doit apparaître nulle
  part où l'on liste des recettes, hors de la portée « Projets » du carnet ;
  un projet **validé ou dissous** est une recette ordinaire, que rien ne doit
  distinguer. C'est ce qui réduit la surface du filtrage à quatre points —
  partout ailleurs, le filtre `status = 'published'` déjà en place
  (recherche, accueil, profils publics, abonnements, taxonomies, compteurs
  admin) suffit, un projet en cours étant un brouillon :
  - `lib/carnet.ts` — portée « Projets », exclue de toutes les autres et de
    `counts.all` (« Tout » cesse d'être littéralement tout : c'est le prix,
    assumé, du cloisonnement) ;
  - `/api/recipes/picker` — un chantier n'est pas une sous-recette : ses
    composants peuvent être non résolus et ses quantités ne sont que des
    points de départ ;
  - `lib/shares-data.ts` — un partage de carnet « brouillons compris » ne
    doit pas emporter les projets en cours de son propriétaire ;
  - `/recette/[id]` et `/creer` — redirigés vers le parcours guidé.
- **`lib/projects.ts` (pur) / `lib/projects-data.ts` (base, server-only)** :
  même séparation que `ideas.ts` / `ideas-data.ts`, sans quoi le formulaire
  client tirerait `next/headers` et casserait le build.
- **Le format vit sur `recipes`, jamais dans une table satellite** :
  `measure_type`, `mold_type_id`, `mold_dims`, `servings`, `yield_*`. C'est
  de là que `BatchWidget` tire les coefficients surface/volume que
  `scalingCoef` applique ; un format rangé ailleurs couperait le mode projet
  de toute la machinerie d'ajustement, qu'on veut réutiliser telle quelle.
  `recipe_projects` ne porte donc que ce qui n'a pas de foyer : l'intention
  en texte libre et l'étape courante du dialogue.
- **Un composant est une copie, jamais une référence vivante** (même doctrine
  que les fournées) : ses étapes et ses ingrédients sont écrits dans les
  `recipe_steps` / `ingredient_groups` / `ingredients` **du projet**, et
  `recipe_steps.component_id` dit à quel composant chaque étape appartient —
  le niveau de regroupement qui manquait au modèle, où une étape est appariée
  à un seul groupe d'ingrédients par son `order_index`. Pas de `snapshot`
  jsonb : le moteur de fournée (`materializeBatch`) lit les tables
  relationnelles, une copie en jsonb lui serait invisible et imposerait un
  second moteur — exactement ce que « un projet est une recette » évite.
- **Dissolution assumée dans `/creer`.** `CreerForm` supprime puis réinsère
  toutes les étapes à chaque enregistrement : tous les `component_id`
  disparaissent. Plutôt que d'interdire l'éditeur à une recette de projet (ce
  qui la priverait des photos, ustensiles, tags et moules — alors qu'elle
  doit s'utiliser exactement comme une recette saisie à la main), on
  l'annonce : bandeau à l'ouverture, confirmation à l'enregistrement, puis
  `project_stage = 'dissolved'`. **La vue par composants est perdue, les
  composants ne le sont pas** : §9 est un engagement vis-à-vis d'auteurs
  tiers, il ne doit pas suffire d'ouvrir puis d'enregistrer une recette pour
  la blanchir de ses emprunts. Un projet **en cours**, lui, n'entre pas dans
  `/creer` du tout : il y perdrait sa structure avant même d'exister.
- **RLS en deux temps** : `recipe_projects` (intention, avancement) est
  strictement privée — policy `_proprietaire` sur `owns_recipe()` + les trois
  `impersonation_ro_*` du motif des tables `batch_*`. `recipe_project_components`
  ajoute une **lecture publique quand la recette est publiée** : sans elle,
  le crédit « pâte sucrée de X » serait invisible aux visiteurs de la fiche.
  Filtré par la RLS, jamais par le composant — même doctrine que
  `RecipeComments`.
- **Le parcours guidé enregistre à chaque geste**, jamais à la fin
  (`/projets/[id]`, `ProjectWizard`) : l'étape courante vit dans
  `recipe_projects.wizard_step`, et la liste des composants n'est **jamais**
  tenue en état local — elle vient du rendu serveur, chaque modification écrit
  puis resynchronise (`useMutation`). Un miroir local aurait divergé de la base
  au premier échec d'écriture, sur un objet qui se construit en plusieurs
  sessions et parfois sur plusieurs appareils.
- **Trois chemins de résolution, un seul écrivain.** Copie d'une recette
  existante, proposition de l'IA, saisie à la main : les trois produisent la
  même forme intermédiaire (`ComponentStepDraft`, `lib/projects.ts`) que
  `writeComponentContent` (`lib/projects-write.ts`) est seul à écrire. Sans ce
  pivot, chaque source réinventerait son insertion, avec trois occasions de
  rompre l'appariement étape ↔ groupe d'ingrédients.
- **Un composant occupe un bloc contigu d'`order_index`** (`k × 100`), ce qui
  évite de renuméroter tout le projet à chaque rattachement. Seuls un
  déplacement ou une suppression redistribuent les blocs
  (`resequenceProjectSteps`). **Supprimer un composant passe obligatoirement
  par `clearComponentContent`** : les groupes d'ingrédients ne portent pas de
  `component_id` (ils s'apparient par `order_index`), donc supprimer les étapes
  seules laisserait des groupes orphelins qui se rattacheraient à l'étape d'un
  AUTRE composant à la première redistribution — les ingrédients d'une
  préparation réapparaîtraient sous une autre.
- **L'ordre des sources est imposé** (§5) : carnet → favoris → pâtissiers
  suivis → IA. Les trois portées sont donc interrogées **séparément** via
  `/api/recipes/picker` plutôt que fusionnées : c'est la portée qui a répondu
  qui décide du `source_kind`, donc du crédit d'auteur. La pertinence est
  obtenue en pré-remplissant la recherche avec le nom du composant.
- **Les quantités ne sont pas recalculées ici, elles réutilisent la
  machinerie des fournées** (étape 5) : rapport des volumes ou des surfaces
  entre le moule de la recette source et le format visé (`moldMetrics`), puis
  application ligne par ligne selon le `scaling_mode` du groupe
  (`scalingCoef`) — une pâte à foncer suit la surface, un appareil suit le
  volume. Le `scaling_mode` de la recette source est donc **copié** avec le
  composant : le perdre ferait recalculer de travers tout ce qui n'est pas
  proportionnel au volume. Quand la géométrie ne tranche pas (pas de moule sur
  la source, composant proposé par l'IA ou saisi à la main), l'écran bascule
  sur `/api/scale-recipe`, la route d'ajustement en texte libre déjà en place,
  qui rend le coefficient **et** son explication en une phrase (§6.4).
- **`ingredients.base_quantity` porte la valeur d'origine**, et c'est elle —
  jamais la quantité affichée — que multiplie tout ajustement : sans ça,
  changer deux fois le coefficient multiplierait deux fois. Exactement le rôle
  de `batch_ingredients.base_quantity` côté fournée. Une ligne **modifiée à la
  main** voit sa `base_quantity` effacée : elle sort définitivement du recalcul
  global, comme une ligne `added` d'une fournée que `rescaleBatchIngredients`
  ne touche jamais. La colonne reste vide pour toutes les recettes ordinaires —
  seul le mode projet l'écrit.
- **Le récapitulatif consolide avec `mergeIngredients`**, la fonction de la
  fiche recette, et non une seconde implémentation : elle sait fusionner deux
  lignes du même ingrédient exprimées dans des unités différentes via la table
  de conversions, ce qui compte d'autant plus que les composants viennent de
  recettes différentes.
- **Un essai est une fournée du projet**, jamais un objet de plus (§7). Les
  fournées portent déjà les quantités réellement utilisées
  (`batch_ingredients.real_quantity`), les notes du jour J
  (`batches.commentaire_global`), l'avancement et la filiation d'un essai au
  suivant (`batches.source_plan_id`) : une table d'essais aurait dupliqué tout
  cela et créé une seconde source de vérité sur « combien j'ai vraiment mis ».
  Seul le verdict manquait — `batches.trial_verdict` (`to_review` / `ok` /
  `validated`). La fournée d'essai est créée avec le **même moteur** que celle
  d'une recette ordinaire (`lib/batch-write.ts`, extrait de `BatchWidget` pour
  être partagé), avec un facteur de **1** : les quantités du projet sont déjà
  celles du format visé, un second coefficient les fausserait.
- **Promouvoir les quantités d'un essai** (§7.4) apparie les lignes par
  `batch_steps.source_step_id` → étape du projet → son groupe d'ingrédients
  (par `order_index`) → le nom à l'intérieur du groupe. S'appuyer sur le seul
  nom confondrait deux « Sucre » appartenant à deux composants différents. La
  quantité mesurée devient aussi la nouvelle `base_quantity` : ce qui a
  réellement fonctionné devient la référence, et un futur changement de format
  repart de là.
- **Validation** (§8) : `projectValidationBlockers()` (`lib/projects.ts`)
  liste ce qui bloque — format non renseigné, composant non résolu — recalculé
  côté client à l'affichage ET reposé côté serveur avant l'écriture (un projet
  reste modifiable depuis plusieurs onglets). Aucun essai n'est requis. La
  validation écrit une **section d'assemblage final** (`writeAssemblyStep`,
  `lib/projects-write.ts`) — une étape ordinaire sans `component_id`,
  positionnée après tous les blocs de composants, listant leur ordre — puis
  bascule `project_stage` à `ready`. **`status` ne bouge pas** : la validation
  rend le projet utilisable comme une recette, elle ne la publie pas. Idempo-
  tente : revalider après un retour en brouillon remplace l'assemblage
  précédent (repéré par `component_id is null`) plutôt que d'en empiler un
  second.
- **Réversibilité** (§8.5, `ProjectMarking`) : repasser en brouillon
  (`project_stage: 'ready' → 'wizard'`) est possible tant que la recette n'est
  pas `status = 'published'`. Un projet **dissous**, lui, n'a plus de bouton :
  il n'a plus de composants à retrouver dans le dialogue.
- **Marquage sur la fiche** (§8.4, `ProjectMarking`) : discret, affiché pour
  `ready` **et** `dissolved` — les crédits d'auteur (§9) survivent à la
  dissolution, seule la vue par composants (liée aux étapes) s'y perd. La
  liste des crédits (`getProjectCredits`) est protégée par la policy RLS
  « propriétaire ou recette publiée » posée au socle : rien à refiltrer côté
  application. Un lien vers une recette source supprimée ou dépubliée reste
  affiché en texte (le nom de l'auteur ne disparaît jamais), `sourceRecipeId`
  devenant `null` par la FK `ON DELETE SET NULL`.
- **Essais après validation** (§7.5) : `ProjectTrials` est réutilisé tel quel
  sur la fiche recette (propriétaire uniquement), avec `canLaunch={false}` —
  lancer une fournée y passe déjà par le geste normal de la fiche
  (`BatchWidget`) ; en proposer un second aurait fait deux portes d'entrée
  pour le même geste. Seuls l'historique, la comparaison et la promotion des
  quantités restent affichés.
- **`duplicate_recipe` recopie les composants** et la correspondance ancien →
  nouveau composant sur les étapes : un duplicata est une vraie variante du
  projet. Sans ça, dupliquer puis publier effaçait les crédits.

## Boîte à idées

Module communautaire : `/idees` (liste triable, publique) et `/idees/nouvelle`
(formulaire de création, protégée par `middleware.ts` et
`requireWritableSession()` — même garde que `/creer`, `/importer`,
`/relecture`).

- **`ideas`** (titre 5-60 caractères, description ≤ 1000, statut) +
  **`idea_votes`** (clé primaire composite `(idea_id, user_id)`, qui porte à
  elle seule la contrainte « un vote par membre et par idée » — pas de colonne
  `id` ni d'index supplémentaire). Nommée `idea_votes` et non `votes` : la
  base doit encore accueillir les likes sur les recettes et les profils
  annoncés au produit, un `votes` générique deviendrait vite fourre-tout.
- **Pas de compteur dénormalisé** (même doctrine que `author_ratings`) : le
  nombre de votes est recompté à la volée par les RPC ci-dessous.
- **Statuts** : `new` (défaut), `reviewing`, `in_progress`, `done`,
  `declined` (avec `admin_note` publique), `merged` (fusionnée dans une
  autre idée via `merged_into_id`, RPC `merge_ideas`). Une idée `merged`
  n'apparaît jamais dans `list_ideas` ni dans `suggest_similar_ideas`.
- **Seul un admin modifie `status` / `admin_note` / `merged_into_id`** : la
  RLS ne sachant pas distinguer les colonnes changées dans une même ligne
  (`USING`/`WITH CHECK` ne voient jamais l'ancienne ET la nouvelle valeur
  dans la même expression), la règle est portée par un trigger
  (`ideas_guard_admin_fields`), pas par une policy.
- **`/admin/idees`** (modération, `IdeasManager`) : statut, note admin
  publique, suppression, fusion manuelle d'un doublon. Réservé à l'admin
  complet — `requireFullAdmin()` en tête de page, comme `/admin/membres` ou
  `/admin/moules` (cf. « Rôles du back-office » ci-dessus) : un gestionnaire
  n'a pas à modérer la boîte à idées.
- **RPC `merge_ideas(source_id, target_id)`** : transfère les votes de
  l'idée absorbée vers la cible (`on conflict do nothing`, pas de doublon de
  vote) puis marque la source `merged`. `SECURITY DEFINER` — transférer un
  vote au nom d'un AUTRE utilisateur que l'appelant exige de contourner la
  RLS de `idea_votes` (`user_id = auth.uid()`), même nécessité que le trigger
  `ideas_auto_vote_author` ; la fonction vérifie `is_admin_user()`
  elle-même, pas seulement l'écran qui l'appelle.
- **Détection de doublons par IA** (Claude, `lib/ai/idea-duplicates.ts`),
  en complément du trigramme/FTS ci-dessous qui ne repère qu'une proximité
  lexicale : deux idées peuvent décrire le même besoin sans un seul mot
  commun (« minuteur qui se lance tout seul » ↔ « chronomètre automatique »).
  Deux usages, un seul jeu de prompts/parsing :
  - à la création (`POST /api/idees/verifier-doublon`) : déclenchée à la
    validation du formulaire, pas à la frappe (coût et latence d'un appel
    IA par lettre tapée) — compare l'idée saisie à tout le fonds ouvert, y
    compris les idées `declined` (savoir qu'une idée proche a déjà été
    refusée, et pourquoi via `admin_note`, évite de la reproposer à
    l'identique). Best-effort : clé API absente ou appel en échec →
    `{ matches: [] }`, ne bloque jamais la publication ;
  - côté admin (`POST /api/admin/idees/detecter-doublons`,
    `IdeaDuplicateScanner`) : balaie les idées encore ouvertes deux par
    deux, propose des paires à fusionner en un clic (RPC `merge_ideas`).
  **RPC `ideas_summaries(idea_ids)`** : ré-hydrate les id renvoyés par l'IA
  en objets affichables (titre, statut, votes, « ai-je voté ») avec les
  mêmes composants que le reste du module (`StatusBadge`, `VoteButton`),
  même motif que `list_ideas` / `suggest_similar_ideas`.
- **Quota anti-spam** (trigger `ideas_check_quota`, 5 idées / 24 h / membre) :
  table publique en écriture ouverte à tout membre authentifié, sans lui un
  compte compromis la noierait en quelques secondes.
- **L'auteur vote automatiquement** pour sa propre idée à la création
  (trigger `ideas_auto_vote_author`), sinon elle naît à 0 vote.
- **RPC `list_ideas`** (motif `search_advanced_recipes`) : page + total +
  décompte des votes + « ai-je voté » en une seule requête, `SECURITY
  INVOKER`. **RPC `suggest_similar_ideas`** : prévention des doublons pendant
  la frappe du titre — le plein texte seul échoue sur un mot partiel
  (« chrono » ne matche pas « chronomètre », quasi toujours le cas en cours
  de saisie), d'où un repli trigramme (`pg_trgm`, extension installée hors du
  schéma `public` sur ce projet — d'où `set search_path = public, extensions`
  sur cette fonction). Renvoie aussi `has_voted` par suggestion, pour que son
  bouton de vote direct ne tente pas un second vote (violation de contrainte
  d'unicité sinon).
- **`lib/ideas.ts` (pur) / `lib/ideas-data.ts` (RPC, server-only)** : les
  constantes et types sont utilisés à la fois par la page serveur et par le
  formulaire client (`IdeaForm`) ; regrouper le data-fetching (qui importe
  `next/headers` via `lib/supabase/server`) dans le même fichier faisait
  échouer le build du bundle client. Motif déjà en place pour la recherche
  (`search-params.ts` pur / `search.ts` RPC).
- **Vote optimiste sans resynchronisation bloquante** (`VoteButton`, motif
  `FavoriteHeart`) : état local + rollback en cas d'échec, pas de spinner
  plein écran — c'est une action trop fréquente pour ça. En tri « plus
  votées », la liste ne se réordonne donc pas sous le doigt au moment du
  clic ; elle prend le nouvel ordre à la prochaine navigation.
- **Pas de mécanisme de facettes façon `/recherche`** : le tri (`?tri=`) et
  la pagination (`?n=`) vivent dans l'URL, mais via de simples liens
  (`<Link>`), sans le `SearchProvider` (debounce, panneau mobile) construit
  pour la recherche avancée — un tri à deux valeurs ne le justifie pas.

## Contact et suivi Jira

Formulaire de contact public (`/contact`), notification de l'administrateur,
création automatique d'un ticket Jira pour les signalements de bug, suivi de
son avancement, et e-mail au demandeur quand la correction est **réellement
en ligne**. Décisions de conception détaillées, écarts assumés vis-à-vis de
la spécification d'origine, et points restés non vérifiés faute d'accès à un
projet Supabase/Jira réel : **`docs/contact-jira.md`**.

- **Supabase est la source de vérité, Jira reçoit un ticket pseudonymisé**
  (référence + UUID du membre, jamais son e-mail, son nom, son IP ni son
  user-agent brut) — `corpsTicketJira` (`lib/contact.ts`) est le seul
  constructeur de description de ticket, testé sur cet invariant. Un
  signalement `donnees-personnelles` ne crée **jamais** de ticket, garanti à
  la fois par le code et par une contrainte SQL
  (`contact_messages_jira_bug_only`).
- **Quatre modules serveur, une seule logique pure.** `lib/contact.ts` (pur :
  validation, mappage des statuts Jira, décision de synchronisation,
  compositions d'e-mails — importable par le formulaire, un Client
  Component) ; `lib/contact-data.ts` (flux public, `/api/contact`) ;
  `lib/contact-admin-data.ts` (back-office : lectures via le client de
  session — RLS, écritures via `createAdminClient()`, **aucune policy
  d'écriture n'existe sur ces tables, pour personne, admin compris**) ;
  `lib/contact-sync-data.ts` (webhook + réconciliation Jira, **sans aucune
  session** : tout, lectures comprises, passe par la clé service_role).
- **`decisionSynchroJira`** (`lib/contact.ts`) est le point de calcul UNIQUE
  du webhook Jira, de la réconciliation quotidienne et du bouton
  « Resynchroniser maintenant » : idempotence (le statut Jira n'a pas
  changé) → mappage (`Terminé` → `a_deployer`, `Déployé` → `termine`) →
  protection d'une clôture prononcée à la main par un administrateur, dans
  cet ordre. Statuts Jira reconnus par **id en priorité**, le nom en repli —
  l'id survit à un renommage dans Jira, contrairement au nom seul.
- **L'e-mail de déploiement part immédiatement**, pas après un délai (ce
  qu'aurait exigé un cron Vercel au quart d'heure, incompatible avec le plan
  Hobby) : `deploy_notify` (interrupteur par demande, à couper *avant* le
  passage en « déployé ») est donc le seul moyen de l'empêcher — une fois
  parti, aucun retour en arrière. Réservation par `UPDATE ... WHERE
  deploy_email_status = 'pending'` avant l'envoi réel (doctrine « réserver
  plutôt que constater », cf. `lib/quota-route.ts`) : protège contre une
  course entre le webhook et la réconciliation. Un échec passe en `failed`,
  **jamais** de retour à `pending` — un envoi manqué se rattrape par la
  réponse manuelle de l'administrateur, jamais par un nouvel essai
  automatique. Un membre connecté reçoit aussi une notification in-app,
  indépendante du canal e-mail (elle ne dépend que de `user_id`, pas d'une
  adresse ni du succès de l'envoi).
- **E-mails par SES** (`lib/email.ts`, déjà en production pour les
  notifications d'abonnement) — pas de second fournisseur.
- **Back-office** : `/admin/contact`, réservé à l'admin complet
  (`requireFullAdmin()`), fenêtre des 200 demandes les plus récentes plutôt
  qu'une pagination serveur complète, filtres statut/type en cases à cocher
  (multi-sélection, dans l'URL, tout coché par défaut — un paramètre absent
  vaut « tout coché », une valeur vide vaut « rien coché »), tri/recherche/
  anomalies côté client. Toute mutation (statut, réponse, notes, suppression)
  vit dans la fiche détail (`/admin/contact/[reference]`, adressée par la
  référence humaine) — jamais dans la liste.
- **Photos jointes** (`contact_message_photos`, jusqu'à 3 par demande,
  compressées côté client comme le reste du site) : visibles uniquement dans
  la fiche détail admin — **jamais transmises à Jira**, qui ne reçoit qu'une
  ligne de texte et l'URL directe vers la fiche admin quand une photo est
  jointe (`ContexteTicket.photoAdminUrl`). Une photo est un contenu libre du
  visiteur, rien ne garantit son absence de donnée personnelle : l'envoyer
  romprait l'invariant de pseudonymisation ci-dessus. Cf.
  `docs/contact-jira.md` §15.
- **Suivi côté membre** : section « Mes demandes de contact » dans
  `/reglages` (`lib/contact-member-data.ts`, lecture seule — répondre ou
  changer un statut reste un geste d'administration), avec une fiche par
  demande (`/reglages/mes-demandes/[reference]`) montrant le message, les
  réponses reçues et l'avancement du statut — jamais le contexte technique
  ni le détail Jira. Repose sur quatre policies RLS `*_membre_lecture`
  (`user_id = auth.uid()`), en plus des `*_admin_lecture` déjà en place. Le
  lien apparaît sur l'écran de confirmation du formulaire uniquement pour un
  visiteur connecté. Cf. `docs/contact-jira.md` §16.
- **Anti-spam sans traceur tiers** : honeypot, délai minimum de 3 s porté
  par un jeton **signé côté serveur** (`CONTACT_FORM_SECRET` — un horodatage
  lu du navigateur ne protégerait rien), limitation de débit comptée en base
  (pas en mémoire de process, cette route écrivant avec la clé
  service_role).
- **Tâche planifiée** : `GET /api/cron/contact-jira` (réconciliation
  quotidienne, filet de sécurité — Jira ne réessaie jamais un webhook
  échoué), déclarée dans `vercel.json` à 2 h 30, après le cron
  d'abonnements.

## Réglages du compte

`/reglages` (l'atelier — ce qu'on règle pour soi, distinct de la vitrine
`/u/[handle]`) porte, sous `ProfileHeader` et `PasswordChangeCard` : trois
blocs repliables (`SettingsCard`, replié par défaut, compte affiché dans
l'en-tête), un par relation révocable côté propriétaire — jamais ouverts par
défaut, pour ne pas payer le coût visuel d'un bloc vide à chaque visite.

- **`FollowingCard`** (« Mes abonnements ») : pâtissiers suivis
  (`lib/follows.ts` `getFollowing`), retrait via `follows` delete.
- **`BookSharesCard`** (« Partages de mon carnet ») : mêmes lignes que la
  liste interne de `ShareBookButton`, ici pour consultation/révocation sans
  ouvrir la fenêtre de partage.
- **`RecipeSharesCard`** (« Partages de mes recettes ») : **uniquement**
  `recipe_shares` (partages recette par recette), jamais les partages de
  carnet — les deux granularités restent des cartes séparées, cf. « Partage
  du carnet » (`lib/shares.ts`). Un membre peut donc avoir accès à une
  recette via son carnet sans apparaître ici ; la carte le rappelle en clair
  plutôt que de laisser croire à une liste exhaustive des accès.
- **Compteurs recalculés, jamais dénormalisés** (même doctrine que
  `author_ratings`) : `profiles.followers_count` / `following_count` ne sont
  écrites nulle part (cf. `lib/follows.ts`) et ne doivent **pas** être lues —
  `ProfileHeader` reçoit `followCounts` déjà calculé par le serveur
  (`getFollowCounts`). Ces deux colonnes restent en base, mortes ; les
  supprimer est une migration séparée, hors périmètre de cet écran.
- **Note moyenne d'un profil public** (`getPublicProfileStats`) : `null`
  (donc masquée) tant que `author_ratings.rated_recipes` est à 0 — sans ça,
  un auteur sans aucune note affiche une moyenne de 0/5, indiscernable d'une
  vraie mauvaise moyenne.

## Données de référence (cache)

Les neuf référentiels (`tags`, `recipe_types`, `difficulties`, `units`,
`mold_types`, `allergens`, `ingredient_refs`, `utensils`,
`ingredient_conversions`) et les clés publiques de `site_settings` sont servis
par **`lib/data/reference.ts`**, jamais lus directement. Ils pesaient 22 920
requêtes sur le relevé du 25/08/2026, soit 51 % du trafic REST — la fiche
recette à elle seule en chargeait cinq, plus `tags` via le `Header`.

- **Trois couches** : `unstable_cache` (cache serveur partagé entre requêtes
  et entre visiteurs, avec étiquettes — Next 15.1, pas la directive `use
  cache`), `cache()` React par-dessus (déduplication intra-rendu), et un repli
  non mis en cache sur le client à cookies. Motif éprouvé dans `lib/blog.ts`.
- **Une lecture par table, plusieurs formes en sortie.** `getTags`,
  `getHomeCategories` et `getTagBySlug` partagent une seule lecture ; idem pour
  les deux formes d'`allergens` et les trois d'`ingredient_refs`. Ne pas
  rajouter d'accesseur qui interroge la base — c'est ce qui avait produit les
  doublons. `lib/taxonomy.ts`, `lib/imports.ts` etc. ne sont plus que des
  ré-exports.
- **Toute écriture invalide son étiquette**, sinon la valeur reste périmée
  jusqu'à 24 h : `revalidateReference('units')` (`lib/revalidate-reference.ts`)
  **avant** `router.refresh()` — ce dernier seul relirait la valeur en cache.
- **Lecture au rôle `anon`** (`unstable_cache` interdit les cookies) : ne
  jamais y faire passer une donnée dépendant de l'utilisateur. Et comme une RLS
  qui refuse renvoie zéro ligne plutôt qu'une erreur, **un référentiel vide est
  traité comme un symptôme, jamais comme un résultat** — il n'est pas mis en
  cache et la lecture est refaite avec la session. `site_settings` excepté :
  n'avoir aucune bannière est normal.

Règles complètes et pièges : `docs/note-regression-cache.md`.

## Base de données (Supabase / PostgreSQL)

Types générés dans `lib/database.types.ts` (source de vérité). Tables
principales :

| Domaine | Tables |
|---|---|
| Utilisateurs | `profiles`, `allowlist` |
| Recettes | `recipes`, `recipe_steps`, `step_photos`, `ingredient_groups`, `ingredients`, `recipe_utensils`, `recipe_tags`, `tags`, `difficulties` |
| Référentiels | `units`, `ingredient_refs`, `utensils`, `molds`, `mold_types` |
| Interactions | `favorites`, `comments` |
| Communauté | `ideas`, `idea_votes` — voir « Boîte à idées » ci-dessus (fonctions `list_ideas`, `suggest_similar_ideas`) |
| Projets | `recipe_projects`, `recipe_project_components` (+ `recipes.kind` / `recipes.project_stage`, `recipe_steps.component_id`, fonction `owns_recipe`) — voir « Mode projet » ci-dessus |
| Planification | `planning`, `plan_steps`, `plan_substeps`, `plan_ingredients`, `plan_utensils`, `executions`, `execution_steps`, `execution_substeps`, `execution_ingredients`, `execution_utensils` — voir « Recettes planifiées » ci-dessous |
| Courses | `shopping_lists`, `shopping_list_items` |
| Import IA | `imports` |
| Site | `site_settings` (bannières d'accueil) |
| Impersonation | `impersonation_sessions`, `impersonation_events` |
| Recherche | colonne générée `recipes.fts` (GIN), vue `author_ratings`, fonctions `mc_norm`, `search_advanced_recipes`, `suggest_ingredients` |
| Contact | `contact_messages`, `contact_replies`, `contact_status_history`, `contact_message_photos` — voir « Contact et suivi Jira » ci-dessus, RLS sans policy d'écriture (`docs/contact-jira.md`) |

- Sécurité par **Row Level Security** (les requêtes passent par la session
  de l'utilisateur, jamais par une clé service côté front).
- **Images stockées en data-URL** directement en base (compression côté
  client dans `lib/images.ts` — pas de bucket de stockage ni de CDN).
- Régénération des types : `npm run gen:types` (token Supabase requis) ou
  workflow GitHub Actions manuel (`.github/workflows/gen-types.yml`).

## Routes IA (API Anthropic)

- `POST /api/import-url` — analyse un texte de recette collé et produit un
  brouillon de recette structuré (pas d'import par URL : le JSON-LD
  schema.org des pages de recette liste les ingrédients à plat pour toute la
  recette sans les rattacher à leurs étapes, ce qui pousse l'IA à deviner un
  partage de quantité silencieusement faux quand un ingrédient est réutilisé
  dans plusieurs étapes). `maxDuration = 60 s`, quota journalier configurable
  (`IMPORT_DAILY_QUOTA`, défaut 20).
- `POST /api/transcribe-photo` — transcrit **une** photo de page en texte
  (import par photo). Une photo par requête, et non un lot : le corps d'une
  fonction serverless étant borné (~4,5 Mo), grouper les pages les obligeait à
  être réduites à une définition où le texte d'une page de livre devenait
  illisible pour l'IA (« 150 °C » lu « 160 °C »). Le navigateur lance les
  requêtes en parallèle, assemble les transcriptions et les envoie à
  `/api/import-url`. `maxDuration = 60 s`.
- `POST /api/scale-recipe` — calcule un coefficient d'ajustement des
  quantités (changement de moule/dimensions). `maxDuration = 30 s`.
- `POST /api/projet/structure` — déduit d'une intention en texte libre le
  format visé ET la liste ordonnée des composants. Un seul appel pour les deux
  (la même phrase porte l'un et l'autre ; deux appels feraient payer deux fois
  la même lecture, avec le risque qu'ils se contredisent), même si
  l'utilisateur, lui, garde deux écrans. **Best-effort** : clé absente, panne
  ou réponse illisible → proposition vide, le dialogue reste utilisable
  entièrement à la main. `maxDuration = 30 s`.
- `POST /api/projet/composant` — propose une recette de base pour un composant
  (§5.4). L'échec est ici **remonté**, contrairement à la route précédente :
  l'utilisateur a explicitement demandé une proposition, il doit savoir qu'elle
  n'est pas venue. `maxDuration = 60 s`.

**L'import par photo se fait en deux passes**, dans deux requêtes distinctes :
*lire*, puis *structurer*. Un appel unique devait déchiffrer la page et la
structurer en même temps — deux tâches difficiles à la fois, qui faisaient lire
une page à deux colonnes en travers et fusionner des sous-préparations
indépendantes. La transcription rend au modèle de structuration ce que l'import
par texte collé lui donne depuis toujours : du texte déjà linéarisé.
- Clé `ANTHROPIC_API_KEY` **côté serveur uniquement** ; modèle configurable
  via `IMPORT_MODEL` (défaut `claude-haiku-4-5`). Les appels sont en
  **streaming** : en mode bloquant, une extraction de plusieurs milliers de
  tokens dépasse le `maxDuration` de la route sans rien laisser observer.

## Variables d'environnement

| Variable | Rôle | Exposition |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Publique (inlinée au build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase | Publique (inlinée au build) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (impersonation : lien temporaire + audit ; écritures et lectures du module contact/Jira, qui n'a aucune policy RLS d'écriture) | Serveur uniquement |
| `ANTHROPIC_API_KEY` | API Claude (import / ajustement) | Serveur uniquement |
| `IMPORT_MODEL` | Modèle de structuration (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `TRANSCRIBE_MODEL` | Modèle de lecture des photos (optionnel, défaut `claude-sonnet-5`) | Serveur uniquement |
| `PSEUDO_MODERATION_MODEL` | Modèle du contrôle des pseudos à l'inscription (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `COMMENT_MODERATION_MODEL` | Modèle du score IA sur les avis d'une fournée terminée (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `IMPORT_DAILY_QUOTA` | Quota d'imports/jour (optionnel) | Serveur uniquement |
| `COMING_SOON` | `true` affiche la page d'attente (`/bientot-disponible`) à la place du site — scopée à l'environnement Production Vercel. Voir « Domaines » ci-dessous : `dev.jepatisse.com` en est exempté par `middleware.ts`, quel que soit ce réglage. | Serveur uniquement |
| `CRON_SECRET` | Protège les routes planifiées (`/api/cron/*`) — Vercel ajoute automatiquement l'en-tête `Authorization: Bearer <CRON_SECRET>` à ses appels programmés dès que la variable existe | Serveur uniquement |
| `CONTACT_NOTIFICATION_TO` | Destinataire de la notification à chaque nouvelle demande de contact | Serveur uniquement |
| `EMAIL_REPLY_TO` | Adresse « répondre à » des e-mails transactionnels du module contact | Serveur uniquement |
| `CONTACT_FORM_SECRET` | Signe le jeton anti-robot du formulaire de contact (délai minimum) — absent : dégradé, jamais bloquant | Serveur uniquement |
| `IP_HASH_SALT` | Sel de hachage des adresses IP du formulaire de contact (jamais stockées en clair) | Serveur uniquement |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | Authentification Jira (création de ticket, recherche de statut) | Serveur uniquement |
| `JIRA_PROJECT_KEY` / `JIRA_ISSUE_TYPE_BUG` | Projet et type de ticket pour un signalement de bug | Serveur uniquement |
| `JIRA_STATUS_TO_DEPLOY` / `_ID`, `JIRA_STATUS_DEPLOYED` / `_ID` | Noms (et id, en priorité) des statuts Jira « développé » et « déployé » — cf. « Contact et suivi Jira » | Serveur uniquement |
| `JIRA_WEBHOOK_SECRET` | Secret HMAC du webhook Jira entrant | Serveur uniquement |

Modèle local : `.env.local.example` → `.env.local`.

## Déploiement

- **Vercel**, projet **`mc`** (anciennement `mc-snowy`), branche de production
  `main`, racine du dépôt (framework preset **Next.js**, Node **22.x** — voir
  `DEPLOY.md`). Tous les domaines ci-dessous appartiennent à ce projet — un
  déploiement sur `main` les met donc tous à jour automatiquement.
- **Région des fonctions : Francfort**, la même que le projet Supabase. Elles
  étaient à Washington : chaque requête base traversait l'Atlantique, et une
  page en enchaîne plusieurs — dont certaines en série (cf.
  `docs/audit-egress-supabase.md`). Un changement de région n'a d'effet
  qu'après **redéploiement**.
- **Un second projet Vercel, `dev_jp`, déploie le même dépôt** sur
  `mc-oqp7.vercel.app`, sans domaine propre. Chaque push construit donc deux
  fois, et cette URL sert une copie publiquement joignable du site sur la
  **même** base Supabase. À détacher du dépôt s'il n'a plus d'usage.
- Les variables `NEXT_PUBLIC_*` étant inlinées au build, tout changement
  nécessite un redéploiement **sans cache de build**.
- Côté Supabase : Site URL + Redirect URLs (`https://<domaine>/**`) dans
  Authentication → URL Configuration.
- **Domaines** : `www.jepatisse.com` est le domaine canonique — `jepatisse.com`
  y redirige (308), `jepatisse.fr` et `www.jepatisse.fr` aussi (301). C'est le
  futur domaine public — affiche pour l'instant la page d'attente `COMING_SOON` aux
  visiteurs, ne pas le prendre pour cible lors d'une vérification en
  production. **`dev.jepatisse.com`** est l'URL de production réelle à ce
  stade, réservée aux testeurs (accès restreint) : c'est elle qu'il faut
  utiliser pour vérifier qu'un correctif déployé sur `main` se comporte comme
  attendu. Comme les deux domaines partagent désormais le même projet Vercel
  (et donc le même scope Production pour `COMING_SOON`), c'est
  `middleware.ts` qui exempte spécifiquement `dev.jepatisse.com` de la page
  d'attente (comparaison sur l'en-tête `Host`) — sans quoi les testeurs
  tomberaient eux aussi dessus.

## Commandes

```bash
npm run dev         # serveur de développement (http://localhost:3000)
npm run build       # build de production
npm run start       # serveur de production local
npm run lint        # ESLint (next/core-web-vitals)
npm run typecheck   # tsc --noEmit
npm run gen:types   # régénère lib/database.types.ts depuis la base live
```
## Règles de fonctionnement

Avant toute réponse, effectuer systématiquement une phase de qualification.
Attendre mon OK avant de lancer les modifications

#### 1. Qualification

Identifier :

- Le type de demande :
  - Architecture
  - Développement
  - Analyse fonctionnelle
  - UX / UI
  - Documentation
  - Organisation produit
  - Gestion de projet
  - Migration technique
  - Autre

- Le niveau de complexité :
  - Faible
  - Moyen
  - Élevé

- Le niveau de risque :
  - Faible
  - Moyen
  - Élevé

- Le volume de contexte nécessaire :
  - Local
  - Produit
  - Multi-produits
  - Organisation

#### 2. Recommandation du modèle

Afficher systématiquement :

MODELE RECOMMANDE :
JUSTIFICATION :

Règles :

###### Haiku

Utiliser pour :

- Reformulation
- Résumé
- Documentation simple
- Compte rendu
- Questions courantes

###### Sonnet

Utiliser pour :

- Développement quotidien
- React
- API
- SQL
- Debug
- Refactoring local
- Tests
- Revue de code

###### Opus

Utiliser pour :

- Architecture applicative
- Migration PC SOFT vers React
- Urbanisation du SI
- Design System
- Analyse transverse
- Dette technique
- Plan de transformation
- Arbitrage d'architecture
- Analyse multi-produits
- Organisation du Bureau d'Études

#### 3. Vérification critique

Avant de produire la réponse :

- Rechercher les hypothèses implicites.
- Identifier les risques.
- Identifier les limites de l'analyse.
- Vérifier la cohérence globale.
- Proposer une alternative si elle présente des avantages.

#### 4. Réponse

Structurer systématiquement :

###### Analyse

###### Recommandation

###### Risques

###### Plan d'action


---

## Fonctionnalités déjà en place (Plan gratuit) - Liste non exhaustive
Carnet de recette privé et public
Ajustement de la recette par quantité à produire ou par type de moule
Ajustement de la recette en fonction de la quantité d'un ingrédient disponible
Fournées (planification puis cuisson guidée d'une recette adaptée, écran /fournee/[id])
Gestion de la liste des courses
Remplacement d'un ingrédient d'une fournée par une autre recette
(le praliné acheté devient le praliné fabriqué : ses étapes s'insèrent dans le
déroulé, ses ingrédients rejoignent les courses)
Boîte à idées communautaire pour le développement du site (liste triable,
votes, proposition d'idée avec prévention des doublons)



## Fonctionnalités déjà en place (Plan payant) - Liste non exhaustive
Ajustement de la recette par IA (texte libre)
Import de recette par photos (pages photographiées, lues par IA)
Import de recette par PDF
Import de recette par copier/coller (l'import depuis une URL a été retiré : le JSON-LD des pages de recette ne rattache pas les ingrédients à leurs étapes, ce qui produisait des quantités erronées sur les ingrédients réutilisés dans plusieurs étapes)



## Fonctionnalités à venir (Plan gratuit) - Liste non exhaustive

Communauté de patissier, personnes suivies, like sur les profils et sur les recettes

Marquage d'une étape déjà réalisée dans une recette planifiée (retire ses
ingrédients des courses et de la mise en place, cuisson conservable).

Déclenchement automatique du chronomètre du téléphone selon le timing des étapes.

Identification et gestion des allergènes.

Versioning de recettes (système de fork) pour créer et visualiser l'évolution d'une recette.

Création et consultation de fiches techniques et fiches d'erreurs.

Intégration de lecteurs vidéo YouTube directement dans les étapes de recette.

Système d'envoi de message automatique lors d'un refus de publication.

Messagerie interne entre utilisateurs.




## Fonctionnalités à venir (Plan payant) - Liste non exhaustive

Importation automatisée de recettes depuis des sites internet tiers grâce à l'IA

Génération de fiches techniques professionnelles (poids final, portions, coût matière, prix de revient, DLC conseillée).

Calcul et gestion des coûts matières.

Partage sécurisé de carnets de recettes privés.

Assistant IA contextuel (calculs de portions, conversions de moules, substitution d'ingrédients).

Suivi et gestion des stocks d'ingrédients.

Compagnon vocal déporté pour pilotage des recettes et minuteurs sans contact manuel.
