// Abonnements entre pâtissiers.
//
// La table `follows` existait déjà en base (avec `profiles.followers_count` /
// `following_count`) mais n'était utilisée nulle part avant ce lot. Les deux
// colonnes dénormalisées ne sont **pas** maintenues ici : aucune écriture n'y
// touche, et les compteurs affichés sont calculés en direct depuis `follows`.
// Même doctrine que la vue `author_ratings` (cf. CLAUDE.md « Recherche
// avancée ») — pas de colonne à maintenir, pas de dérive silencieuse entre un
// compteur et les lignes qui le justifient.
//
// Écriture : côté client uniquement (insert/delete ciblés, comme les favoris),
// via `FollowButton`. Ce module ne porte que les lectures serveur.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, withAllergenNames, type RecipeCard } from '@/lib/recipes';
import type { Member } from '@/lib/shares';

// `cache()` : une fiche recette et une page profil interrogent chacune ce
// statut une fois par rendu ; sans mémoïsation, une page qui l'affiche à deux
// endroits (bannière + tiroir) doublerait la requête pour rien.
export const isFollowing = cache(async (followerId: string, followingId: string): Promise<boolean> => {
  if (followerId === followingId) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle();
  if (error) {
    // Table non lisible (policy manquante) : on n'affiche pas « Abonné » à
    // tort, mais on ne casse pas la page pour autant — cf. SQL à appliquer,
    // fourni séparément (jamais de fichier .sql dans le dépôt, cf. CLAUDE.md).
    console.error('isFollowing:', error.message);
    return false;
  }
  return !!data;
});

export async function getFollowCounts(profileId: string): Promise<{ followers: number; following: number }> {
  const supabase = await createClient();
  const [followers, following] = await Promise.all([
    supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profileId),
    supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profileId),
  ]);
  if (followers.error) console.error('getFollowCounts (abonnés):', followers.error.message);
  if (following.error) console.error('getFollowCounts (abonnements):', following.error.message);
  return { followers: followers.count ?? 0, following: following.count ?? 0 };
}

// Nombre d'abonnés pour un lot d'auteurs (carte pâtissier de la recherche
// avancée, `AuthorCard`) — même doctrine que `getFollowCounts` : calculé en
// direct depuis `follows`, jamais depuis `profiles.followers_count` (colonne
// morte). Une seule requête pour tout le lot plutôt qu'un `getFollowCounts`
// par auteur affiché.
export async function getFollowerCounts(profileIds: string[]): Promise<Map<string, number>> {
  if (profileIds.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.from('follows').select('following_id').in('following_id', profileIds);
  if (error) {
    console.error('getFollowerCounts:', error.message);
    return new Map();
  }
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.following_id, (counts.get(row.following_id) ?? 0) + 1);
  }
  return counts;
}

export type FollowedMember = { member: Member; created_at: string | null };

// Pâtissiers suivis par `userId`, pour la carte « Mes abonnements » des
// réglages — même motif que `getBookSharesGiven` (lib/shares-data.ts) :
// jointure vers `profiles`, une ligne par abonnement.
export const getFollowing = cache(async (userId: string): Promise<FollowedMember[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('follows')
    .select('following_id, created_at, profiles!follows_following_id_fkey(id, full_name, avatar_url, username)')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getFollowing:', error.message);
    return [];
  }
  type Row = { created_at: string | null; profiles: Member | null };
  return ((data as unknown as Row[]) ?? [])
    .filter((r): r is Row & { profiles: Member } => !!r.profiles)
    .map((r) => ({ member: r.profiles, created_at: r.created_at }));
});

// Dernières publications des pâtissiers suivis par `userId` — le fil des
// abonnements, commun à l'Accueil et au carnet (cf. README du handoff : « à
// confirmer », assumé ici comme défendable aux deux endroits, chronologique
// d'un côté, grille filtrable de l'autre).
export async function getFollowedRecipes(userId: string, limit = 12) {
  const supabase = await createClient();
  const { data: followedIds, error: followErr } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);
  if (followErr) {
    console.error('getFollowedRecipes (abonnements):', followErr.message);
    return [];
  }
  const ids = (followedIds ?? []).map((f) => f.following_id);
  if (ids.length === 0) return [];

  // `status: 'published'` seul, sans filtre `is_public` explicite : même
  // requête que `getRecipes` (lib/recipes.ts), qui ne filtre pas non plus sur
  // `is_public` — les recettes privées d'autrui sont donc déjà écartées par la
  // RLS, pas par l'application. Refiltrer ici sur `is_public` avec `.neq()`
  // aurait de surcroît exclu à tort les lignes `is_public IS NULL` (`NULL !=
  // false` vaut NULL en SQL, donc absent du résultat).
  const { data, error } = await supabase
    .from('recipes')
    .select(CARD_SELECT)
    .in('author_id', ids)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getFollowedRecipes:', error.message);
    return [];
  }
  return withAllergenNames(data as unknown as RecipeCard[]);
}
