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
    .select('*, shopping_list_items(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) console.error('getShoppingList:', error.message);
  return (data as ShoppingList | null) ?? null;
}
