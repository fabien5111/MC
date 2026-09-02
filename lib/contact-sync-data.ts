// Synchronisation Jira → back-office — webhook entrant (spec §9.2) ET
// réconciliation quotidienne (spec §9.3) partagent ce module.
//
// SERVER-ONLY, et sans AUCUNE session utilisateur : contrairement à
// `lib/contact-admin-data.ts` (lectures via le client de session d'un admin
// authentifié), ni le webhook Jira ni la tâche planifiée n'ont de session —
// tout passe par la clé service_role, lectures comprises.
//
// `synchroniserStatut` est le point d'entrée UNIQUE : webhook et
// réconciliation lui délèguent tout — décision (`decisionSynchroJira`,
// `lib/contact.ts`) puis écriture — pour ne jamais recomposer cette
// séquence à deux endroits qui finiraient par diverger.
//
// Décisions de conception : `docs/contact-jira.md`.
import { createAdminClient } from '@/lib/supabase/admin';
import { withContactSchema } from '@/lib/contact-types';
import type { ContactMessageRow } from '@/lib/contact-types';
import {
  composeEmailDeploiement,
  composeNotificationDeploiement,
  dateClotureApres,
  decisionSynchroJira,
  emailDeploiementAutorise,
  type ConfigStatutsJira,
  type DecisionSynchro,
  type StatutJira,
} from '@/lib/contact';
import { createNotification } from '@/lib/notifications-data';
import { sendEmailBestEffort } from '@/lib/email';

// ─────────────────────────────────────────────────────────────────────────
// Lecture des demandes concernées
// ─────────────────────────────────────────────────────────────────────────

export type MessageSync = Pick<
  ContactMessageRow,
  | 'id'
  | 'reference'
  | 'subject'
  | 'type'
  | 'email'
  | 'user_id'
  | 'status'
  | 'status_source'
  | 'jira_status'
  | 'jira_status_id'
  | 'deploy_notify'
  | 'deploy_email_status'
>;

const COLONNES_SYNC =
  'id, reference, subject, type, email, user_id, status, status_source, jira_status, jira_status_id, deploy_notify, deploy_email_status';

/** Webhook (spec §9.2.3) : ticket inconnu → l'appelant répond `200` sans effet. */
export async function getMessageByIssueKey(issueKey: string): Promise<MessageSync | null> {
  const client = withContactSchema(createAdminClient());
  const { data } = await client.from('contact_messages').select(COLONNES_SYNC).eq('jira_issue_key', issueKey).maybeSingle();
  return data ?? null;
}

export type MessageOuvert = MessageSync & { jira_issue_key: string };

/** Réconciliation (spec §9.3.1) : tout ce qui a un ticket et n'est pas encore clos. */
export async function getMessagesAvecTicketOuvert(): Promise<MessageOuvert[]> {
  const client = withContactSchema(createAdminClient());
  const { data, error } = await client
    .from('contact_messages')
    .select(`${COLONNES_SYNC}, jira_issue_key`)
    .not('jira_issue_key', 'is', null)
    .neq('status', 'termine');
  if (error) {
    console.error('contact-sync: lecture des tickets ouverts impossible :', error.message);
    return [];
  }
  // Le filtre `not jira_issue_key is null` garantit la non-nullité — le cast
  // évite de retyper toute la colonne en optionnel pour ce seul appelant.
  return (data ?? []) as MessageOuvert[];
}

// ─────────────────────────────────────────────────────────────────────────
// Application de la décision
// ─────────────────────────────────────────────────────────────────────────

async function prenomDuMembre(client: ReturnType<typeof withContactSchema>, userId: string): Promise<string | null> {
  const { data } = await client.from('profiles').select('full_name').eq('id', userId).maybeSingle();
  return data?.full_name?.split(' ')[0] || null;
}

/**
 * E-mail de déploiement + notification in-app (spec §10.3, décision §2.8).
 * Les deux canaux sont INDÉPENDANTS : l'e-mail exige une adresse, l'in-app
 * exige un membre connecté — un visiteur sans compte peut donc recevoir
 * l'e-mail sans notification in-app, et rien n'empêche l'inverse en théorie
 * (un membre sans e-mail associé, cas qui ne devrait pas se produire mais
 * que le code n'a pas besoin de spécialement rejeter).
 */
async function notifierDeploiement(
  client: ReturnType<typeof withContactSchema>,
  message: MessageSync,
  source: 'jira-webhook' | 'jira-sync',
): Promise<void> {
  const verdict = emailDeploiementAutorise({
    type: message.type,
    email: message.email,
    deployNotify: message.deploy_notify,
    statutEmail: message.deploy_email_status,
    source,
  });

  if (!verdict.envoyer) {
    // Ne JAMAIS écraser un statut déjà définitif (sent/failed) : si le refus
    // vient de « déjà traité », le statut n'est déjà plus 'pending' et cette
    // garde l'empêche de redevenir 'skipped' par erreur.
    if (message.deploy_email_status === 'pending') {
      await client.from('contact_messages').update({ deploy_email_status: 'skipped' }).eq('id', message.id);
    }
    console.info(`contact-sync: e-mail de déploiement non envoyé pour ${message.reference} : ${verdict.raison}`);
  } else {
    // Réservation AVANT l'envoi (« réserver plutôt que constater »,
    // docs/contact-jira.md §5) : l'UPDATE conditionnel sur 'pending' protège
    // contre une course entre le webhook et la réconciliation quotidienne —
    // au plus l'un des deux obtient la ligne.
    const { data: reserve, error } = await client
      .from('contact_messages')
      .update({ deploy_email_status: 'sent', deploy_email_sent_at: new Date().toISOString() })
      .eq('id', message.id)
      .eq('deploy_email_status', 'pending')
      .select('id');

    if (!error && reserve && reserve.length > 0) {
      const prenom = message.user_id ? await prenomDuMembre(client, message.user_id) : null;
      const { subject, html, text } = composeEmailDeploiement({
        reference: message.reference,
        authorFirstName: prenom,
        subject: message.subject,
      });
      const envoye = await sendEmailBestEffort({ to: message.email as string, subject, html, text });
      if (!envoye) {
        await client
          .from('contact_messages')
          .update({ deploy_email_status: 'failed', deploy_email_error: `Envoi à ${message.email} échoué.` })
          .eq('id', message.id);
      }
    }
    // `reserve` vide : un autre appel a déjà pris la main entre-temps — rien
    // à faire, l'e-mail part (ou est déjà parti) de ce côté-là.
  }

  // Notification in-app, indépendante du canal e-mail — cf. docstring.
  if (message.user_id && message.type === 'bug' && message.deploy_notify) {
    const { title, body } = composeNotificationDeploiement(message.subject);
    await createNotification(createAdminClient(), message.user_id, 'contact_deploye', title, body);
  }
}

/**
 * Écrit la transition décidée par `decisionSynchroJira` : statut, statut
 * Jira, historique, puis notification si `decision.notifier`. N'est JAMAIS
 * appelée pour une `decision.action === 'ignorer'` — c'est `synchroniserStatut`
 * qui filtre.
 */
async function appliquerDecisionSynchro(
  message: MessageSync,
  decision: Extract<DecisionSynchro, { action: 'appliquer' }>,
  recu: StatutJira,
  source: 'jira-webhook' | 'jira-sync',
): Promise<void> {
  const client = withContactSchema(createAdminClient());
  const maintenant = new Date().toISOString();

  const { error } = await client
    .from('contact_messages')
    .update({
      status: decision.statut,
      status_updated_at: maintenant,
      status_source: source,
      jira_status: recu.nom,
      jira_status_id: recu.id,
      jira_synced_at: maintenant,
      closed_at: dateClotureApres(decision.statut, maintenant),
    })
    .eq('id', message.id);
  if (error) {
    console.error(`contact-sync: mise à jour du statut impossible pour ${message.reference} :`, error.message);
    return;
  }

  await client.from('contact_status_history').insert({
    message_id: message.id,
    from_status: message.status,
    to_status: decision.statut,
    source,
    jira_status: recu.nom,
  });

  if (decision.avertissement) {
    // Repli de sécurité déclenché (statut Jira inconnu de catégorie
    // « Terminé ») : journalisé, jamais silencieux — cf. spec §9.1 et
    // docs/contact-jira.md §7.1 sur le choix de ne pas construire un
    // second dispositif d'alerte pour ce cas encore rare.
    console.warn(`contact-sync: ${message.reference} — ${decision.avertissement}`);
  }

  if (decision.notifier) await notifierDeploiement(client, message, source);
}

/**
 * Point d'entrée unique : calcule la décision puis l'applique. Webhook et
 * réconciliation n'ont RIEN d'autre à savoir sur la synchronisation.
 *
 * `forcer` (lot 12) : réservé au bouton « Resynchroniser maintenant »
 * (`/api/admin/contact/[id]/jira/resync`) — contourne `memeStatutJira` sans
 * toucher à `jiraPeutEcraser`, cf. `OptionsDecisionSynchro` (`lib/contact.ts`).
 * Ni le webhook ni la réconciliation ne doivent jamais le passer à `true`.
 */
export async function synchroniserStatut(
  message: MessageSync,
  recu: StatutJira,
  config: ConfigStatutsJira,
  source: 'jira-webhook' | 'jira-sync',
  forcer = false,
): Promise<void> {
  const decision = decisionSynchroJira(
    { status: message.status, statusSource: message.status_source, jiraStatusId: message.jira_status_id, jiraStatus: message.jira_status },
    recu,
    config,
    { forcerMalgreMemeStatutJira: forcer },
  );

  if (decision.action === 'ignorer') {
    if (decision.avertissement) console.warn(`contact-sync: ${message.reference} — ${decision.avertissement}`);
    return;
  }

  await appliquerDecisionSynchro(message, decision, recu, source);
}
