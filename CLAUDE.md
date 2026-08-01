# Maryse Club — Documentation technique

Site de partage de recettes de pâtisserie. Application web full-stack
TypeScript, déployée sur Vercel, avec Supabase comme backend (base de
données, authentification).

## Repères pour travailler sur ce dépôt

- **Production** : la branche `main` est déployée automatiquement sur Vercel
  (projet `mc-snowy`). Ne pousser sur `main` que du code vérifié.
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
| Hébergement | **Vercel** (fonctions serverless, projet `mc-snowy`) | Node 22.x |

## Architecture

```
app/                    Pages et routes (App Router)
├── page.tsx            Accueil
├── connexion/          Connexion / inscription (e-mail + OAuth)
├── creer/              Éditeur de recette (création + édition)
├── recette/[id]/       Fiche recette (+ mode planifié)
├── execution/[id]/     Écran d'exécution guidée d'une recette
├── courses/[id]/       Liste de courses
├── profil/             Profil (recettes, favoris, planning, listes)
├── recherche/          Recherche avancée (facettes + résultats)
├── importer/           Import de recette par IA (texte collé)
├── relecture/[id]/     Relecture d'un brouillon importé
├── admin/              Back-office (layout partagé + 5 sous-écrans)
├── api/
│   ├── import-url/       POST — analyse IA d'une recette (texte) → brouillon
│   ├── transcribe-photo/ POST — lecture IA d'UNE photo de page → texte
│   ├── scale-recipe/     POST — coefficient IA d'ajustement des quantités
│   ├── recherche/compte/ GET  — compte seul des résultats (tiroir mobile)
│   ├── ingredients/      GET  — autocomplétion des ingrédients
│   ├── recipes/          GET  — pagination de l'accueil
│   ├── admin/impersonate/ POST — lien de connexion « en tant que »
│   └── impersonation/    POST — fin de session / journal d'audit
├── auth/callback/      Callback OAuth / confirmation e-mail
└── auth/impersonation/ Consommation d'un lien « en tant que »

components/             Composants React (client pour l'interactif)
lib/                    Accès données typés + logique métier pure
├── supabase/           Clients navigateur / serveur / middleware
├── database.types.ts   Types générés depuis la base Supabase
└── *.ts                recipes, profile, executions, admin, recipe-plan…
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
- **Suppression optimiste dans une liste.** `useMutation` repasse `busy` à
  `false` dès que l'écriture réseau aboutit — avant que `router.refresh()`
  n'ait fini de resynchroniser le rendu serveur. Si la liste vient de props
  serveur affichées telles quelles, l'élément supprimé reste visible pendant
  cette fenêtre alors que le spinner a déjà disparu. Toujours doubler
  `useMutation` d'un état local initialisé depuis les props (`useState` +
  `useEffect` de resynchronisation) et filtrer l'élément supprimé au succès
  de la mutation, pour que sa disparition soit synchrone avec l'arrêt du
  spinner (cf. `ProfileTabs.tsx` `delRecipe` / `components/ImporterList.tsx`
  `supprimer`).

## Authentification

- Supabase Auth par **cookies** (`@supabase/ssr`), vérifiable côté serveur.
- Fournisseurs : **e-mail/mot de passe** (avec confirmation par e-mail) et
  **OAuth Google** (callback : `/auth/callback`).
- `middleware.ts` (runtime **Node.js**) protège `/profil`, `/creer`,
  `/admin`, `/execution`, `/courses`, `/importer`, `/relecture` → redirection
  vers `/connexion?next=…` si non connecté. Tolérant aux pannes : une erreur
  Supabase transitoire ne bloque pas le site, le contrôle fin restant assuré
  dans chaque page (`requireUser`, `requireAdmin`).
- Rôles applicatifs dans `profiles.role` (`admin` pour le back-office).

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
  Pas de cookie dédié : le mode ne peut donc pas être désactivé côté
  navigateur, et la même condition est réutilisée en SQL par
  `public.is_read_only_session()` dans les policies RLS d'écriture.
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

## Recettes planifiées (planning / exécution)

Un plan est une **copie matérialisée** de la recette au moment de la
planification, pas un diff appliqué sur la recette vivante. L'ancien modèle
(`planning.overrides` référençant les `id` de `ingredients` / `recipe_steps`
de la recette) se corrompait silencieusement dès que l'auteur ré-enregistrait
sa recette : `CreerForm` fait un `delete` + `insert` complet de
`ingredient_groups` / `recipe_steps` à chaque sauvegarde, ce qui change tous
les `id` — un plan existant perdait ses ajustements, réaffichait des
ingrédients supprimés, et pouvait désynchroniser liste de courses et mise en
place. Le nouveau modèle matérialise le contenu dans le plan lui-même, qui
devient indépendant de la recette d'origine.

- **`planning`** (+ `plan_steps`, `plan_substeps`, `plan_ingredients`,
  `plan_utensils`) porte l'**intention** : une copie de la recette propre à
  l'utilisateur, modifiable (quantités, ingrédients ajoutés/supprimés, et à
  terme remplacement d'un ingrédient par une sous-recette) sans dépendre de
  l'évolution de la recette d'origine. `planning.recipe_id` est en
  `ON DELETE SET NULL` (`recipe_title` dénormalisé prend le relais pour
  l'affichage si la recette est supprimée). `plan_ingredients.step_id` est une
  vraie clé étrangère vers `plan_steps` — contrairement à l'ancien appariement
  par `order_index` entre `ingredient_groups` et `recipe_steps` (aucune FK),
  ce qui permettra d'insérer les étapes d'une sous-recette sans désynchroniser
  le lien étape ↔ ingrédients. `order_index` est `numeric` (pas `integer`)
  pour pouvoir intercaler une insertion sans renuméroter toute la suite.
- **`executions`** (+ `execution_steps`, `execution_substeps`,
  `execution_ingredients`, `execution_utensils`) porte la **réalisation** :
  une session par « je cuisine ce plan maintenant », plusieurs sessions
  possibles par plan. Chaque ligne **fige** au démarrage le nom, l'unité et
  la quantité prévue (`planned_quantity` / `planned_text`), et n'ajoute que
  l'état constaté (`done`, `real_quantity`, `commentaire`). Ses clés
  étrangères vers les tables `plan_*` sont en `ON DELETE SET NULL`.
  **Ne jamais resynchroniser ces colonnes figées depuis le plan** — même bien
  intentionné, ça détruirait la trace de ce qui a réellement été fait le jour
  J. Si le plan évolue après une session (l'auteur remplace la pâte de
  pistache par du praliné, ou vous corrigez le plan vous-même), la session
  passée reste inchangée : c'est le but, pas un oubli.
- Un plan **ayant au moins une exécution ne peut plus être supprimé**
  (`executions.planning_id` en `ON DELETE RESTRICT`) — seulement archivé
  (`planning.status = 'archive'`). C'est ce qui garantit la trace des
  recettes planifiées déjà réalisées. Toute action « supprimer un plan »
  (ex. bouton « Retirer du planning » de l'onglet Planning) doit d'abord
  tenter l'archivage plutôt qu'un `delete` qui échouerait en violation de
  contrainte dès qu'une session existe.
- **Replanifier** une recette à partir d'un plan existant = dupliquer les
  lignes `plan_*` d'un `planning.id` vers un nouveau, avec une nouvelle
  `planned_date` (`planning.source_plan_id` trace la filiation). Ça ne
  requête jamais la recette d'origine — le plan copié est déjà autonome.
- **RLS à deux couches**, motif repris de `shopping_lists` : une policy
  `<table>_proprietaire` (`FOR ALL`, rôle `public`, basée sur
  `owns_plan()` / `owns_execution()`) + trois policies `impersonation_ro_*`
  (`RESTRICTIVE`, rôle `authenticated`) qui bloquent toute écriture en
  session « en tant que » lecture seule, quel que soit le propriétaire.

## Base de données (Supabase / PostgreSQL)

Types générés dans `lib/database.types.ts` (source de vérité). Tables
principales :

| Domaine | Tables |
|---|---|
| Utilisateurs | `profiles`, `allowlist` |
| Recettes | `recipes`, `recipe_steps`, `step_photos`, `ingredient_groups`, `ingredients`, `recipe_utensils`, `recipe_tags`, `tags`, `difficulties` |
| Référentiels | `units`, `ingredient_refs`, `utensils`, `molds`, `mold_types` |
| Interactions | `favorites`, `comments` |
| Planification | `planning`, `plan_steps`, `plan_substeps`, `plan_ingredients`, `plan_utensils`, `executions`, `execution_steps`, `execution_substeps`, `execution_ingredients`, `execution_utensils` — voir « Recettes planifiées » ci-dessous |
| Courses | `shopping_lists`, `shopping_list_items` |
| Import IA | `imports` |
| Site | `site_settings` (bannières d'accueil) |
| Impersonation | `impersonation_sessions`, `impersonation_events` |
| Recherche | colonne générée `recipes.fts` (GIN), vue `author_ratings`, fonctions `mc_norm`, `search_advanced_recipes`, `suggest_ingredients` |

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
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service_role (impersonation : lien temporaire + audit) | Serveur uniquement |
| `ANTHROPIC_API_KEY` | API Claude (import / ajustement) | Serveur uniquement |
| `IMPORT_MODEL` | Modèle de structuration (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `TRANSCRIBE_MODEL` | Modèle de lecture des photos (optionnel, défaut `claude-sonnet-5`) | Serveur uniquement |
| `IMPORT_DAILY_QUOTA` | Quota d'imports/jour (optionnel) | Serveur uniquement |

Modèle local : `.env.local.example` → `.env.local`.

## Déploiement

- **Vercel**, projet `mc-snowy`, branche de production `main`, racine du
  dépôt (framework preset **Next.js**, Node **22.x** — voir `DEPLOY.md`).
- Les variables `NEXT_PUBLIC_*` étant inlinées au build, tout changement
  nécessite un redéploiement **sans cache de build**.
- Côté Supabase : Site URL + Redirect URLs (`https://<domaine>/**`) dans
  Authentication → URL Configuration.

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
Planification de l'execution des recettes
Gestion de la liste des courses



## Fonctionnalités déjà en place (Plan payant) - Liste non exhaustive
Ajustement de la recette par IA (texte libre)
Import de recette par photos (pages photographiées, lues par IA)
Import de recette par PDF
Import de recette par copier/coller (l'import depuis une URL a été retiré : le JSON-LD des pages de recette ne rattache pas les ingrédients à leurs étapes, ce qui produisait des quantités erronées sur les ingrédients réutilisés dans plusieurs étapes)



## Fonctionnalités à venir (Plan gratuit) - Liste non exhaustive

Communauté de patissier, personnes suivies, like sur les profils et sur les recettes

Éclatement d'un ingrédient spécifique en sous-étapes de préparation détaillées.

Déclenchement automatique du chronomètre du téléphone selon le timing des étapes.

Identification et gestion des allergènes.

Boîte à idées communautaire pour le développement du site.

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
