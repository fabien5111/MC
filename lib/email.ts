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
import nodemailer from 'nodemailer';

export class MissingSmtpConfigError extends Error {
  constructor() {
    super('Configuration SMTP manquante (variables SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / EMAIL_SENDER).');
    this.name = 'MissingSmtpConfigError';
  }
}

// `replyTo` : optionnel, pour les courriels transactionnels du module contact
// (§10 de docs/contact-jira.md) — le membre répond directement à
// EMAIL_REPLY_TO, jamais à `notifications@`.
export type EmailAEnvoyer = { to: string; subject: string; text: string; html?: string; replyTo?: string };

export async function sendEmail({ to, subject, text, html, replyTo }: EmailAEnvoyer): Promise<void> {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: pass, EMAIL_SENDER: from } = process.env;
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
