// Favoris — porté de db.js (getFavoriteIds). Server-side.
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

// Ensemble des recipe_id favoris de l'utilisateur courant (vide si non connecté).
export async function getFavoriteIds(): Promise<Set<string>> {
  const user = await getCurrentUser();
  if (!user) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from('favorites').select('recipe_id').eq('user_id', user.id);
  return new Set((data ?? []).map((f) => f.recipe_id));
}
