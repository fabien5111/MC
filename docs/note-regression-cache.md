# Note de régression — cache des données de référence

**Livrable 4** de la spécification « Réduction de la consommation egress
Supabase », volet *invalidation de cache*. À conserver : ce sont les règles que
tout développement ultérieur doit respecter pour ne pas réintroduire le
problème — ou en créer un pire, celui de la donnée périmée.

Portée : chantier 2 (`lib/data/reference.ts`). Les volets *sessions* et
*propagation des rôles* seront écrits avec les chantiers 3 et 4.

---

## 1. Ce qui a changé

Les neuf tables de référence (`tags`, `recipe_types`, `difficulties`, `units`,
`mold_types`, `allergens`, `ingredient_refs`, `utensils`,
`ingredient_conversions`) et les clés publiques de `site_settings` ne sont plus
lues à chaque rendu. Elles passent par `lib/data/reference.ts`, qui superpose :

1. `unstable_cache` — cache serveur partagé **entre requêtes et entre
   visiteurs**, avec étiquettes ;
2. `cache()` React — déduplication à l'intérieur d'un même rendu ;
3. un repli non mis en cache sur le client à cookies, si la lecture publique
   échoue ou revient vide.

## 2. Les trois règles à respecter

### Règle 1 — Ne jamais lire un référentiel directement

Aucun `supabase.from('tags')` (ni `units`, `allergens`…) **en lecture** hors de
`lib/data/reference.ts`. C'est la dispersion des accès qui avait produit trois
requêtes distinctes sur `tags`, deux sur `allergens` et trois sur
`ingredient_refs` — la même table, découpée différemment selon l'appelant.

Besoin d'une forme différente ? Elle se dérive **en mémoire** de la lecture
déjà en cache (cf. `getTags` / `getHomeCategories` / `getTagBySlug`, qui
partagent une seule lecture). Ces tables sont petites ; une requête SQL par
variante ne se justifie pas.

`lib/taxonomy.ts`, `lib/imports.ts` et les autres ne sont plus que des
ré-exports : ils existent pour ne pas avoir eu à toucher ~60 sites d'appel, pas
pour y remettre des requêtes.

### Règle 2 — Toute écriture sur un référentiel doit invalider son étiquette

Une écriture non suivie d'une invalidation laisse la valeur périmée **jusqu'à
24 h** selon la table. Depuis un Client Component :

```ts
import { revalidateReference } from '@/lib/revalidate-reference';
await revalidateReference('units'); // puis router.refresh()
```

L'ordre compte : invalider **avant** de re-rendre. `router.refresh()` seul
re-rend la page, mais le Server Component relit la valeur en cache — l'écran ne
bouge pas, et le développement conclut à tort que l'écriture a échoué.

Sites déjà câblés : `ListsManager` (les neuf tables, aux deux points de
mutation), `BannerManager`, `RecipeDefaultPhotoManager`, `CreerForm` et
`RelectureEditor` (tags / ustensiles / ingrédients créés depuis l'éditeur).

### Règle 3 — Le client de cache ne voit que ce que la RLS ouvre à tout le monde

`unstable_cache` interdit toute API de requête dans son callback : la lecture
se fait donc au rôle `anon`, sans cookie. **Ne jamais y faire passer une donnée
dépendant de l'utilisateur** (favoris, brouillons, carnet, planning) : la
première réponse mise en cache serait servie à tous les visiteurs suivants.

Le corollaire est moins évident et plus dangereux : une RLS qui refuse ne
renvoie pas une erreur, mais **zéro ligne**. Un cache posé dessus figerait une
liste vide, silencieusement, pendant 24 h.

D'où l'invariant du module : **un référentiel vide est un symptôme, jamais un
résultat.** Une lecture vide n'est pas mise en cache et la requête est refaite
avec le client à cookies — le comportement d'avant le chantier. On perd le
gain sur cette table, jamais l'affichage.

`site_settings` est la seule exception (`allowEmpty: true`) : n'avoir aucune
bannière est un état normal du site.

## 3. Points de vigilance

- **Une nouvelle table de référence** doit être ajoutée dans
  `lib/data/reference.ts`, avec sa durée de validité, **et** être invalidée à
  l'écriture. Ajoutée ailleurs, elle repart pour un tour du problème initial.
- **Un référentiel n'est pas lisible au rôle `anon`** ? Le repli fonctionne, et
  c'est silencieux par conception. Symptôme à connaître : le compteur de cette
  table ne baisse pas alors que les autres s'effondrent. Deux tables sont dans
  ce cas incertain — `ingredient_refs` et `utensils`, lues uniquement depuis
  des écrans authentifiés (`/importer`, `/relecture`), soit 1 869 appels du
  relevé. À vérifier après déploiement ; si le repli s'avère systématique,
  ouvrir la RLS en lecture publique sur ces deux tables (leur contenu est un
  référentiel, pas une donnée personnelle).
- **Le back-office lit sans cache** : `getSiteSettings` (`lib/site.ts`) est
  conservé non mis en cache pour `app/admin/photos`. Un écran d'administration
  ne pèse rien et n'a pas à voir une valeur périmée. Ne pas « optimiser » ça.
- **Les durées de validité sont un filet, pas le mécanisme** : la propagation
  repose sur l'invalidation (règle 2). Les allonger sans vérifier que toutes
  les écritures invalident bien reviendrait à allonger le délai pendant lequel
  un oubli reste invisible.
- **`lib/data/reference.ts` importe `next/headers`** (via le client à cookies
  du repli) : il ne doit jamais être importé par un Client Component. Le build
  échoue si ça arrive — c'est le garde-fou, il suffit de ne pas le contourner.
