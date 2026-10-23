// Envoi d'e-mails applicatifs (hors e-mails Supabase Auth, qui passent par
// leur propre config SMTP côté dashboard Supabase) via un SMTP unique —
// client commun à l'outil de test du back-office (app/admin/test-email) ET
// aux notifications d'abonnement par e-mail (app/api/cron/abonnements) : un
// seul jeu de variables d'environnement pour un seul fournisseur, plutôt que
// deux implémentations qui se seraient silencieusement désynchronisées.
//
// Fournisseur Brevo depuis la migration Infomaniak (docs/migration-infomaniak.md
// § 7.9 bis) — AWS SES a été retiré : le compte restait en bac à sable sans
// perspective de sortie, ce qui n'atteignait aucun destinataire non vérifié.
// Les variables gardent un nom neutre vis-à-vis du fournisseur : SMTP est un
// protocole standard, rien dans le code n'est spécifique à Brevo.
//
// Deux façons d'appeler, pour deux contextes différents :
//  - `sendEmail` lève `MissingSmtpConfigError` (ou l'erreur d'envoi telle
//    quelle) — c'est ce que veut un admin qui teste sa configuration : voir
//    l'échec immédiatement, jamais un succès silencieux qui masquerait une
//    panne.
//  - `sendEmailBestEffort` ne lève jamais et renvoie `true`/`false` — c'est
//    ce que veut le cron d'expiration : un e-mail qui ne part pas dégrade
//    l'information du membre, il ne doit jamais interrompre le traitement
//    des autres abonnements de la même passe.
//
// **Habillage (JEP-277)** : tout e-mail traverse ici le gabarit unique
// (`habillerEmail`, `lib/email-gabarit.ts`) — en-tête de marque, signature,
// photo de signature (JEP-378), pied. `html` n'est donc que le CORPS du
// message, et `pied` est obligatoire : chaque envoi dit s'il est facultatif
// (lien vers les préférences), obligatoire ou interne.
//
// **Expéditeur (JEP-377)** : le nom affiché est « Je pâtisse ! » (variable
// `EMAIL_SENDER_NAME` pour le changer), jamais la partie locale de l'adresse
// — Gmail affichait « noreply ».
import nodemailer from 'nodemailer';
import { createAdminClient } from '@/lib/supabase/admin';
import { siteUrl } from '@/lib/site-url';
import { CLE_PHOTO_SIGNATURE, habillerEmail, type PiedEmail } from '@/lib/email-gabarit';

export class MissingSmtpConfigError extends Error {
  constructor() {
    super('Configuration SMTP manquante (variables SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_SENDER).');
    this.name = 'MissingSmtpConfigError';
  }
}

/** Nom affiché de l'expéditeur. */
export const NOM_EXPEDITEUR_DEFAUT = 'Je pâtisse !';

/**
 * `EMAIL_SENDER` peut porter une adresse nue (`noreply@…`) ou déjà un nom
 * (`"X" <noreply@…>`) : dans le second cas on la garde telle quelle.
 */
export function expediteur(brut: string, nom = process.env.EMAIL_SENDER_NAME || NOM_EXPEDITEUR_DEFAUT) {
  const adresse = brut.trim();
  if (adresse.includes('<')) return adresse;
  return { name: nom, address: adresse };
}

// `replyTo` : optionnel, pour les courriels transactionnels du module contact
// (§10 de docs/contact-jira.md) — le membre répond directement à
// EMAIL_REPLY_TO, jamais à `notifications@`.
// `headers` : en-têtes supplémentaires, ex. `List-Unsubscribe` des e-mails de
// notification facultatifs (JEP-279).
export type EmailAEnvoyer = {
  to: string;
  subject: string;
  /** Corps en texte brut, SANS signature ni pied (posés par le gabarit). */
  text: string;
  /** Corps HTML, SANS enveloppe ni signature ; absent : le texte mis en paragraphes. */
  html?: string;
  pied: PiedEmail;
  replyTo?: string;
  headers?: Record<string, string>;
};

// Photo de signature : lue au plus toutes les 5 minutes par processus (un
// récapitulatif peut partir vers des dizaines de membres d'affilée). Une
// lecture impossible vaut « pas de photo » : jamais un e-mail bloqué pour ça.
const DUREE_CACHE_PHOTO_MS = 5 * 60_000;
const cachePhoto = globalThis as typeof globalThis & { __mcPhotoSignature?: { url: string | null; jusqua: number } };

export async function photoSignatureEmail(): Promise<string | null> {
  const c = cachePhoto.__mcPhotoSignature;
  if (c && c.jusqua > Date.now()) return c.url;
  let url: string | null = null;
  try {
    const { data } = await createAdminClient()
      .from('site_settings' as never)
      .select('value')
      .eq('key', CLE_PHOTO_SIGNATURE)
      .maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    url = typeof v === 'string' && /^https:\/\//.test(v) ? v : null;
  } catch {
    url = null;
  }
  cachePhoto.__mcPhotoSignature = { url, jusqua: Date.now() + DUREE_CACHE_PHOTO_MS };
  return url;
}

export async function sendEmail({ to, subject, text, html, pied, replyTo, headers }: EmailAEnvoyer): Promise<void> {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: pass, EMAIL_SENDER: from } = process.env;
  if (!host || !port || !user || !pass || !from) throw new MissingSmtpConfigError();

  const habille = habillerEmail({
    texte: text,
    contenuHtml: html,
    pied,
    urlSite: siteUrl(),
    photoSignature: await photoSignatureEmail(),
  });

  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  await transport.sendMail({
    from: expediteur(from),
    to,
    subject,
    text: habille.texte,
    html: habille.html,
    replyTo,
    headers,
  });
}

/** Envoi qui ne lève jamais : `ok` et, en cas d'échec, le message d'erreur (tracé par l'appelant). */
export async function sendEmailResultat(email: EmailAEnvoyer): Promise<{ ok: true } | { ok: false; erreur: string }> {
  try {
    await sendEmail(email);
    return { ok: true };
  } catch (e) {
    const erreur = (e as Error).message;
    console.error(`email: envoi à ${email.to} échoué :`, erreur);
    return { ok: false, erreur };
  }
}

/** Renvoie `true` si l'e-mail est parti, `false` sinon — jamais ne lève. */
export async function sendEmailBestEffort(email: EmailAEnvoyer): Promise<boolean> {
  return (await sendEmailResultat(email)).ok;
}
