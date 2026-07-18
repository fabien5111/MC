// Chargeurs de données du profil, typés — portés de db.js
// (getFavorites, getPlanning, getShoppingLists, getUnits). Server-side, RLS via session.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Unit = Database['public']['Tables']['units']['Row'];

export type FavoriteRow = {
  recipe_id: string;
  created_at: string | null;
  recipes: {
    id: string;
    title: string;
    description: string | null;
    hero_image_url: string | null;
    rating_avg: number | null;
    profiles: { full_name: string | null } | null;
  } | null;
};

export type PlanningRow = {
  id: number;
  recipe_id: string | null;
  planned_date: string | null;
  factor: number | null;
  adjust_label: string | null;
  recipes: {
    id: string;
    title: string | null;
    hero_image_url: string | null;
    prep_time: number | null;
  } | null;
};

export type ShoppingListSummary = Database['public']['Tables']['shopping_lists']['Row'] & {
  shopping_list_items: { id: number; checked: boolean }[];
};

export async function getFavorites(userId: string): Promise<FavoriteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('favorites')
    .select(
      'recipe_id, created_at, recipes(id, title, description, hero_image_url, rating_avg, profiles!recipes_author_id_fkey(full_name))',
    )
    .eq('user_id', userId);
  if (error) console.error('getFavorites:', error.message);
  return (data as unknown as FavoriteRow[]) ?? [];
}

export async function getPlanning(userId: string): Promise<PlanningRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('planning')
    .select('*, recipes(id, title, hero_image_url, prep_time)')
    .eq('user_id', userId)
    .order('planned_date', { ascending: true });
  if (error) console.error('getPlanning:', error.message);
  return (data as unknown as PlanningRow[]) ?? [];
}

export async function getShoppingLists(userId: string): Promise<ShoppingListSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, shopping_list_items(id, checked)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getShoppingLists:', error.message);
  return (data as unknown as ShoppingListSummary[]) ?? [];
}

export type PlanningEntry = {
  id: number;
  recipe_id: string | null;
  planned_date: string | null;
  factor: number | null;
  adjust_label: string | null;
};

// Une entrée de planning (contexte planifié d'une recette). null si absente/RLS.
export async function getPlanningEntry(id: number): Promise<PlanningEntry | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('planning')
    .select('id, recipe_id, planned_date, factor, adjust_label')
    .eq('id', id)
    .maybeSingle();
  return (data as PlanningEntry | null) ?? null;
}

export async function getUnits(): Promise<Unit[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('units').select('*').order('name');
  return data ?? [];
}
