// Gabarit HTML UNIQUE des e-mails envoyés par l'application (JEP-277) — PUR :
// aucune lecture de base, testable sans réseau. Utilisable côté serveur comme
// par les routes qui servent les gabarits GoTrue (JEP-276).
//
// Avant lui, quatre mises en forme coexistaient (une enveloppe d'abonnement, un
// `<pre>`, `texteVersHtml`, des `<p>` bruts), chacune avec sa signature et son
// pied. Désormais un composeur ne produit que le CORPS du message ; l'en-tête
// de marque, la signature « L'équipe de Je pâtisse ! », la photo de signature
// (JEP-378) et le pied sont posés ici, et seulement ici — par `sendEmail`
// (`lib/email.ts`), que tous les envois traversent. Un composeur ne doit donc
// plus signer lui-même : la signature apparaîtrait deux fois.
//
// Mise en page en tableaux et styles en ligne : c'est ce que comprennent
// Outlook et Gmail, qui ignorent une feuille de style ou un `flex`.

/**
 * Ce que dit le pied du message — chaque envoi doit le choisir :
 *  - `preferences` : e-mail facultatif, réglable dans /reglages ;
 *  - `obligatoire` : légal, sécurité, support, compte — impossible à couper ;
 *  - `interne` : adressé à l'équipe du site (notification de contact).
 */
export type PiedEmail = 'preferences' | 'obligatoire' | 'interne';

/** Où le membre règle ses e-mails : cible du lien du pied « préférences ». */
export const CHEMIN_PREFERENCES = '/reglages#notifications';

export const SIGNATURE_EMAIL = 'L’équipe de Je pâtisse !';

/** Clé `site_settings` de la photo de signature (Admin → Photos du site, JEP-378). */
export const CLE_PHOTO_SIGNATURE = 'email_signature_photo';
/** Format imposé de la photo de signature : 1600 × 320 px (ratio 5:1). */
export const PHOTO_SIGNATURE_LARGEUR = 1600;
export const PHOTO_SIGNATURE_HAUTEUR = 320;

const COULEUR_MARQUE = '#300a12';
const COULEUR_FOND = '#fff8f7';
const COULEUR_TEXTE = '#2b1a1c';
const COULEUR_DISCRET = '#8a7375';
const POLICE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const echapperHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Texte brut → paragraphes HTML échappés (blocs séparés par une ligne vide). */
export function texteVersParagraphes(texte: string): string {
  return texte
    .trim()
    .split(/\n{2,}/)
    .map((bloc) => `<p style="margin:0 0 14px;">${echapperHtml(bloc).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** Un bouton d'action, au style de la marque (lien absolu attendu). */
export function boutonEmail(url: string, libelle: string): string {
  return (
    `<p style="margin:20px 0;"><a href="${echapperHtml(url)}" ` +
    `style="display:inline-block;background:${COULEUR_MARQUE};color:#ffffff;text-decoration:none;` +
    `padding:12px 22px;border-radius:999px;font-weight:600;">${echapperHtml(libelle)}</a></p>`
  );
}

/** Retire une ancienne signature en fin de texte, pour qu'elle ne soit jamais doublée. */
export function sansSignature(texte: string): string {
  return texte.replace(/\n*(?:À bientôt,\s*\n)?L[’']équipe (?:de )?(?:« )?Je pâtisse !(?: »)?\s*$/u, '').trimEnd();
}

function piedHtml(pied: PiedEmail, urlSite: string): string {
  const style = `color:${COULEUR_DISCRET};font-size:12px;line-height:1.5;margin:0;`;
  if (pied === 'preferences') {
    const url = `${urlSite}${CHEMIN_PREFERENCES}`;
    return (
      `<p style="${style}">Vous recevez cet e-mail selon vos préférences de notification. ` +
      `<a href="${echapperHtml(url)}" style="color:${COULEUR_DISCRET};">Gérer mes préférences</a></p>`
    );
  }
  if (pied === 'obligatoire') {
    return `<p style="${style}">Message obligatoire lié à votre compte : il ne peut pas être désactivé.</p>`;
  }
  return `<p style="${style}">Message interne de Je pâtisse !</p>`;
}

function piedTexte(pied: PiedEmail, urlSite: string): string {
  if (pied === 'preferences') return `Gérer mes préférences de notification : ${urlSite}${CHEMIN_PREFERENCES}`;
  if (pied === 'obligatoire') return 'Message obligatoire lié à votre compte : il ne peut pas être désactivé.';
  return 'Message interne de Je pâtisse !';
}

export type EmailHabille = { html: string; texte: string };

/**
 * Habille un corps de message : en-tête de marque, corps, signature, photo de
 * signature (si une est posée), pied. `contenuHtml` absent : le texte brut est
 * mis en paragraphes.
 */
export function habillerEmail(opts: {
  texte: string;
  contenuHtml?: string;
  pied: PiedEmail;
  urlSite: string;
  photoSignature?: string | null;
}): EmailHabille {
  const texte = sansSignature(opts.texte);
  const corps = opts.contenuHtml ?? texteVersParagraphes(texte);
  const photo = opts.photoSignature?.trim();
  const blocPhoto = photo
    ? `<tr><td style="padding:0 32px 8px;"><img src="${echapperHtml(photo)}" width="536" alt="" ` +
      `style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:8px;"></td></tr>`
    : '';
  const html =
    `<!doctype html><html lang="fr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:0;background:${COULEUR_FOND};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COULEUR_FOND};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;font-family:${POLICE};color:${COULEUR_TEXTE};font-size:16px;line-height:1.55;">` +
    `<tr><td style="background:${COULEUR_MARQUE};border-radius:12px 12px 0 0;padding:18px 32px;">` +
    `<a href="${echapperHtml(opts.urlSite)}" style="color:#ffffff;text-decoration:none;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;">Je pâtisse !</a>` +
    `</td></tr>` +
    `<tr><td style="padding:28px 32px 8px;">${corps}` +
    `<p style="margin:20px 0 12px;">${echapperHtml(SIGNATURE_EMAIL)}</p></td></tr>` +
    blocPhoto +
    `<tr><td style="padding:16px 32px 24px;border-top:1px solid #efdfde;">${piedHtml(opts.pied, opts.urlSite)}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  const texteFinal = `${texte}\n\n${SIGNATURE_EMAIL}\n\n—\n${piedTexte(opts.pied, opts.urlSite)}`;
  return { html, texte: texteFinal };
}
