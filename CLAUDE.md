# Je pâtisse ! — Documentation technique

Site de partage de recettes de pâtisserie. Application web full-stack
TypeScript, hébergée chez **Infomaniak** — application et base sur Virtuozzo
Cloud (Genève), photos sur le stockage objet Swift. La pile d'authentification
et d'API est **Supabase auto-hébergée** (PostgreSQL + GoTrue + PostgREST), pas
le service managé.

## Repères pour travailler sur ce dépôt

- **Production** : `www.jepatisse.com` et `dev.jepatisse.com` sont tous deux
  servis depuis Virtuozzo — `www` affiche la page d'attente `COMING_SOON`,
  `dev` en est exempté et sert le site réel (voir « Déploiement »). Ne
  pousser sur `main` que du code vérifié.
- **L'utilisateur travaille exclusivement en ligne, jamais en local** — pas de
  terminal sur sa machine, pas de client SSH installé. Toute action côté
  infrastructure (Virtuozzo, DNS Infomaniak, secrets GitHub…) doit donc
  préciser **« Où : »** avant la manœuvre — quel nœud (216658 applicatif,
  216680 équilibreur de `jepatisse-app`, 216115 équilibreur de
  `jepatisse-bdd`, 216075 PostgreSQL, 216114 GoTrue, 216242 PostgREST,
  217256 pgweb), et par quel canal (console Infomaniak / *Configuration
  manager* / éditeur de configuration / Web SSH du nœud). Ne jamais supposer
  qu'une commande shell est possible sans avoir nommé le nœud — ni qu'elle
  s'exécutera en root : le Web SSH du nœud 216115 tourne sous l'utilisateur
  `nginx`, sans `sudo`, et n'écrit que dans `conf.d/`.
- **Une commande destinée au Web SSH tient sur UNE seule ligne**, enchaînée
  par `&&` ou `;` — jamais un bloc de plusieurs lignes, ni une boucle, ni un
  `if` déplié. Un bloc collé dans un terminal web s'exécute ligne par ligne,
  mélange sa sortie aux invites intermédiaires, et rend le résultat
  inexploitable à la copie. Corollaire, plus important encore : **quand la
  sortie doit être recopiée ailleurs** (clé, jeton, empreinte, chaîne de
  connexion), elle doit être produite **sur une seule ligne, seule** — sans
  titre, sans repère, sans ligne voisine. Tout ce qui l'entoure finit copié
  avec elle : c'est ce qui a mutilé deux fois la clé de déploiement
  (§ « Déployer `main` automatiquement » de `DEPLOY.md`). Une valeur qu'on
  veut vérifier se demande par une **seconde** commande, pas en ajoutant une
  ligne à la première.
- **Une action posée dans un panneau ne prouve pas qu'un processus l'a
  reçue.** Après toute variable ou fichier modifié côté Virtuozzo, vérifier
  l'état **du processus**, pas celui de l'interface — `pm2 env <id>` sur la
  pile Node.js, `/proc/<pid>/environ` du vrai PID sur un nœud Docker (jamais
  `/proc/1/environ`, qui est le lanceur de la plateforme). Ce contrôle a
  tranché plusieurs pannes coûteuses le 13/09 (§ 7.17, § 7.21 du dossier de
  migration) — un panneau à jour et un processus à jour sont deux choses
  différentes.
- **Vérification** avant tout push : `npm run typecheck` (et `npm run build`
  pour les changements structurels).
- **Langue** : code commenté en français, UI en français ; les messages de
  commit sont en français.
- **Types de la base** : ne jamais éditer `lib/database.types.ts` à la main —
  le régénérer par le workflow manuel « Régénérer les types de la base »,
  qui ouvre une pull request (jamais d'écriture directe sur `main`). Il joint
  la base par un tunnel SSH à travers le nœud applicatif (216658) et le
  réseau interne — **aucun Endpoint à ouvrir** (rôle `gen_types`, privilège
  `REFERENCES` seul ; `DEPLOY.md` § « Régénérer les types de la base »).
- **Images** : déposées sur le **stockage objet Swift** par le navigateur, via
  une URL signée mintée par `/api/stockage/televersement` — les octets ne
  transitent jamais par l'application. Compression côté client via
  `lib/images.ts` / composant `ImageSlot`. (Les data-URL en base sont
  l'ancien modèle, entièrement repris par le lot B ; il n'en reste que dans
  `articles.content`, hors périmètre.)
- **Ne jamais recharger une image déjà sur Swift dans un `<canvas>`** (via
  `resizeDataUrlToThumb`/`chargerImageDepuisSrc`, `lib/images.ts`) **si elle
  n'a pas changé** : `crossOrigin="anonymous"` exige un en-tête CORS sur la
  lecture, que le conteneur peut ne pas renvoyer — l'échec remonte en
  « Image illisible » sur une image qui s'affiche pourtant très bien. Bug
  réel rencontré dans `CreerForm` : les vignettes (`hero_thumb_url`/
  `hero_card_url`) étaient recalculées à **chaque** enregistrement même sans
  changement de photo, cassant la sauvegarde de toute recette déjà illustrée.
  Corrigé en ne recalculant que si `hero`/`heroOriginal` est un dépôt frais
  (`estDataUrlImage`, `lib/storage.ts`) — sinon les colonnes sont omises de
  l'update, gardant les vignettes déjà en base.
- **Scripts SQL** : ne pas créer de fichier `.sql` dans `db/`. Toute
  migration ou requête SQL doit être affichée directement dans la
  conversation (bloc de code SQL), pour être copiée-collée dans **pgweb**,
  l'éditeur SQL en ligne posé le 19/09/2026 :
  `https://auth.jepatisse.com/pgweb/` (nœud 217256, rôle `pgweb_admin`,
  mode opératoire complet dans `DEPLOY.md` § « Éditeur SQL en ligne »).
  Deux conséquences à ne pas confondre : l'utilisateur a de nouveau une
  console SQL permanente, mais **Claude n'y a aucun accès** — elle est
  derrière une authentification HTTP Basic dont lui seul a les identifiants,
  et c'est lui qui exécute. Écrire le SQL en supposant qu'il sera lu et joué
  par un humain : commenté, idempotent quand c'est possible, jamais une
  suite de gestes à enchaîner à l'aveugle. Le port 5432 reste fermé ; un
  outil **extérieur** (runner GitHub Actions) passe par le nœud applicatif en
  SSH (`scripts/tunnel-bdd.mjs`), jamais par un Endpoint.
- **pgweb ne peut PAS modifier la structure d'une table** (`ALTER TABLE`,
  qu'il s'agisse d'ajouter une colonne ou une contrainte). Découvert le
  25/09/2026 (JEP-254) : `pgweb_admin` a `LOGIN BYPASSRLS` et rien de plus
  — aucun `GRANT` de privilèges (`SELECT`/`INSERT`/…) ne remplace la
  propriété de la table, qu'a exclusivement `postgres`, et `pgweb_admin` n'a
  pas non plus le droit de se rendre membre de `postgres`
  (`grant postgres to pgweb_admin` échoue avec « permission denied to grant
  role »). **Pour toute migration qui touche une table existante**, écrire le
  SQL comme d'habitude pour la partie lisible (fonctions, requêtes), mais
  préciser dans le message qu'il faudra le jouer via `psql` en tant que
  `postgres`, en Web SSH sur le nœud **216075** (PostgreSQL), pas via
  pgweb — `psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "…"`. Une
  fonction (`CREATE FUNCTION`) ou une requête de lecture/écriture de
  données, elles, passent bien par pgweb : la limite ne porte que sur le
  DDL des tables.
- **Une fonction `SECURITY DEFINER` doit appartenir à `postgres`, jamais à
  `pgweb_admin`** — elle s'exécute avec les droits de son propriétaire.
  Découvert le 01/10/2026 (JEP-249), deux pièges en chaîne : `postgres`
  n'est **pas superutilisateur** sur cette base, donc
  `alter function … owner to postgres` sur une fonction créée dans pgweb
  échoue (« must be owner of function »), et un `CREATE` de plusieurs
  milliers de caractères collé dans le Web SSH est **tronqué** par le
  terminal (la commande reste ouverte sur une invite `>`). Mode opératoire :
  1. **pgweb** — créer la fonction sous un nom de modèle
     (`<nom>_modele`), lisible sur plusieurs lignes, puis
     `revoke all … from public, anon, authenticated` sur ce modèle ;
  2. **Web SSH 216075**, une ligne courte — `postgres` la recopie sous le
     vrai nom, et en devient propriétaire :
     `psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "do \$\$ begin execute replace(pg_get_functiondef('public.<nom>_modele(<types>)'::regprocedure), '<nom>_modele', '<nom>'); end \$\$; grant execute on function public.<nom>(<types>) to authenticated;"`
     (le corps ne doit pas contenir son propre nom, sinon `replace` le
     réécrit aussi ; `\$` obligatoire, sans quoi le shell efface `$$`) ;
  3. **pgweb** — `drop function public.<nom>_modele(<types>)`, puis
     contrôler `pg_get_userbyid(proowner)` dans `pg_proc`.
  Remplacer une fonction existante appartenant déjà à `postgres` suit le même
  chemin (pgweb ne peut pas la remplacer : « must be owner »). Une fonction
  sans privilège (`SECURITY INVOKER`, calcul pur comme `mc_ingredient_key`)
  peut rester à `pgweb_admin`.
- **Polices** : Playfair Display / Work Sans / Parisienne sont servies par
  `next/font/local` (`app/fonts.ts`), fichiers `.woff2` versionnés dans
  `app/fonts/` (sous-ensemble `latin` des polices variables de Google Fonts),
  auto-hébergées depuis `/_next/static` — jamais un `<link>` vers
  `fonts.googleapis.com`, qui bloquait le premier affichage (audit PageSpeed
  du 28/09/2026). **Jamais `next/font/google`** (JEP-299) : il téléchargeait
  les polices chez Google à chaque build, et Google renvoie parfois des
  adresses sans extension que Next 15.5 ne sait pas lire — build en échec sur
  le nœud (04/10) puis sur un runner GitHub (06/10). Material
  Symbols reste chargée depuis Google (police à ligatures, non gérable par
  `next/font`), mais réduite au poids (`wght@300`, seule valeur utilisée) et
  aux icônes réellement affichées par le code — sous-ensemble recalculé à
  **chaque build** par `scripts/material-symbols.mjs` (jamais une liste
  entretenue à la main : une icône ajoutée au code apparaît d'elle-même au
  prochain déploiement). La restriction d'axe seule ne réduisait quasiment
  rien (976 Kio contre 974 pour le catalogue complet) — tout le poids vient
  du nombre de glyphes, d'où l'obligation du sous-ensemble par nom
  (`icon_names=`, 34 Kio pour ~180 icônes).

---

## Stack

| Couche | Technologie | Version |
|---|---|---|
| Framework | **Next.js** (App Router, Route Handlers) | 15.x |
| Langage | **TypeScript** (mode strict) | 5.7 |
| UI | **React** (Server + Client Components) | 19 |
| Styles | **Tailwind CSS** (design tokens dans `tailwind.config.ts`) | 3.4 |
| Backend | **Supabase auto-hébergée** — PostgreSQL + GoTrue + PostgREST, RLS | PG 17.6 |
| Client Supabase | `@supabase/supabase-js` + `@supabase/ssr` (auth par cookies) | 2.x / 0.12 |
| Stockage | **Swift** (Infomaniak Public Cloud), dépôt signé TempURL | — |
| IA | **API Anthropic (Claude)** — import et ajustement de recettes | `claude-haiku-4-5` (structuration) / `claude-sonnet-5` (lecture de photos) |
| Hébergement | **Infomaniak Virtuozzo Cloud** (Genève) — pile Node.js native + `pm2`, derrière un équilibreur NGINX | Node 22.x |

## Architecture

```
app/                    Pages et routes (App Router)
├── page.tsx            Accueil
├── connexion/          Connexion / inscription (e-mail + OAuth)
├── creer/              Éditeur de recette (création + édition)
├── recette/[id]/       Fiche recette (consultation, création d'une fournée)
├── fournee/[id]/       Fiche + mode Pâtisser d'une fournée (Préparer/Pâtisser)
├── execution/[id]/     Ancienne URL d'une session — redirection vers /fournee/[id]
├── courses/[id]/       Liste de courses
├── profil/             Profil (recettes, favoris, fournées, listes)
├── recherche/          Recherche avancée (facettes + résultats)
├── idees/              Boîte à idées (liste + tri + votes)
├── idees/nouvelle/     Proposer une idée (formulaire + prévention des doublons)
├── notifications/      Toutes les notifications (filtre Membre / Administrateur)
├── projets/nouveau/    Mode projet — étape 1 d'un projet pas encore créé
│                       (choix IA / manuel ; aucune écriture)
├── projets/[id]/       Mode projet — parcours guidé (intention → format →
│                       structure → recettes des composants)
├── importer/           Import de recette par IA (texte collé)
├── relecture/[id]/     Relecture d'un brouillon importé
├── admin/              Back-office (layout partagé + 5 sous-écrans)
├── api/
│   ├── projet/           POST — création d'un projet au passage à l'étape 2
│   │                     (recette + satellites + proposition de l'IA)
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
│   ├── cron/notifications/ GET — outbox, rappels de fournée, récapitulatifs
│   ├── compte/mot-de-passe/ POST — alerte de sécurité après changement de mot de passe
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
  `/relecture`, `/idees/nouvelle`, `/notifications` → redirection vers `/connexion?next=…` si non
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

- **Changer de pseudo : `/reglages` → « Modifier le profil », un seul champ**
  (04/10/2026, sans ticket Jira). L'adresse du profil public n'est plus un champ libre : elle est
  **dérivée du pseudo** (`pseudoSlug`), affichée en lecture seule sous le champ,
  de sorte que `full_name` et `username` ne divergent plus. L'enregistrement
  passe par `POST /api/pseudo/choisir` (mêmes contrôles qu'à l'inscription :
  format, unicité, IA) — `ProfileEditor` n'écrit plus jamais `username` lui-même ;
  seules la bio et les liens partent encore en écriture directe. La route sert
  donc deux gestes : le **premier choix** (CGU + attestation d'âge exigées,
  décompte de l'inscription) et le **changement** d'un membre déjà inscrit (ni
  l'un ni l'autre).
  - **Un changement d'adresse par 60 jours** (`PSEUDO_DELAI_CHANGEMENT_JOURS`,
    `profiles.pseudo_changed_at`). La première saisie ne compte pas. Le délai
    ne porte que sur l'**adresse** (le slug) : rectifier la casse ou les accents
    d'un pseudo sans changer son slug reste libre, aucun lien ne casse. Contrôlé
    **avant** la vérification complète, pour qu'un refus ne coûte pas un appel
    IA ; un pseudo inchangé ne coûte ni vérification ni délai.
  - **L'ancienne adresse `/u/<ancien-slug>` cesse de fonctionner** (arbitrage
    du 04/10/2026 : pas d'historique des slugs). L'éditeur le dit avant l'envoi.
  - **`pseudo_changed_at` est lue à part** (`dernierChangementPseudo`,
    `lib/pseudo-data.ts`), jamais via `PROFILE_COLUMNS` : l'y ajouter avant la
    migration ferait échouer la lecture du profil sur tout le site (profil
    `null`, membres renvoyés sur `/choix-pseudo`). Colonne absente → le délai
    est simplement inactif, rien ne casse.
  - **Garde-fou en base** : le trigger `profiles_guard_pseudo` refuse à un
    membre (`authenticated` / `anon`, hors admin) toute écriture de `username`,
    `pseudo_changed_at` ou — sur un `UPDATE` — `full_name`. Sans lui, le délai
    se contournait depuis la console du navigateur (la RLS laisse un membre
    écrire sa propre ligne). Posé par `psql` en tant que `postgres` (DDL sur
    `profiles`, hors de portée de pgweb) ; la fonction, elle, peut rester à
    `pgweb_admin` (aucun privilège).
- **Attestation d'âge** (JEP-34, `lib/attestation-age.ts`) : case
  « 15 ans ou plus, ou accord du représentant légal » juste au-dessus du
  bouton, sur l'inscription par e-mail **et** sur `/choix-pseudo` (un compte
  Google n'a jamais vu la première). Tracée comme les CGU, dans les
  métadonnées du compte (`age_attestation_version`, `age_attestation_at`),
  revérifiée par `/api/pseudo/choisir`. Le texte est versionné : le modifier
  impose une nouvelle `AGE_ATTESTATION_VERSION`. Traitée exactement comme la
  case des CGU : bouton désactivé tant qu'elle n'est pas cochée (arbitrage
  produit — la spec prévoyait un message à la tentative de validation).

### `/choix-pseudo` — passage obligé

Écran de choix du pseudo, imposé à tout compte qui n'en a pas — en pratique
toute première connexion Google, où le trigger `handle_new_user` recopie le nom
du compte Google dans `full_name` : un état civil que personne n'a choisi
d'afficher à côté de ses recettes. Pré-rempli avec ce nom (nettoyé, tronqué,
dé-doublonné par `suggestionPseudoLibre`), modifiable — c'est l'objet de l'écran.

- **La marque « a un pseudo » est `profiles.username`**, pas `full_name` : le
  slug n'est écrit que par les chemins qui ont validé le pseudo, alors que
  `full_name` se remplit tout seul. Conséquence directe : **vider l'adresse du
  profil depuis `/reglages` renverrait le membre ici** — `ProfileEditor` exige
  un pseudo valide (le champ n'est plus l'adresse mais le pseudo lui-même).
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
  résultats — réglage d'une facette, validation du tiroir, « Charger plus » —
  **sauf la saisie du champ texte**, qui navigue en `silent` (d'où
  `showOverlay = pending && !silentNav.current` dans `SearchProvider`) : un
  voile qui clignote à chaque pause de frappe cache le champ qu'on est en
  train de remplir. Même doctrine que le carnet (JEP-54).
  Il est déclaré à un seul endroit (`components/search/SearchResults.tsx`) :
  plusieurs `LoadingOverlay` montés en même temps empileraient leurs voiles.
  Un délai de 120 ms avant affichage (le même que `NavigationSpinner`) évite
  le clignotement sur un rafraîchissement instantané.
- **L'état optimiste ne se laisse pas écraser par l'écho de sa propre
  navigation.** `SearchProvider` resynchronise `criteria` sur les critères du
  serveur, mais cet écho revient en retard du debounce plus du rendu : appliqué
  tel quel, il réécrivait `criteria.q` — donc le champ — avec une valeur
  périmée, et les lettres tapées entre-temps étaient perdues. Il n'est donc
  appliqué que si le changement vient d'**ailleurs** (retour arrière, lien
  partagé), repéré en comparant l'empreinte des derniers critères posés
  localement. Le drapeau retombe en fin de navigation, jamais entre deux
  lettres (un debounce armé le maintient) — sans quoi un écran resterait
  désynchronisé de son URL. Vaut pour tout ce qui est débouncé : le texte
  **et** le curseur de temps. Même correctif que `CarnetToolbar`.
- **Compatibilité** : `?category=` (liens de catégorie de l'accueil) est un
  alias de `cat`, fusionné à la lecture — aucune redirection.

## Recherche textuelle sans accents

**Toute zone de recherche du site ignore la casse ET les accents** (JEP-254) :
« creme » trouve « Crème brûlée ». Une seule règle, `normSearch` / `matchesSearch`
(`lib/text-search.ts`, alias de `normLoose`), pour tous les filtres en mémoire
(carnet, blog, back-office). Côté base, `ilike` étant sensible aux accents, les
recherches par titre ou par nom passent par des **colonnes générées**
`recipes.title_norm` et `profiles.full_name_norm` (fonction immuable
`public.mc_norm_imm`), interrogées avec le terme déjà normalisé via
`withNormColumn` — qui retombe sur la colonne brute si la colonne normalisée
n'existe pas encore. Ne pas réintroduire de `toLowerCase().includes` ni
d'`ilike('title', …)` : c'est ce qui rendait « eclair » introuvable.
La recherche avancée (`mc_norm`) et l'autocomplétion des ingrédients
(`suggest_ingredients`) l'étaient déjà.

## Noms d'ingrédients : singulier, pluriel, « oeuf » (JEP-249)

**Le texte saisi reste affiché tel quel ; c'est la comparaison qui confond
les variantes.** `ingredientKey` (`lib/ingredient-name.ts`, pur) ramène
« Jaunes d'oeufs », « jaune d’œuf », « JAUNE D'OEUF » à la même clé (casse,
accents, ligatures œ/æ, apostrophes, mots vides, pluriel en -s et en -ux mot
par mot). C'est la **seule** règle pour rapprocher deux noms d'ingrédients :
`resolveIngredientRefId` (rattachement au référentiel — libellé exact
préféré, clé en repli), `mergeIngredients` (liste totale), le récapitulatif
de projet, les fusions de fournée (`mergeIngredientRows`, `expandableGroup` /
`expandedGroup`) et l'ajout à une liste de courses existante.

**Courses : fusion automatique avec conversion, comme la fiche recette.** Tout
article qui entre dans une liste — ajout depuis une recette ou une fournée
(`ShoppingWidget`), saisie à la main (`ShoppingItems.addItem`), fusion de deux
listes (`CuisineContent.mergeShoppingLists`) — passe par `findMergeTarget`
(`lib/shopping-merge.ts`) : il rejoint la ligne du MÊME ingrédient (clé
`ingredientKey`) de même unité, à défaut une ligne dont l'unité est reliée par
la table de conversions (`convertQty`) ; la quantité entrante est alors convertie
dans l'unité de la ligne existante, qui la garde (« Jaune d'œuf 200 g » + « 5
unité(s) » = 300 g). Sans correspondance — autre ingrédient, ligne non rattachée
au référentiel (`ref_id`), conversion inconnue, quantité non numérique, **commentaire
différent** — c'est une nouvelle ligne : on n'additionne jamais sans conversion
connue, et le commentaire fait partie de l'identité d'une ligne (« Jaune d'œuf —
température ambiante » est voulue à part ; la réunir en absorbant son commentaire
en effacerait la distinction). Comparaison insensible à la casse et aux espaces,
un commentaire absent valant « vide » — comme le récapitulatif d'une fiche recette,
qui regroupe par ingrédient ET commentaire. Seul le picto de fusion manuelle, geste
explicite, tranche entre des commentaires différents : sans rien à arbitrer (aucun,
ou le même) pas de choix ; un seul commentaire, le garder ou l'effacer ; deux, le
sien, celui de l'autre ligne, les deux réunis par « ; » (choix par défaut, rien ne
se perd sans l'avoir demandé) ou aucun (`commentChoices` / `mergedComment`). Le même
calcul sert au **picto de fusion manuelle** (`mergeCandidates` / `mergeResult` /
`mergePreview`), qui montre « 5 unité(s) + 100 g (≈ 5 unité(s)) = 10 unité(s) »
avant validation, et pour les lignes déjà en doublon avant ce correctif.
`ShoppingWidget` et la fusion de listes tiennent un `pool` (lignes en base +
lignes à créer) : un article rattaché y entre pour que le suivant puisse le
rejoindre, et une ligne modifiée n'est jamais relue périmée. **Reste hors
périmètre** : la liste totale d'une fournée (`mergeIngredientRows`) ne convertit
pas les unités — sa structure (quantités ajustées / d'origine / textes) est plus
délicate à toucher. Ne pas réintroduire de `name.toLowerCase()` comme clé de fusion.
**Saisie à la main** (`ShoppingItems.addItem`) : l'unité est **obligatoire** à
l'ajout — sans elle, ni conversion ni fusion (ni, demain, coût). Seul l'ajout
l'exige : la modification d'une ligne (`EditItemRow`) reste libre, pour ne pas
bloquer la correction d'une ligne ancienne sans unité. Au clic sur « Ajouter »
sans unité, la liste déroulante des unités est cerclée de rouge (en plus de
l'alerte, qui reste le garde-fou) jusqu'au choix d'une unité. La liste « Fusionner
avec » affiche le commentaire de chaque ligne (tronqué à 40 caractères), seul
élément qui distingue deux lignes du même ingrédient.

**Listes totales : une ligne par commentaire, un total par ingrédient.** Fiche
recette (« Liste complète des ingrédients »), fournée (« Liste totale ») et
éditeur / relecture d'import (récapitulatif) suivent la même règle : un même
ingrédient reste sur une ligne par commentaire (« Jaune d'œuf » / « Jaune
d'œuf — température ambiante »), suivie d'une ligne « Total — X » dès qu'il en
a plusieurs. Le total passe par `groupWithTotal` / `subtotalOf`
(`lib/ingredients-recap.ts`), qui convertit les unités reliées par la table de
conversions et n'invente jamais un total sans conversion connue. Côté fiche,
`mergeIngredientLines` (= `mergeIngredients` avec `byComment`) alimente
l'affichage et les courses ; `mergeIngredients` seul garde un total par
ingrédient pour l'ajustement par quantité disponible et le JSON-LD. Côté
fournée, `mergeIngredientRows` ne concatène plus les commentaires (liste totale
ET courses). **Une seule présentation** pour les quatre écrans :
`components/IngredientTotalList.tsx` (rendu pur, sans état — utilisable côté
serveur comme côté client). Un ingrédient seul tient sur une ligne (quantité,
nom, allergènes, commentaire, renvois d'étape), **sans total** ; un ingrédient à
plusieurs lignes s'ouvre sur son **total en gras**, suivi du détail en retrait
(une ligne par commentaire : quantité, commentaire en italique, renvois
d'étape). Chaque écran ne branche que ce qui lui est propre : `links` (étapes de
la fiche, boutons « aller à l'étape » de l'éditeur) et `action` (colonne de
gauche — picto de remplacement de la fournée, absent ailleurs ; la colonne
n'existe que si un écran en porte). Le picto de remplacement reste sur chaque
ligne de détail (il couvre toutes les occurrences nom + unité), jamais sur le
total, qui peut mêler des unités ; le total n'est jamais ajouté au panier (il
n'existe qu'à l'affichage). Ne pas recoder une quatrième variante de cette
liste. La fournée renvoie elle aussi vers les étapes (`MergedBatchRow.stepIds`,
ancre `#etape-<id>` du déroulé Préparer).

- **Approximation symétrique** : « cassis » devient « cassi », « noix » reste
  « noix » — sans conséquence, les deux côtés passent par la même fonction.
  Seuls les mots de plus de 3 lettres perdent leur pluriel (« jus », « riz »).
- **Jamais stockée** : la règle peut s'affiner sans migration. Son jumeau SQL
  `public.mc_ingredient_key` (rattrapage des `ref_id`) doit rester aligné.
- **« oeuf » → « œuf » à l'écriture** (`fixOeufLigature`) sur tous les chemins
  qui écrivent un nom d'ingrédient : `CreerForm`, relecture d'import, courses,
  composants de projet.
- **Un ingrédient, une seule entrée au référentiel** — préalable aux coûts et
  aux stocks, qui se rattacheront à `ingredient_refs.id`, jamais au texte.
  Admin → Éléments inconnus liste les **doublons du référentiel** (même clé)
  et les fusionne par la RPC `admin_merge_ingredient_refs` (SECURITY
  DEFINER, propriétaire `postgres`) : toutes les clés étrangères vers
  `ingredient_refs` sont réécrites (découvertes dans `pg_constraint`, pas
  énumérées — une table ajoutée plus tard est couverte d'office), les
  conversions en double écartées, les attributs vides de l'entrée gardée
  complétés, puis les autres supprimées. Jamais automatique : la clé est une
  approximation, un admin tranche. Le même écran masque des « inconnus » les
  noms dont la clé correspond déjà à une référence (la RPC
  `admin_unknown_ingredients` compare encore les libellés exacts) ; la RPC
  `admin_volume_ingredients_missing_density`, elle, rapproche par `ref_id`
  puis par `mc_ingredient_key`, et la masse volumique de repli de
  `estimateWeightGrams` par `ingredientKey`.

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
ce soit avant le jour J (« déjà fait en amont ») ou pendant (mode Pâtisser de
l'écran `/fournee/[id]`, cf. `components/batch/BatchView.tsx`). Conséquences
directes :
- **Aucune session à démarrer** : passer en mode Pâtisser ne matérialise
  plus rien (l'ancien `insertMaterializedExecution` a disparu) — la fournée
  porte déjà tout ce qu'il faut cocher depuis sa création. `BatchView` se
  contente de poser `batches.date_debut` à la première entrée en mode
  Pâtisser.
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

- **Une fournée close est verrouillée dans les DEUX modes, et se rouvre
  explicitement.** `readOnly` (`batch.status !== 'planifiee'`, `?lecture=1`
  ou impersonation lecture seule) doit atteindre **tout** ce qui écrit : le
  mode Pâtisser le respectait depuis toujours, mais `BatchStepDonePanel` ne
  recevait pas la prop — le mode Préparer restait donc modifiable sur une
  fournée terminée (cases, jour de l'étape, notes, sous-étapes). L'interface
  mentait sur l'état de la fournée ; ce n'était pas un trou de sécurité
  (`useMutation` bride toujours l'impersonation), mais bien une écriture
  d'historique par effet de bord. Corollaire posé en même temps :
  **« Reprendre cette fournée » vaut désormais pour `terminee` autant que
  pour `abandonnee`** — la doctrine antérieure (« seul l'abandon est
  réversible ») n'était tenable que tant que Préparer offrait cette
  échappatoire non voulue. Deux conséquences à connaître :
  - le bouton est volontairement **indépendant de `lecture`** — « Fournées
    terminées » (`/en-cuisine`) n'ouvre qu'en `?lecture=1`, s'y adosser le
    rendrait invisible depuis son unique point d'entrée (même raisonnement
    que la carte d'avis) ;
  - reprendre efface `date_fin`, donc la durée totale du résumé : d'où une
    confirmation explicite sur une fournée `terminee`, absente pour un
    abandon.
  **Le verrou doit s'énoncer là où il se fait sentir** : un bandeau en tête
  des deux modes dit pourquoi tout est grisé et porte le bouton de reprise.
  Le lien de l'en-tête ne suffit pas — il sort du champ dès qu'on a déroulé
  la page, et une case grisée sans explication ni porte de sortie se lit
  comme une panne, pas comme un état.
  **Lever `?lecture=1` passe par `router.replace`, jamais par `refresh`** :
  le paramètre vit dans l'URL, donc dans les `searchParams` du rendu serveur
  — un `refresh` rejouerait la page avec `lecture=1` et la re-verrouillerait
  aussitôt, et un `history.replaceState` réécrirait la barre d'adresse sans
  rien renvoyer au serveur. C'est la seule resynchronisation de cet écran qui
  ne soit pas un `router.refresh()`.
- **`batches.user_note` et `batches.notes` ne sont pas la même chose** :
  la première est la note personnelle de la fournée (éditée en Préparer par
  `BatchNotes`), la seconde le commentaire saisi au lancement dans
  `BatchWidget`. Le mode Pâtisser n'affichait que `notes`, sous le libellé
  « Ma note » — la note personnelle, justement celle qu'on écrit pour ajuster
  la recette, y était donc structurellement invisible. Les deux sont
  désormais rendues, sous deux libellés distincts.
- **Une note personnelle n'est jamais repliée avec l'étape.** Une étape
  entièrement traitée se replie (`collapsible`, cf. `stepFullyDone`), mais son
  bloc « Ma note » reste hors du volet : c'est le seul contenu de l'étape qui
  serve encore **après** coup, pour ajuster la recette au vu de ce qui s'est
  passé. Vaut dans les deux modes — `StepCookCard` rend `user_note` hors de
  son propre volet, pour la même raison.
- **Le mode Pâtisser AFFICHE ce que « déjà réalisé » exclut, il ne l'escamote
  pas.** `StepCookCard` filtrait ses ingrédients par `batchIngredientExcluded`
  (et ses sous-étapes par `batchSubstepExcluded`) **avant** de rendre : une
  étape cochée s'affichait donc littéralement vide, et la déplier ne révélait
  rien. Or c'est justement ce contenu qu'on relit après coup pour ajuster la
  recette. Les lignes exclues sont désormais rendues barrées et verrouillées,
  comme en mode Préparer — la même règle que « une étape n'est jamais retirée
  du déroulé », appliquée un cran plus bas. Ne disparaissent que les lignes
  qui ne font plus partie de la fournée : retirées à la main, éclatées en
  sous-recette, ou portées par une étape entièrement remplacée. Corollaire :
  les automatismes (auto-coche de l'étape quand tout est coché) travaillent
  sur les listes `active*`, jamais sur les listes affichées — sinon une étape
  dont tout est exclu ne se cocherait plus jamais.
- **Le repli du mode Pâtisser porte sur l'ÉTAPE, pas sur le jour** : les
  jalons sont dépliés par défaut (on suit `collapsedJalons`, les jours que
  l'utilisateur a refermés — jamais l'inverse), les étapes repliées. Replier
  les deux niveaux ne laissait plus rien voir du déroulé ; n'en replier aucun
  noyait l'étape en cours sous les ingrédients de toute la journée. L'en-tête
  d'une étape repliée annonce ce qu'elle contient (« 6 ingrédients ·
  3 sous-étapes »), sans quoi elle se lirait comme une étape vide.
  **Un `<details>` piloté par React a besoin de son `onToggle`** : sans lui,
  le clic n'est connu que du navigateur, et le premier re-rendu (une case
  cochée suffit) rétablit l'état calculé — le jour se refermait sous le doigt.
  **Tout l'en-tête d'une étape déplie**, pas seulement le chevron (cible de la
  taille d'une icône, difficile à viser au doigt) : d'où un `role="button"` et
  non un `<label>`, qui renverrait vers la case à cocher tout clic sur le
  titre, et un `stopPropagation` sur la case — sans lui, cocher une étape la
  replierait au passage.
- **Une note saisie se signale en vert** (`border-green-700 bg-green-50`) sur
  les trois champs du mode Pâtisser — ingrédient, sous-étape, étape. Ces
  champs sont vides sur l'immense majorité des lignes : sans marqueur, celui
  qui porte une remarque se confond avec les autres dès qu'on remonte la
  liste. Même couleur que le reste de la fournée pour « de vous » (cf. le
  bandeau de légende du mode Préparer). Les deux premiers étant des champs
  **non contrôlés** (`defaultValue` + `onBlur`), le vert n'y apparaît qu'à la
  validation de la saisie — il signale une note *enregistrée*, pas en cours de
  frappe ; le troisième, contrôlé, verdit à la frappe.
- **Proposer un avis suit ce que `BatchReview` sait offrir**, pas la seule
  appartenance de l'avis à la fournée : un avis `pending` ou `approved` y rend
  un récapitulatif en lecture seule, il n'y a rien à saisir. `reviewEligible`
  ne retient donc que l'absence d'avis et un avis `rejected` de cette fournée.
  Se voyait en reprenant puis reclôturant une fournée déjà notée : on
  proposait de noter une recette qui l'était déjà.
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
  J (saisi en mode Pâtisser, `BatchView`). Ne jamais les fusionner en un seul
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
- **Le picto de remplacement est aussi sur la « Liste totale des
  ingrédients »** (JEP-254), pas seulement dans « Ingrédients ajustés »
  (repliée par défaut, groupée par étape) : sans lui, remplacer un
  ingrédient depuis la vue d'ensemble obligeait à déplier cette section pour
  retrouver la même ligne. Même fenêtre (`IngredientExpandDialog`), même
  droit (`droits.remplacementIngredient`, avec `LockedAction` en repli),
  masqué sur une fournée fermée (`readOnly`) comme le reste des actions de
  cette vue.
- **Le remplacement couvre TOUTES les occurrences du même ingrédient**
  (JEP-254) : le praliné d'une ganache ET d'un croustillant, remplacé en un
  seul geste — la liste totale fusionne déjà les lignes identiques (nom +
  unité) entre étapes, et un remplacement qui n'en couvrirait qu'une
  laisserait les autres en doublon dans les courses. Les étapes de la
  sous-recette ne s'insèrent qu'**une fois**, mais `expanded_into_recipe_id`
  marque **chaque** occurrence, qui sort donc des courses et de la mise en
  place tout en restant visible dans SA propre étape (avec sa quantité),
  barrée et créditée « Fabriqué à partir de X » comme n'importe quelle ligne
  remplacée. `expandableGroup(batch, name, unit)` (`lib/recipe-plan.ts`)
  retrouve toutes les occurrences éligibles par nom + unité, depuis la
  « Liste totale » comme depuis « Ingrédients ajustés » — un clic sur
  N'IMPORTE LAQUELLE ouvre la fenêtre pour le groupe entier. La quantité par
  défaut proposée à `IngredientExpandDialog` est la **somme** des
  occurrences ; les étapes insérées portent le `source_ingredient_id` de
  l'occurrence dont l'étape est la plus tôt dans la fournée (jour, puis
  position), qui sert aussi de repère par défaut pour la position
  d'insertion. **Annuler** (`cancelExpansion`) reconstitue le même groupe via
  `expandedGroup(batch, row)` (même recette de remplacement + même nom +
  unité) et rétablit tout d'un coup, jamais une occurrence isolée — sinon les
  autres resteraient marquées « fabriquées » alors que les étapes qui les
  produisent auraient disparu. **Limite connue, acceptée** : le groupe se
  reconstitue par nom + unité + recette, sans colonne dédiée — un AUTRE
  ingrédient de même nom + unité remplacé par la même recette (coïncidence
  très rare) serait à tort inclus dans l'annulation groupée.
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
- **La carte d'avis est au-dessus des onglets Préparer/Pâtisser**, et son
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
  injurieux ou inapproprié — affiché à l'admin (Admin → Avis) pour
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

- **Le projet n'est créé qu'au passage à l'étape 2** (JEP-254). Le bouton
  « Projet » du carnet est un simple lien vers `/projets/nouveau`, qui
  n'écrit rien : on y choisit entre l'aide de l'IA (intention → proposition
  de format et de composants) et la construction manuelle. `POST /api/projet`
  crée alors la recette-projet **avec** l'intention et la proposition
  revalidée (titre, format, composants), `wizard_step = 2` — ouvrir le mode
  projet puis renoncer ne laisse plus de projet vide dans le carnet. Aucune
  donnée ne voyage d'une page à l'autre par le navigateur : l'étape 2 se
  relit depuis la base.
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
  `measure_type`, `mold_type_id`, `mold_dims`, `servings`, `yield_*`. Tout
  format en moule (rond, cadre, bûche = `demi-cylindre`, empreintes) se
  réalise en N exemplaires, portés par `yield_qty` ; le format affiché est
  **déduit** (`deduceProjectFormat`), et la forme du calcul retombe sur celle
  du format quand aucun moule du référentiel n'est choisi
  (`projectTargetForme`). C'est
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
  rompre l'appariement étape ↔ groupe d'ingrédients. **`readComponentDraft`**
  (`lib/projects-write.ts`) est le lecteur symétrique : il relit le contenu
  déjà enregistré d'un composant dans cette même forme (`ComponentStepDraft[]`)
  — c'est ce qui permet à « Consulter » (JEP-254, étape 4) de rouvrir la
  fenêtre de résolution directement en édition, préremplie, pour une source
  « Proposée par l'IA » ou « Saisie à la main » : ces deux-là n'ont pas de
  `source_recipe_id`, donc pas de recette séparée à ouvrir dans un nouvel
  onglet (contrairement à « Mon carnet » / « Favoris » / « Suivis », où
  « Changer » rouvre la recherche comme avant). **« Réinitialiser »** (même
  écran) est le pendant destructeur : `enregistrer` refusant d'écrire un
  composant sans étape, vider le brouillon puis « Enregistrer » ne menait
  nulle part — il n'existait donc aucun moyen de repartir de zéro sur un
  composant déjà enregistré. Efface son contenu (`clearComponentContent`) et
  le repasse `resolved: false`, **sans fermer la fenêtre** : contrairement à
  `onDone`, la resynchronisation demandée au parent (`onReset`) ne démonte
  pas la modale, pour enchaîner aussitôt sur une recherche, une proposition
  de l'IA ou une saisie à la main — fermer (croix) reste la sortie normale
  vers la liste des composants, qui affiche alors « À résoudre ».
- **Proposition de l'IA : une étape par sous-préparation, pas par geste**
  (JEP-254). `buildComponentContenu` demandait jusqu'ici 1 à 6 étapes sans
  autre consigne, et l'IA en produisait une par geste technique (hydrater la
  gélatine, fondre le praliné, chauffer la crème…) pour une seule ganache
  montée — un découpage qui n'a de sens nulle part ailleurs sur le site,
  où une préparation homogène est UNE étape avec ses gestes en sous-étapes.
  Le schéma JSON gagne donc un champ `sous_etapes` par étape (repris par
  `normaliseComponentRecipe`, qui l'assigne au champ `ComponentStepDraft.
  sous_etapes` déjà porté par le pivot et déjà écrit par
  `writeComponentContent` — rien à changer côté écriture) ; la consigne passe
  à « une étape par sous-préparation distincte, ses gestes dans
  `sous_etapes` ; 1 à 4 étapes ». `ComponentResolver` gagne un champ
  d'édition dédié (une ligne par sous-étape) entre la description et les
  ingrédients de chaque étape, sinon une proposition de l'IA relue et
  corrigée avant enregistrement perdrait silencieusement ses sous-étapes
  — le seul endroit qui les affichait avant (la fiche recette) ne s'ouvre
  qu'après coup. `draftToText` (relecture pour une nouvelle proposition,
  point 8) les inclut aussi, sans quoi une correction demandée à l'IA
  repartirait d'un texte amputé de ses gestes.
- **Contexte libre AVANT la première proposition** (JEP-254) : cliquer sur
  « Demander une proposition à l'IA » ouvre désormais une étape de saisie
  (« Précisions pour l'IA », facultative — sans gélatine, au chocolat noir
  plutôt qu'au lait…) plutôt que de lancer l'appel directement avec le seul
  nom du composant. Distinct de `consignes` (point 8, ci-dessus) : l'un
  précède la première proposition, l'autre corrige une proposition déjà vue
  — les deux coexistent sans se remplacer. `buildComponentContenu` gagne un
  paramètre `contexteLibre`, ajouté au prompt comme les autres lignes de
  contexte (rôle, dessert, format) ; `POST /api/projet/composant` le lit et
  le transmet, sans y toucher.
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
- **Mode d'ajustement d'un composant choisi dès l'étape 3**
  (`recipe_project_components.scaling_mode` : `simple` = volume, `foncage` =
  surface, `aucun`). La colonne n'est que la **mémoire** du choix tant que le
  composant n'a pas de recette : c'est le `scaling_mode` des groupes
  d'ingrédients que lit tout le calcul. Il est donc reporté sur les groupes
  existants (`setComponentScalingMode`) et prime sur celui de la source à
  chaque copie ; vide, celui de la recette d'origine est gardé.
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
  qui rend le coefficient **et** son explication en une phrase (§6.4). Cet
  ajustement individuel reçoit aussi le rôle du composant et la liste des
  autres préparations de l'assemblage (JEP-254) : sans eux, l'IA ne peut que
  comparer des moules, ce qui ne veut rien dire pour un insert ou une
  garniture, dont la quantité dépend de sa place dans le montage, pas d'un
  rapport géométrique avec sa recette source.
- **« Proposer le plan de montage » a été retiré** (JEP-254, essayé puis
  abandonné) : un seul appel IA proposait une quantité visée par composant
  d'après le format du dessert et le rôle de chacun, écrite dans
  `recipe_project_components.target_quantity` / `target_unit`. Trop
  approximatif à l'usage (une dimension déduite du contexte — même diamètre
  qu'une autre couche, couverture totale d'une surface — se faisait
  régulièrement écraser par des règles génériques par rôle, produisant des
  quantités trop faibles) : l'ajustement individuel par IA (`proposerIA`,
  ci-dessus) couvre mieux ce besoin, composant par composant. Les colonnes
  `target_quantity` / `target_unit` restent en base, inutilisées, comme
  avant leur introduction — une suppression réelle est une migration
  séparée, hors périmètre.
- **Perte en cuisine, par composant** (JEP-254) : ce qui reste sur le fouet,
  dans les bols, sur les cuillères réduit ce qui arrive réellement dans le
  dessert. Corrigée en **produisant un peu plus**, jamais en changeant la
  quantité visée : un pourcentage par composant (défaut 10 %, réglage de
  session, aucune colonne dédiée) vient gonfler le coefficient — et les
  coefficients surface/volume associés (`ScaleProposal.moldCoefs`), sinon une
  préparation qui fonce un moule n'en tiendrait pas compte. S'applique aux
  deux sources de proposition (format, IA),
  **jamais** à un coefficient saisi à la main : c'est déjà la décision finale
  de l'utilisateur.
- **Quantité d'origine affichée en italique** (JEP-254) : à côté du champ
  éditable de chaque ligne d'ingrédient, la quantité d'avant ajustement
  (`ingredients.base_quantity`) reste visible en italique tant qu'un
  coefficient l'a réellement changée — repère de contrôle après un
  ajustement (format, IA, ou coefficient saisi à la main), sans repasser par
  la recette source. Masquée quand elle vaut la quantité actuelle (facteur
  ×1, ou avant tout ajustement) pour ne pas doubler l'affichage pour rien.
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

## Mode projet v2 (essai, admins seulement)

Seconde présentation du mode projet, **à côté** du parcours guidé en onglets
(`/projets/[id]`), pour comparer les deux : `/projets/[id]/v2`
(`components/projets/v2/ProjectV2.tsx`). Le projet s'y lit comme la recette
qu'il deviendra — une seule colonne, les blocs de la recette dans l'ordre de
l'éditeur, entre lesquels s'intercalent les blocs « Atelier projet »
(intention, structure, quantités, validation) sur un fond plus clair.

- **Mêmes données, aucune migration** : les deux versions lisent et écrivent
  les mêmes colonnes ; un projet s'ouvre indifféremment dans l'une ou l'autre.
  Lien « Essayer la nouvelle version » sur la v1, « Revenir à la version
  actuelle » sur la v2. Un non-admin qui suit le lien retombe sur la v1.
- **Un admin entre directement dans la v2 à la création** : `/projets/nouveau` (page serveur) lit `isAdmin` et le passe à `NewProjectStart` (`versionEssai`), qui redirige vers `/projets/<id>/v2` au lieu de `/projets/<id>`. Les autres membres gardent le parcours en onglets.
- **Redemander une proposition de l'IA** : dès que le projet a un format ou des préparations, le bouton du bloc « Intention » devient « Redemander une proposition (IA) » (secondaire) et demande confirmation (nombre de préparations remplacées et conservées). La nouvelle proposition remplace le format et les préparations **« À résoudre »** ; celles qui ont déjà leur recette sont conservées (travail réel), puis les blocs d'étapes sont redistribués (`resequenceProjectSteps`) avant l'insertion des nouvelles.
- **« Structure » juste sous « Votre intention »** : le bloc s'ouvre dès qu'une intention OU un format est renseigné (`projectV2BlockStates`, paramètre `intent`), puisque le format est désormais plus bas.
- **Ajustement des quantités dans chaque préparation** : plus de bloc « Ajustement des quantités » en v2. Le bloc « Étapes » ouvre sur `DessertVise` (rappel du dessert visé), puis chaque préparation résolue porte un volet replié « Ajustement des quantités · ×coef » qui rend `QuantitiesStep` avec `componentId` (une seule carte, sans intro ni nom ; le calcul connaît toujours les autres préparations). Un seul coefficient par préparation, comme en base (`recipe_project_components.scale_factor`) — jamais par étape. La v1 utilise `QuantitiesStep` sans `componentId`, inchangée.
- **Recherche d'une recette de base : cinq portées cochables, les mêmes qu'au remplacement d'un ingrédient** (`PICKER_SCOPES`, `lib/projects.ts`) : Mes recettes (non brouillons), Mes brouillons, Mes favoris, Mes abonnements, Toutes les recettes. Défauts : remplacement d'ingrédient = recettes + brouillons + favoris ; mode projet = + abonnements (jamais « toutes » d'office). Le mode projet interroge **une portée à la fois**, dans l'ordre carnet → brouillons → favoris → abonnements → toutes : la première qui trouve la recette décide du crédit (`PICKER_SCOPE_KIND` : recettes et brouillons = `own`, « toutes » = `community`, libellé « Communauté »). `source_kind = 'community'` suppose qu'aucun CHECK de la base ne l'interdise.
- **Aperçu d'une recette avant de la choisir** (`ComponentResolver`, mode `apercu`) : l'œil (`visibility`) de chaque résultat ouvre, dans la même fenêtre, ce que la copie écrirait (`planComponentCopy`, rendu par `RecipeStep`, sans photos — la copie ne les lit pas), sous un bandeau fixe « Annuler » (retour à la liste, recherche et cases conservées) / « Sélectionner » (même geste que le « + », mêmes crédits). Remplace l'ancien lien vers un nouvel onglet. Le remplacement d'un ingrédient (`IngredientExpandDialog`) garde son lien d'origine.
- **« Retirer la recette »** (`retirerRecette`, `useProjectComponents`) : à côté de « Modifier cette préparation » (blocs Structure et Étapes), confirme puis `resetComponent` (`lib/projects-write.ts`) — contenu effacé, source oubliée, préparation « À résoudre » ; même geste que « Réinitialiser » de la fenêtre de résolution.
- **Ustensiles d'une préparation copiée** : la copie d'une recette existante (`ComponentResolver.attacher`) lit ses `recipe_utensils` et `attachComponentUtensils` (`lib/projects-write.ts`) les mémorise sur la préparation (`recipe_project_components.utensils`, jsonb — la source ne les rattache à aucune étape, ils ne sont donc jamais portés par une étape), puis ajoute à la liste globale `recipe_utensils` ceux qui manquent (`utensilsToAdd`, `lib/projects.ts` : même `ref_id` ou même nom normalisé par `ingredientKey`). **Rien n'est jamais retiré** de la liste globale (retirer ou remplacer une préparation laisse ses ustensiles, à nettoyer dans le bloc « Ustensiles »). Colonne absente (migration pas jouée) : la liste globale est complétée quand même. L'éditeur « Ustensiles » de la v2 est remonté (`key`) quand la liste en base change et garde le `ref_id` des lignes inchangées.
- **La v2 n'écrit jamais `recipe_projects.wizard_step`** : l'étape du parcours
  en onglets reste la propriété de la v1. L'état d'un bloc (ouvert / grisé avec
  ce qui le débloque) se déduit de la base par `projectV2BlockStates`
  (`lib/projects.ts`), jamais de cette colonne.
- **Un bloc pas encore atteint reste visible, grisé** — arbitrage produit : on
  voit d'emblée toute la recette à venir.
- **Format : un seul contrôle pour les deux écrans** — `ProjectFormatFields`
  (champs) et `buildProjectFormatUpdate` (contrôle + colonnes à écrire). Le
  bloc « Format » de la v2 ne réécrit pas le titre (il se modifie dans « Le
  dessert »). La description se saisit pour tous les formats en v2 ; la v1 ne
  l'efface donc plus hors format libre.
- **Tout le parcours tient sur la page** (lots 1 à 5) : intention et
  proposition de l'IA (`/api/projet/structure` — le format proposé est
  enregistré s'il est complet, les préparations seulement si le projet n'en a
  aucune), dessert (photo, nom, description, type, catégories), format,
  structure et résolution, étapes par préparation avec leur ajustement de
  quantités (`QuantitiesStep`, une carte par préparation), liste complète des ingrédients,
  ustensiles / difficulté / temps, conseils et source, essais
  (`ProjectTrials`) et validation (`validateProject`, `lib/projects-write.ts`,
  partagé avec la v1).
- **Étapes : la présentation de la fiche recette, pas une variante.** Le bloc « Étapes » rend chaque étape par `components/recipe/RecipeStep.tsx`, le même composant que `app/recette/[id]` (titre numéroté, pastilles de temps, ingrédients de l'étape, photos, sous-étapes, conseils) ; ne pas recoder une seconde présentation. L'édition d'une préparation (`ComponentResolver`) utilise `StepEditorCard`, calquée sur l'éditeur `/creer`.
- **Composants : un seul code pour les deux versions** —
  `useProjectComponents` (ajout, renommage, rôle, ajustement, suppression,
  réordonnancement, ouverture de la résolution) et `ProjectStructureList`.
  « Modifier cette préparation » (v2) rouvre `ComponentResolver` en édition
  **quelle que soit la source**, avec `initialSource` : le crédit d'une copie
  est conservé à l'enregistrement (§9), au lieu d'être effacé.
- **Le brouillon d'un composant transporte tout ce qu'une étape porte** :
  jour, temps, température, astuce (`StepEditorCard`, calquée sur l’éditeur `/creer`), allergènes en texte libre,
  photos d'étape (`ComponentStepDraft.photos`, déposées sur Swift par
  `ComponentResolver` avant l'écriture — `projects-write` ne téléverse rien,
  il sert aussi côté serveur). `readComponentDraft` relit désormais aussi le
  `scaling_mode` du groupe et la `base_quantity` de chaque ligne : avant,
  modifier une préparation effaçait son mode d'ajustement et faisait de la
  quantité ajustée la nouvelle référence. Une quantité retouchée dans la
  fenêtre efface la base (la ligne sort du recalcul, comme à l'étape
  « Quantités »).
- **Éléments de recette écrits section par section**
  (`components/projets/v2/RecipeDetailEditors.tsx`), mêmes colonnes et tables
  que `CreerForm`, jamais par son enregistrement global (qui effacerait les
  `component_id`). Photo d'en-tête : vignettes recalculées seulement pour un
  dépôt frais. **Catégories** : même principe que `/creer` (pastilles pleines
  retirables, « + Ajouter un tag » avec recherche sans accents, création d'un
  tag à la volée), mais la liaison `recipe_tags` ne s'écrit qu'au bouton
  « Enregistrer ». **Pas de « type de recette »** : `recipes.type_id` n'est
  saisi dans aucun écran du site (78 recettes sur 78 sans type au relevé du
  06/10/2026) ; son filtre de recherche et son affichage sur les cartes
  restent donc vides. En donner un à toutes les recettes suppose de l'ajouter
  d'abord à `/creer` et à la relecture d'import.

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

## Notifications (JEP-278, 279, 280)

**Un seul moteur, `notifier()`** (`lib/notifier.ts`, serveur, client service_role).
Aucun module n'appelle plus lui-même `createNotification` +
`sendEmailBestEffort` : cron d'abonnements, webhook Stripe, résiliation,
contact et tous les événements de la communauté passent par lui. Il lit le
catalogue, les préférences du membre, écrit la cloche (avec anti-rafale), puis
envoie l'e-mail tout de suite ou le met en file de récapitulatif.

- **Le catalogue est la seule source de vérité** (`lib/notification-events.ts`,
  pur) : catégories, événements, canaux par défaut, verrouillage, « récap
  seulement », gabarits, liens. La grille de `/reglages`
  (`NotificationPreferencesCard`) le lit : un événement ajouté au catalogue
  apparaît dans les préférences sans toucher à l'écran. `decisionCanaux` est le
  calcul unique de « où va cet événement ». La clé d'un événement est stockée
  (`notifications.event`, `notification_outbox.event`) : ne jamais la renommer.
- **Événements nés d'une écriture du navigateur** (favori, abonné, validation
  d'une recette ou d'un avis, statut d'une idée, partage, composant de projet) :
  des **triggers SQL** posent une ligne dans `notification_outbox` via
  `mc_notif_emit` (SECURITY DEFINER, propriétaire `postgres`, refuse tout appel
  hors trigger par `pg_trigger_depth()`). `GET /api/cron/notifications` vide
  l'outbox toutes les 15 min (`cron-notifications.yml`). Le navigateur ne fournit
  jamais lui-même une notification : rien à falsifier, et une session « en tant
  que » en lecture seule n'écrit rien, donc ne notifie rien. **Les événements
  nés d'une écriture serveur** (cron, Stripe, contact) appellent `notifier()`
  directement ; un appelant serveur qui agit pour une session doit tester
  `isReadOnlySession()` lui-même.
- **Cloche et page `/notifications`** : la cloche montre les 5 dernières
  (`NOTIFICATIONS_CLOCHE`) et un lien « Voir toutes » ; son badge compte **toutes**
  les non lues (`countUnreadNotifications`), pas seulement les 5 affichées. La
  page (20 par lot, `?n=`) filtre par `?portee=` (`toutes` / `membre` / `admin`),
  **réservé aux admin et gestionnaires** (`lirePortee`) : une notification est
  « d'administration » si sa catégorie est `backOffice` dans le catalogue
  (`CATEGORIES_ADMIN`, déduite, jamais listée à la main) ; une ligne sans
  catégorie concerne le membre (`filtreMembre`, `is.null` indispensable : NULL
  n'est dans aucun `not.in`). **Gras = non consultée** : ouvrir la cloche ou la
  page marque les affichées lues (`read_at`, aucune colonne en plus) mais le gras
  est tenu en état local pendant la visite, jamais déduit de `read_at` — sinon il
  s'éteindrait dès la resynchronisation. **Cloche → page** : la cloche a déjà marqué ses
  entrées lues quand la page s'ouvre, qui ne peut donc plus les reconnaître ; elle en laisse
  la liste dans le `sessionStorage` (par membre, `memoriserNouvelles`), que la page lit une
  fois (`recupererNouvelles`) — best-effort, sans stockage la page n'a que ses propres non
  lues. Logique pure : `lib/notifications-view.ts`.
- **Jamais d'auto-notification** : `acteurId === userId` écarte l'événement.
  Les écritures service_role (`auth.uid()` nul) ne notifient pas un partage : le
  déverrouillage par lien de carnet crée une ligne `book_shares` au nom du
  propriétaire, ce n'est pas un partage voulu par lui.
- **Verrouillé par événement, pas par catégorie** : confirmation de souscription
  et de résiliation (obligation légale, CGV art. 7), réponses du support,
  alerte de changement de mot de passe partent quelles que soient les
  préférences. Le reste de « Abonnement » (J-3, J-1, échec de paiement) respecte
  l'e-mail décoché ; la cloche d'abonnement et de support est toujours affichée.
- **L'unité réglable est la RUBRIQUE (sous-catégorie), pas la catégorie**
  (`RUBRIQUES`, `lib/notification-events.ts`) : 5 sous-catégories dans « Mes
  recettes » (publication ou refus, avis reçus, favoris, projets qui s'en
  inspirent, mise en avant), 3 dans « Communauté », 3 dans « Fournées », 3 dans
  « Boîte à idées » ; les autres catégories ne sont pas découpées (rubrique
  unique, de même clé que la catégorie). Chaque événement du catalogue porte sa
  `rubrique`. La clé de rubrique (`mes_recettes.favoris`) est stockée telle
  quelle dans `notification_preferences.category` — **aucune colonne ni
  migration pour ajouter une rubrique**. **Héritage** : une ligne au niveau de la
  CATÉGORIE (avant le découpage, ou la reprise de `notify_email = false`) vaut
  pour toutes ses rubriques tant qu'aucune n'est réglée individuellement, pour
  qu'un e-mail refusé ne devienne jamais un e-mail reçu à cause du découpage.
  Les rubriques « récap seulement » (favoris, projets, abonnés, pâtissiers
  suivis, idées soutenues) démarrent sans e-mail, rythme hebdomadaire.
- **« Aucun » n'est pas un réglage** : c'est décocher les deux canaux. Les
  préférences sont des lignes éparses (`notification_preferences`) : seules les
  divergences avec le défaut du catalogue y sont écrites. `profiles.notify_email`
  n'est plus lue (colonne morte, comme `followers_count`) ; la migration l'a
  convertie en « e-mail décoché » sur toutes les catégories désactivables.
- **Récap seulement** : favoris, nouveaux abonnés, recettes d'un pâtissier suivi,
  composant de projet, idée réalisée, files de modération — jamais d'e-mail
  unitaire, un rythme « immédiat » est ramené au quotidien. La cloche reste
  immédiate. **Une entrée de cloche par événement** (arbitrage du 03/10) :
  chaque favori, chaque nouvel abonné et chaque recette d'un pâtissier suivi a
  la sienne, avec le pseudo et un lien, comme sur un réseau social — le seul
  regroupement qui reste est celui des files de modération (« 3 recettes
  attendent votre validation »), où une liste d'admins ne veut pas trente
  lignes. Le mécanisme d'anti-rafale (`groupeParCle` + `gabaritGroupe`, clé
  `group_key`) reste dans le moteur pour un futur événement qui en aurait besoin.
  Seul l'e-mail de récapitulatif rassemble les événements, une ligne chacun.
- **Les favoris sont nominatifs pour l'auteur de la recette** (arbitrage
  JEP-280) : ils restent absents du profil public, mais l'auteur voit le
  pseudo. Écrit dans `/confidentialite` ; changer cette règle impose d'y
  revenir.
- **Quota Brevo : 300 e-mails par jour** (`email_quota`, réservation atomique
  par la RPC `email_quota_reserver`, jour compté en `Europe/Zurich`). Les e-mails
  verrouillés peuvent puiser dans les 40 derniers ; au-delà du plafond souple,
  un e-mail immédiat bascule dans le prochain récapitulatif au lieu d'être
  perdu. Un récapitulatif qui dépasse le quota reste en file pour la passe
  suivante.
- **La passe quotidienne se rattrape** (04/10/2026) : GitHub retarde ou saute
  des tâches planifiées — le jour du lancement, trois passes `outbox` seulement
  avaient tourné en douze heures et le créneau de 05:30 UTC jamais. Toute passe
  `outbox` postérieure à 05:30 UTC joue donc aussi la quotidienne du jour
  (`quotidienARattraper`), **une seule fois** : le jour de Zurich est réservé
  atomiquement dans `site_settings` (`notifications_quotidien_du`,
  `reserverQuotidien`) ; la réservation est rendue si la passe échoue. Un
  `?passe=quotidien` explicite rejoue toujours (rappels et récapitulatifs sont
  dédoublonnés). Aucune migration.
- **Rappels de fournée** (`lib/notification-rappels-data.ts`, passe `quotidien`
  de 05:30 UTC) : étape à commencer le jour J − n, veille, invitation à donner
  son avis le lendemain d'une fournée terminée sans avis, recette mise en avant
  le jour où sa plage commence. **Les dates se calculent en `Europe/Zurich`**
  (`lib/notification-rappels.ts`) ; l'heure d'envoi, elle, suit l'UTC du cron
  (7 h 30 l'été, 6 h 30 l'hiver). Chaque rappel porte une clé de dédoublonnage
  (`notification_dedupe`) : relancer le cron n'en renvoie aucun deux fois,
  cloche coupée ou non.
- **Un e-mail déjà composé part à l'identique** (`emailPrecompose`) : les textes
  d'abonnement, de Stripe et de résiliation existaient avant le moteur. Le flux
  de contact garde son envoi propre (réservation `deploy_email_status`) et ne
  passe par le moteur que pour la cloche (`sansEmail`).
- **Tous les e-mails facultatifs** portent un pied de page vers
  `/reglages#notifications` (le bloc s'ouvre à l'arrivée) et l'en-tête
  `List-Unsubscribe`. Pas de désinscription en un clic sans connexion.
- **Tables du moteur absentes de `lib/database.types.ts`** jusqu'à la
  régénération : accès non typé, comme `notifications` avant elles.

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
- **E-mails par SMTP Brevo** (`lib/email.ts`, déjà en production pour les
  notifications d'abonnement) — pas de second fournisseur. **AWS SES a été
  retiré** à la migration Infomaniak (docs/migration-infomaniak.md § 7.9 bis) :
  le compte restait en bac à sable sans perspective de sortie, ce qui
  n'atteignait aucun destinataire non vérifié. Les variables portent un nom
  neutre (`SMTP_*`, `EMAIL_SENDER`) plutôt que celui d'un fournisseur.
- **Aucune liste de suppression locale des bounces/complaints.** SES en
  portait une (`email_suppressions`, alimentée par un webhook SNS) : Brevo
  tient la sienne côté serveur et refuse de lui-même les adresses ayant
  rebondi — la protection de réputation ne disparaît pas, elle change de
  main. Ce qui disparaît, c'est la visibilité locale sur ces adresses. La
  table `email_suppressions` reste en base, non lue et non écrite par
  l'application — même doctrine que `profiles.followers_count` (« les
  supprimer est une migration séparée, hors périmètre »). Un webhook Brevo
  pour la réalimenter est un chantier possible, non entamé.
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
  `/reglages` (`lib/contact-member-data.ts`), avec une fiche par demande
  (`/reglages/mes-demandes/[reference]`) montrant le message, les réponses
  reçues et l'avancement du statut — jamais le contexte technique ni le
  détail Jira. Repose sur quatre policies RLS `*_membre_lecture` (`user_id =
  auth.uid()`), en plus des `*_admin_lecture` déjà en place. Le lien apparaît
  sur l'écran de confirmation du formulaire uniquement pour un visiteur
  connecté. Cf. `docs/contact-jira.md` §16.
- **Réponse du demandeur depuis son suivi** : le membre peut ajouter un
  message à sa demande depuis cette même fiche — `contact_replies.author_kind`
  (`'admin' | 'member'`) distingue qui a écrit, dans le même fil que les
  réponses admin. **Aucun effet automatique sur le statut** (contrairement à
  une réponse admin, qui fait passer `recu` → `en_cours`) : réouvrir une
  demande `termine`/`a_deployer` toucherait `closed_at` (purge) et
  l'idempotence de l'e-mail de déploiement — l'administrateur, prévenu par
  e-mail (best-effort, sans colonne de suivi dédiée), change le statut à la
  main s'il y a lieu. Changer un statut ou répondre EN TANT QU'administrateur
  restent des gestes exclusifs à `lib/contact-admin-data.ts` : cette écriture
  reste, comme toutes les autres du module, exclusivement via
  `createAdminClient()` — aucune policy d'écriture n'est ajoutée. Cf.
  `docs/contact-jira.md` §17.
- **Photos sur une réponse, commentaire Jira à chaque échange** : une
  réponse, admin ou membre, peut porter une photo (`contact_reply_photos`,
  widget partagé `PhotoUploader.tsx`). Une photo admin n'est **jamais**
  incluse dans l'e-mail envoyé au demandeur (une data-URL n'est pas fiable
  une fois embarquée) — seulement mentionnée avec un lien vers son suivi
  (`/reglages/mes-demandes/[reference]`), et uniquement si le demandeur est
  un membre **connecté** : un visiteur n'a nulle part où la consulter par
  e-mail, elle reste alors visible seulement dans le panneau admin et le
  commentaire Jira. Chaque réponse, admin ou membre, ajoute aussi un
  commentaire pseudonymisé sur le ticket Jira existant
  (`commenterReponseJira`, `lib/contact-data.ts`, point d'entrée unique pour
  les deux écrans) — jamais si la demande n'est pas un bug ou n'a pas encore
  de ticket. Échec tracé (`contact_replies.jira_comment_status` /
  `jira_comment_error`, bouton « Renvoyer le commentaire » côté admin),
  contrairement à la notification e-mail du point précédent : un commentaire
  manqué désynchronise silencieusement le ticket de la vraie conversation.
  Cf. `docs/contact-jira.md` §18-19.
- **Anti-spam sans traceur tiers** : honeypot, délai minimum de 3 s porté
  par un jeton **signé côté serveur** (`CONTACT_FORM_SECRET` — un horodatage
  lu du navigateur ne protégerait rien), limitation de débit comptée en base
  (pas en mémoire de process, cette route écrivant avec la clé
  service_role).
- **Tâche planifiée** : `GET /api/cron/contact-jira` (réconciliation
  quotidienne, filet de sécurité — Jira ne réessaie jamais un webhook
  échoué), portée par `.github/workflows/cron-contact-jira.yml` à 2 h 30
  UTC, après le cron d'abonnements.

## CGV et souscription

`/cgv` (texte, `app/cgv/page.tsx`) et `lib/cgv.ts` (`CGV_VERSION`). Détail :
`docs/abonnements.md` §16.

- **Pas de renonciation au droit de rétractation** : la fenêtre de
  souscription (`CheckoutWaiverDialog`) demande l'acceptation des CGV et
  l'**accès immédiat** au service, deux cases distinctes. Le membre garde ses
  14 jours, remboursé au prorata (geste manuel, Dashboard Stripe).
- **Revérifié côté serveur** (`checkout`, `changer` en montée) avec la version
  en vigueur, tracé en métadonnée Stripe (`cgv_version`, `cgv_accepted_at`).
  **Modifier le fond du texte impose une nouvelle `CGV_VERSION`.**
- **Confirmations écrites de souscription et de résiliation envoyées quelle
  que soit la préférence de notification** : ce sont des obligations légales
  (support durable, résiliation en trois clics), pas des notifications.

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

## Partage du carnet par lien (JEP-21)

Deux partages externes, à côté du partage nominatif (`ShareBookButton`,
`book_shares`) : le **site** (« Partager Je pâtisse ! », pied de page,
`ShareSiteButton`) et le **carnet** par un lien public
`/carnet/partage/<jeton>`. Même panneau pour les deux (`SocialSharePanel` :
feuille native, Facebook, Pinterest, WhatsApp, X, e-mail, Instagram, copie) ;
chaque page porte sa carte d'aperçu (`app/opengraph-image.tsx`,
`app/carnet/partage/[jeton]/opengraph-image.tsx`).

- **Jeton signé, pas de table** (`lib/book-link.ts`) : le lien est permanent
  et non révocable (arbitrage JEP-21), il n'y a donc rien à mémoriser — un
  HMAC de l'id du propriétaire suffit, sans migration. Secret
  `CARNET_PARTAGE_SECRET`, à défaut dérivé de `SUPABASE_SERVICE_ROLE_KEY`.
  **Changer l'un ou l'autre invalide tous les liens distribués** — c'est
  aussi la seule révocation possible. Un besoin de révocation par carnet
  imposera une table ; ce module est le seul endroit à changer.
- **Un lien n'ouvre jamais les brouillons** (`PORTEE_LIEN = 'published'`) :
  il circule sans qu'on sache jusqu'où. Déverrouiller n'écrase jamais un
  partage nominatif existant (`ignoreDuplicates`), qui peut être plus large.
- **L'aperçu ne montre rien de privé** (`getApercuCarnet`, clé service_role) :
  nom, nombre de recettes, et une mosaïque des photos de recettes **publiques**
  uniquement. Le flou est un décor : une image floutée en CSS reste
  téléchargeable nette, il ne doit donc jamais porter une photo privée.
- **Le jeton traverse l'inscription par `next`**, que le parcours transporte
  déjà de bout en bout (e-mail confirmé des jours plus tard, Google,
  `/choix-pseudo`) : `next = /carnet/partage/<jeton>/deverrouiller`. Cette
  destination est une **page**, pas un Route Handler : `LoginForm` rejoint
  `next` par `router.replace`, qui attend un rendu React. Elle écrit la
  ligne `book_shares` au nom du propriétaire (ce que la RLS refuse au
  destinataire, à juste titre), puis renvoie vers `/carnet?scope=shared`.
- **Instagram n'a pas d'URL de partage** : feuille native du téléphone si
  disponible, sinon copie du lien avec mode d'emploi (story, bio).
- **Un article du blog se partage aussi** (`ShareSiteButton` paramétré par
  `chemin` / `titre` / `texte`, ligne d'auteur). Sa carte reste celle de
  `generateMetadata` : couverture de l'article, et une description complétée
  par le début du texte quand l'auteur n'a saisi qu'une phrase courte
  (`descriptionPartage`, `lib/blog-content.ts`). Un `openGraph` de page
  **remplace** celui du layout : `siteName` et `locale` y sont donc redonnés.

## Installation (PWA)

Le site est installable (icône sur l'écran d'accueil, mode `standalone`) via
`public/manifest.json`. Longtemps sans service worker actif — un choix
délibéré, pas un oubli — jusqu'à ce que ça bloque l'installation sur un
navigateur précis.

- **Chrome/Edge n'exigent plus de service worker pour installer** depuis
  respectivement leurs versions 108 (mobile) et 112 (desktop) : un manifeste
  valide en HTTPS suffit à proposer l'installation. **Samsung Internet, lui,
  l'exige toujours** — manifeste valide *et* service worker portant un
  gestionnaire `fetch` — sans quoi aucune bannière n'apparaît, quel que soit le
  manifeste. D'où le retour d'un vrai service worker (`app/sw.js/route.ts`),
  après l'avoir neutralisé pendant la migration Next.js (cf. ci-dessous).
- **Historique — pourquoi il n'y en avait plus.** La version vanilla du site
  enregistrait un service worker sur ce domaine. Resté actif dans les
  navigateurs des visiteurs après le passage à Next.js, il continuait de
  servir des pages depuis son cache en ignorant le `no-store` envoyé par le
  serveur — le carnet de recettes affichait un état périmé qu'un simple F5 ne
  corrigeait pas, seul un vidage manuel du cache y parvenait. `/sw.js` a donc
  longtemps été un worker **auto-destructeur** (se désenregistre lui-même,
  purge les caches, recharge les onglets ouverts) — un service worker ne
  pouvant pas être désinscrit à distance, c'est la seule méthode fiable pour
  atteindre les navigateurs qui le portent encore.
- **Garde-fou du nouveau worker, impératif : jamais de HTML dynamique ni de
  réponse d'API en cache.** Toute navigation passe en réseau d'abord ; le
  cache n'intervient qu'en dernier recours, hors ligne, et ne sert alors que
  `/hors-ligne` — une page statique dédiée, sans dépendance à une donnée que
  le worker ne peut pas fournir hors ligne. Seuls quelques fichiers immuables
  (icônes, manifeste) sont précachés. C'est ce qui permet de réintroduire un
  service worker sans rejouer la régression ci-dessus.
- **Servi par une route (`app/sw.js/route.ts`), pas par `public/`** : ça
  permet un interrupteur d'arrêt côté serveur (`PWA_DISABLE_SERVICE_WORKER`,
  cf. tableau des variables d'environnement) — engagé, la route sert le worker
  auto-destructeur de l'historique ci-dessus, sans toucher au code du
  navigateur. Le nom du cache est dérivé de `VERCEL_GIT_COMMIT_SHA` : chaque
  déploiement purge donc le précédent à l'activation, sans version à
  incrémenter à la main.
- **`ServiceWorkerRegistrar`** (`components/ServiceWorkerRegistrar.tsx`,
  monté dans le layout racine) désinscrit tout enregistrement qui ne pointe
  pas vers `/sw.js` actuel — reliquat de la version vanilla ou enregistrement
  fait sous un autre chemin — avant d'enregistrer le worker courant. Il
  n'a rien à connaître de l'interrupteur d'arrêt : `register('/sw.js')`
  installe tel quel ce que la route sert.
- **Bouton d'installation maison** (`components/InstallPwaBanner.tsx`,
  `lib/use-install-prompt.ts`) : Chrome/Edge et Samsung Internet antérieur à
  la version 27 émettent `beforeinstallprompt`, capté pour afficher un bouton
  qui déclenche l'invite native au clic plutôt que la mini-infobar du
  navigateur. **Samsung Internet ≥ 27 ne l'émet plus** — Samsung a choisi de
  piloter l'installation depuis son propre menu plutôt que par cet événement
  Chrome — la bannière bascule alors, après un court délai sans événement, sur
  une fiche d'instructions (menu ⋮ → « Ajouter une page à »). Même repli pour
  Safari iOS, qui n'a jamais émis cet événement.
- **Rejet temporaire, pas définitif** (`localStorage`, 30 jours) : fermer la
  bannière une fois ne dit pas qu'on ne veut jamais installer l'application.
- **Visible aux visiteurs comme aux membres** : installer l'application n'est
  pas une action de compte, la bannière est montée dans le layout racine, hors
  de toute condition de session.

## Cookies et consentement

Politique de cookies = **§ 10 de `/confidentialite`** (ancre `#cookies`),
jamais une page à part : `/cookies` n'est qu'une redirection 307 posée dans
`next.config.mjs` (évaluée avant `middleware.ts`, donc valable sous
`COMING_SOON`). Deux textes finiraient par se contredire — c'est ce qui était
arrivé au § 10, qui affirmait « aucun outil de mesure d'audience » (JEP-128).

- **Google Analytics 4 n'est chargé qu'après « Accepter »**
  (`components/CookieConsent.tsx`, `lib/consent.ts`) : aucun Consent Mode
  « denied » qui chargerait `gtag.js` avant le choix. Sans
  `NEXT_PUBLIC_GA_ID`, ni script, ni bandeau, ni bouton.
- **Refuser pèse autant qu'accepter** (deux boutons identiques, même niveau) ;
  le choix vit dans le stockage local, 6 mois, puis la question est reposée.
- **Retirer son accord** (« Gérer mes cookies », pied de page et § 10) coupe GA
  dans la page (`ga-disable-<ID>`) et efface les `_ga*` sur chaque niveau de
  domaine — GA les pose sur `.jepatisse.com`.
- **ID de mesure : `G-NCXHK395QN`** (propriété « Je pâtisse ! », JEP-89). Le nom
  des cookies `_ga_NCXHK395QN` figure au § 10 : changer d'ID impose de changer
  le texte. L'ID rédigé à l'origine dans le ticket (`G-DLLDP40QE5`) n'existait
  pas dans la propriété — GA serait resté muet sans aucune erreur. Il est
  **inscrit au build** : poser la variable dans le panneau Virtuozzo puis
  *reconstruire* (un redémarrage ne suffit pas), et le vérifier dans les
  fichiers construits (`grep -rl <ID> .next/static`), pas par `pm2 env`.
- **`dev.jepatisse.com` est du trafic interne** : son script d'initialisation
  pose `traffic_type: 'internal'` (nom d'hôte lu dans le navigateur, le même
  build servant `dev` et `www`), exclu des rapports par le filtre de données
  « Trafic interne » de GA4 (à passer de *Test* à *Actif* après vérification —
  l'exclusion est définitive). `www` (page d'attente) reste mesuré.
- **Événements d'usage : `trackEvent` (`lib/analytics.ts`)**, typé par une
  liste fermée (`EvenementsAudience`) — jamais de chaîne libre, jamais de
  donnée personnelle (l'identifiant de recette est admis). Muet tant que
  `window.gtag` n'existe pas, donc avant « Accepter ». Émis **après** la
  réussite de l'écriture, jamais à l'intention : `ajouter_favori` /
  `retirer_favori` (`FavoriteHeart`, `FavoriteButton`), `creer_fournee` et
  `ajuster_recette` (`BatchWidget`, au geste normal de la fiche — les essais du
  mode projet ne sont pas comptés), `terminer_fournee` (`BatchView` ET
  `PlanningDayView`, deux chemins), `generer_liste_courses` (création d'une
  liste, pas l'ajout à une liste existante), `importer_recette` (`ImporterForm`).
  Les paramètres (`mode`, `source`, `method`, `recipe_id`) doivent être déclarés comme
  **dimensions personnalisées** dans GA pour sortir dans les rapports. Les
  chiffres ne comptent que les visiteurs consentants.
- **`sign_up` : l'inscription est terminée quand le pseudo du compte est
  enregistré pour la PREMIÈRE fois** (`lib/inscription.ts`, JEP-89) — pas à la
  création du compte (un compte e-mail non confirmé n'est pas un inscrit), pas
  à un changement de pseudo ultérieur. Deux chemins mènent à cet instant, et le
  navigateur ne les voit pas pareil :
  - `/api/pseudo/choisir` (Google, et e-mail dont le pseudo n'a pu être écrit)
    répond `inscription: 'google' | 'email' | null` — `null` si le membre avait
    déjà un pseudo (lu **avant** l'écriture), la route servant aussi à en
    changer ; `PseudoChooser` envoie l'événement ;
  - `/auth/callback` écrit le pseudo d'une inscription par e-mail côté serveur
    puis **redirige** : il pose `?inscription=email` sur la destination
    (`avecMarqueInscription`), que `components/InscriptionTracker.tsx` (layout
    racine) lit, **retire de l'adresse avant toute attente**, puis envoie par
    `trackEventQuandPret` — GA n'est pas encore chargé à l'arrivée, `trackEvent`
    seul perdrait l'événement. Le marqueur ne porte aucune donnée personnelle.
  Méthode d'après `app_metadata.provider` (`email` ou `google`, tout autre
  fournisseur : pas d'événement). **Limite connue** : pas de seuil d'ancienneté
  du compte (le jeton de session n'en porte pas la date) — un compte plus
  ancien sans pseudo compterait comme une inscription ; sans objet tant que le
  site n'est ouvert qu'aux testeurs.
- **Configuration GA décrite par le § 10, à garder alignée** : cookies 13 mois
  (`cookie_expires`, GA pose 2 ans par défaut), signaux Google et
  personnalisation publicitaire désactivés. La conservation 14 mois se règle
  dans la console Google Analytics, pas dans le code.

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
| Projets | `recipe_projects`, `recipe_project_components` (+ `scaling_mode`, `recipes.kind` / `recipes.project_stage`, `recipe_steps.component_id`, fonction `owns_recipe`) — voir « Mode projet » ci-dessus |
| Planification | `planning`, `plan_steps`, `plan_substeps`, `plan_ingredients`, `plan_utensils`, `executions`, `execution_steps`, `execution_substeps`, `execution_ingredients`, `execution_utensils` — voir « Recettes planifiées » ci-dessous |
| Courses | `shopping_lists`, `shopping_list_items` |
| Import IA | `imports` |
| Site | `site_settings` (bannières d'accueil) |
| Impersonation | `impersonation_sessions`, `impersonation_events` |
| Recherche | colonne générée `recipes.fts` (GIN), vue `author_ratings`, fonctions `mc_norm`, `search_advanced_recipes`, `suggest_ingredients` |
| Contact | `contact_messages`, `contact_replies`, `contact_status_history`, `contact_message_photos` — voir « Contact et suivi Jira » ci-dessus, RLS sans policy d'écriture (`docs/contact-jira.md`) |

- Sécurité par **Row Level Security** (les requêtes passent par la session
  de l'utilisateur, jamais par une clé service côté front).
- **Images sur le stockage objet Swift**, pas en base : les colonnes portent
  une URL. Le dépôt est un `PUT` direct navigateur → conteneur, autorisé par
  une signature TempURL mintée par `/api/stockage/televersement` — les octets
  ne traversent jamais l'application. Compression côté client dans
  `lib/images.ts`. Deux conteneurs, `jp-photos` (public) et `jp-contact`
  (privé, données personnelles), cloisonnés par des clés de signature
  distinctes.
- Régénération des types : workflow GitHub Actions manuel
  (`.github/workflows/gen-types.yml`, tunnel SSH par le nœud applicatif,
  résultat en pull request), dont l'en-tête
  décrit le mode opératoire.

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

**Import en lot depuis Jira** (JEP-242) : des recettes préparées dans des
tickets Jira (texte + photo finale du dessert) sont importées en **brouillon**
chez un membre donné, sans appel à l'API Anthropic. La structuration est faite
par Claude Code dans la session, au format exact de sortie de l'IA
(`RecetteIA`, cf. `PROMPT` de `lib/ai/import-pivot.ts` — mêmes règles de
fidélité), dans `imports-jira/<CLÉ>.json`. Le membre destinataire (e-mail ou pseudo)
est donné **au lancement du workflow**, jamais dans le dépôt : une adresse
e-mail enregistrée resterait dans l'historique git. Tout ce qui suit l'appel IA dans `/api/import-url` est rejoué
à l'identique par `lib/import-jira.ts` ; le workflow manuel
`.github/workflows/import-jira-recettes.yml` (simulation d'abord, puis
`importer`) retrouve le membre, dépose la photo sur `jp-photos/recettes/`,
insère la ligne `imports`, commente le ticket et le passe à « Revue en
cours » (garde-fou `resoudreTransition` contre « Déployé »). Idempotent par la marque
`Jira <CLÉ>` dans `imports.fichier_original`. `lib/import-jira.test.ts` valide
chaque fichier du dossier à la CI.

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
| `STRIPE_SECRET_KEY` | Authentification aux API Stripe (Checkout, portail, échéanciers, webhook sortant vers `test_helpers/test_clocks` en test) — version de l'API épinglée dans le Dashboard Stripe, pas dans le code (§14 `docs/abonnements.md`) | Serveur uniquement |
| `STRIPE_WEBHOOK_SECRET` | Vérifie la signature du webhook entrant (`/api/webhooks/stripe`, corps brut) — absente : la route répond 503 plutôt que de traiter un événement dont l'origine ne peut plus être garantie | Serveur uniquement |
| `NEXT_PUBLIC_GA_ID` | Identifiant de mesure Google Analytics 4 (JEP-128). Absent : aucun traceur, aucun bandeau de consentement, pas de bouton « Gérer mes cookies » — cf. « Cookies et consentement » | Publique (inlinée au build) |
| `ANTHROPIC_API_KEY` | API Claude (import / ajustement) | Serveur uniquement |
| `IMPORT_MODEL` | Modèle de structuration (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `TRANSCRIBE_MODEL` | Modèle de lecture des photos (optionnel, défaut `claude-sonnet-5`) | Serveur uniquement |
| `PSEUDO_MODERATION_MODEL` | Modèle du contrôle des pseudos à l'inscription (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `COMMENT_MODERATION_MODEL` | Modèle du score IA sur les avis d'une fournée terminée (optionnel, défaut `claude-haiku-4-5`) | Serveur uniquement |
| `IMPORT_DAILY_QUOTA` | Quota d'imports/jour (optionnel) | Serveur uniquement |
| `COMING_SOON` | `true` affiche la page d'attente (`/bientot-disponible`) à la place du site — posée sur le projet Vercel résiduel, qui sert encore `www.jepatisse.com`. Voir « Domaines » : `dev.jepatisse.com` en est exempté par `middleware.ts`, quel que soit ce réglage. | Serveur uniquement |
| `CRON_SECRET` | Protège les routes planifiées (`/api/cron/*`) : l'appelant doit envoyer `Authorization: Bearer <CRON_SECRET>`. Vercel l'ajoutait automatiquement à ses appels programmés ; une fois les crons portés sur GitHub Actions, c'est au workflow de poser l'en-tête. | Serveur uniquement |
| `MAINTENANCE_FREEZE` | `true` bloque **tout** le site par un 503, les deux domaines compris — fenêtre de bascule uniquement, à retirer après. Contrairement à `COMING_SOON`, n'exempte pas `dev.jepatisse.com` ; ne couvre ni `/api/*` ni les écritures directes du navigateur vers Supabase (cf. en-tête de `middleware.ts`) | Serveur uniquement |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | Client SMTP unique (`lib/email.ts`) — Brevo depuis la migration Infomaniak | Serveur uniquement |
| `EMAIL_SENDER` | Adresse d'expédition des e-mails applicatifs (`noreply@jepatisse.com`) | Serveur uniquement |
| `CONTACT_NOTIFICATION_TO` | Destinataire de la notification à chaque nouvelle demande de contact | Serveur uniquement |
| `EMAIL_REPLY_TO` | Adresse « répondre à » des e-mails transactionnels du module contact | Serveur uniquement |
| `CONTACT_FORM_SECRET` | Signe le jeton anti-robot du formulaire de contact (délai minimum) — absent : dégradé, jamais bloquant | Serveur uniquement |
| `IP_HASH_SALT` | Sel de hachage des adresses IP du formulaire de contact (jamais stockées en clair) | Serveur uniquement |
| `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` | Authentification Jira (création de ticket, recherche de statut) | Serveur uniquement |
| `JIRA_PROJECT_KEY` / `JIRA_ISSUE_TYPE_BUG` | Projet et type de ticket pour un signalement de bug | Serveur uniquement |
| `JIRA_STATUS_TO_DEPLOY` / `_ID`, `JIRA_STATUS_DEPLOYED` / `_ID` | Noms (et id, en priorité) des statuts Jira « développé » et « déployé » — cf. « Contact et suivi Jira » | Serveur uniquement |
| `JIRA_WEBHOOK_SECRET` | Secret HMAC du webhook Jira entrant | Serveur uniquement |
| `SWIFT_STORAGE_URL` | Racine du stockage objet, telle que la rend `swift auth` (`https://<hôte>/v1/AUTH_<projet>`) — lot B | Serveur uniquement |
| `SWIFT_TEMPURL_KEY_PHOTOS` | Clé de signature TempURL du conteneur `jp-photos` (public). **Doit différer de la suivante** : c'est ce qui cloisonne réellement les deux conteneurs | Serveur uniquement |
| `SWIFT_TEMPURL_KEY_CONTACT` | Clé de signature TempURL du conteneur `jp-contact` (privé, photos de contact — données personnelles) | Serveur uniquement |
| `CARNET_PARTAGE_SECRET` | Signe les liens de partage de carnet (`lib/book-link.ts`, JEP-21) — optionnelle : absente, dérivée de `SUPABASE_SERVICE_ROLE_KEY`. La changer invalide tous les liens déjà distribués | Serveur uniquement |
| `PWA_DISABLE_SERVICE_WORKER` | `true` fait servir par `app/sw.js/route.ts` un worker auto-destructeur (se désenregistre, purge les caches) plutôt que le worker actif — interrupteur d'arrêt de la PWA, cf. « Installation (PWA) » ci-dessous. Variable lue côté serveur à l'exécution, pas au build : un changement prend effet au redémarrage du nœud, sans reconstruction. | Serveur uniquement |

Modèle local : `.env.local.example` → `.env.local`.

## Déploiement

Mode opératoire complet, pièges de construction compris : **`DEPLOY.md`**.
Historique de la migration depuis Vercel + Supabase :
`docs/migration-infomaniak.md`.

- **Trois environnements Virtuozzo, à Genève.** `jepatisse-app` porte
  l'application (pile Node.js 22.x native + `pm2`, nœud 216658) derrière son
  équilibreur NGINX (216680). `jepatisse-bdd` porte la base (PostgreSQL 17.6,
  216075), GoTrue (216114) et PostgREST (216242) derrière l'équilibreur qui
  sert `auth.jepatisse.com` (216115) et y tient le rôle de Kong sur
  `/auth/v1/` et `/rest/v1/`. Deux environnements distincts pour l'app et la
  base, et non un seul : le moteur d'un environnement Jelastic est figé à sa
  création, et l'image Docker de la base y interdit les piles natives. Effet
  heureux : un redéploiement applicatif ne peut pas atteindre la base. Un
  troisième, `jepatisse-preview` (216804), sert les aperçus de PR.
- **Après avoir poussé/créé une PR, vérifier la disponibilité de l'étiquette
  `preview`** (un seul nœud d'aperçu, une PR à la fois — cf. `DEPLOY.md`
  § « Aperçu d'une PR ») : lister les PR ouvertes portant déjà `preview`.
  Toujours **annoncer le résultat** à l'utilisateur (créneau libre, ou déjà
  pris par telle PR). Si le créneau est libre, **proposer** de poser
  l'étiquette sur la PR courante plutôt que la poser d'emblée — c'est un
  geste délibéré (construction sur une vraie machine avec de vrais secrets),
  pas une étape automatique du push.
- **Ne jamais ajouter de nœud à la couche applicative de `jepatisse-app`.** La
  plateforme régénère `upstream common` à partir de la **couche entière** : un
  nœud ajouté s'y retrouve rangé, et l'équilibreur envoie des visiteurs dessus.
  Un `server_name` propre dans `conf.d/` n'y change rien, l'upstream est réécrit
  au-dessus. C'est ce qui a mis `dev.jepatisse.com` en panne le 14/09 — il
  servait l'application Express d'usine d'un nœud vide. Un besoin de nœud
  supplémentaire se règle par un **environnement séparé** (c'est ce qu'est
  `jepatisse-preview`). Corollaire : `nginx -s reload` étant refusé depuis le
  Web SSH, une configuration régénérée n'est relue que par un **redémarrage du
  nœud d'équilibrage** depuis le tableau de bord — entre les deux, 502 sur tout,
  alors que le fichier sur disque est juste et que l'application répond en
  local. Cf. `DEPLOY.md` § « Aperçu d'une PR ».
- **Une nouvelle origine web doit être autorisée par l'API des DEUX côtés**,
  sinon elle ne peut ni se connecter ni écrire : le motif CORS de
  l'équilibreur `jepatisse-bdd` (216115, `/etc/nginx/conf.d/ssl.conf`) pour toute
  connexion et toute écriture, ET `GOTRUE_URI_ALLOW_LIST` (216114) pour la
  connexion Google spécifiquement. Le symptôme ne nomme ni l'un ni l'autre :
  un « Failed to fetch » de `supabase-js`. Vaut pour l'aperçu, et pour tout
  domaine qu'on ajouterait ensuite. Mode opératoire complet dans `DEPLOY.md`.
- **Le déploiement construit sur le nœud** — mais **`.github/workflows/deploiement-app.yml`
  peut le faire lui-même à chaque push sur `main`**, s'il est armé (variable de
  dépôt `DEPLOIEMENT_ACTIF`, cf. `DEPLOY.md` § « Déployer `main`
  automatiquement »). **Ne jamais affirmer qu'une fusion sur `main` exige un
  geste manuel (Web SSH, commande canonique) sans avoir vérifié l'armement** —
  la dernière exécution du workflow sur `main` le montre directement : un job
  « Construire et redémarrer le nœud » dont l'étape « Ce qui serait fait
  (simulation) » est *skipped* (pas *success*) veut dire qu'il a réellement
  construit sur le nœud, pas simulé. Erreur commise le 27/09 sur JEP-250 :
  annoncé comme geste manuel restant à faire, alors que le workflow avait déjà
  déployé et vérifié le HTTP 200 avant même la fin de la réponse. La procédure
  manuelle décrite plus bas reste la porte de sortie si le workflow est
  désarmé ou échoue, jamais la première hypothèse.
- **`pm2` ne lit jamais `scripts.start`** : c'est `ecosystem.config.js` qui
  pilote le démarrage, avec `instances: 1`. Ce n'est pas un réglage de charge
  mais une **contrainte de justesse** — `unstable_cache` et `revalidateTag`
  sont par processus, plusieurs instances désynchroniseraient les
  référentiels.
- **Le panneau de variables n'est pas l'environnement du processus.** Après
  toute modification, vérifier avec `pm2 env 0 | grep <NOM>` et redémarrer le
  nœud ; `pm2 restart --update-env` propage le shell appelant, donc parfois
  l'ancienne valeur. Sur un nœud Docker, lire `/proc/<pid>/environ` du vrai
  processus — **pas** `/proc/1/environ`, qui est le lanceur de la plateforme.
  Ce piège a coûté deux pannes le 13/09 (§ 7.17 du dossier).
- Les `NEXT_PUBLIC_*` comptent **aux deux moments** : inlinées dans le bundle
  navigateur au build, relues dans `process.env` par le code serveur à
  l'exécution. Un changement impose donc une reconstruction **et** une valeur
  juste dans le panneau.
- **`maxDuration` est une directive Vercel, inerte ici.** C'est le
  `proxy_read_timeout` de l'équilibreur (60 s par défaut) qui borne désormais
  une route longue. Un import IA coupé se présente en **504 de l'équilibreur**,
  pas en erreur applicative.
- **Domaines, tous sur Infomaniak depuis la phase 3 du lot A** (§ 7.21).
  `www.jepatisse.com` est le domaine canonique, servi par Virtuozzo (CNAME
  vers l'hôte de l'environnement) et affichant la page d'attente
  `COMING_SOON` — posée sur le nœud applicatif, plus sur Vercel. `jepatisse.com`
  et les deux `.fr` redirigent en 301 via la **redirection web** du manager
  Infomaniak (pas de CNAME à l'apex, qui l'interdit). **`dev.jepatisse.com`**
  reste l'URL des testeurs, exemptée de la page d'attente par `middleware.ts`
  (comparaison sur `Host`) — c'est elle qu'il faut utiliser pour vérifier
  qu'un correctif se comporte comme attendu tant que `COMING_SOON` est posé.
- **Redirection HTTP → HTTPS et HSTS** posés sur l'équilibreur (§ 7.21,
  fichiers `nginx-jelastic.conf` et `conf.d/ssl.conf` du nœud 216680) — deux
  protections que Vercel fournissait sans qu'on les demande, et qui manquaient
  à la bascule.
- **Résidu Vercel, à retirer** : le projet `mc` ne sert plus aucun domaine
  (URL `*.vercel.app` seule) ; un second projet `dev_jp` déploie le même
  dépôt sur `mc-oqp7.vercel.app`, sans domaine propre non plus. Les deux
  crons tournent depuis GitHub Actions
  (`.github/workflows/cron-*.yml`) ; `vercel.json` a disparu. Ne reste que le
  retrait des deux projets eux-mêmes (phase 4).

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

#### 5. Suivi d'une tâche en attente (PR, déploiement…)

Ne jamais programmer soi-même un réveil automatique récurrent quand le
seul blocage restant est une action humaine (test manuel sur un aperçu,
décision, validation) — un point de contrôle périodique n'a de sens que
s'il peut trouver du nouveau sans intervention (CI en cours, conflit,
revue). Incident vécu le 17-18/09 sur la PR #282 : six réveils horaires
consécutifs n'ont rien trouvé de neuf, chacun rechargeant tout le contexte
de la session pour zéro information — pur gaspillage de quota, sur une
nuit entière où seul un test manuel restait à faire.

À la place : poser la question, avec une durée conseillée (« je reviens
vérifier dans 30 minutes, ou une autre durée te convient mieux ? »), et
attendre l'ordre avant de programmer quoi que ce soit. Ne reprogrammer
qu'une fois, jamais en boucle silencieuse.

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
