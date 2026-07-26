// Accès aux recettes, typé — porté depuis db.js (getRecipes / getRecipe /
// getUserRecipes / createRecipe). À utiliser dans les Server Components.
//
// NOTE : les requêtes à jointures profondes (getRecipe) touchent des tables
// absentes de schema.sql (utensils, ingredient_refs, executions…) : la base
// live a divergé. On régénérera les types avec `npm run gen:types` au moment
// de porter recette.html ; d'ici là ces retours restent volontairement souples.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { cardAllergenNames, matchAllergenPictos, type AllergenPictoItem } from '@/lib/recipe-view';

type Recipe = Database['public']['Tables']['recipes']['Row'];

export const CARD_SELECT =
  'id, title, description, hero_image_url, prep_time, cook_time, wait_time, total_time, rating_avg, rating_count, created_at, ' +
  'profiles!recipes_author_id_fkey(full_name, avatar_url), recipe_types(name), difficulties(name, level), ' +
  'ingredient_groups(ingredients(allergen)), recipe_steps(prep_time, cook_time, wait_time)';

export type RecipeCard = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'description'
  | 'hero_image_url'
  | 'prep_time'
  | 'cook_time'
  | 'wait_time'
  | 'total_time'
  | 'rating_avg'
  | 'rating_count'
  | 'created_at'
> & {
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
  ingredient_groups: { ingredients: { allergen: string | null }[] }[];
  recipe_steps: { prep_time: number | null; cook_time: number | null; wait_time: number | null }[];
};


export async function getRecipes(opts: {
  limit?: number;
  offset?: number;
  status?: string;
  authorId?: string | null;
  typeId?: number | null;
} = {}): Promise<RecipeCard[]> {
  const { limit = 12, offset = 0, status = 'published', authorId = null, typeId = null } = opts;
  const supabase = await createClient();
  let q = supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (authorId) q = q.eq('author_id', authorId);
  if (typeId) q = q.eq('type_id', typeId);
  const { data, error } = await q;
  if (error) console.error('getRecipes:', error.message);
  return (data as unknown as RecipeCard[]) ?? [];
}

// Recherche de recettes publiées par titre, ingrédient ou auteur.
// PostgREST ne permet pas un OR sur des tables jointes différentes en une
// requête : on collecte donc les identifiants correspondants via trois
// requêtes ciblées (titre / auteur / ingrédient), puis on récupère les
// cartes complètes pour l'union dédoublonnée. Le filtre `status = published`
// est réappliqué au chargement final : une correspondance pointant vers une
// recette non publiée est ainsi écartée.
export async function searchRecipes(
  query: string,
  opts: { limit?: number } = {},
): Promise<RecipeCard[]> {
  const q = query.trim();
  if (!q) return [];
  const { limit = 60 } = opts;
  const supabase = await createClient();
  const like = `%${q}%`;

  const [titleRes, authorProfiles, ingredientRes] = await Promise.all([
    // 1. Titre de la recette
    supabase.from('recipes').select('id').eq('status', 'published').ilike('title', like),
    // 2. Auteur (nom affiché) → identifiants de profils
    supabase.from('profiles').select('id').ilike('full_name', like),
    // 3. Ingrédient → recette via le groupe d'ingrédients
    supabase.from('ingredients').select('ingredient_groups(recipe_id)').ilike('name', like),
  ]);

  const ids = new Set<string>();
  for (const row of titleRes.data ?? []) ids.add(row.id);
  for (const row of ingredientRes.data ?? []) {
    const recipeId = (row as { ingredient_groups: { recipe_id: string | null } | null })
      .ingredient_groups?.recipe_id;
    if (recipeId) ids.add(recipeId);
  }

  const authorIds = (authorProfiles.data ?? []).map((p) => p.id);
  if (authorIds.length) {
    const byAuthor = await supabase
      .from('recipes')
      .select('id')
      .eq('status', 'published')
      .in('author_id', authorIds);
    for (const row of byAuthor.data ?? []) ids.add(row.id);
  }

  if (!ids.size) return [];

  const { data, error } = await supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', 'published')
    .in('id', [...ids])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('searchRecipes:', error.message);
  return (data as unknown as RecipeCard[]) ?? [];
}

// Recettes publiées rattachées à une catégorie (tag promu sur l'accueil),
// identifiée par son slug. Même principe que searchRecipes : on résout
// d'abord les identifiants de recettes concernées (via recipe_tags), puis on
// récupère les cartes complètes.
export async function getRecipesByTag(
  slug: string,
  opts: { limit?: number } = {},
): Promise<RecipeCard[]> {
  const { limit = 60 } = opts;
  const supabase = await createClient();

  const { data: tag } = await supabase.from('tags').select('id').eq('slug', slug).maybeSingle();
  if (!tag) return [];

  const { data: links } = await supabase.from('recipe_tags').select('recipe_id').eq('tag_id', tag.id);
  const ids = (links ?? []).map((l) => l.recipe_id);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', 'published')
    .in('id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) console.error('getRecipesByTag:', error.message);
  return (data as unknown as RecipeCard[]) ?? [];
}

export async function getUserRecipes(userId: string) {
  const supabase = await createClient();
  const query = () =>
    supabase
      .from('recipes')
      .select('id, title, description, hero_image_url, status, is_public, rating_avg, created_at')
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

  let { data, error } = await query();
  if (error) {
    console.error('getUserRecipes:', error.message);
    ({ data, error } = await query());
    if (error) console.error('getUserRecipes (retry):', error.message);
  }
  return data ?? [];
}

export async function getRecipe(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle();
  if (error) console.error('getRecipe:', error.message);
  return data;
}

// Recette complète avec toutes ses jointures (porté de getRecipe du db.js).
// Typée souplement : les jointures profondes ne s'infèrent pas proprement.
export type RecipeStepView = {
  id: number;
  title: string | null;
  description: string | null;
  day_offset: number | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  tips: string | null;
  sous_etapes: string[] | null;
  order_index: number | null;
  step_photos: { url: string; order_index: number | null }[];
};
export type IngredientView = {
  id: number;
  name: string;
  quantity: string | null;
  unit: string | null;
  comment: string | null;
  url: string | null;
  allergen: string | null;
  order_index: number | null;
  ingredient_refs: { url: string | null; allergens: AllergenRef | null } | null;
};
// Allergène de référence rattaché à un ingrédient (picto + infobulle).
export type AllergenRef = { id: number; name: string; picto: string | null; tooltip: string | null };
export type RecipeFull = {
  id: string;
  title: string;
  description: string | null;
  author_id: string;
  is_public: boolean | null;
  status: string | null;
  created_at: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  measure_type: string | null;
  yield_qty: string | null;
  yield_unit: string | null;
  yield_desc: string | null;
  yield_notes: string | null;
  mold_type_id: number | null;
  mold_dims: import('@/lib/database.types').Json | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  total_time: number | null;
  tips: string | null;
  source: string | null;
  source_url: string | null;
  video_url: string | null;
  serving_advice: string | null;
  hero_image_url: string | null;
  profiles: { full_name: string | null; avatar_url: string | null; username: string | null } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
  mold_types: { name: string; forme: string | null } | null;
  recipe_tags: { tags: { id: number; name: string; slug: string } | null }[];
  recipe_utensils: { id: number; name: string; comment: string | null; url: string | null; order_index: number | null; utensils: { url: string | null } | null }[];
  ingredient_groups: { id: number; name: string | null; order_index: number | null; scaling_mode: string | null; ingredients: IngredientView[] }[];
  recipe_steps: RecipeStepView[];
};

const FULL_SELECT = `
  *,
  profiles!recipes_author_id_fkey(full_name, avatar_url, username),
  recipe_types(name),
  difficulties(name, level),
  mold_types(name, forme),
  recipe_tags(tags(id, name, slug)),
  recipe_utensils(*, utensils(url)),
  ingredient_groups(*, ingredients(*, ingredient_refs(url, allergens(id, name, picto, tooltip)))),
  recipe_steps(*, step_photos(*))
`;

export async function getRecipeFull(id: string): Promise<RecipeFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select(FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getRecipeFull:', error.message);
  return (data as unknown as RecipeFull | null) ?? null;
}

// Table de référence des allergènes avec picto + infobulle. Sert à retrouver le
// visuel d'un allergène saisi en texte libre dans une recette (rapprochement
// par nom). Colonne `picto` hors typage généré → client non typé, cast local.
// Mémoïsé par requête (React cache) : plusieurs cartes sur une même page ne
// déclenchent qu'une seule lecture.
export const getAllergensWithPicto = cache(async (): Promise<AllergenRef[]> => {
  const supabase = await createClient();
  const q = supabase.from('allergens' as never) as ReturnType<typeof supabase.from>;
  const { data, error } = await q.select('id, name, picto, tooltip').order('name');
  if (error) {
    console.error('getAllergensWithPicto:', error.message);
    return [];
  }
  return ((data as unknown as AllergenRef[]) ?? []).filter((a) => a.name);
});

// Résout les pictos d'allergènes pour un lot de cartes (une seule lecture de
// la table de référence). Utile pour les rendus faits hors d'un Server
// Component (ex. route API de pagination), où l'on ne peut pas s'appuyer sur
// le composant asynchrone AllergenPictos.
export type RecipeCardWithAllergens = RecipeCard & { allergenItems: AllergenPictoItem[] };
export async function withAllergenPictos<T extends Pick<RecipeCard, 'ingredient_groups'>>(
  recipes: T[],
): Promise<(T & { allergenItems: AllergenPictoItem[] })[]> {
  if (!recipes.length) return [];
  const refs = await getAllergensWithPicto();
  return recipes.map((r) => ({ ...r, allergenItems: matchAllergenPictos(cardAllergenNames(r), refs) }));
}
