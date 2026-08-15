// Lecture du profil public d'un pâtissier — la vitrine, pendant du carnet
// privé. Deux métiers différents : ce module ne renvoie jamais un brouillon,
// une recette en attente ou refusée, ni aucun champ de réglage (bio en
// écriture, uploads…), qui restent l'affaire de `/reglages`.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, withAllergenPictos, type RecipeCardWithAllergens } from '@/lib/recipes';
import { EMPTY_PUBLIC_PROFILE_PARAMS, type PublicProfileParams } from '@/lib/public-profile-params';
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

// Compte des recettes publiées **et** note moyenne, calculés depuis les
// recettes elles-mêmes plutôt que depuis la vue `author_ratings`.
//
// La vue reste la source de la facette « note de l'auteur » de `/recherche`,
// mais elle ne dit pas de façon exploitable ici s'il existe au moins une
// *note* : un profil dont l'unique recette n'a jamais été évaluée affichait
// « 0.0 » en note moyenne — indiscernable d'une vraie mauvaise moyenne, qui
// n'existe pas (les notes vont de 1 à 5). Le même travers dilue la moyenne dès
// qu'une partie seulement des recettes est notée (une recette à 5 ★ et trois
// sans note ne font pas 1,25). Une seule requête sur `recipes` tranche les
// deux cas : on ne moyenne que les recettes qui portent au moins une note, et
// on renvoie `null` — donc rien à l'écran — s'il n'y en a aucune.
export const getPublicProfileStats = cache(async (authorId: string): Promise<PublicProfileStats> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('rating_avg, rating_count')
    .eq('author_id', authorId)
    .eq('status', 'published');
  if (error) {
    console.error('getPublicProfileStats:', error.message);
    return { recipeCount: 0, ratingAvg: null };
  }
  const recipes = data ?? [];
  // Moyenne des notes des recettes notées, chaque recette pesant pareil —
  // c'est la note de la recette qui est affichée sur sa carte, pas le nombre
  // d'avis qu'elle a reçus.
  const rated = recipes.filter((r) => (r.rating_count ?? 0) > 0 && r.rating_avg != null);
  return {
    recipeCount: recipes.length,
    ratingAvg: rated.length > 0 ? rated.reduce((s, r) => s + (r.rating_avg ?? 0), 0) / rated.length : null,
  };
});

// Recettes publiées d'un pâtissier, filtrées et triées **en SQL** : l'URL est
// le seul état de l'écran (`lib/public-profile-params.ts`), le Server
// Component re-rend à chaque changement — pas de seconde grille filtrée côté
// client. La recherche porte sur le titre, comme celle du carnet.
export async function getPublicProfileRecipes(
  authorId: string,
  params: PublicProfileParams = EMPTY_PUBLIC_PROFILE_PARAMS,
): Promise<RecipeCardWithAllergens[]> {
  const supabase = await createClient();
  let q = supabase.from('recipes').select(CARD_SELECT).eq('author_id', authorId).eq('status', 'published');
  const search = params.q.trim();
  // `%` et `_` sont les jokers de `ilike` : les échapper évite qu'une saisie
  // les contenant ne cherche autre chose que ce qui a été tapé.
  if (search) q = q.ilike('title', `%${search.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
  q =
    params.tri === 'alpha'
      ? q.order('title', { ascending: true })
      : params.tri === 'rating'
        ? // Une recette sans note ne passe pas devant une recette notée.
          q.order('rating_avg', { ascending: false, nullsFirst: false })
        : q.order('created_at', { ascending: false });
  const { data, error } = await q;
  if (error) {
    console.error('getPublicProfileRecipes:', error.message);
    return [];
  }
  return withAllergenPictos(data as unknown as import('@/lib/recipes').RecipeCard[]);
}
