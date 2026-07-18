// Listes de référence pour l'éditeur de recette (tags, difficultés).
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Tag = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'>;
export type Difficulty = Database['public']['Tables']['difficulties']['Row'];

export async function getTags(): Promise<Tag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tags')
    .select('id, name, slug')
    .eq('status', 'published')
    .order('name');
  return data ?? [];
}

export async function getDifficulties(): Promise<Difficulty[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('difficulties').select('*').order('level');
  return data ?? [];
}
