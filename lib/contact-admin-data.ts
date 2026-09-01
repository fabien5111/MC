// Écran d'administration du module contact — lectures et écritures,
// SERVER-ONLY, réservées à `/admin/contact` et `/api/admin/contact/*`.
//
// **Deux clients, pour deux raisons opposées.** Les LECTURES passent par le
// client normal (cookies de session) : la policy RLS `contact_messages_admin_lecture`
// (et ses pareilles sur `contact_replies` / `contact_status_history`, lot 1)
// les ouvre déjà à `is_admin_user()` — inutile de contourner la RLS pour lire
// ce qu'elle autorise déjà. Les ÉCRITURES, elles, passent TOUJOURS par la clé
// service_role : aucune policy d'écriture n'existe sur ces tables, pour
// personne, admin compris (spec §12, lot 1 §6.2) — un geste d'administration
// qui écrirait avec le client normal échouerait silencieusement contre la RLS.
//
// Décisions de conception : `docs/contact-jira.md`.
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withContactSchema } from '@/lib/contact-types';
import type {
  ContactMessagePhotoRow,
  ContactMessageRow,
  ContactReplyPhotoRow,
  ContactReplyRow,
  ContactStatusHistoryRow,
} from '@/lib/contact-types';
import {
  CONTACT_STATUS_KEYS,
  CONTACT_TYPE_KEYS,
  composeReponseAdmin,
  dateClotureApres,
  type ContactStatus,
  type ContactType,
} from '@/lib/contact';
import { creerTicketJira, type ResultatTicketJira } from '@/lib/jira';
import { commenterReponseJira, enregistrerPhotosReponse } from '@/lib/contact-data';
import { sendEmailBestEffort } from '@/lib/email';
import { siteUrl } from '@/lib/site-url';

// ─────────────────────────────────────────────────────────────────────────
// Liste (fenêtre bornée, filtres statut/type appliqués côté serveur)
// ─────────────────────────────────────────────────────────────────────────

export type ContactListRow = Pick<
  ContactMessageRow,
  | 'id'
  | 'reference'
  | 'created_at'
  | 'status'
  | 'type'
  | 'user_id'
  | 'email'
  | 'subject'
  | 'jira_issue_key'
  | 'jira_sync_status'
  | 'jira_status'
  | 'admin_notify_error'
  | 'deploy_email_status'
  | 'deploy_email_error'
> & {
  authorName: string | null;
  replyCount: number;
  hasFailedReply: boolean;
  hasPhotos: boolean;
};

// Cases à cocher, multi-sélection (spec §11.2) : chaque tableau porte
// l'ensemble des valeurs COCHÉES, jamais un filtre unique. `statuses`/`types`
// couvrant tout l'ensemble possible équivaut à « aucun filtre » (défaut à
// l'ouverture, cf. `parseStatutsSelectionnes` / `parseTypesSelectionnes`
// dans `lib/contact.ts`, pures et testées) ; un tableau VIDE signifie
// « décoché partout », qui ne doit renvoyer aucune ligne.
export type ContactListFilters = { statuses: ContactStatus[]; types: ContactType[] };

const LISTE_COLONNES =
  'id, reference, created_at, status, type, user_id, email, subject, jira_issue_key, jira_sync_status, jira_status, admin_notify_error, deploy_email_status, deploy_email_error';

/**
 * Les 200 demandes les plus récentes correspondant aux filtres — pas une
 * pagination serveur complète (cf. docs/contact-jira.md §2.6) : au-delà, le
 * filtre statut/type reste le seul moyen d'atteindre les plus anciennes.
 */
export async function getContactMessages(filters: ContactListFilters): Promise<ContactListRow[]> {
  // Court-circuit : une case décochée sur toute une colonne ne peut renvoyer
  // aucune ligne — inutile d'interroger la base pour le vérifier.
  if (filters.statuses.length === 0 || filters.types.length === 0) return [];

  const client = withContactSchema(await createClient());

  let requete = client.from('contact_messages').select(LISTE_COLONNES).order('created_at', { ascending: false }).limit(200);
  // `.in()` avec la liste COMPLÈTE des valeurs possibles équivaut à filtre
  // absent, mais l'omettre carrément évite à Postgres une clause `IN` inutile
  // dans le cas — le plus courant — où tout est coché.
  if (filters.statuses.length < CONTACT_STATUS_KEYS.length) requete = requete.in('status', filters.statuses);
  if (filters.types.length < CONTACT_TYPE_KEYS.length) requete = requete.in('type', filters.types);
  const { data, error } = await requete;
  if (error) {
    console.error('contact-admin: liste des demandes illisible :', error.message);
    return [];
  }
  const lignes = data ?? [];
  if (lignes.length === 0) return [];

  const userIds = [...new Set(lignes.map((l) => l.user_id).filter((v): v is string => !!v))];
  const ids = lignes.map((l) => l.id);

  const [{ data: profils }, { data: reponses }, { data: photos }] = await Promise.all([
    userIds.length
      ? client.from('profiles').select('id, full_name').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    client.from('contact_replies').select('message_id, email_status').in('message_id', ids),
    client.from('contact_message_photos').select('message_id').in('message_id', ids),
  ]);

  const nomParUser = new Map((profils ?? []).map((p) => [p.id, p.full_name]));
  const reponsesParMessage = new Map<string, { total: number; echec: boolean }>();
  for (const r of reponses ?? []) {
    const courant = reponsesParMessage.get(r.message_id) ?? { total: 0, echec: false };
    courant.total += 1;
    if (r.email_status === 'failed') courant.echec = true;
    reponsesParMessage.set(r.message_id, courant);
  }
  const messagesAvecPhoto = new Set((photos ?? []).map((p) => p.message_id));

  return lignes.map((l) => ({
    ...l,
    hasPhotos: messagesAvecPhoto.has(l.id),
    authorName: l.user_id ? (nomParUser.get(l.user_id) ?? null) : null,
    replyCount: reponsesParMessage.get(l.id)?.total ?? 0,
    hasFailedReply: reponsesParMessage.get(l.id)?.echec ?? false,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Bandeau d'anomalies (spec §11.2)
// ─────────────────────────────────────────────────────────────────────────

export type ContactAnomalyCounts = { jiraFailed: number; notifyFailed: number; emailFailed: number; replyFailed: number };

/**
 * Compté sur TOUTE la table, indépendamment du filtre ou de la fenêtre de
 * 200 lignes affichée par `getContactMessages` : une anomalie doit rester
 * visible même quand l'écran est filtré sur un autre statut ou un autre
 * type — sinon une demande en échec pourrait rester invisible indéfiniment
 * derrière le filtre courant.
 */
export async function getContactAnomalyCounts(): Promise<ContactAnomalyCounts> {
  const client = withContactSchema(await createClient());
  const [{ count: jiraFailed }, { count: notifyFailed }, { count: emailFailed }, { count: replyFailed }] = await Promise.all([
    client.from('contact_messages').select('id', { count: 'exact', head: true }).eq('jira_sync_status', 'failed'),
    client.from('contact_messages').select('id', { count: 'exact', head: true }).not('admin_notify_error', 'is', null),
    client.from('contact_messages').select('id', { count: 'exact', head: true }).eq('deploy_email_status', 'failed'),
    client.from('contact_replies').select('id', { count: 'exact', head: true }).eq('email_status', 'failed'),
  ]);
  return {
    jiraFailed: jiraFailed ?? 0,
    notifyFailed: notifyFailed ?? 0,
    emailFailed: emailFailed ?? 0,
    replyFailed: replyFailed ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Détail
// ─────────────────────────────────────────────────────────────────────────

export type ContactDetail = ContactMessageRow & {
  authorName: string | null;
  authorRegisteredAt: string | null;
  previousRequestsCount: number;
};

export async function getContactMessageByReference(reference: string): Promise<ContactDetail | null> {
  const client = withContactSchema(await createClient());
  const { data: message } = await client.from('contact_messages').select('*').eq('reference', reference).maybeSingle();
  if (!message) return null;

  let authorName: string | null = null;
  let authorRegisteredAt: string | null = null;
  let previousRequestsCount = 0;

  if (message.user_id) {
    const [{ data: profil }, { count }] = await Promise.all([
      client.from('profiles').select('full_name, created_at').eq('id', message.user_id).maybeSingle(),
      client
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', message.user_id)
        .neq('id', message.id),
    ]);
    authorName = profil?.full_name ?? null;
    authorRegisteredAt = profil?.created_at ?? null;
    previousRequestsCount = count ?? 0;
  }

  return { ...message, authorName, authorRegisteredAt, previousRequestsCount };
}

export type ContactReplyAvecPhotos = ContactReplyRow & { photos: ContactReplyPhotoRow[] };

export async function getContactReplies(messageId: string): Promise<ContactReplyAvecPhotos[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_replies')
    .select('*')
    .eq('message_id', messageId)
    .order('created_at', { ascending: true });
  const replies = data ?? [];
  if (replies.length === 0) return [];

  const { data: photos } = await client
    .from('contact_reply_photos')
    .select('*')
    .in('reply_id', replies.map((r) => r.id))
    .order('order_index', { ascending: true });
  const parReponse = new Map<string, ContactReplyPhotoRow[]>();
  for (const p of photos ?? []) {
    const arr = parReponse.get(p.reply_id) ?? [];
    arr.push(p);
    parReponse.set(p.reply_id, arr);
  }
  return replies.map((r) => ({ ...r, photos: parReponse.get(r.id) ?? [] }));
}

export async function getContactStatusHistory(messageId: string): Promise<ContactStatusHistoryRow[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_status_history')
    .select('*')
    .eq('message_id', messageId)
    .order('changed_at', { ascending: false });
  return data ?? [];
}

// Ne partent JAMAIS vers Jira (docs/contact-jira.md) : visibles uniquement
// dans cette fiche admin.
export async function getContactPhotos(messageId: string): Promise<ContactMessagePhotoRow[]> {
  const client = withContactSchema(await createClient());
  const { data } = await client
    .from('contact_message_photos')
    .select('*')
    .eq('message_id', messageId)
    .order('order_index', { ascending: true });
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────
// Changement de statut manuel (spec §11.4)
// ─────────────────────────────────────────────────────────────────────────

export type ResultatEcriture = { ok: true } | { ok: false; error: string };

/**
 * Modification manuelle, dans les deux sens (spec §11.4). Passe par le
 * statut ACTUEL de la ligne (relu ici, pas transmis par l'appelant) pour que
 * `contact_status_history.from_status` reflète la réalité même si l'écran
 * était ouvert depuis un moment.
 *
 * **N'envoie jamais l'e-mail de déploiement** : seul un passage par le
 * statut Jira « déployé » le déclenche (§10.3) — une clôture manuelle est
 * délibérément muette pour le demandeur.
 */
export async function changerStatutManuel(
  messageId: string,
  nouveauStatut: ContactStatus,
  authorId: string,
): Promise<ResultatEcriture> {
  const client = withContactSchema(createAdminClient());
  const { data: actuel } = await client.from('contact_messages').select('status').eq('id', messageId).maybeSingle();
  if (!actuel) return { ok: false, error: 'Demande introuvable.' };

  const maintenant = new Date().toISOString();
  const { error } = await client
    .from('contact_messages')
    .update({
      status: nouveauStatut,
      status_updated_at: maintenant,
      status_source: 'admin',
      closed_at: dateClotureApres(nouveauStatut, maintenant),
    })
    .eq('id', messageId);
  if (error) return { ok: false, error: 'Écriture du statut impossible.' };

  await client.from('contact_status_history').insert({
    message_id: messageId,
    from_status: actuel.status,
    to_status: nouveauStatut,
    source: 'admin',
    author_id: authorId,
  });

  return { ok: true };
}

export async function enregistrerNotesInternes(messageId: string, notes: string): Promise<ResultatEcriture> {
  const client = withContactSchema(createAdminClient());
  const { error } = await client
    .from('contact_messages')
    .update({ admin_notes: notes.trim() || null })
    .eq('id', messageId);
  return error ? { ok: false, error: 'Enregistrement des notes impossible.' } : { ok: true };
}

/**
 * Interrupteur préventif de l'e-mail de déploiement (§2.2 : l'envoi étant
 * immédiat, c'est le seul moyen d'empêcher l'e-mail — à couper AVANT que le
 * ticket ne passe en « déployé », jamais après coup.
 */
export async function basculerDeployNotify(messageId: string, valeur: boolean): Promise<ResultatEcriture> {
  const client = withContactSchema(createAdminClient());
  const { error } = await client.from('contact_messages').update({ deploy_notify: valeur }).eq('id', messageId);
  return error ? { ok: false, error: 'Écriture impossible.' } : { ok: true };
}

export async function supprimerDemande(messageId: string): Promise<ResultatEcriture> {
  const client = withContactSchema(createAdminClient());
  // Réponses et historique partent en cascade (`on delete cascade`, lot 1).
  const { error } = await client.from('contact_messages').delete().eq('id', messageId);
  return error ? { ok: false, error: 'Suppression impossible.' } : { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Reprise de la création Jira (bouton « Créer le ticket », spec §11.3)
// ─────────────────────────────────────────────────────────────────────────

export async function relancerCreationTicket(messageId: string): Promise<ResultatTicketJira> {
  const client = withContactSchema(createAdminClient());
  const { data: message } = await client
    .from('contact_messages')
    .select('reference, subject, message, user_id, page_url, browser_context, app_version, type')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return { ok: false, error: 'Demande introuvable.' };
  if (message.type !== 'bug') return { ok: false, error: "Cette demande n'est pas un signalement de bug." };

  const { count: nbPhotos } = await client
    .from('contact_message_photos')
    .select('id', { count: 'exact', head: true })
    .eq('message_id', messageId);

  const resultat = await creerTicketJira({
    reference: message.reference,
    subject: message.subject,
    message: message.message,
    userId: message.user_id,
    pageUrl: message.page_url,
    browserContext: message.browser_context,
    appVersion: message.app_version,
    photoAdminUrl: (nbPhotos ?? 0) > 0 ? `${siteUrl()}/admin/contact/${message.reference}` : null,
  });

  await client
    .from('contact_messages')
    .update(
      resultat.ok
        ? { jira_issue_key: resultat.issueKey, jira_sync_status: 'sent', jira_synced_at: new Date().toISOString(), jira_error: null }
        : { jira_sync_status: 'failed', jira_error: resultat.error },
    )
    .eq('id', messageId);

  return resultat;
}

// ─────────────────────────────────────────────────────────────────────────
// Réponse depuis le panneau d'administration (spec §10.2)
// ─────────────────────────────────────────────────────────────────────────

export type ResultatReponse = { ok: true; delivered: boolean } | { ok: false; error: string };

async function composerEtEnvoyer(
  client: ReturnType<typeof withContactSchema>,
  message: Pick<ContactMessageRow, 'reference' | 'subject' | 'message' | 'email' | 'created_at' | 'user_id'>,
  replyId: string,
  corps: string,
): Promise<{ delivered: boolean; error: string | null }> {
  let prenom: string | null = null;
  if (message.user_id) {
    const { data: profil } = await client.from('profiles').select('full_name').eq('id', message.user_id).maybeSingle();
    prenom = profil?.full_name?.split(' ')[0] || null;
  }

  // Une photo jointe par l'admin n'est jamais embarquée dans l'e-mail (peu
  // fiable en data-URL) : seulement mentionnée, avec un lien vers le suivi
  // du membre — impossible à proposer à un visiteur non connecté, qui n'a
  // pas accès à `/reglages` (lot 11).
  let photoMemberUrl: string | null = null;
  if (message.user_id) {
    const { count } = await client.from('contact_reply_photos').select('id', { count: 'exact', head: true }).eq('reply_id', replyId);
    if ((count ?? 0) > 0) photoMemberUrl = `${siteUrl()}/reglages/mes-demandes/${message.reference}`;
  }

  const { subject, html, text } = composeReponseAdmin({
    reference: message.reference,
    authorFirstName: prenom,
    replyBody: corps,
    originalSubject: message.subject,
    originalMessage: message.message,
    originalDateIso: message.created_at,
    photoMemberUrl,
  });

  const delivered = await sendEmailBestEffort({
    to: message.email as string,
    subject,
    html,
    text,
    replyTo: process.env.EMAIL_REPLY_TO,
  });

  return { delivered, error: delivered ? null : `Envoi à ${message.email} échoué.` };
}

/**
 * Enregistre puis envoie une réponse. `ok: false` seulement si la réponse
 * n'a PAS PU être enregistrée (pas d'adresse, écriture impossible) — un
 * échec d'ENVOI, lui, n'empêche pas l'enregistrement : la réponse reste
 * dans le fil, avec son statut de délivrance, et le bouton « Renvoyer »
 * (`renvoyerReponse`) la reprend telle quelle.
 */
export async function envoyerReponse(messageId: string, authorId: string, corps: string, photos: string[]): Promise<ResultatReponse> {
  const client = withContactSchema(createAdminClient());
  const { data: message } = await client
    .from('contact_messages')
    .select('id, reference, subject, message, email, status, created_at, user_id, type, jira_issue_key')
    .eq('id', messageId)
    .maybeSingle();
  if (!message) return { ok: false, error: 'Demande introuvable.' };
  if (!message.email) return { ok: false, error: "Cette demande n'a pas d'adresse e-mail associée." };

  const { data: reply, error: insertError } = await client
    .from('contact_replies')
    .insert({ message_id: messageId, author_id: authorId, author_kind: 'admin', body: corps, email_status: 'pending' })
    .select('id, created_at')
    .single();
  if (insertError || !reply) return { ok: false, error: 'Écriture de la réponse impossible.' };

  // Enregistrées AVANT l'envoi : `composerEtEnvoyer` doit déjà les trouver
  // pour décider d'inclure la mention dans l'e-mail.
  await enregistrerPhotosReponse(reply.id, photos);

  const { delivered, error } = await composerEtEnvoyer(client, message, reply.id, corps);

  await client
    .from('contact_replies')
    .update(delivered ? { email_status: 'sent', sent_at: new Date().toISOString() } : { email_status: 'failed', error })
    .eq('id', reply.id);

  // Commentaire Jira (lot 10) : best-effort, ne conditionne jamais le
  // résultat renvoyé — la réponse est déjà enregistrée et, si possible,
  // envoyée par e-mail.
  await commenterReponseJira(
    client,
    { id: reply.id, body: corps, author_kind: 'admin', created_at: reply.created_at },
    { type: message.type, jira_issue_key: message.jira_issue_key, reference: message.reference },
  );

  // Effet de bord sur le statut (§10.2.7) : seul `recu` bascule, tout autre
  // statut — y compris `a_deployer` — reste intact.
  if (message.status === 'recu') {
    await client
      .from('contact_messages')
      .update({ status: 'en_cours', status_updated_at: new Date().toISOString(), status_source: 'admin' })
      .eq('id', messageId);
    await client
      .from('contact_status_history')
      .insert({ message_id: messageId, from_status: 'recu', to_status: 'en_cours', source: 'admin', author_id: authorId });
  }

  return { ok: true, delivered };
}

export async function renvoyerReponse(replyId: string): Promise<ResultatReponse> {
  const client = withContactSchema(createAdminClient());
  const { data: reply } = await client.from('contact_replies').select('id, message_id, body').eq('id', replyId).maybeSingle();
  if (!reply) return { ok: false, error: 'Réponse introuvable.' };

  const { data: message } = await client
    .from('contact_messages')
    .select('reference, subject, message, email, created_at, user_id')
    .eq('id', reply.message_id)
    .maybeSingle();
  if (!message) return { ok: false, error: 'Demande introuvable.' };
  if (!message.email) return { ok: false, error: "Cette demande n'a pas d'adresse e-mail associée." };

  const { delivered, error } = await composerEtEnvoyer(client, message, reply.id, reply.body);

  await client
    .from('contact_replies')
    .update(delivered ? { email_status: 'sent', sent_at: new Date().toISOString(), error: null } : { email_status: 'failed', error })
    .eq('id', reply.id);

  return { ok: true, delivered };
}

/**
 * Relance le commentaire Jira d'une réponse déjà enregistrée (bouton
 * « Renvoyer le commentaire », lot 10) — motif de `renvoyerReponse` pour
 * l'e-mail, mais sur `jira_comment_status` plutôt que `email_status`.
 */
export async function renvoyerCommentaireJira(replyId: string): Promise<ResultatEcriture> {
  const client = withContactSchema(createAdminClient());
  const { data: reply } = await client
    .from('contact_replies')
    .select('id, message_id, body, author_kind, created_at')
    .eq('id', replyId)
    .maybeSingle();
  if (!reply) return { ok: false, error: 'Réponse introuvable.' };

  const { data: message } = await client
    .from('contact_messages')
    .select('type, jira_issue_key, reference')
    .eq('id', reply.message_id)
    .maybeSingle();
  if (!message) return { ok: false, error: 'Demande introuvable.' };

  const resultat = await commenterReponseJira(client, reply, message);
  if (!resultat) return { ok: false, error: "Pas de ticket Jira associé à cette demande." };
  return resultat.ok ? { ok: true } : { ok: false, error: resultat.error };
}

