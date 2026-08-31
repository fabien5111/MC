// Suivi de ses propres demandes de contact (`/reglages`), en LECTURE SEULE.
// SERVER-ONLY.
//
// Repose sur les policies RLS `*_membre_lecture` (client de session) —
// même raisonnement que `lib/contact-admin-data.ts` pour l'admin : la RLS
// ouvre déjà exactement ce qu'il faut, inutile du client service_role pour
// une lecture. Aucune écriture ici : répondre ou changer un statut reste un
// geste d'administration (`lib/contact-admin-data.ts`).
//
// Décisions de conception : `docs/contact-jira.md`.
import { createClient } from '@/lib/supabase/server';
import { withContactSchema } from '@/lib/contact-types';
import type { ContactMessageRow, ContactMessagePhotoRow } from '@/lib/contact-types';
import type { ContactStatus } from '@/lib/contact';

export type MaDemandeListe = Pick<ContactMessageRow, 'reference' | 'created_at' | 'status' | 'type' | 'subject'>;

const COLONNES_LISTE = 'reference, created_at, status, type, subject';

export async function getMesDemandes(userId: string): Promise<MaDemandeListe[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_messages')
    .select(COLONNES_LISTE)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export type MaDemandeDetail = Pick<
  ContactMessageRow,
  'id' | 'reference' | 'created_at' | 'status' | 'type' | 'subject' | 'message'
>;

const COLONNES_DETAIL = 'id, reference, created_at, status, type, subject, message';

/**
 * `userId` revérifié explicitement (pas seulement laissé à la RLS) : la
 * fiche est adressée par référence, pas par id — la vérification directe
 * évite de faire reposer une donnée personnelle sur la seule policy.
 */
export async function getMaDemande(userId: string, reference: string): Promise<MaDemandeDetail | null> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_messages')
    .select(COLONNES_DETAIL)
    .eq('reference', reference)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export type MaReponse = { id: string; created_at: string; body: string };

export async function getMesReponses(messageId: string): Promise<MaReponse[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_replies')
    .select('id, created_at, body')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export type MonChangementStatut = {
  id: string;
  changed_at: string;
  from_status: ContactStatus | null;
  to_status: ContactStatus;
};

// Ordre chronologique croissant : contrairement à la fiche admin (le
// changement le plus récent en tête, pour une lecture rapide), la fiche
// membre raconte une progression — se lit du début vers le statut actuel.
export async function getMonHistoriqueStatuts(messageId: string): Promise<MonChangementStatut[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_status_history')
    .select('id, changed_at, from_status, to_status')
    .eq('message_id', messageId)
    .order('changed_at', { ascending: true });
  return data ?? [];
}

// Les mêmes photos que celles jointes par le membre à l'envoi — jamais
// transmises à un outil tiers (docs/contact-jira.md §15), pas plus ici
// qu'à l'écran d'administration.
export async function getMesPhotos(messageId: string): Promise<ContactMessagePhotoRow[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_message_photos')
    .select('*')
    .eq('message_id', messageId)
    .order('order_index', { ascending: true });
  return data ?? [];
}
