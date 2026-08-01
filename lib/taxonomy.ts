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
// avant migration → []).
export async function getHomeCategories(): Promise<HomeCategory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tags')
    .select('id, name, slug, category_picto')
    .eq('status', 'published')
    .eq('show_on_home', true)
    .not('category_picto', 'is', null);
  if (error) return [];
  return (data ?? []).filter((t) => !!t.category_picto).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

// Nom d'un tag (catégorie) à partir de son slug — utilisé par /recherche
// pour afficher le libellé de la catégorie sélectionnée sur l'accueil.
export async function getTagBySlug(slug: string): Promise<Tag | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tags')
    .select('id, name, slug')
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle();
  return data ?? null;
}

// Types de recette publiés — facette « Type de recette » de la recherche
// avancée (le filtre SQL travaille sur le slug, comme les catégories).
export type RecipeType = Pick<Database['public']['Tables']['recipe_types']['Row'], 'id' | 'name' | 'slug'>;

export async function getRecipeTypes(): Promise<RecipeType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipe_types')
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
