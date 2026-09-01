// Suivi de ses propres demandes de contact (`/reglages`), SERVER-ONLY.
//
// Les LECTURES reposent sur les policies RLS `*_membre_lecture` (client de
// session) — même raisonnement que `lib/contact-admin-data.ts` pour l'admin :
// la RLS ouvre déjà exactement ce qu'il faut, inutile du client service_role
// pour une lecture. La seule ÉCRITURE (`envoyerReponseMembre`, lot 9) passe
// en revanche TOUJOURS par la clé service_role, comme côté admin : aucune
// policy d'écriture n'existe sur ces tables, pour personne. Changer un
// statut, répondre EN TANT QU'administrateur, ou toute autre mutation reste
// un geste d'administration (`lib/contact-admin-data.ts`).
//
// Décisions de conception : `docs/contact-jira.md`.
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withContactSchema } from '@/lib/contact-types';
import type { ContactMessageRow, ContactMessagePhotoRow } from '@/lib/contact-types';
import { composeNotificationReponseMembre, type ContactStatus } from '@/lib/contact';
import { sendEmailBestEffort } from '@/lib/email';
import { siteUrl } from '@/lib/site-url';

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

// ─────────────────────────────────────────────────────────────────────────
// Réponse du demandeur depuis son propre suivi (lot 9)
// ─────────────────────────────────────────────────────────────────────────

export type ResultatReponseMembre = { ok: true } | { ok: false; error: string };

/**
 * Écrit avec la clé service_role — même raisonnement que côté admin
 * (`lib/contact-admin-data.ts` `envoyerReponse`) : `contact_replies` n'a
 * AUCUNE policy d'écriture, pour personne. `userId` est revérifié ici
 * (propriété de la demande), pas seulement délégué à l'appelant.
 *
 * **Aucun effet de bord sur le statut**, contrairement à la réponse admin
 * (§10.2.7 : `recu` → `en_cours`) : rouvrir automatiquement une demande
 * `termine`/`a_deployer` toucherait `closed_at` (point de départ de la
 * purge, §6) et l'idempotence de l'e-mail de déploiement (§5).
 * L'administrateur, prévenu par e-mail ci-dessous, change le statut à la
 * main s'il y a lieu.
 */
export async function envoyerReponseMembre(userId: string, reference: string, corps: string): Promise<ResultatReponseMembre> {
  const client = withContactSchema(createAdminClient());
  const { data: message } = await client
    .from('contact_messages')
    .select('id, subject')
    .eq('reference', reference)
    .eq('user_id', userId)
    .maybeSingle();
  if (!message) return { ok: false, error: 'Demande introuvable.' };

  const { error } = await client.from('contact_replies').insert({
    message_id: message.id,
    author_id: userId,
    author_kind: 'member',
    body: corps,
    // Sans objet ici : aucun e-mail n'est envoyé « au demandeur » pour son
    // propre message — `email_status` ne sert qu'à suivre les envois vers le
    // demandeur (réponses admin).
    email_status: 'skipped',
  });
  if (error) return { ok: false, error: 'Écriture de la réponse impossible.' };

  await notifierAdminNouvelleReponse(reference, message.subject, corps);

  return { ok: true };
}

/**
 * Best-effort, comme `notifierAdmin` (`lib/contact-data.ts`) pour la demande
 * initiale : un échec d'envoi ne fait jamais perdre le message, déjà
 * enregistré par l'INSERT précédent. Pas de colonne dédiée pour tracer
 * l'échec — ce serait un second point de défaillance à surveiller pour une
 * notification secondaire.
 */
async function notifierAdminNouvelleReponse(reference: string, subject: string, body: string): Promise<void> {
  const destinataire = process.env.CONTACT_NOTIFICATION_TO;
  if (!destinataire) {
    console.error('contact: CONTACT_NOTIFICATION_TO absent — notification de réponse membre non envoyée.');
    return;
  }
  const { subject: emailSubject, html, text } = composeNotificationReponseMembre({
    reference,
    subject,
    body,
    adminUrl: `${siteUrl()}/admin/contact/${reference}`,
  });
  await sendEmailBestEffort({ to: destinataire, subject: emailSubject, html, text });
}
