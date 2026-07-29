# Handoff : Recherche avancée — Maryse-Club (adapté au dépôt `fabien5111/MC`)

> **Version 2, réécrite après lecture du code réel.** La version précédente décrivait la fonctionnalité comme une création complète ; le dépôt montre qu'une bonne part existe déjà. Ce document dit donc **ce qu'il faut étendre**, et non ce qu'il faut construire.
>
> Il remplace la partie UX/UI des *Spécifications : Moteur de Recherche Avancé* d'origine, dont la partie technique reste valable et est reprise ici, corrigée là où le code contredit les hypothèses initiales.

## Parti retenu

| Rôle | Retenu | État dans le dépôt |
|---|---|---|
| Lancement de la recherche | **1e — bandeau qui se déploie** | ✅ **existe déjà** (`components/HeaderSearch.tsx`) → à enrichir |
| Critères, desktop (≥ 1024 px) | **2a — colonne persistante + résultats en direct** | ❌ à créer dans `app/recherche/page.tsx` |
| Critères, tablette & mobile (< 1024 px) | **2c — tiroir remontant** | ❌ à créer |
| Page de résultats | — | ⚠️ **existe** (`app/recherche/page.tsx`) → à étendre, pas à refaire |
| Couche données | — | ⚠️ `searchRecipes()` existe mais est à remplacer par la RPC |

**Bascule 2a ↔ 2c : 1024 px** (`lg` de `tailwind.config.ts`). Décision de design, pas une valeur indicative : une tablette en portrait n'a pas la place pour une colonne de 318 px plus une grille de cartes.

---

## Ce qui existe déjà — à lire avant de coder

### `components/HeaderSearch.tsx` — le picto 1e est déjà là

Le composant client fait **déjà** l'essentiel de ce que la maquette 1e démontre :

- loupe `material-symbols-outlined` avec `aria-expanded` ;
- panneau qui glisse sous l'en-tête (`max-h-0 → max-h-40`, `opacity`, `transition-all duration-300 ease-out`), ancré au `<header>` sticky ;
- focus automatique du champ à l'ouverture (`useEffect`) ;
- **fermeture par `Échap`** déjà implémentée ;
- soumission → `router.push('/recherche?q=…')` ;
- `role="search"` sur le formulaire, **lu par `NavigationSpinner`** pour afficher le spinner « Le Fouet ».

**Ne pas réécrire ce composant.** Trois ajouts seulement :

1. Un bouton **« Critères avancés »** (icône `tune`) à droite du champ, qui pousse vers `/recherche` avec le tiroir/colonne ouvert (ex. `?panel=1`).
2. Une ligne de **suggestions** cliquables sous le champ.
3. La **fermeture au clic extérieur**, absente aujourd'hui (seul `Échap` est géré).

Le `max-h-40` actuel (160 px) devra être relevé pour accueillir les suggestions.

**Sur les suggestions :** la maquette les montre en dur (`Chocolat`, `Sans gluten`…). Elles doivent être **contextuelles** — tags promus de l'accueil (`tags`, déjà utilisés par `getRecipesByTag`) ou dernières recherches de l'utilisateur. Si aucune source n'est branchée au lancement, garder une liste éditoriale courte issue de `tags` plutôt qu'un tableau codé en dur dans le composant.

### `app/recherche/page.tsx` — la page existe

Server Component qui gère **deux modes** : `?q=` (recherche texte) et `?category=` (slug de tag). À conserver — la recherche avancée s'ajoute à ces modes, elle ne les remplace pas. Points à préserver :

- Le titre bascule entre « Résultats de recherche » et « Catégorie : … ».
- **Un bandeau publicitaire est intercalé toutes les 2 lignes** (`CARDS_PER_BLOCK = 6`, fonction `chunk`, composant `AdBanner`). La maquette 2a ne le montre pas — **le conserver** ; c'est un emplacement monétisé du produit.
- Grille `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8`.
- `Header` / `Footer` / `MobileNav`.

### `components/RecipeCard.tsx` + `RecipeCardLayout.tsx` — à réutiliser tel quel

**Ne pas redessiner la carte.** La maquette en propose une version simplifiée : ignorer, la vraie carte est plus riche.

Deux corrections importantes de la maquette vers le réel :

| Maquette | Réalité du produit |
|---|---|
| Pastilles de difficulté (`20 × 9 px`, `.pill`) | **`<MaryseIcon />`** — 5 icônes de maryse, `text-primary` si atteint, `text-outline-variant` sinon |
| Note en icône étoile + nombre + `(140)` | Texte simple `4.5 ★` (`rating_avg`), en `text-xs text-secondary` |

La carte affiche déjà : image 4/3, difficulté en maryses, type de recette, temps effectif (`effectiveTimes` + `formatTime`), titre, description sur 2 lignes, **pictos d'allergènes**, auteur, note. Elle porte en superposition le cœur favori (`FavoriteHeart`) et un bouton « Planifier ».

**La facette difficulté doit donc utiliser `MaryseIcon`, pas les pastilles de la maquette** — sinon le même concept se lit de deux façons différentes sur un même écran.

### Allergènes — déjà en place, mais schéma hybride

Le produit gère déjà les allergènes : table `allergens` (nom, `picto`, `tooltip`), colonne `ingredient_refs.allergen_id` (normalisée, FK), et `ingredients.allergen` (**texte libre**). `lib/recipe-view.ts` rapproche les deux par `normAllergen()` — insensible à la casse et aux accents.

**Conséquence directe sur la facette « Allergènes à exclure » :** filtrer sur le texte libre `ingredients.allergen` n'est pas fiable. Le filtre doit passer par `ingredient_refs.allergen_id`, ce qui suppose que les ingrédients des recettes soient rattachés à un `ingredient_ref`. Tant que ce rattachement n'est pas systématique, **ne pas présenter ce filtre comme une garantie de sécurité alimentaire** dans l'interface — c'est déjà signalé dans `CLAUDE.md`. Le formuler comme une aide au tri.

### `searchRecipes()` — c'est ce que la RPC remplace

Aujourd'hui, la recherche fait **trois requêtes séparées** (titre / auteur / ingrédient), collecte les identifiants dans un `Set`, puis recharge les cartes complètes — le commentaire du code explique que PostgREST ne permet pas un `OR` sur des tables jointes différentes. Aucune pagination réelle (`limit: 60`), aucun tri autre que `created_at`.

C'est précisément la limite que la RPC lève. **Garder `searchRecipes` pendant la transition** (la page l'utilise), puis basculer.

---

## Conventions du dépôt — non négociables

Tirées de `CLAUDE.md`, à respecter sous peine de faire un travail à refaire :

- **⚠️ Ne pas créer de fichier `.sql` dans `db/`.** Toute migration doit être **affichée dans la conversation** en bloc SQL, pour copier-coller dans l'éditeur SQL de Supabase. (Les fichiers présents dans `db/` sont antérieurs à cette règle.)
- **Ne jamais éditer `lib/database.types.ts` à la main** — le régénérer (`npm run gen:types` ou le workflow GitHub Actions `gen-types.yml`) **après** création de la RPC.
- **Vérification avant tout push** : `npm run typecheck`, et `npm run build` pour un changement structurel. `main` est déployée automatiquement sur Vercel (`mc-snowy`).
- **Server Components pour la lecture**, Client Components pour l'interactif ; toute écriture resynchronise le serveur via `useMutation` (`lib/use-mutation.ts`) + `router.refresh()`.
- **Logique métier pure dans `lib/`**, sans effet de bord (à l'image de `recipe-view.ts`).
- **Spinner** : jamais d'indicateur local. Le spinner « Le Fouet » (`Spinner.tsx` / `LoadingOverlay.tsx`) est déjà déclenché automatiquement sur les navigations de formulaire `role="search"` par `NavigationSpinner`.
- **Français** partout : code commenté, UI, messages de commit.
- Alias d'import `@/*`.
- `CLAUDE.md` impose une **phase de qualification avant toute modification**, et d'attendre le OK. Ce document sert de base à cette qualification ; il ne la remplace pas.

---

## Écran 2a — colonne persistante (≥ 1024 px)

**Référence :** `recherche-retenue.html`, section `#2a`.

Structure à ajouter dans `app/recherche/page.tsx`, autour de la grille existante :

1. **Barre de recherche** en pilule, pré-remplie avec `q`, bouton d'effacement.
2. **Tri** — `<select>` à droite : `Pertinence` (défaut), `Plus récentes`, `Mieux notées`, `Les plus rapides`.
3. **Colonne de critères** — largeur **318 px**, bordure droite, fond `surface-container-low/40`. En-tête « Critères » + **pastille du nombre de critères actifs** + « Réinitialiser ».
4. **Compteur** — `42 recettes` en `font-headline-md`, avec la phrase de contexte « pour “praliné” ». Réutiliser la formulation déjà en place (`{n} résultat{s} pour «&nbsp;{query}&nbsp;»`).
5. **Rappel des critères actifs** en badges retirables au-dessus de la grille.
6. **Grille + bandeaux publicitaires** — inchangés.
7. **Pagination** — « Charger plus » (offset) remplaçant la limite de 60.

**Ordre des facettes, à respecter :** Ingrédients, Type de recette, Difficulté, Temps total, Catégories, Note de la recette, Note de l'auteur, Allergènes à exclure.

Les **ingrédients passent en premier** : c'est la facette qui différencie le produit, elle ne doit pas être enterrée sous les facettes classiques. Les allergènes ferment la liste, étant rarement remodifiés une fois posés.

Le **rappel des critères actifs** évite de faire remonter l'utilisateur dans la colonne pour défaire un réglage — les badges d'ingrédients y gardent leur code couleur.

---

## Écran 2c — tiroir mobile (< 1024 px)

**Référence :** `recherche-retenue.html`, section `#2c` (deux téléphones : résultats + tiroir, et état vide).

1. **En-tête collant** — champ en pilule + bouton **« Filtres »** (`tune`) avec pastille de comptage.
2. **Bande de critères actifs** en défilement horizontal, badges retirables.
3. **Ligne de contexte** — compteur à gauche, tri à droite (`swap_vert`, ouvre une feuille).
4. **Résultats en liste** et non en grille : vignette 80 px, titre sur 2 lignes, note, temps, difficulté en maryses.
5. **Tiroir** — hauteur **88 %**, rayon supérieur 22 px, poignée centrée, voile noir 45 %, `translateY(101% → 0)` en `.38s cubic-bezier(.32,.72,0,1)`.

**Hiérarchie dans le tiroir :** les trois facettes vedettes sont **dépliées** (Ingrédients, Temps, Note de la recette) ; les autres en **accordéons repliés** (Type, Difficulté, Catégories, Allergènes, Note de l'auteur), le premier ouvert pour signaler la suite. Objectif : une liste courte à parcourir au pouce.

**Pied fixe** — bouton pleine largeur **« Voir les 18 recettes »**, nombre dynamique mis à jour avant validation.

Attention à ne pas entrer en conflit avec **`MobileNav`**, déjà présent en bas des pages : le tiroir doit passer au-dessus, et le pied du tiroir ne doit pas se retrouver masqué par la barre de navigation.

---

## La facette ingrédients — inclure / exclure

Comportement identique en 2a et 2c, seule la mise en page change.

1. **Bascule de mode** — segment « À inclure » (`add_circle`) / « À exclure » (`do_not_disturb_on`). La position active prend un fond blanc, une ombre légère et **la couleur de son mode**. Changer de mode **redonne le focus au champ**.
2. **Autocomplétion** sur `ingredient_refs` (icône `nutrition`), **7 suggestions maximum**, chacune préfixée de l'icône du mode courant.
3. **Ajout** au clic ou à `Entrée` (première suggestion, à défaut la saisie brute) ; le champ se vide.
4. **Dédoublonnage insensible à la casse** — comportement à conserver, il évite les requêtes contradictoires.
5. **Badges** — inclus : fond `#d7ecd9`, texte `#1f4d2b`, bordure `#8fc39b`. Exclus : fond `#ffdad6`, texte `#93000a`, bordure `#e4a49e`, **texte barré** 1,5 px.
6. **Légende** en 2a : « Vert = présent dans la recette · Rouge barré = absent ».

**Cas limite absent de la maquette :** un ingrédient ne peut être simultanément inclus et exclu. À l'ajout dans un mode, retirer l'entrée de l'autre mode plutôt que de laisser les deux coexister.

**Couleurs à ajouter à `tailwind.config.ts`** — ces verts et rouges ne sont pas dans la palette Material actuelle. Les nommer (`ingredient-include-*`, `ingredient-exclude-*`) plutôt que de les écrire en dur dans les composants.

---

## Les autres facettes

| Facette | Contrôle | Source de données |
|---|---|---|
| **Type de recette** | Radio, `Toutes` par défaut | table `recipe_types` (déjà jointe dans `CARD_SELECT`) |
| **Difficulté** | Cases cumulables, **5 `MaryseIcon`** + libellé | table `difficulties` (`name`, `level`) |
| **Temps total** | Curseur 30 → 480 min, pas de 30 | `effectiveTimes()` — **attention**, le temps effectif retombe sur la somme des étapes quand `total_time` est vide : le filtre SQL doit reproduire cette règle, sinon les résultats contrediront le temps affiché sur la carte |
| **Catégories** | Puces multi-sélection | table `tags` (cohérent avec `?category=`) |
| **Note de la recette** | 5 étoiles ; re-cliquer la valeur courante remet à zéro | `recipes.rating_avg` |
| **Note de l'auteur** | Segment `Toutes / 3★+ / 4★+ / 4,5★+` | **à créer** : `profiles.author_rating_avg`, `author_rating_count` |
| **Allergènes à exclure** | Cases à cocher, accent `error` | via `ingredient_refs.allergen_id` (voir réserve plus haut) |

Le **filtre temps** est le piège le plus sérieux de la liste : `effectiveTimes()` calcule un temps de repli à partir des étapes. Un filtre SQL naïf sur `total_time` exclura des recettes dont la carte affiche pourtant un temps compatible. À traiter dans la RPC.

**Pastille de comptage** — ingrédients + catégories + niveaux de difficulté + allergènes + note si non nulle. **Masquée à zéro**, pas de « 0 » affiché.

**Compteurs par facette** (« Entremets 62 ») : la maquette les montre, ils exigent des agrégats SQL. À trancher avant développement — les calculer dans la RPC, ou **les retirer de l'interface**. Ne pas les laisser codés en dur.

---

## État vide

**Référence :** second téléphone de la section `#2c`.

L'état actuel de la page se contente d'une phrase (« Aucune recette ne correspond… »). L'état vide de la recherche avancée doit **proposer de relâcher un critère précis** :

- Icône `search_off`, titre « Aucune recette ne réunit tous ces critères ».
- **Trois suggestions maximum** : l'action à gauche (« Retirer *Gélatine* », « Porter le temps à 4 h »), le **gain chiffré à droite** (`+14`, `+8`, `+5`).
- Lien « Tout réinitialiser ».

**Coût technique à assumer :** ces gains supposent de recompter en retirant un critère à la fois. À déclencher **uniquement quand le total est zéro**, jamais sur le chemin nominal. Si le coût est trop élevé, dégrader proprement : mêmes suggestions **sans les compteurs**, plutôt que renoncer à l'écran.

---

## État applicatif

**Tous les critères dans l'URL** — décision d'origine confirmée, et cohérente avec l'architecture Server Components du projet : `app/recherche/page.tsx` lit déjà ses `searchParams`. Pas de store global.

```
?q=praline
&inc=chocolat-noir,noisette    # ingrédients à inclure
&exc=fraise                    # à exclure
&type=entremets
&diff=3,4
&tmax=180                      # minutes ; absent = sans limite
&cat=chocolat,caramel           # cohabite avec le ?category= existant
&allerg=lactose
&min_rr=4                      # note recette
&min_ar=4                      # note auteur
&sort=relevance                # relevance | recent | rating | quick
&offset=0
```

**Compatibilité à préserver :** le paramètre `?category=` existe déjà et arrive depuis les catégories de l'accueil. Soit `cat` le généralise, soit les deux cohabitent — mais **les liens de l'accueil ne doivent pas casser**.

### Points de vigilance

- **Débounce** — le compteur en direct de 2a signifie une requête par réglage. Débouncer la saisie (~300 ms), regrouper les changements de facettes, **ne pas déclencher une requête par tick de curseur**.
- **Requêtes concurrentes** — annuler la précédente (`AbortController`), n'appliquer que la dernière réponse. Sans cela, les résultats scintillent et peuvent s'afficher dans le mauvais ordre.
- **Mobile : les critères ne s'appliquent qu'à la validation.** Mais le **compteur du bouton se met à jour en direct** → il faut un appel « compte seul », distinct de la requête de résultats.
- **Fermer le tiroir par le voile ou `Échap` annule** les modifications non validées ; seul le bouton de pied les applique. Sinon l'utilisateur n'a aucun moyen de revenir en arrière.
- **`offset` repart de zéro** à tout changement de critère ou de tri. Ne jamais concaténer des pages issues de critères différents.

---

## Backend Supabase

### Schéma

- `profiles` : ajouter `author_rating_avg` (`numeric`) et `author_rating_count` (`int`).
- `recipes` : colonne générée **`fts` (`tsvector`) indexée en GIN**, agrégeant titre, description, auteur et ingrédients — c'est ce qui remplace les trois requêtes de `searchRecipes`.

**Rappel : afficher ce SQL dans la conversation, ne pas créer de fichier dans `db/`.**

### RPC `search_advanced_recipes`

Paramètres : `search_term`, `filters` (JSONB), `included_ingredients` (`text[]`), `excluded_ingredients` (`text[]`), `min_recipe_rating`, `min_author_rating`, `offset_val`, `limit_val`.

- **Exclusion** : `NOT IN (SELECT recipe_id … WHERE ingredient.name = ANY(excluded))`.
- **Inclusion** : `@>` sur le tableau agrégé des identifiants d'ingrédients de la recette.
- **Retourner le total** avec la page (`count` fenêtré) — il alimente le compteur desktop, la mention « n sur N » et le libellé du bouton mobile. Un second aller-retour serait du gaspillage.
- **Reproduire `effectiveTimes()`** pour le filtre temps (voir plus haut).
- **`status = 'published'`** doit rester appliqué, comme dans `searchRecipes`.
- **RLS** : la RPC doit respecter les policies existantes ; ne pas contourner par une clé service.

### Frontend

- Étendre `lib/recipes.ts` : nouvelle fonction appelant la RPC, avec un type de retour compatible `RecipeCard` (réutiliser `CARD_SELECT`, ou renvoyer la même forme depuis le SQL) pour que **`RecipeCard` fonctionne sans modification**.
- Créer `components/SearchFilters.tsx` (Client Component) qui met à jour l'URL.
- Endpoint d'autocomplétion sur `ingredient_refs`, insensible à la casse et aux accents (réutiliser le principe de `normAllergen()`).
- Appel « compte seul » pour le tiroir mobile et les suggestions de l'état vide.

---

## Design Tokens

`tailwind.config.ts` **correspond exactement** aux tokens de la maquette (mêmes hex, mêmes noms, mêmes tailles de police, `borderRadius` et `spacing` identiques). Aucune conversion à faire : utiliser les classes du projet.

Seuls ajouts nécessaires : les **couleurs des badges d'ingrédients** (verts / rouges ci-dessus), absentes de la palette.

Polices : **Playfair Display** (titres), **Work Sans** (corps), **Great Vibes** (logo). Intitulés de facettes : 10 px, poids 600, `letter-spacing .2em`, capitales, `text-outline`.

Icônes Material Symbols utilisées : `search`, `close`, `tune`, `nutrition`, `add_circle`, `do_not_disturb_on`, `star`, `swap_vert`, `expand_more`, `search_off`. Réglage du produit : `'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24`.

| Mesure | Usage |
|---|---|
| `1024px` | bascule 2a ↔ 2c |
| `318px` | largeur de la colonne de critères |
| `88%` | hauteur du tiroir |
| `22px` | rayon supérieur du tiroir |
| `80px` | vignette des résultats en liste |
| `6` | cartes entre deux bandeaux publicitaires (existant) |
| `7` | suggestions d'autocomplétion maximum |
| `3` | suggestions d'assouplissement maximum |

---

## Files

| Fichier | Rôle |
|---|---|
| `recherche-retenue.html` | **Référence à implémenter** — 1e, 2a, 2c et l'état vide, facettes interactives. |
| `recherche-avancee.html` | Contexte de décision (5 pictos, 3 écrans). **Non à implémenter.** |
| `Specifications_Recherche_Maryse_Club.pdf` | Spécifications d'origine, pour traçabilité. |

⚠️ Les maquettes sont des **références visuelles**, pas du code à porter : Tailwind y est chargé par CDN, le JavaScript est une IIFE vanilla sans état applicatif — il ne démontre que les gestes d'interface. **La logique d'état est celle décrite plus haut (URL), pas celle du script de maquette.**

---

## Ordre de travail conseillé

Trois blocs quasi indépendants, à traiter en autant de sessions — demandés d'un coup, les décisions échappent.

1. **Base de données** — colonnes `profiles`, colonne générée `fts` + index GIN, RPC `search_advanced_recipes`. SQL affiché en conversation, puis `npm run gen:types`.
2. **Couche données + état** — fonction dans `lib/recipes.ts`, `SearchFilters`, sérialisation URL, autocomplétion. Bascule de `searchRecipes` vers la RPC.
3. **Interface** — enrichissement de `HeaderSearch`, colonne 2a, tiroir 2c, état vide.

---

## Definition of done

- [ ] `HeaderSearch` est **étendu** (suggestions + « Critères avancés » + fermeture au clic extérieur), sans régression du focus, d'`Échap`, ni du spinner `role="search"`.
- [ ] Au-dessus de 1024 px la colonne est permanente ; en dessous, tiroir. `MobileNav` ne masque pas le pied du tiroir.
- [ ] La grille utilise **`RecipeCard` inchangé** ; la difficulté s'affiche en `MaryseIcon` dans la carte **et** dans la facette.
- [ ] Les bandeaux publicitaires toutes les 2 lignes sont conservés.
- [ ] Les liens `?category=` de l'accueil fonctionnent toujours.
- [ ] Ingrédients : autocomplétion dans les deux modes, sans doublon, sans cumul inclus/exclu, codes couleur respectés.
- [ ] Le filtre temps est cohérent avec le temps affiché sur les cartes (`effectiveTimes`).
- [ ] Tous les critères sont dans l'URL ; rechargement, partage de lien et retour arrière restituent la même recherche.
- [ ] Le total est cohérent partout : compteur desktop, « n sur N », bouton mobile.
- [ ] Mobile : application à la validation seule ; fermeture par le voile = annulation.
- [ ] `offset` repart de zéro à tout changement ; « Charger plus » ne mélange pas deux jeux de critères.
- [ ] Requêtes concurrentes annulées, aucun résultat périmé.
- [ ] État vide : trois assouplissements ciblés ; compteurs omis proprement si non calculables.
- [ ] Compteurs par facette alimentés par le SQL ou retirés — jamais en dur.
- [ ] Aucun fichier `.sql` ajouté dans `db/` ; `database.types.ts` régénéré, non édité à la main.
- [ ] `npm run typecheck` et `npm run build` passent.
- [ ] Navigable au clavier ; `prefers-reduced-motion` respecté sur le tiroir et le bandeau.
