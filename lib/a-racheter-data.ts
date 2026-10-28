// Liste « À racheter » (JEP-379) — accès base, SERVEUR UNIQUEMENT. Logique
// pure : `lib/a-racheter.ts`.
//
// Écritures avec la clé service_role, appelées seulement par
// `POST /api/courses/a-racheter`, qui a déjà vérifié le membre, sa session et
// son droit. Le trigger `shopping_lists_guard_a_racheter` refuse à un membre
// (`authenticated`) de créer, renommer ou supprimer la liste système : elle ne
// naît qu'ici. Chaque écriture refiltre sur `user_id` (la clé service_role
// ignore la RLS).
//
// `shopping_lists.kind` est absente de `lib/database.types.ts` jusqu'à la
// régénération : accès non typé, comme `lib/recipe-lists-data.ts`.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { KIND_A_RACHETER, NOM_A_RACHETER, decisionAjout, type DecisionAjout } from '@/lib/a-racheter';

const vers = (client: unknown): SupabaseClient => client as SupabaseClient;

/** Erreur dont le message peut être montré tel quel au membre. */
export class ARacheterIndisponible extends Error {}

// Colonne `kind` absente : la migration n'est pas jouée.
const colonneAbsente = (e: { code?: string; message?: string }) => e.code === '42703' || /kind/.test(e.message ?? '');

/** Identifiant de la liste « À racheter » du membre, créée au premier ajout. */
async function listeDuMembre(db: SupabaseClient, userId: string): Promise<number> {
  const lire = () => db.from('shopping_lists').select('id').eq('user_id', userId).eq('kind', KIND_A_RACHETER).maybeSingle();
  const { data, error } = await lire();
  if (error) {
    if (colonneAbsente(error)) throw new ARacheterIndisponible('La liste « À racheter » n’est pas encore disponible.');
    throw new Error(error.message);
  }
  if (data) return (data as { id: number }).id;

  const { data: cree, error: insErr } = await db
    .from('shopping_lists')
    .insert({ user_id: userId, name: NOM_A_RACHETER, kind: KIND_A_RACHETER })
    .select('id')
    .single();
  if (!insErr && cree) return (cree as { id: number }).id;
  // Deux clics simultanés : l'index unique partiel a refusé le second, la
  // liste existe désormais.
  if (insErr?.code === '23505') {
    const { data: relue } = await lire();
    if (relue) return (relue as { id: number }).id;
  }
  throw new Error(insErr?.message ?? 'Création de la liste impossible.');
}

/**
 * Range un ingrédient dans la liste « À racheter » du membre : nom seul, sans
 * quantité ni unité. Déjà présent → rien n'est écrit ; présent mais barré →
 * remis à racheter.
 */
export async function ajouterARacheter(userId: string, nom: string, refId: number | null): Promise<DecisionAjout['action']> {
  const db = vers(createAdminClient());
  const listId = await listeDuMembre(db, userId);

  const { data: items, error } = await db.from('shopping_list_items').select('id, name, ref_id, checked').eq('list_id', listId);
  if (error) throw new Error(error.message);
  const decision = decisionAjout((items ?? []) as { id: number; name: string; ref_id: number | null; checked: boolean }[], nom, refId);

  if (decision.action === 'decocher') {
    const { error: upErr } = await db.from('shopping_list_items').update({ checked: false }).eq('id', decision.id).eq('list_id', listId);
    if (upErr) throw new Error(upErr.message);
  } else if (decision.action === 'creer') {
    const { error: insErr } = await db
      .from('shopping_list_items')
      .insert({ list_id: listId, name: nom, ref_id: refId, quantity: null, unit: null, comment: null, checked: false });
    if (insErr) throw new Error(insErr.message);
  }
  return decision.action;
}
