// Chargeurs de données du profil, typés — portés de db.js
// (getFavorites, getPlanning, getShoppingLists, getUnits). Server-side, RLS via session.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { CARD_SELECT, withAllergenPictos, type RecipeCard, type RecipeCardWithAllergens } from '@/lib/recipes';
import { PLAN_FULL_SELECT, type PlanFull } from '@/lib/recipe-plan';

export type Unit = Database['public']['Tables']['units']['Row'];

// La recette embarquée reprend exactement les champs de la carte recette
// (RecipeCard, cf. lib/recipes.ts) : la page profil affiche les favoris avec
// le composant RecipeCardClient, identique à celui de l'accueil.
export type FavoriteRow = {
  recipe_id: string;
  created_at: string | null;
  recipes: RecipeCardWithAllergens | null;
};

export type PlanningRow = {
  id: number;
  recipe_id: string | null;
  recipe_title: string | null;
  planned_date: string | null;
  factor: number | null;
  adjust_label: string | null;
  notes: string | null;
  status: string;
  // Compte des exécutions liées : `executions.planning_id` est en
  // ON DELETE RESTRICT, donc un plan déjà cuisiné ne peut pas être
  // supprimé — seulement archivé (cf. CLAUDE.md « Recettes planifiées »).
  executions: { count: number }[];
  // Session en cours pour ce plan, s'il y en a une (alias distinct de
  // `executions` ci-dessus, filtré côté requête) — pour afficher un badge
  // « Session en cours » ou un bouton « Démarrer » dans la liste des
  // recettes planifiées.
  active_execution: { id: number; date_debut: string }[];
  // Jours nécessaires : calculé depuis le plan matérialisé (plan_steps),
  // pas depuis la recette d'origine qui a pu évoluer depuis. Le reste des
  // colonnes (titre, ordre, durées) sert à la vue par jour transverse à
  // plusieurs recettes (PlanningDayView) — day_order_index n'est renseignée
  // qu'après un premier glisser-déposer dans cette vue, cf. CLAUDE.md.
  plan_steps: {
    id: number;
    title: string | null;
    day_offset: number;
    day_order_index: number | null;
    order_index: number;
    already_done: boolean;
    prep_time: number | null;
    wait_time: number | null;
    cook_time: number | null;
    cook_temp: number | null;
  }[];
  recipes: {
    id: string;
    title: string | null;
    hero_image_url: string | null;
    prep_time: number | null;
    total_time: number | null;
  } | null;
};

export type ShoppingListSummary = Database['public']['Tables']['shopping_lists']['Row'] & {
  shopping_list_items: { id: number; checked: boolean }[];
};

export async function getFavorites(userId: string): Promise<FavoriteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('favorites')
    .select(`recipe_id, created_at, recipes(${CARD_SELECT})`)
    .eq('user_id', userId);
  if (error) console.error('getFavorites:', error.message);
  const rows = (data as unknown as { recipe_id: string; created_at: string | null; recipes: RecipeCard | null }[]) ?? [];
  const cards = rows.map((r) => r.recipes).filter((r): r is RecipeCard => !!r);
  const withPictos = await withAllergenPictos(cards);
  const byId = new Map(withPictos.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, recipes: r.recipes ? (byId.get(r.recipes.id) ?? null) : null }));
}

export async function getPlanning(userId: string): Promise<PlanningRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('planning')
    .select(
      '*, executions(count), active_execution:executions(id, date_debut), recipes(id, title, hero_image_url, prep_time, total_time), plan_steps(id, title, day_offset, day_order_index, order_index, already_done, prep_time, wait_time, cook_time, cook_temp)',
    )
    .eq('user_id', userId)
    .eq('status', 'planifie')
    .eq('active_execution.status', 'en_cours')
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

// L'en-tête d'un plan (ligne `planning` seule, sans son contenu) — utilisé
// partout où seuls facteur/libellé/date sont nécessaires (bandeau, formulaire
// d'édition). `lib/recipe-plan.ts` s'appuie dessus pour `planFactor()`.
export type PlanningEntry = Database['public']['Tables']['planning']['Row'];

// Un plan complet (en-tête + étapes/sous-étapes/ingrédients/ustensiles
// matérialisés). null si absent/RLS. C'est la copie indépendante de la
// recette au moment de la planification — voir CLAUDE.md.
export async function getPlan(id: number): Promise<PlanFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('planning').select(PLAN_FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getPlan:', error.message);
  return (data as unknown as PlanFull | null) ?? null;
}

export async function getUnits(): Promise<Unit[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('units').select('*').order('name');
  return data ?? [];
}
