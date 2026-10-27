// Listes de recettes (JEP-376) — accès base, SERVEUR UNIQUEMENT. Logique pure :
// `lib/recipe-lists.ts`.
//
// Lectures sous la session (RLS : propriétaire seul). Écritures avec la clé
// service_role, appelées seulement par les routes `/api/listes/*`, qui ont déjà
// vérifié le membre, sa session et son droit — aucune policy d'écriture
// n'existe sur ces tables. Chaque écriture refiltre sur `owner_id` : la clé
// service_role ignore la RLS, la propriété doit donc être dite ici.
//
// Tables absentes de `lib/database.types.ts` jusqu'à la régénération : accès
// non typé, comme `push_subscriptions`.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  LISTE_KIND_CAP,
  LISTE_KIND_PERSO,
  LISTE_MAX_RECETTES,
  MESSAGE_NOM_PRIS,
  NOM_LISTE_CAP,
  deplacerListe,
  nomListePris,
  trierListes,
  type ListeKind,
  type ListeResume,
} from '@/lib/recipe-lists';

type Db = SupabaseClient;
const vers = (client: unknown): Db => client as Db;

type LigneListe = { id: string; name: string; kind: ListeKind; position: number; recipe_list_items?: { count: number }[] };

const resume = (l: LigneListe): ListeResume => ({
  id: l.id,
  nom: l.name,
  kind: l.kind,
  position: l.position,
  nombre: l.recipe_list_items?.[0]?.count ?? 0,
});

// ── Lectures (session) ────────────────────────────────────────────────────

/**
 * Listes réelles du membre (CAP et personnelles, jamais « Favoris », qui est
 * virtuelle), CAP en tête. Échec de lecture (migration pas jouée) → `[]`,
 * journalisé : le carnet s'affiche sans listes plutôt que de casser.
 */
export async function getListesDuMembre(userId: string): Promise<ListeResume[]> {
  const supabase = vers(await createClient());
  const { data, error } = await supabase
    .from('recipe_lists')
    .select('id, name, kind, position, recipe_list_items(count)')
    .eq('owner_id', userId);
  if (error) {
    console.error('getListesDuMembre:', error.message);
    return [];
  }
  return trierListes(((data ?? []) as LigneListe[]).map(resume));
}

/** Recettes d'une liste du membre, dernier ajout d'abord. Échec → `[]`. */
export async function getIdsListe(userId: string, listeId: string): Promise<string[]> {
  const supabase = vers(await createClient());
  const { data, error } = await supabase
    .from('recipe_list_items')
    .select('recipe_id, added_at, recipe_lists!inner(owner_id)')
    .eq('list_id', listeId)
    .eq('recipe_lists.owner_id', userId)
    .order('added_at', { ascending: false })
    .limit(LISTE_MAX_RECETTES);
  if (error) {
    console.error('getIdsListe:', error.message);
    return [];
  }
  return ((data ?? []) as { recipe_id: string }[]).map((l) => l.recipe_id);
}

/** Recettes de la liste CAP du membre (liste absente → `[]`). */
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

/** Listes du membre qui contiennent cette recette. Échec → ensemble vide. */
export async function getListesContenant(userId: string, recipeId: string): Promise<Set<string>> {
  const supabase = vers(await createClient());
  const { data, error } = await supabase
    .from('recipe_list_items')
    .select('list_id, recipe_lists!inner(owner_id)')
    .eq('recipe_id', recipeId)
    .eq('recipe_lists.owner_id', userId);
  if (error) {
    console.error('getListesContenant:', error.message);
    return new Set();
  }
  return new Set(((data ?? []) as { list_id: string }[]).map((l) => l.list_id));
}

// ── Écritures (clé service_role, appelées par les routes) ─────────────────

type Echec = { ok: false; message: string; status: number };
type Resultat = { ok: true } | Echec;
const echec = (message: string, status = 500): Echec => ({ ok: false, message, status });

/** Une liste du membre (contrôle de propriété), `null` sinon. */
export async function lireListe(admin: unknown, userId: string, listeId: string): Promise<{ id: string; kind: ListeKind } | null> {
  const { data } = await vers(admin)
    .from('recipe_lists')
    .select('id, kind')
    .eq('id', listeId)
    .eq('owner_id', userId)
    .maybeSingle();
  return (data as { id: string; kind: ListeKind } | null) ?? null;
}

/** Nombre de listes personnelles du membre (plafond `listes_max`). */
export async function compterListesPerso(admin: unknown, userId: string): Promise<number> {
  const { count } = await vers(admin)
    .from('recipe_lists')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
    .eq('kind', LISTE_KIND_PERSO);
  return count ?? 0;
}

/**
 * Id de la liste CAP du membre, créée au premier ajout. L'index unique partiel
 * (`owner_id` where `kind = 'cap'`) garantit qu'il n'y en a qu'une : deux
 * premiers ajouts simultanés font échouer le second insert, qui relit alors.
 */
export async function idListeCap(admin: unknown, userId: string, creer: boolean): Promise<string | null> {
  const db = vers(admin);
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

/** Crée une liste personnelle, placée en dernier. */
// Noms des listes perso du membre, pour refuser un doublon (`nomListePris`).
// `null` si la lecture échoue : l'appelant refuse alors l'écriture.
async function listesPerso(db: Db, userId: string): Promise<{ id: string; nom: string }[] | null> {
  const { data, error } = await db.from('recipe_lists').select('id, name').eq('owner_id', userId).eq('kind', LISTE_KIND_PERSO);
  if (error) {
    console.error('listesPerso:', error.message);
    return null;
  }
  return ((data ?? []) as { id: string; name: string }[]).map((l) => ({ id: l.id, nom: l.name }));
}

export async function creerListe(admin: unknown, userId: string, nom: string): Promise<{ ok: true; liste: ListeResume } | Echec> {
  const db = vers(admin);
  const existantes = await listesPerso(db, userId);
  if (!existantes) return echec('Création impossible pour le moment.');
  if (nomListePris(nom, existantes)) return echec(MESSAGE_NOM_PRIS, 409);
  const { data: dernieres } = await db
    .from('recipe_lists')
    .select('position')
    .eq('owner_id', userId)
    .eq('kind', LISTE_KIND_PERSO)
    .order('position', { ascending: false })
    .limit(1);
  const position = (((dernieres ?? []) as { position: number }[])[0]?.position ?? -1) + 1;
  const { data, error } = await db
    .from('recipe_lists')
    .insert({ owner_id: userId, kind: LISTE_KIND_PERSO, name: nom, position })
    .select('id, name, kind, position')
    .single();
  if (error || !data) {
    console.error('creerListe:', error?.message);
    return echec('Création impossible pour le moment.');
  }
  return { ok: true, liste: resume(data as LigneListe) };
}

/** Renomme une liste personnelle (jamais la liste CAP). */
export async function renommerListe(admin: unknown, userId: string, listeId: string, nom: string): Promise<Resultat> {
  const existantes = await listesPerso(vers(admin), userId);
  if (!existantes) return echec('Renommage impossible pour le moment.');
  if (nomListePris(nom, existantes, listeId)) return echec(MESSAGE_NOM_PRIS, 409);
  const { error, count } = await vers(admin)
    .from('recipe_lists')
    .update({ name: nom }, { count: 'exact' })
    .eq('id', listeId)
    .eq('owner_id', userId)
    .eq('kind', LISTE_KIND_PERSO);
  if (error) {
    console.error('renommerListe:', error.message);
    return echec('Renommage impossible pour le moment.');
  }
  return count ? { ok: true } : echec('Liste introuvable.', 404);
}

/** Déplace une liste personnelle d'un cran (renumérote toutes les listes perso). */
export async function deplacerListeEnBase(admin: unknown, userId: string, listeId: string, sens: 'haut' | 'bas'): Promise<Resultat> {
  const db = vers(admin);
  const { data, error } = await db.from('recipe_lists').select('id, name, position').eq('owner_id', userId).eq('kind', LISTE_KIND_PERSO);
  if (error) return echec('Déplacement impossible pour le moment.');
  const nouvelles = deplacerListe(
    ((data ?? []) as { id: string; name: string; position: number }[]).map((l) => ({ id: l.id, nom: l.name, position: l.position })),
    listeId,
    sens,
  );
  if (!nouvelles) return { ok: true };
  for (const l of nouvelles) {
    const { error: e } = await db.from('recipe_lists').update({ position: l.position }).eq('id', l.id).eq('owner_id', userId);
    if (e) {
      console.error('deplacerListeEnBase:', e.message);
      return echec('Déplacement impossible pour le moment.');
    }
  }
  return { ok: true };
}

/** Supprime une liste personnelle et son contenu (cascade). Jamais la liste CAP. */
export async function supprimerListe(admin: unknown, userId: string, listeId: string): Promise<Resultat> {
  const { error, count } = await vers(admin)
    .from('recipe_lists')
    .delete({ count: 'exact' })
    .eq('id', listeId)
    .eq('owner_id', userId)
    .eq('kind', LISTE_KIND_PERSO);
  if (error) {
    console.error('supprimerListe:', error.message);
    return echec('Suppression impossible pour le moment.');
  }
  return count ? { ok: true } : echec('Liste introuvable.', 404);
}

/** Ajoute (`dans`) ou retire une recette d'une liste déjà contrôlée. Idempotent. */
export async function basculerContenu(admin: unknown, listeId: string, recipeId: string, dans: boolean): Promise<Resultat> {
  const db = vers(admin);
  if (!dans) {
    const { error } = await db.from('recipe_list_items').delete().eq('list_id', listeId).eq('recipe_id', recipeId);
    if (error) {
      console.error('basculerContenu (retrait):', error.message);
      return echec('Retrait impossible pour le moment.');
    }
    return { ok: true };
  }
  const { count } = await db.from('recipe_list_items').select('recipe_id', { count: 'exact', head: true }).eq('list_id', listeId);
  if ((count ?? 0) >= LISTE_MAX_RECETTES) {
    return echec(`Cette liste compte déjà ${LISTE_MAX_RECETTES} recettes.`, 409);
  }
  const { error } = await db
    .from('recipe_list_items')
    .upsert({ list_id: listeId, recipe_id: recipeId }, { onConflict: 'list_id,recipe_id', ignoreDuplicates: true });
  if (error) {
    console.error('basculerContenu (ajout):', error.message);
    return echec('Ajout impossible pour le moment.');
  }
  return { ok: true };
}
