// Listes de référence pour l'éditeur de recette (tags, difficultés).
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type Tag = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'>;
export type Difficulty = Database['public']['Tables']['difficulties']['Row'];

// Catégorie d'accueil : un tag promu par l'admin (`show_on_home`) et pourvu
// d'un picto (`category_picto`) — les deux conditions sont requises.
export type HomeCategory = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'> & {
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

// Tags promus en catégories d'accueil : case « Afficher sur l'accueil »
// cochée (`show_on_home`) ET picto renseigné (`category_picto`). Triées par
// nom (alphabétique, accents inclus). Tolérant aux erreurs (colonnes absentes
// avant migration → []). Colonnes hors typage généré → client non typé, cast
// local assumé.
export async function getHomeCategories(): Promise<HomeCategory[]> {
  const supabase = await createClient();
  const q = supabase.from('tags' as never) as ReturnType<typeof supabase.from>;
  const { data, error } = await q
    .select('id, name, slug, category_picto')
    .eq('status', 'published')
    .eq('show_on_home', true)
    .not('category_picto', 'is', null);
  if (error) return [];
  return ((data as unknown as HomeCategory[]) ?? [])
    .filter((t) => !!t.category_picto)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function getDifficulties(): Promise<Difficulty[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('difficulties').select('*').order('level');
  return data ?? [];
}
