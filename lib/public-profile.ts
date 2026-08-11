// Lecture du profil public d'un pâtissier — la vitrine, pendant du carnet
// privé. Deux métiers différents : ce module ne renvoie jamais un brouillon,
// une recette en attente ou refusée, ni aucun champ de réglage (bio en
// écriture, uploads…), qui restent l'affaire de `/reglages`.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, withAllergenPictos, type RecipeCardWithAllergens } from '@/lib/recipes';
import type { Database } from '@/lib/database.types';

export type PublicProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'username'
  | 'full_name'
  | 'avatar_url'
  | 'banner_url'
  | 'bio'
  | 'created_at'
  | 'website_url'
  | 'instagram_url'
  | 'facebook_url'
  | 'youtube_url'
  | 'tiktok_url'
  | 'pinterest_url'
>;

// Un identifiant de profil public peut être un nom d'utilisateur choisi
// (`profiles.username`) ou, à défaut, l'identifiant du compte — tous les
// membres n'en ont pas encore choisi un. Le nom d'utilisateur est essayé en
// premier : c'est la forme que porteront les liens partagés une fois choisie.
export const getPublicProfile = cache(async (handle: string): Promise<PublicProfile | null> => {
  const supabase = await createClient();
  const cols =
    'id, username, full_name, avatar_url, banner_url, bio, created_at, website_url, instagram_url, facebook_url, youtube_url, tiktok_url, pinterest_url';
  const byUsername = await supabase.from('profiles').select(cols).eq('username', handle).maybeSingle();
  if (byUsername.data) return byUsername.data as PublicProfile;
  // Un nom d'utilisateur ne ressemble jamais à un UUID : évite une requête
  // inutile (et une erreur de format côté Postgres) pour la grande majorité
  // des handles.
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle);
  if (!looksLikeId) return null;
  const byId = await supabase.from('profiles').select(cols).eq('id', handle).maybeSingle();
  return (byId.data as PublicProfile | null) ?? null;
});

export type PublicProfileStats = {
  recipeCount: number;
  ratingAvg: number | null;
};

export const getPublicProfileStats = cache(async (authorId: string): Promise<PublicProfileStats> => {
  const supabase = await createClient();
  const [countRes, ratingRes] = await Promise.all([
    supabase
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', authorId)
      .eq('status', 'published'),
    supabase.from('author_ratings').select('rating_avg').eq('author_id', authorId).maybeSingle(),
  ]);
  if (countRes.error) console.error('getPublicProfileStats (recettes):', countRes.error.message);
  if (ratingRes.error) console.error('getPublicProfileStats (note):', ratingRes.error.message);
  return {
    recipeCount: countRes.count ?? 0,
    ratingAvg: ratingRes.data?.rating_avg ?? null,
  };
});

// Catégories filtrables du profil : **seulement** celles où ce pâtissier a
// publié au moins une recette — jamais la liste complète du référentiel
// (cf. CLAUDE.md « Profil public ») : un filtre qui ne renvoie rien est inutile.
export async function getPublicProfileCategories(authorId: string): Promise<{ name: string; slug: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('recipe_tags(tags(name, slug))')
    .eq('author_id', authorId)
    .eq('status', 'published');
  if (error) {
    console.error('getPublicProfileCategories:', error.message);
    return [];
  }
  type Row = { recipe_tags: { tags: { name: string; slug: string } | null }[] };
  const seen = new Map<string, string>();
  for (const r of (data as unknown as Row[]) ?? []) {
    for (const rt of r.recipe_tags) {
      if (rt.tags) seen.set(rt.tags.slug, rt.tags.name);
    }
  }
  return [...seen.entries()].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function getPublicProfileRecipes(
  authorId: string,
  categorySlug?: string,
): Promise<RecipeCardWithAllergens[]> {
  const supabase = await createClient();
  let q = supabase.from('recipes').select(CARD_SELECT).eq('author_id', authorId).eq('status', 'published');
  // Filtrer par catégorie impose de passer par la jointure `recipe_tags` :
  // un `.eq()` direct sur `recipe_tags.tags.slug` n'est pas exprimable via le
  // client PostgREST, d'où la sous-requête d'identifiants.
  if (categorySlug) {
    const { data: ids } = await supabase
      .from('recipe_tags')
      .select('recipe_id, tags!inner(slug)')
      .eq('tags.slug', categorySlug);
    const recipeIds = ((ids as { recipe_id: string }[]) ?? []).map((r) => r.recipe_id);
    if (recipeIds.length === 0) return [];
    q = q.in('id', recipeIds);
  }
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) {
    console.error('getPublicProfileRecipes:', error.message);
    return [];
  }
  return withAllergenPictos(data as unknown as import('@/lib/recipes').RecipeCard[]);
}
