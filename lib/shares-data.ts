// Lectures serveur du partage (carnet + recettes) — cf. lib/shares.ts pour
// les types et la doctrine. Server-only (importe `next/headers` via
// lib/supabase/server) : jamais importé par un composant client.
//
// Les deux tables n'existent pas encore dans `lib/database.types.ts` tant que
// le SQL fourni séparément (jamais de fichier .sql dans le dépôt, cf.
// CLAUDE.md) n'a pas été appliqué et les types régénérés (`npm run
// gen:types`) : `.from(...)` est donc casté en `never`, comme les RPC
// absentes des types générés le sont déjà ailleurs (lib/search.ts).
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, withAllergenPictos, type RecipeCard, type RecipeCardWithAllergens } from '@/lib/recipes';
import type {
  BookShareGiven,
  BookShareReceived,
  Member,
  RecipeShareInfo,
  RecipeShareReceived,
  ShareScope,
} from '@/lib/shares';

const MEMBER_SELECT = 'full_name, avatar_url, username';

// ── Partages du carnet émis par le propriétaire ────────────────────────────

export const getBookSharesGiven = cache(async (ownerId: string): Promise<BookShareGiven[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('book_shares' as never)
    .select(`shared_with_id, scope, created_at, profiles!book_shares_shared_with_id_fkey(${MEMBER_SELECT})`)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getBookSharesGiven:', error.message);
    return [];
  }
  type Row = { shared_with_id: string; scope: ShareScope; created_at: string | null; profiles: Omit<Member, 'id'> | null };
  return ((data as unknown as Row[]) ?? [])
    .filter((r): r is Row & { profiles: Omit<Member, 'id'> } => !!r.profiles)
    .map((r) => ({ scope: r.scope, created_at: r.created_at, member: { id: r.shared_with_id, ...r.profiles } }));
});

// ── Partages du carnet reçus (un membre m'a ouvert le sien) ────────────────

export const getBookSharesReceived = cache(async (userId: string): Promise<BookShareReceived[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('book_shares' as never)
    .select(`owner_id, scope, created_at, profiles!book_shares_owner_id_fkey(${MEMBER_SELECT})`)
    .eq('shared_with_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getBookSharesReceived:', error.message);
    return [];
  }
  type Row = { owner_id: string; scope: ShareScope; created_at: string | null; profiles: Omit<Member, 'id'> | null };
  return ((data as unknown as Row[]) ?? [])
    .filter((r): r is Row & { profiles: Omit<Member, 'id'> } => !!r.profiles)
    .map((r) => ({ scope: r.scope, created_at: r.created_at, owner: { id: r.owner_id, ...r.profiles } }));
});

// ── Partages d'une recette précise reçus ───────────────────────────────────

export const getRecipeSharesReceived = cache(async (userId: string): Promise<RecipeShareReceived[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipe_shares' as never)
    .select(`recipe_id, owner_id, created_at, recipes(id, title), profiles!recipe_shares_owner_id_fkey(${MEMBER_SELECT})`)
    .eq('shared_with_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getRecipeSharesReceived:', error.message);
    return [];
  }
  type Row = {
    recipe_id: string;
    owner_id: string;
    created_at: string | null;
    recipes: { id: string; title: string } | null;
    profiles: Omit<Member, 'id'> | null;
  };
  return ((data as unknown as Row[]) ?? [])
    .filter((r): r is Row & { profiles: Omit<Member, 'id'> } => !!r.profiles)
    .map((r) => ({ created_at: r.created_at, recipe: r.recipes, owner: { id: r.owner_id, ...r.profiles } }));
});

// ── Qui a accès à UNE recette (fiche recette, propriétaire) ────────────────

export const getRecipeShareInfo = cache(
  async (recipeId: string, authorId: string, status: string | null): Promise<RecipeShareInfo> => {
    const supabase = await createClient();
    const [directRes, bookRes] = await Promise.all([
      supabase
        .from('recipe_shares' as never)
        .select(`shared_with_id, profiles!recipe_shares_shared_with_id_fkey(${MEMBER_SELECT})`)
        .eq('recipe_id', recipeId),
      supabase
        .from('book_shares' as never)
        .select(`shared_with_id, scope, profiles!book_shares_shared_with_id_fkey(${MEMBER_SELECT})`)
        .eq('owner_id', authorId),
    ]);
    if (directRes.error) console.error('getRecipeShareInfo (direct):', directRes.error.message);
    if (bookRes.error) console.error('getRecipeShareInfo (carnet):', bookRes.error.message);

    type DirectRow = { shared_with_id: string; profiles: Omit<Member, 'id'> | null };
    type BookRow = { shared_with_id: string; scope: ShareScope; profiles: Omit<Member, 'id'> | null };

    const direct = ((directRes.data as unknown as DirectRow[]) ?? [])
      .filter((r): r is DirectRow & { profiles: Omit<Member, 'id'> } => !!r.profiles)
      .map((r) => ({ id: r.shared_with_id, ...r.profiles }));

    const viaBook = ((bookRes.data as unknown as BookRow[]) ?? [])
      .filter((r): r is BookRow & { profiles: Omit<Member, 'id'> } => !!r.profiles && (r.scope === 'all' || status === 'published'))
      .map((r) => ({ id: r.shared_with_id, ...r.profiles }));

    return { direct, viaBook };
  },
);

// ── Recettes partagées avec moi (scope carnet « Partagées avec moi ») ──────
//
// RLS seule fait le tri : une recette d'un propriétaire dont le partage de
// carnet est « publiées » n'est de toute façon renvoyée par la requête que si
// elle est publiée (policy `recipes_partagees`) — inutile de reproduire ce
// filtre ici.

export type SharedRecipeItem = { recipe: RecipeCardWithAllergens; via: 'direct' | 'book'; ownerId: string };

export const getSharedWithMeRecipes = cache(async (userId: string): Promise<SharedRecipeItem[]> => {
  const supabase = await createClient();
  const [directRes, bookRes] = await Promise.all([
    supabase.from('recipe_shares' as never).select('recipe_id').eq('shared_with_id', userId),
    supabase.from('book_shares' as never).select('owner_id').eq('shared_with_id', userId),
  ]);
  if (directRes.error) console.error('getSharedWithMeRecipes (direct):', directRes.error.message);
  if (bookRes.error) console.error('getSharedWithMeRecipes (carnet):', bookRes.error.message);

  const directIds = new Set(((directRes.data as unknown as { recipe_id: string }[]) ?? []).map((r) => r.recipe_id));
  const ownerIds = [...new Set(((bookRes.data as unknown as { owner_id: string }[]) ?? []).map((r) => r.owner_id))];
  if (!directIds.size && !ownerIds.length) return [];

  const branches: string[] = [];
  if (directIds.size) branches.push(`id.in.(${[...directIds].join(',')})`);
  if (ownerIds.length) branches.push(`author_id.in.(${ownerIds.join(',')})`);

  const { data, error } = await supabase.from('recipes').select(CARD_SELECT).or(branches.join(',')).order('created_at', { ascending: false });
  if (error) {
    console.error('getSharedWithMeRecipes:', error.message);
    return [];
  }
  const rows = (data as unknown as RecipeCard[]) ?? [];
  const withPictos = await withAllergenPictos(rows);
  return withPictos.map((r) => ({ recipe: r, via: directIds.has(r.id) ? 'direct' : ('book' as const), ownerId: r.author_id }));
});

// ── Recherche de membres (autocomplete des deux dialogs de partage) ────────

export async function searchMembers(term: string, excludeId: string, limit = 8): Promise<Member[]> {
  const t = term.trim();
  if (t.length < 2) return [];
  const supabase = await createClient();
  const cols = 'id, full_name, avatar_url, username';
  const [byName, byUsername] = await Promise.all([
    supabase.from('profiles').select(cols).neq('id', excludeId).ilike('full_name', `%${t}%`).order('full_name').limit(limit),
    supabase.from('profiles').select(cols).neq('id', excludeId).ilike('username', `%${t}%`).order('username').limit(limit),
  ]);
  if (byName.error) console.error('searchMembers (nom):', byName.error.message);
  if (byUsername.error) console.error('searchMembers (identifiant):', byUsername.error.message);
  const seen = new Map<string, Member>();
  for (const m of [...(byName.data ?? []), ...(byUsername.data ?? [])] as Member[]) seen.set(m.id, m);
  return [...seen.values()].slice(0, limit);
}
