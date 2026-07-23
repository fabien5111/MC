// Listes de référence pour l'éditeur de recette (tags, difficultés).
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Tag = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'>;
export type Difficulty = Database['public']['Tables']['difficulties']['Row'];

// Catégorie d'accueil : un tag mis en avant pour « Explorer par Catégorie ».
// Son visuel provient soit d'un picto image (`category_picto`, prioritaire),
// soit du nom d'une icône Material Symbols (`category_icon`). Au moins l'un des
// deux est renseigné.
export type HomeCategory = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'> & {
  category_icon: string | null;
  category_picto: string | null;
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

// Tags promus en catégories d'accueil : icône Material Symbols (`category_icon`)
// OU picto image (`category_picto`) renseigné. Ordonnés par id (ordre de
// création) pour laisser l'admin maîtriser l'ordre d'affichage. Tolérant aux
// erreurs (colonnes absentes avant migration → []). Colonne `category_picto`
// hors typage généré → client non typé, cast local assumé.
export async function getHomeCategories(): Promise<HomeCategory[]> {
  const supabase = await createClient();
  const q = supabase.from('tags' as never) as ReturnType<typeof supabase.from>;
  const { data, error } = await q
    .select('id, name, slug, category_icon, category_picto')
    .eq('status', 'published')
    .or('category_icon.not.is.null,category_picto.not.is.null')
    .order('id');
  if (error) return [];
  return ((data as unknown as HomeCategory[]) ?? []).filter((t) => !!(t.category_icon || t.category_picto));
}

export async function getDifficulties(): Promise<Difficulty[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('difficulties').select('*').order('level');
  return data ?? [];
}
