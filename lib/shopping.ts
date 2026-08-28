// Accès aux listes de courses, typé — porté depuis db.js
// (getShoppingList). Server-side ; RLS via la session.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type ShoppingItem = Database['public']['Tables']['shopping_list_items']['Row'];
export type ShoppingList = Database['public']['Tables']['shopping_lists']['Row'] & {
  shopping_list_items: ShoppingItem[];
};

// Une liste avec ses articles. null si introuvable ou hors périmètre RLS.
export async function getShoppingList(id: number): Promise<ShoppingList | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_lists')
    // Colonnes énumérées des deux côtés de la jointure (cf. CLAUDE.md) : ici
    // tout est réellement affiché — c'est la vue détail — mais une colonne
    // ajoutée plus tard à l'une des deux tables ne rejoindra pas le payload
    // sans qu'on l'ait décidé.
    .select(
      'id, name, user_id, created_at, ' +
        'shopping_list_items(id, list_id, name, quantity, unit, ref_id, comment, checked, created_at)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) console.error('getShoppingList:', error.message);
  return (data as ShoppingList | null) ?? null;
}
