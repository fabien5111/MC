// Listes de recettes (JEP-376) — accès base, SERVEUR UNIQUEMENT. Logique pure :
// `lib/recipe-lists.ts`.
//
// Lectures sous la session (RLS : propriétaire seul). Écritures avec la clé
// service_role, appelées seulement par la route `/api/listes/cap`, qui a déjà
// vérifié le membre, son droit et la recette — aucune policy d'écriture
// n'existe sur ces tables.
//
// Tables absentes de `lib/database.types.ts` jusqu'à la régénération : accès
// non typé, comme `push_subscriptions`.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { LISTE_KIND_CAP, LISTE_MAX_RECETTES, NOM_LISTE_CAP } from '@/lib/recipe-lists';

type Db = SupabaseClient;
const vers = (client: unknown): Db => client as Db;

/**
 * Identifiants des recettes de la liste CAP du membre, les plus récemment
 * ajoutées d'abord. Liste absente (jamais rien ajouté) → `[]`. Échec de lecture
 * (migration pas jouée) → `[]`, journalisé : la rubrique s'affiche vide plutôt
 * que de casser le carnet.
 */
export async function getIdsListeCap(userId: string): Promise<string[]> {
  const supabase = vers(await createClient());
  const { data, error } = await supabase
    .from('recipe_list_items')
    .select('recipe_id, added_at, recipe_lists!inner(owner_id, kind)')
    .eq('recipe_lists.owner_id', userId)
    .eq('recipe_lists.kind', LISTE_KIND_CAP)
    .order('added_at', { ascending: false })
    .limit(LISTE_MAX_RECETTES);
  if (error) {
    console.error('getIdsListeCap:', error.message);
    return [];
  }
  return ((data ?? []) as { recipe_id: string }[]).map((l) => l.recipe_id);
}

/** La recette est-elle dans la liste CAP du membre ? Échec → `false`. */
export async function estDansListeCap(userId: string, recipeId: string): Promise<boolean> {
  const supabase = vers(await createClient());
  const { data, error } = await supabase
    .from('recipe_list_items')
    .select('recipe_id, recipe_lists!inner(owner_id, kind)')
    .eq('recipe_id', recipeId)
    .eq('recipe_lists.owner_id', userId)
    .eq('recipe_lists.kind', LISTE_KIND_CAP)
    .limit(1);
  if (error) {
    console.error('estDansListeCap:', error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

type Resultat = { ok: true } | { ok: false; message: string; status: number };

/**
 * Id de la liste CAP du membre, créée au premier ajout. L'index unique partiel
 * (`owner_id` where `kind = 'cap'`) garantit qu'il n'y en a qu'une : deux
 * premiers ajouts simultanés font échouer le second insert, qui relit alors.
 */
async function idListeCap(db: Db, userId: string, creer: boolean): Promise<string | null> {
  const lire = async () => {
    const { data } = await db.from('recipe_lists').select('id').eq('owner_id', userId).eq('kind', LISTE_KIND_CAP).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };
  const existante = await lire();
  if (existante || !creer) return existante;
  const { data, error } = await db
    .from('recipe_lists')
    .insert({ owner_id: userId, kind: LISTE_KIND_CAP, name: NOM_LISTE_CAP })
    .select('id')
    .single();
  if (!error && data) return (data as { id: string }).id;
  return lire();
}

/** Ajoute (`dans`) ou retire une recette de la liste CAP. Idempotent. */
export async function basculerListeCap(admin: unknown, userId: string, recipeId: string, dans: boolean): Promise<Resultat> {
  const db = vers(admin);
  const listeId = await idListeCap(db, userId, dans);
  if (!dans) {
    if (!listeId) return { ok: true };
    const { error } = await db.from('recipe_list_items').delete().eq('list_id', listeId).eq('recipe_id', recipeId);
    if (error) {
      console.error('basculerListeCap (retrait):', error.message);
      return { ok: false, message: 'Retrait impossible pour le moment.', status: 500 };
    }
    return { ok: true };
  }
  if (!listeId) return { ok: false, message: 'Liste CAP indisponible pour le moment.', status: 500 };
  const { count } = await db.from('recipe_list_items').select('recipe_id', { count: 'exact', head: true }).eq('list_id', listeId);
  if ((count ?? 0) >= LISTE_MAX_RECETTES) {
    return { ok: false, message: `La liste CAP compte déjà ${LISTE_MAX_RECETTES} recettes.`, status: 409 };
  }
  const { error } = await db
    .from('recipe_list_items')
    .upsert({ list_id: listeId, recipe_id: recipeId }, { onConflict: 'list_id,recipe_id', ignoreDuplicates: true });
  if (error) {
    console.error('basculerListeCap (ajout):', error.message);
    return { ok: false, message: 'Ajout impossible pour le moment.', status: 500 };
  }
  return { ok: true };
}
