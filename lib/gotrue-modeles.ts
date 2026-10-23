// Modèles d'e-mails de GoTrue (nœud 216114) — PUR, servis par les routes
// `app/api/gotrue-modeles/*` (JEP-276). GoTrue auto-hébergé sans Studio lit ses
// modèles via une URL qu'il va chercher à l'envoi
// (`GOTRUE_MAILER_TEMPLATES_<TYPE>`) : la version du dépôt reste la source de
// vérité, et ces e-mails portent le même gabarit que ceux de l'application
// (`habillerEmail`, JEP-277) au lieu des modèles par défaut, en anglais.
//
// `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .RedirectTo }}` sont des variables
// Go template substituées par GoTrue lui-même à l'envoi — jamais ici.
//
// **Liens en `token_hash`, jamais `?code=`** : le lien est ouvert depuis un
// client mail, souvent sur un autre appareil que celui de la demande, où le
// flux PKCE échoue faute de son jeton local (cf. `app/auth/callback/route.ts`).
import { boutonEmail, habillerEmail } from '@/lib/email-gabarit';

export type ModeleGoTrue = 'confirmation-inscription' | 'mot-de-passe-oublie' | 'changement-email';

const p = (contenu: string) => `<p style="margin:0 0 14px;">${contenu}</p>`;

/**
 * Liens des trois modèles. L'inscription transmet `{{ .RedirectTo }}` en
 * `suite` : il porte le `next` choisi par le formulaire (lien de partage de
 * carnet, JEP-21), que `/auth/callback` en extrait — un `next` fixé ici le
 * perdrait. Le mot de passe et le changement d'adresse ont une destination
 * fixe.
 */
export const LIENS_GOTRUE: Record<ModeleGoTrue, string> = {
  'confirmation-inscription':
    '{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&suite={{ .RedirectTo }}',
  'mot-de-passe-oublie':
    '{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reinitialiser-mot-de-passe',
  'changement-email': '{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change&next=/reglages',
};

const CONTENUS: Record<ModeleGoTrue, { texte: string; html: (lien: string) => string }> = {
  'confirmation-inscription': {
    texte: 'Bienvenue sur Je pâtisse ! Confirmez votre adresse e-mail pour activer votre compte.',
    html: (lien) =>
      p('Bonjour,') +
      p('Bienvenue sur Je pâtisse ! Il reste une étape : confirmer votre adresse e-mail pour activer votre compte.') +
      boutonEmail(lien, 'Confirmer mon adresse e-mail') +
      p("Ce lien ne fonctionne qu'une seule fois, pendant une durée limitée ; il vous connecte directement à votre compte, depuis n'importe quel appareil.") +
      p("Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement ce message."),
  },
  'mot-de-passe-oublie': {
    texte: 'Réinitialisez le mot de passe de votre compte Je pâtisse !',
    html: (lien) =>
      p('Bonjour,') +
      p('Vous avez demandé à réinitialiser le mot de passe de votre compte Je pâtisse !') +
      boutonEmail(lien, 'Choisir un nouveau mot de passe') +
      p("Ce lien ne fonctionne qu'une seule fois, pendant une durée limitée.") +
      p("Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé."),
  },
  'changement-email': {
    texte: "Confirmez le changement d'adresse e-mail de votre compte Je pâtisse !",
    html: (lien) =>
      p('Bonjour,') +
      p("Une demande de changement d'adresse e-mail a été faite sur votre compte Je pâtisse !") +
      boutonEmail(lien, 'Confirmer cette adresse') +
      p("Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail."),
  },
};

/** Page HTML complète du modèle, à servir telle quelle à GoTrue. */
export function modeleGoTrue(modele: ModeleGoTrue, opts: { urlSite: string; photoSignature: string | null }): string {
  const c = CONTENUS[modele];
  return habillerEmail({
    texte: c.texte,
    contenuHtml: c.html(LIENS_GOTRUE[modele]),
    pied: 'obligatoire',
    urlSite: opts.urlSite,
    photoSignature: opts.photoSignature,
  }).html;
}

/**
 * `next` transporté par le paramètre `suite` d'une confirmation d'inscription
 * (le `{{ .RedirectTo }}` de GoTrue : `https://…/auth/callback?next=%2F…`).
 * `null` si absent ou illisible ; le chemin est revalidé par l'appelant.
 */
export function nextDepuisSuite(suite: string | null): string | null {
  if (!suite) return null;
  try {
    return new URL(suite).searchParams.get('next');
  } catch {
    return null;
  }
}
