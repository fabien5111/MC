// Listes de référence pour l'éditeur de recette (tags, difficultés).
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Tag = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'>;
export type Difficulty = Database['public']['Tables']['difficulties']['Row'];

// Catégorie d'accueil : un tag mis en avant, dont `category_icon` porte le nom
// de l'icône Material Symbols affichée dans « Explorer par Catégorie ».
export type HomeCategory = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'> & {
  category_icon: string;
};

export async function getTags(): Promise<Tag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tags')
    .select('id, name, slug')
    .eq('status', 'published')
    .order('name');
  return data ?? [];
}

// Tags promus en catégories d'accueil (colonne `category_icon` renseignée).
// Ordonnés par id (ordre de création) pour laisser l'admin maîtriser l'ordre
// d'affichage. Tolérant aux erreurs (colonne absente avant migration → []).
export async function getHomeCategories(): Promise<HomeCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, slug, category_icon')
    .eq('status', 'published')
    .not('category_icon', 'is', null)
    .order('id');
  if (error) return [];
  return (data ?? []).filter((t): t is HomeCategory => !!t.category_icon);
}

export async function getDifficulties(): Promise<Difficulty[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('difficulties').select('*').order('level');
  return data ?? [];
}
