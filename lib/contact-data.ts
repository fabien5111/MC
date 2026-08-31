// Formulaire de contact — lectures et écritures, SERVER-ONLY.
//
// Séparé de `lib/contact.ts` (pur) pour la même raison que `ideas-data.ts` /
// `pseudo-data.ts` : ce module écrit avec la clé service_role et signe des
// jetons avec `node:crypto` — deux choses qu'un Client Component ne doit
// jamais pouvoir tirer dans son bundle.
//
// Décisions de conception : `docs/contact-jira.md`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { withContactSchema } from '@/lib/contact-types';
import type { ContactMessageInsert, ContactMessageRow } from '@/lib/contact-types';
import { composeNotificationAdmin, DEBIT_IP, DEBIT_MEMBRE, genererReference, type ContactType } from '@/lib/contact';
import { sendEmailBestEffort } from '@/lib/email';
import { siteUrl } from '@/lib/site-url';

// ─────────────────────────────────────────────────────────────────────────
// Jeton anti-robot (délai minimum d'ouverture, spec §5.5.2)
// ─────────────────────────────────────────────────────────────────────────

// Format `<horodatage-ms>.<hmac-hex>`. Signé par le rendu SERVEUR de
// `/contact` à l'ouverture de la page, revérifié par la route à la
// soumission : sans signature, un horodatage lu du navigateur se falsifie en
// une ligne de console et ne protège rien (cf. `lib/contact.ts`
// `verdictDelaiOuverture`).
export function signerOuverture(maintenantMs: number): string {
  const secret = process.env.CONTACT_FORM_SECRET;
  if (!secret) return String(maintenantMs); // dégradé : cf. `verifierOuverture`.
  const signature = createHmac('sha256', secret).update(String(maintenantMs)).digest('hex');
  return `${maintenantMs}.${signature}`;
}

/**
 * Vérifie le jeton et rend l'horodatage d'ouverture qu'il porte, ou `null`
 * s'il est absent, malformé ou falsifié.
 *
 * **Dégradé, jamais bloquant** si `CONTACT_FORM_SECRET` n'est pas configuré :
 * même doctrine que la modération IA des pseudos — une variable
 * d'environnement manquante ne doit jamais empêcher un visiteur de déposer
 * une demande, elle affaiblit seulement une couche parmi trois (honeypot,
 * délai, débit).
 */
export function verifierOuverture(jeton: unknown): number | null {
  if (typeof jeton !== 'string' || jeton.length === 0) return null;

  const secret = process.env.CONTACT_FORM_SECRET;
  if (!secret) {
    console.error('contact: CONTACT_FORM_SECRET absent — délai anti-robot non signé, best-effort.');
    const ms = Number(jeton);
    return Number.isFinite(ms) ? ms : null;
  }

  const [msTexte, signature] = jeton.split('.');
  if (!msTexte || !signature) return null;

  const attendue = createHmac('sha256', secret).update(msTexte).digest('hex');
  // Longueurs comparées AVANT `timingSafeEqual`, qui lève sur des tampons de
  // tailles différentes plutôt que de renvoyer `false` — un jeton tronqué ne
  // doit jamais faire planter la route.
  if (signature.length !== attendue.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(attendue))) return null;

  const ms = Number(msTexte);
  return Number.isFinite(ms) ? ms : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Empreinte d'IP
// ─────────────────────────────────────────────────────────────────────────

// Jamais en clair (spec §4.2/§4.4) : seule l'empreinte, salée, est stockée —
// et purgée à 30 jours (`contact_purge`, lot 1) indépendamment du reste de la
// demande. `IP_HASH_SALT` absent → aucune empreinte : la limitation par IP
// est alors désactivée (repli sur la seule limitation par membre pour un
// visiteur connecté), jamais un blocage total du formulaire pour une
// variable de sécurité secondaire manquante.
export async function empreinteIp(ip: string | null): Promise<string | null> {
  const sel = process.env.IP_HASH_SALT;
  if (!ip || !sel) return null;
  const donnees = new TextEncoder().encode(`${sel}:${ip}`);
  const empreinte = await crypto.subtle.digest('SHA-256', donnees);
  return Buffer.from(empreinte).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────
// Limitation de débit — comptée EN BASE (cf. docs/contact-jira.md §8)
// ─────────────────────────────────────────────────────────────────────────

function depuis(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export async function debitIpDepasse(ipHash: string): Promise<boolean> {
  const client = withContactSchema(createAdminClient());
  const { count } = await client
    .from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', depuis(DEBIT_IP.fenetreMinutes));
  return (count ?? 0) >= DEBIT_IP.max;
}

export async function debitMembreDepasse(userId: string): Promise<boolean> {
  const client = withContactSchema(createAdminClient());
  const { count } = await client
    .from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', depuis(DEBIT_MEMBRE.fenetreMinutes));
  return (count ?? 0) >= DEBIT_MEMBRE.max;
}

// ─────────────────────────────────────────────────────────────────────────
// Enregistrement de la demande
// ─────────────────────────────────────────────────────────────────────────

export type NouvelleDemande = {
  type: ContactType;
  email: string | null;
  subject: string;
  message: string;
  userId: string | null;
  pageUrl: string | null;
  browserContext: string | null;
  appVersion: string | null;
  ipHash: string | null;
};

export type DemandeEnregistree = { ok: true; id: string; reference: string; type: ContactType };
export type EnregistrementEchoue = { ok: false };

const MAX_TENTATIVES_REFERENCE = 5;
// Code Postgres d'une violation de contrainte unique — la seule collision de
// référence possible, sur un alphabet de 32^6 combinaisons (cf. `lib/contact.ts`).
const CODE_VIOLATION_UNICITE = '23505';

/**
 * Insère la demande, en retirant une nouvelle référence en cas de collision
 * (improbable : 32^6 combinaisons, cf. `genererReference`). L'INSERT est le
 * seul geste qui doit réussir pour que la route réponde succès (spec §7.11) —
 * la création du ticket Jira et la notification administrateur viennent
 * après, et leur échec n'annule jamais celui-ci.
 */
export async function enregistrerDemande(
  demande: NouvelleDemande,
): Promise<DemandeEnregistree | EnregistrementEchoue> {
  const client = withContactSchema(createAdminClient());

  for (let tentative = 0; tentative < MAX_TENTATIVES_REFERENCE; tentative++) {
    const reference = genererReference();
    const ligne: ContactMessageInsert = {
      reference,
      type: demande.type,
      email: demande.email,
      subject: demande.subject,
      message: demande.message,
      user_id: demande.userId,
      page_url: demande.pageUrl,
      browser_context: demande.browserContext,
      app_version: demande.appVersion,
      ip_hash: demande.ipHash,
      // La création Jira arrive au lot suivant : une demande de bug reste en
      // 'pending' jusque-là, sans que ça déclenche le bandeau d'anomalies
      // (seul 'failed' y figure, cf. lot 1 §5).
      jira_sync_status: demande.type === 'bug' ? 'pending' : 'not_applicable',
    };
    const { data, error } = await client.from('contact_messages').insert(ligne).select('id').single();

    if (!error && data) return { ok: true, id: data.id, reference, type: demande.type };
    if (error?.code !== CODE_VIOLATION_UNICITE) {
      console.error('contact: enregistrement échoué :', error?.message);
      return { ok: false };
    }
    // Collision de référence : on retire un nouveau tirage, sans réessayer
    // indéfiniment (une contrainte d'un autre ordre produirait la même erreur
    // Postgres pour une raison qui, elle, ne se résoudra jamais en boucle).
  }

  console.error('contact: enregistrement échoué après plusieurs collisions de référence.');
  return { ok: false };
}

// ─────────────────────────────────────────────────────────────────────────
// Notification à l'administrateur — à chaque demande (spec §10.1)
// ─────────────────────────────────────────────────────────────────────────

export type DemandeurNotification = { label: string; email: string | null };

/**
 * Compose et envoie la notification, puis journalise le résultat sur la
 * ligne. Best-effort : un échec d'envoi ne remonte jamais à l'appelant, il
 * n'a déjà plus voix au chapitre — la demande est enregistrée depuis
 * l'INSERT précédent (spec §2 : « un échec d'envoi d'e-mail ne fait jamais
 * perdre une demande »).
 */
export async function notifierAdmin(
  message: Pick<ContactMessageRow, 'id' | 'reference' | 'type' | 'subject' | 'message' | 'created_at' | 'page_url' | 'browser_context'>,
  demandeur: DemandeurNotification,
): Promise<void> {
  const destinataire = process.env.CONTACT_NOTIFICATION_TO;
  const client = withContactSchema(createAdminClient());

  if (!destinataire) {
    console.error("contact: CONTACT_NOTIFICATION_TO absent — notification administrateur non envoyée.");
    await client
      .from('contact_messages')
      .update({ admin_notify_error: "CONTACT_NOTIFICATION_TO n'est pas configurée." })
      .eq('id', message.id);
    return;
  }

  const { subject, html, text } = composeNotificationAdmin({
    reference: message.reference,
    type: message.type,
    subject: message.subject,
    message: message.message,
    authorLabel: demandeur.label,
    authorEmail: demandeur.email,
    createdAtIso: message.created_at,
    pageUrl: message.page_url,
    browserContext: message.browser_context,
    jiraIssueKey: null, // lot suivant : la création du ticket a lieu après cette notification.
    adminUrl: `${siteUrl()}/admin/contact/${message.reference}`,
  });

  const envoye = await sendEmailBestEffort({
    to: destinataire,
    subject,
    text,
    html,
    // Confort : un administrateur qui répond directement depuis son client
    // de messagerie atteint le demandeur, sans ouvrir le back-office. Ne
    // remplace pas §10.2 (c'est la route qui journalise la réponse) — un
    // visiteur non connecté sans adresse n'a simplement pas de reply-to.
    replyTo: demandeur.email ?? undefined,
  });

  await client
    .from('contact_messages')
    .update(
      envoye
        ? { admin_notified_at: new Date().toISOString() }
        : { admin_notify_error: `Envoi à ${destinataire} échoué.` },
    )
    .eq('id', message.id);
}

