// Imports de recettes (brouillons IA) — porté de db.js (getImports). Server-side.
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export type ImportRow = {
  id: number;
  source_type: string;
  source_url: string | null;
  statut: string;
  recette: Json;
  alertes: Json;
  created_at: string;
};

export async function getImports(userId: string): Promise<ImportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('id, source_type, source_url, statut, recette, alertes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getImports:', error.message);
  return (data as unknown as ImportRow[]) ?? [];
}
