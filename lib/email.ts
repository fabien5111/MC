// Envoi d'e-mails applicatifs (hors e-mails Supabase Auth, qui passent par
// leur propre config SMTP côté dashboard Supabase) via le SMTP AWS SES du
// domaine — client SMTP unique pour l'outil de test du back-office
// (app/admin/test-email) ET les notifications d'abonnement par e-mail
// (app/api/cron/abonnements) : un seul jeu de variables d'environnement pour
// un seul fournisseur, plutôt que deux implémentations qui se seraient
// silencieusement désynchronisées.
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
import nodemailer from 'nodemailer';

export class MissingSmtpConfigError extends Error {
  constructor() {
    super('Configuration SMTP manquante (variables SES_SMTP_HOST / SES_SMTP_PORT / SES_SMTP_USER / SES_SMTP_PASSWORD / SES_SENDER_EMAIL).');
    this.name = 'MissingSmtpConfigError';
  }
}

// `replyTo` : optionnel, pour les courriels transactionnels du module contact
// (§10 de docs/contact-jira.md) — le membre répond directement à
// EMAIL_REPLY_TO, jamais à `notifications@`.
export type EmailAEnvoyer = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export async function sendEmail({ to, subject, text, html, replyTo }: EmailAEnvoyer): Promise<void> {
  const { SES_SMTP_HOST: host, SES_SMTP_PORT: port, SES_SMTP_USER: user, SES_SMTP_PASSWORD: pass, SES_SENDER_EMAIL: from } = process.env;
  if (!host || !port || !user || !pass || !from) throw new MissingSmtpConfigError();

  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  await transport.sendMail({ from, to, subject, text, html, replyTo });
}

/** Renvoie `true` si l'e-mail est parti, `false` sinon — jamais ne lève. */
export async function sendEmailBestEffort(email: EmailAEnvoyer): Promise<boolean> {
  try {
    await sendEmail(email);
    return true;
  } catch (e) {
    console.error(`email: envoi à ${email.to} échoué :`, (e as Error).message);
    return false;
  }
}
