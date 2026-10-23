// Confirmation d'adresse e-mail d'un compte (JEP-262) — logique pure.
//
// `profiles.status` ne dit rien de la confirmation : le trigger
// `handle_new_user` crée le profil dès l'inscription, avant que le membre ait
// cliqué le lien reçu. La seule vérité est `auth.users.email_confirmed_at`,
// lisible uniquement par l'API d'administration GoTrue
// (`lib/email-confirmation-data.ts`).

/** Forme minimale d'un utilisateur GoTrue, de quoi décider (sans dépendre du SDK). */
export type UtilisateurAuth = { id: string; email_confirmed_at?: string | null };

/** `true` / `false` d'après `email_confirmed_at` ; `null` quand le compte est inconnu de GoTrue. */
export function confirmationDe(utilisateur: UtilisateurAuth | null | undefined): boolean | null {
  if (!utilisateur) return null;
  return !!utilisateur.email_confirmed_at;
}

/** Table `id → confirmé` à partir d'une liste d'utilisateurs GoTrue. */
export function confirmationsParId(utilisateurs: UtilisateurAuth[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const u of utilisateurs) map.set(u.id, !!u.email_confirmed_at);
  return map;
}

/** Valeur stockée dans `member_moderation_events.action` pour un forçage manuel. */
export const ACTION_CONFIRMATION_FORCEE = 'confirmation_email';

/** Motif écrit au journal : le geste n'en demande pas, la trace doit pourtant se lire seule. */
export const MOTIF_CONFIRMATION_FORCEE = "Confirmation manuelle de l'adresse e-mail par un administrateur";

// ── Relance du mail de confirmation (JEP-262, lot 2) ────────────────────────

/** Valeur stockée dans `member_moderation_events.action` pour une relance. */
export const ACTION_RELANCE_CONFIRMATION = 'relance_confirmation';

/** Une relance par membre et par 5 minutes : pas d'envoi en boucle par clics répétés. */
export const DELAI_RELANCE_MS = 5 * 60 * 1000;

export const MOTIF_RELANCE_CONFIRMATION = "Renvoi du mail de confirmation de l'adresse e-mail par un administrateur";

export type VerdictRelance = { ok: true } | { ok: false; attenteSecondes: number };

/**
 * Le délai minimum est-il écoulé depuis la dernière relance de CE membre ?
 * `derniere` : horodatage ISO de la dernière ligne de journal, ou `null`.
 * Une date illisible ou dans le futur ne bloque pas plus longtemps que le
 * délai lui-même (le plafond protège d'une horloge déréglée).
 */
export function relanceAutorisee(derniere: string | null, maintenant: Date = new Date()): VerdictRelance {
  if (!derniere) return { ok: true };
  const t = Date.parse(derniere);
  if (Number.isNaN(t)) return { ok: true };
  const ecoule = maintenant.getTime() - t;
  if (ecoule >= DELAI_RELANCE_MS) return { ok: true };
  const restant = Math.min(DELAI_RELANCE_MS, DELAI_RELANCE_MS - ecoule);
  return { ok: false, attenteSecondes: Math.ceil(restant / 1000) };
}

/** « 4 min » / « 45 s » : durée d'attente lisible pour le message de refus. */
export function libelleAttente(secondes: number): string {
  if (secondes >= 90) return `${Math.ceil(secondes / 60)} min`;
  return `${Math.max(1, secondes)} s`;
}

// ── Mail de confirmation composé par l'application (JEP-262, lot 2) ─────────

/**
 * Origine d'où l'admin agit (en-tête `Origin` de sa requête), ou `null` si elle
 * n'est pas une adresse http(s) lisible. Le lien du mail ramène sur ce domaine
 * (aperçu, `dev`, `www`). Seul un admin vérifié atteint la route : l'en-tête
 * n'ouvre pas de redirection à un tiers.
 */
export function origineValide(brut: string | null | undefined): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Lien de confirmation : un jeton à usage unique que `/auth/callback` échange
 * par `verifyOtp` (aucune PKCE, aucun état local — il s'ouvre depuis n'importe
 * quel client mail). `type` est celui que GoTrue a rendu avec le jeton.
 */
export function lienConfirmation(origine: string, jeton: string, type: string): string {
  return `${origine}/auth/callback?token_hash=${encodeURIComponent(jeton)}&type=${encodeURIComponent(type)}&next=%2F`;
}

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sujet, texte et HTML du mail de confirmation. `pseudo` : facultatif, pour la formule d'appel. */
export function composerEmailConfirmation({ lien, pseudo }: { lien: string; pseudo?: string | null }) {
  const salutation = pseudo?.trim() ? `Bonjour ${pseudo.trim()},` : 'Bonjour,';
  const intro = 'Votre compte Je pâtisse ! est créé : il reste à confirmer votre adresse e-mail.';
  const bouton = 'Confirmer mon adresse e-mail';
  const duree =
    "Ce lien ne fonctionne qu'une seule fois et pendant une durée limitée ; il vous connecte directement à votre compte.";
  const ignorer = "Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement ce message.";
  const signature = "À bientôt,\nL'équipe Je pâtisse !";

  const texte = [salutation, intro, `${bouton} :\n${lien}`, duree, ignorer, signature].join('\n\n');
  const html = [
    `<p>${echapper(salutation)}</p>`,
    `<p>${echapper(intro)}</p>`,
    `<p><a href="${echapper(lien)}">${bouton}</a></p>`,
    `<p>Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>${echapper(lien)}</p>`,
    `<p>${echapper(duree)}</p>`,
    `<p>${echapper(ignorer)}</p>`,
    `<p>${echapper(signature).replace(/\n/g, '<br>')}</p>`,
  ].join('');
  return { sujet: 'Confirmez votre adresse e-mail — Je pâtisse !', texte, html };
}
