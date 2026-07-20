// Accès aux recettes, typé — porté depuis db.js (getRecipes / getRecipe /
// getUserRecipes / createRecipe). À utiliser dans les Server Components.
//
// NOTE : les requêtes à jointures profondes (getRecipe) touchent des tables
// absentes de schema.sql (utensils, ingredient_refs, executions…) : la base
// live a divergé. On régénérera les types avec `npm run gen:types` au moment
// de porter recette.html ; d'ici là ces retours restent volontairement souples.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

type Recipe = Database['public']['Tables']['recipes']['Row'];

const CARD_SELECT =
  'id, title, description, hero_image_url, prep_time, total_time, rating_avg, rating_count, created_at, ' +
  'profiles!recipes_author_id_fkey(full_name, avatar_url), recipe_types(name), difficulties(name, level)';

export type RecipeCard = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'description'
  | 'hero_image_url'
  | 'prep_time'
  | 'total_time'
  | 'rating_avg'
  | 'rating_count'
  | 'created_at'
> & {
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
};

export async function getRecipes(opts: {
  limit?: number;
  status?: string;
  authorId?: string | null;
  typeId?: number | null;
} = {}): Promise<RecipeCard[]> {
  const { limit = 12, status = 'published', authorId = null, typeId = null } = opts;
  const supabase = await createClient();
  let q = supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (authorId) q = q.eq('author_id', authorId);
  if (typeId) q = q.eq('type_id', typeId);
  const { data, error } = await q;
  if (error) console.error('getRecipes:', error.message);
  return (data as unknown as RecipeCard[]) ?? [];
}

export async function getUserRecipes(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, title, description, hero_image_url, status, is_public, rating_avg, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false });
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
  ingredient_refs: { url: string | null } | null;
};
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
  mold_type_id: number | null;
  mold_dims: import('@/lib/database.types').Json | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  total_time: number | null;
  tips: string | null;
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
  ingredient_groups(*, ingredients(*, ingredient_refs(url))),
  recipe_steps(*, step_photos(*))
`;

export async function getRecipeFull(id: string): Promise<RecipeFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select(FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getRecipeFull:', error.message);
  return (data as unknown as RecipeFull | null) ?? null;
}
