// Lien de partage d'un carnet (JEP-21) — lectures et écriture serveur.
//
// Tout passe par la clé service_role, et c'est voulu :
// - l'APERÇU est vu par un visiteur sans session, qui n'a par construction
//   aucun droit RLS sur le carnet d'un autre. Il ne reçoit donc que des
//   agrégats (nom, nombre de recettes) et des photos déjà publiques — jamais
//   un titre, une ligne de recette ni une photo d'une recette privée : le
//   flou de la page est un décor, pas une protection (une image floutée en
//   CSS reste téléchargeable nette) ;
// - le DÉVERROUILLAGE écrit une ligne `book_shares` au nom du PROPRIÉTAIRE
//   (`owner_id`), ce que la RLS refuse à juste titre au destinataire. Même
//   doctrine que `enregistrerPseudo` : le navigateur ne pose jamais lui-même
//   cette ligne, la route a d'abord vérifié le jeton et la session.
import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ShareScope } from '@/lib/shares';

// Portée accordée par un lien : les recettes du carnet hors brouillons. Un
// lien circule sans qu'on sache jusqu'où — il n'emporte jamais les
// brouillons, que seul un partage nominatif (`ShareBookButton`) peut ouvrir.
export const PORTEE_LIEN: ShareScope = 'published';

// Nombre de vignettes de la mosaïque (page d'aperçu et carte OpenGraph).
export const MOSAIQUE_TAILLE = 6;

export type ApercuCarnet = {
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  nbRecettes: number;
  // Photos de recettes PUBLIQUES du carnet (publiées ET `is_public`) —
  // jamais celles d'une recette privée, même publiée au sens modération.
  photos: string[];
};

// `cache()` : lue par `generateMetadata` ET par la page dans le même rendu.
export const getApercuCarnet = cache(async (ownerId: string): Promise<ApercuCarnet | null> => {
  const admin = createAdminClient();
  const [profil, compte, photos] = await Promise.all([
    admin.from('profiles').select('full_name, username, avatar_url').eq('id', ownerId).maybeSingle(),
    // Même périmètre que ce que le lien ouvre (`PORTEE_LIEN`, cf. la policy
    // RLS `recipes_partagees`) : le nombre annoncé est celui qu'on obtient.
    admin
      .from('recipes')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', ownerId)
      .eq('status', 'published'),
    admin
      .from('recipes')
      .select('hero_card_url, hero_thumb_url')
      .eq('author_id', ownerId)
      .eq('status', 'published')
      .eq('is_public', true)
      .eq('has_hero_image', true)
      .order('updated_at', { ascending: false })
      .limit(MOSAIQUE_TAILLE * 2),
  ]);
  if (profil.error) console.error('getApercuCarnet (profil):', profil.error.message);
  if (!profil.data) return null;

  return {
    ownerId,
    nom: profil.data.full_name || profil.data.username || 'Un pâtissier',
    avatarUrl: profil.data.avatar_url,
    nbRecettes: compte.count ?? 0,
    photos: (photos.data ?? [])
      .map((r) => r.hero_card_url || r.hero_thumb_url)
      // Uniquement des URL (Swift) : une ancienne data-URL alourdirait la
      // page et la carte OpenGraph sans rien apporter.
      .filter((u): u is string => !!u && /^https?:\/\//.test(u))
      .slice(0, MOSAIQUE_TAILLE),
  };
});

/** Le membre a-t-il déjà accès au carnet (partage nominatif ou lien déjà déverrouillé) ? */
export async function aDejaAccesAuCarnet(ownerId: string, userId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('book_shares')
    .select('owner_id')
    .eq('owner_id', ownerId)
    .eq('shared_with_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * Associe le carnet de `ownerId` au compte `userId`. Idempotent, et ne
 * rétrograde jamais un partage existant : un membre à qui le propriétaire a
 * déjà ouvert ses brouillons (`scope = 'all'`) ne les perd pas en cliquant
 * sur le lien public (`ignoreDuplicates`).
 */
export async function deverrouillerCarnet(ownerId: string, userId: string): Promise<{ ok: boolean }> {
  if (ownerId === userId) return { ok: true };
  const { error } = await createAdminClient()
    .from('book_shares')
    .upsert({ owner_id: ownerId, shared_with_id: userId, scope: PORTEE_LIEN }, { onConflict: 'owner_id,shared_with_id', ignoreDuplicates: true });
  if (error) console.error('deverrouillerCarnet:', error.message);
  return { ok: !error };
}
