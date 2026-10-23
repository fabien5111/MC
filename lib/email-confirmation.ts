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
