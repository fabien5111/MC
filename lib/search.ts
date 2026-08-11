// Recherche avancée — appel de la RPC Supabase `search_advanced_recipes`.
//
// Une seule requête remplace les trois requêtes de `searchRecipes` (titre /
// auteur / ingrédient) : PostgREST ne sait pas faire un OR sur des tables
// jointes différentes, la fonction SQL si. Elle renvoie la page ET le total
// (compte fenêtré), ce qui évite un second aller-retour pour le compteur.
//
// La RPC est appelée avec la session de l'utilisateur : les policies RLS
// s'appliquent normalement (`SECURITY INVOKER` côté SQL), aucune clé service
// n'intervient. Le filtre `status = 'published'` reste appliqué en SQL.
//
// La signature de la fonction n'est pas encore dans `lib/database.types.ts`
// (types à régénérer après la migration) : on emploie le même contournement
// que `duplicate_recipe` dans components/recipe/DuplicateButton.tsx.
import { createClient } from '@/lib/supabase/server';
import type { RecipeCard } from '@/lib/recipes';
import {
  criteriaToQueryString,
  TIME_MAX,
  timeLabel,
  type SearchCriteria,
} from '@/lib/search-params';

// `error` distingue « la base a répondu : rien ne correspond » de « la requête
// n'a pas abouti ». Sans cette distinction, une RPC absente ou en erreur
// s'affichait exactement comme une recherche sans résultat — le pire des
// symptômes, puisqu'il ressemble à un fonctionnement normal.
export type AuthorResult = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  recipe_count: number;
  rating_avg: number | null;
};

export type SearchResult = {
  total: number;
  recipes: RecipeCard[];
  authorTotal: number;
  authors: AuthorResult[];
  error: string | null;
};

type RpcArgs = {
  search_term: string | null;
  inc_ingredients: string[] | null;
  exc_ingredients: string[] | null;
  type_slug: string | null;
  difficulty_levels: number[] | null;
  tag_slugs: string[] | null;
  exc_allergens: string[] | null;
  max_total_time: number | null;
  min_recipe_rating: number | null;
  min_author_rating: number | null;
  sort_by: string;
  offset_val: number;
  limit_val: number;
  count_only: boolean;
  include_recipes: boolean;
  include_authors: boolean;
};

// Traduction critères → arguments SQL. Centralisée ici pour que la page, la
// route de comptage et les suggestions d'assouplissement interrogent
// rigoureusement la même chose : un écart produirait un total incohérent
// entre le compteur desktop, le bouton du tiroir mobile et la grille.
function toRpcArgs(
  c: SearchCriteria,
  opts: { limit: number; offset: number; countOnly: boolean },
): RpcArgs {
  return {
    search_term: c.q || null,
    inc_ingredients: c.inc.length ? c.inc : null,
    exc_ingredients: c.exc.length ? c.exc : null,
    type_slug: c.type,
    difficulty_levels: c.diff.length ? c.diff : null,
    tag_slugs: c.cat.length ? c.cat : null,
    exc_allergens: c.allerg.length ? c.allerg : null,
    // La butée haute du curseur vaut « sans limite » : on n'envoie pas de
    // borne, sinon les recettes sans temps renseigné seraient écartées.
    max_total_time: c.tmax !== null && c.tmax < TIME_MAX ? c.tmax : null,
    min_recipe_rating: c.minRecipeRating,
    min_author_rating: c.minAuthorRating,
    // « Pertinence » n'a pas de sens sans terme de recherche : la fonction SQL
    // retombe alors sur les plus récentes.
    sort_by: c.sort,
    offset_val: opts.offset,
    limit_val: opts.limit,
    count_only: opts.countOnly,
    include_recipes: c.includeRecipes,
    include_authors: c.includeAuthors,
  };
}

async function callRpc(args: RpcArgs): Promise<SearchResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_advanced_recipes' as never, args as never);
  if (error) {
    console.error('searchAdvanced:', error.message);
    return { total: 0, recipes: [], authorTotal: 0, authors: [], error: error.message };
  }
  const res = data as unknown as {
    total?: number;
    recipes?: RecipeCard[];
    author_total?: number;
    authors?: AuthorResult[];
  } | null;
  return {
    total: res?.total ?? 0,
    recipes: res?.recipes ?? [],
    authorTotal: res?.author_total ?? 0,
    authors: res?.authors ?? [],
    error: null,
  };
}

// Page de résultats + total. `shown` (paramètre `n` de l'URL) est le nombre
// de cartes affichées : la page entière est rendue côté serveur, « Charger
// plus » fait simplement grandir ce nombre. Les bandeaux publicitaires et les
// pictos d'allergènes restent donc calculés au même endroit que le reste.
export async function searchAdvanced(c: SearchCriteria): Promise<SearchResult> {
  return callRpc(toRpcArgs(c, { limit: c.shown, offset: 0, countOnly: false }));
}

// Compte seul (recettes) — suggestions de l'état vide (`relaxationSuggestions`
// ne raisonne que sur des recettes, jamais sur des pâtissiers).
export async function countAdvanced(c: SearchCriteria): Promise<number> {
  const { total } = await callRpc(toRpcArgs(c, { limit: 0, offset: 0, countOnly: true }));
  return total;
}

// Compte seul (recettes + pâtissiers) — bouton de validation du tiroir
// mobile : son libellé doit refléter la portée choisie (Recettes / Pâtissiers
// / les deux), pas seulement les recettes.
export async function countAdvancedAll(c: SearchCriteria): Promise<{ total: number; authorTotal: number }> {
  const { total, authorTotal } = await callRpc(toRpcArgs(c, { limit: 0, offset: 0, countOnly: true }));
  return { total, authorTotal };
}

// Autocomplétion des ingrédients (facette signature), insensible à la casse
// et aux accents — la normalisation est faite en SQL par `public.mc_norm()`,
// la même que `normLoose` côté TypeScript.
export type IngredientSuggestion = { id: number; name: string };
export async function suggestIngredients(term: string, max = 7): Promise<IngredientSuggestion[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('suggest_ingredients' as never, {
    term: t,
    max_results: max,
  } as never);
  if (error) {
    console.error('suggestIngredients:', error.message);
    return [];
  }
  return (data as unknown as IngredientSuggestion[]) ?? [];
}

// ── État vide : proposer de relâcher un critère précis ────────────────────
//
// Recompter en retirant un critère à la fois coûte une requête par critère :
// à ne déclencher QUE lorsque le total est nul, jamais sur le chemin nominal.
// Le nombre de candidats est borné, et chaque recompte se fait en « compte
// seul » (aucune carte construite).
export type Relaxation = {
  id: string;
  action: string; // « Retirer », « Porter le temps à »…
  target: string; // « Gélatine », « 4 h »…
  targetKind: 'inc' | 'exc' | 'plain';
  gain: number; // nombre de recettes regagnées
  params: string; // query string à appliquer
};

const MAX_CANDIDATES = 8;
const MAX_RELAXATIONS = 3;

export async function relaxationSuggestions(c: SearchCriteria): Promise<Relaxation[]> {
  type Candidate = Omit<Relaxation, 'gain' | 'params'> & { next: SearchCriteria };
  const candidates: Candidate[] = [];

  // Les ingrédients exclus d'abord : c'est le critère le plus souvent trop
  // strict, et le plus facile à comprendre quand on le relâche.
  for (const term of c.exc) {
    candidates.push({
      id: `exc:${term}`,
      action: 'Retirer',
      target: term,
      targetKind: 'exc',
      next: { ...c, exc: c.exc.filter((x) => x !== term) },
    });
  }
  for (const term of c.inc) {
    candidates.push({
      id: `inc:${term}`,
      action: 'Retirer',
      target: term,
      targetKind: 'inc',
      next: { ...c, inc: c.inc.filter((x) => x !== term) },
    });
  }
  if (c.tmax !== null && c.tmax < TIME_MAX) {
    const raised = Math.min(TIME_MAX, c.tmax + 120);
    const next = raised >= TIME_MAX ? null : raised;
    candidates.push({
      id: 'tmax',
      action: 'Porter le temps à',
      target: next === null ? 'sans limite' : timeLabel(next).replace("jusqu'à ", ''),
      targetKind: 'plain',
      next: { ...c, tmax: next },
    });
  }
  if (c.minRecipeRating !== null) {
    const lower = c.minRecipeRating - 1;
    candidates.push({
      id: 'min_rr',
      action: 'Accepter',
      target: lower >= 1 ? `${lower} ★ et plus` : 'toutes les notes',
      targetKind: 'plain',
      next: { ...c, minRecipeRating: lower >= 1 ? lower : null },
    });
  }
  for (const name of c.allerg) {
    candidates.push({
      id: `allerg:${name}`,
      action: 'Ne plus exclure',
      target: name,
      targetKind: 'plain',
      next: { ...c, allerg: c.allerg.filter((x) => x !== name) },
    });
  }
  if (c.minAuthorRating !== null) {
    candidates.push({
      id: 'min_ar',
      action: 'Accepter',
      target: 'tous les auteurs',
      targetKind: 'plain',
      next: { ...c, minAuthorRating: null },
    });
  }
  if (c.diff.length) {
    candidates.push({
      id: 'diff',
      action: 'Accepter',
      target: 'toutes les difficultés',
      targetKind: 'plain',
      next: { ...c, diff: [] },
    });
  }
  if (c.cat.length) {
    candidates.push({
      id: 'cat',
      action: 'Accepter',
      target: 'toutes les catégories',
      targetKind: 'plain',
      next: { ...c, cat: [] },
    });
  }
  if (c.type) {
    candidates.push({
      id: 'type',
      action: 'Accepter',
      target: 'tous les types de recette',
      targetKind: 'plain',
      next: { ...c, type: null },
    });
  }

  const shortlist = candidates.slice(0, MAX_CANDIDATES);
  if (!shortlist.length) return [];

  const counted = await Promise.all(
    shortlist.map(async ({ next, ...rest }) => ({
      ...rest,
      gain: await countAdvanced(next),
      params: criteriaToQueryString(next),
    })),
  );

  return counted
    .filter((r) => r.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, MAX_RELAXATIONS);
}
