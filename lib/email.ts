// Envoi d'e-mails applicatifs (hors e-mails Supabase Auth, qui passent par
// leur propre config SMTP côté dashboard Supabase) via le SMTP AWS SES du
// domaine. Utilisé pour l'instant par l'outil de test du back-office
// (app/admin/test-email).
import nodemailer from 'nodemailer';

export class MissingSmtpConfigError extends Error {
  constructor() {
    super('Configuration SMTP manquante (variables SES_SMTP_HOST / SES_SMTP_PORT / SES_SMTP_USER / SES_SMTP_PASSWORD / SES_SENDER_EMAIL).');
    this.name = 'MissingSmtpConfigError';
  }
}

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void> {
  const { SES_SMTP_HOST: host, SES_SMTP_PORT: port, SES_SMTP_USER: user, SES_SMTP_PASSWORD: pass, SES_SENDER_EMAIL: from } = process.env;
  if (!host || !port || !user || !pass || !from) throw new MissingSmtpConfigError();

  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  await transport.sendMail({ from, to, subject, text });
}
