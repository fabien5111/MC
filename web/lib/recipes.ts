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
