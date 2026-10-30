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
  /** Geste du membre lui-même (export de ses données, JEP-362) : aucun admin au journal. */
  parLeMembre: boolean;
  /** Membre prévenu par e-mail (lot 2) ; `null` : action antérieure ou colonne absente. */
  notifie: boolean | null;
  /** Geste sur l'abonnement (`pause`, `resilier`, `reprendre`, suffixe `:echec`), ou `null`. */
  abonnement: string | null;
};

type LigneJournal = {
  id: number;
  action: string;
  reason: string | null;
  suspended_until: string | null;
  created_at: string;
  admin_id: string | null;
  member_notified?: boolean | null;
  subscription_action?: string | null;
};

const COLONNES_JOURNAL = 'id, action, reason, suspended_until, created_at, admin_id';

/**
 * Journal des actions de modération d'un membre (fiche du back-office). Lu
 * avec la session de l'admin : la RLS de `member_moderation_events` réserve
 * la lecture aux administrateurs. Table absente : journal vide. Colonnes du
 * lot 2 absentes : relu sans elles.
 */
export async function getJournalModeration(memberId: string): Promise<EvenementModeration[]> {
  const db = vers(await createClient());
  const lire = (colonnes: string) =>
    db.from('member_moderation_events').select(colonnes).eq('member_id', memberId).order('created_at', { ascending: false }).limit(50);
  let { data, error } = await lire(`${COLONNES_JOURNAL}, member_notified, subscription_action`);
  if (error) ({ data, error } = await lire(COLONNES_JOURNAL));
  if (error || !data) return [];
  const lignes = data as unknown as LigneJournal[];

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
    parLeMembre: !l.admin_id && l.action === 'export_donnees',
    notifie: l.member_notified ?? null,
    abonnement: l.subscription_action ?? null,
  }));
}
