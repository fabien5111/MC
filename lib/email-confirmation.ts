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
