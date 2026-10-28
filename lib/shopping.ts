// Accès aux listes de courses, typé — porté depuis db.js
// (getShoppingList). Server-side ; RLS via la session.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type ShoppingItem = Database['public']['Tables']['shopping_list_items']['Row'];
export type ShoppingList = Database['public']['Tables']['shopping_lists']['Row'] & {
  // `'a_racheter'` pour la liste « À racheter » (JEP-379), absente avant la migration.
  kind?: string | null;
  shopping_list_items: ShoppingItem[];
};

// Une liste avec ses articles. null si introuvable ou hors périmètre RLS.
export async function getShoppingList(id: number): Promise<ShoppingList | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_lists')
    // Colonnes des articles énumérées (cf. CLAUDE.md) : une colonne ajoutée
    // plus tard ne rejoindra pas le payload sans qu'on l'ait décidé. Côté
    // liste, `*` : `kind` (JEP-379, quatre colonnes courtes) est posée à la
    // main, la nommer ferait échouer la lecture avant la migration.
    .select(
      '*, ' +
        'shopping_list_items(id, list_id, name, quantity, unit, ref_id, comment, checked, created_at)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) console.error('getShoppingList:', error.message);
  return (data as ShoppingList | null) ?? null;
}
