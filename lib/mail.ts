// Envoi d'e-mail transactionnel — SMTP générique.
//
// Le prestataire retenu (AWS SES) est exposé en SMTP standard : rien ici ne
// lui est spécifique, un changement de prestataire ne touche que les
// variables d'environnement. Server-only (`nodemailer`, secrets SMTP) — à
// n'importer que depuis une route ou une tâche planifiée.
//
// **Best-effort**, même doctrine que la modération IA des pseudos et des
// avis : SMTP absent, mal configuré, ou en panne → l'envoi échoue
// silencieusement (loggé), jamais une erreur remontée à l'appelant. Un
// e-mail non envoyé dégrade l'information du membre ; il ne doit jamais
// bloquer le mécanisme qu'il accompagne (ici, le cron d'expiration).
import nodemailer from 'nodemailer';

let transporteur: nodemailer.Transporter | null | undefined;

function obtenirTransporteur(): nodemailer.Transporter | null {
  if (transporteur !== undefined) return transporteur;
  const host = process.env.SMTP_HOST;
  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    console.error('mail: SMTP_HOST / SMTP_USER / SMTP_PASSWORD non configurés — envois désactivés.');
    transporteur = null;
    return null;
  }
  transporteur = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporteur;
}

export type Email = { to: string; subject: string; html: string; text: string };

/** Renvoie `true` si l'e-mail est parti, `false` sinon — jamais ne lève. */
export async function envoyerEmail(email: Email): Promise<boolean> {
  const t = obtenirTransporteur();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || 'Je pâtisse ! <no-reply@jepatisse.com>',
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return true;
  } catch (e) {
    console.error(`mail: envoi à ${email.to} échoué :`, (e as Error).message);
    return false;
  }
}
