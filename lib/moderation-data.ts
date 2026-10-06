// Modération des membres (JEP-272) — lectures en base, côté SERVEUR
// uniquement (pendant de `lib/moderation.ts`, qui reste pur). Importer ce
// module depuis un composant client casserait le build : il tire
// `lib/supabase/server`, donc `next/headers`.
//
// **Colonnes lues à part, jamais via `PROFILE_COLUMNS`** — même doctrine que
// `pseudo_changed_at` (`dernierChangementPseudo`) : `suspended_until`,
// `suspension_reason`, `disabled_reason` et la table
// `member_moderation_events` n'existent qu'après la migration. Les ajouter à
// la lecture du profil la ferait échouer sur TOUT le site. Ici, une colonne
// absente dégrade proprement : on retombe sur `profiles.status` seul.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  etatModeration,
  statutPeutBloquer,
  STATUT_DESACTIVE,
  STATUT_SUSPENDU,
  type EtatModeration,
  type LigneModeration,
} from '@/lib/moderation';
import { COLONNES_MODERATION, lireLigneModeration, vers } from '@/lib/moderation-lecture';

export { lireLigneModeration, membreBloque } from '@/lib/moderation-lecture';

/**
 * État de modération de l'utilisateur donné, pour la garde de `requireUser()`
 * et des routes API. `status` est celui de `getProfile()` (déjà mémoïsé par
 * requête) : il est passé par l'appelant plutôt que relu ici, ce qui évite à
 * ce module d'importer `lib/auth` — qui l'importe lui-même.
 *
 * Ne coûte AUCUNE requête quand le statut ne peut pas bloquer, c'est-à-dire
 * pour quasiment tous les membres.
 */
export const getEtatModeration = cache(async (userId: string, status: string | null | undefined): Promise<EtatModeration> => {
  if (!statutPeutBloquer(status)) return { etat: 'actif' };
  const ligne = await lireLigneModeration(await createClient(), userId);
  return etatModeration(ligne ?? { status });
});

/**
 * Lignes de modération des comptes marqués (suspendus ou désactivés), pour la
 * liste du back-office. Une seule requête, bornée aux comptes concernés.
 * Colonnes absentes (migration non jouée) : map vide, la liste retombe sur
 * `profiles.status`.
 */
export async function lireModerationMembres(client: unknown): Promise<Map<string, LigneModeration>> {
  const { data, error } = await vers(client)
    .from('profiles')
    .select(`id, ${COLONNES_MODERATION}`)
    .in('status', [STATUT_SUSPENDU, STATUT_DESACTIVE]);
  const map = new Map<string, LigneModeration>();
  if (error) return map;
  for (const l of (data ?? []) as (LigneModeration & { id: string })[]) map.set(l.id, l);
  return map;
}

export type EvenementModeration = {
  id: number;
  action: string;
  motif: string | null;
  jusquAu: string | null;
  createdAt: string;
  adminNom: string | null;
};

/**
 * Journal des actions de modération d'un membre (fiche du back-office). Lu
 * avec la session de l'admin : la RLS de `member_moderation_events` réserve
 * la lecture aux administrateurs. Table absente : journal vide.
 */
export async function getJournalModeration(memberId: string): Promise<EvenementModeration[]> {
  const db = vers(await createClient());
  const { data, error } = await db
    .from('member_moderation_events')
    .select('id, action, reason, suspended_until, created_at, admin_id')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) return [];
  const lignes = data as { id: number; action: string; reason: string | null; suspended_until: string | null; created_at: string; admin_id: string | null }[];

  const adminIds = [...new Set(lignes.map((l) => l.admin_id).filter((x): x is string => !!x))];
  const noms = new Map<string, string>();
  if (adminIds.length > 0) {
    const { data: admins } = await db.from('profiles').select('id, full_name, email').in('id', adminIds);
    for (const a of (admins ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      noms.set(a.id, a.full_name || a.email || a.id);
    }
  }
  return lignes.map((l) => ({
    id: l.id,
    action: l.action,
    motif: l.reason,
    jusquAu: l.suspended_until,
    createdAt: l.created_at,
    adminNom: l.admin_id ? (noms.get(l.admin_id) ?? null) : null,
  }));
}
