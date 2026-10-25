// Traduction des erreurs de GoTrue (Supabase Auth) — PUR, testé. Seule règle
// pour tous les écrans d'authentification (connexion, inscription, mot de
// passe, adresse e-mail) : GoTrue répond en anglais, et son texte remontait
// tel quel à l'écran (« New password should be different from the old
// password. »).
//
// Le CODE de l'erreur (`AuthError.code`, stable d'une version à l'autre) est
// lu d'abord ; le texte anglais n'est qu'un repli pour une version de GoTrue
// qui ne renverrait pas de code. Une erreur inconnue n'est jamais masquée : le
// texte d'origine reste entre parenthèses, pour le diagnostic.

/** Message d'un compte suspendu ou désactivé (la suite est rendue par `LoginForm`). */
export const COMPTE_BLOQUE = 'Ce compte est suspendu ou désactivé.';

const PAR_CODE: Record<string, string> = {
  same_password: 'Le nouveau mot de passe doit être différent de l’actuel.',
  weak_password: 'Ce mot de passe est trop faible : choisissez-en un plus long ou plus varié.',
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Confirmez votre adresse e-mail avant de vous connecter (lien envoyé à l’inscription).',
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  email_exists: 'Cette adresse e-mail est déjà utilisée par un autre compte.',
  email_address_invalid: 'Cette adresse e-mail n’est pas valide.',
  email_address_not_authorized: 'Cette adresse e-mail n’est pas autorisée.',
  user_banned: COMPTE_BLOQUE,
  over_email_send_rate_limit: 'Trop d’e-mails envoyés à cette adresse : réessayez dans quelques minutes.',
  over_request_rate_limit: 'Trop de tentatives : réessayez dans quelques minutes.',
  over_sms_send_rate_limit: 'Trop de tentatives : réessayez dans quelques minutes.',
  otp_expired: 'Ce lien a expiré ou a déjà servi : demandez-en un nouveau.',
  flow_state_expired: 'Ce lien a expiré : recommencez la démarche.',
  session_not_found: 'Votre session a expiré : reconnectez-vous.',
  session_expired: 'Votre session a expiré : reconnectez-vous.',
  reauthentication_needed: 'Pour des raisons de sécurité, reconnectez-vous avant de faire ce changement.',
  signup_disabled: 'Les inscriptions sont fermées pour le moment.',
  email_provider_disabled: 'La connexion par e-mail est désactivée pour le moment.',
  validation_failed: 'Les informations saisies ne sont pas valides.',
  user_not_found: 'Aucun compte ne correspond.',
};

/** Repli sur le texte anglais (GoTrue sans code, ou erreur côté client). */
const PAR_TEXTE: [RegExp, string][] = [
  [/should be different from the old password/i, PAR_CODE.same_password],
  [/^User already registered/i, PAR_CODE.user_already_exists],
  [/^Invalid login credentials/i, PAR_CODE.invalid_credentials],
  [/^Email not confirmed/i, PAR_CODE.email_not_confirmed],
  [/^User is banned/i, COMPTE_BLOQUE],
  [/Password should be at least (\d+) characters/i, 'Le mot de passe doit contenir au moins $1 caractères.'],
  [/^Password should contain/i, PAR_CODE.weak_password],
  [/email address .* already been registered/i, PAR_CODE.email_exists],
  [/rate limit exceeded/i, PAR_CODE.over_request_rate_limit],
  [/only request this after (\d+) seconds?/i, 'Par sécurité, patientez $1 secondes avant de réessayer.'],
  [/(token|link) has expired or is invalid|otp_expired/i, PAR_CODE.otp_expired],
  [/Auth session missing/i, PAR_CODE.session_not_found],
  [/is invalid$/i, PAR_CODE.email_address_invalid],
  [/Failed to fetch|NetworkError|Load failed/i, 'Connexion au serveur impossible : vérifiez votre réseau et réessayez.'],
];

/** Erreur de GoTrue → message français affichable. */
export function traduireErreurAuth(erreur: { message?: string; code?: string | null } | string | null | undefined): string {
  if (!erreur) return 'Une erreur est survenue.';
  const message = (typeof erreur === 'string' ? erreur : erreur.message ?? '').trim();
  const code = typeof erreur === 'string' ? undefined : erreur.code ?? undefined;
  if (code && PAR_CODE[code]) return PAR_CODE[code];
  for (const [motif, francais] of PAR_TEXTE) {
    const m = message.match(motif);
    if (m) return francais.replace('$1', m[1] ?? '');
  }
  return message ? `Une erreur est survenue (${message}).` : 'Une erreur est survenue.';
}

/** Résultat d'un appel GoTrue → forme attendue par `useMutation`, erreur traduite. */
export function avecErreurTraduite(res: { error: { message?: string; code?: string | null } | null }): {
  error: { message: string } | null;
} {
  return { error: res.error ? { message: traduireErreurAuth(res.error) } : null };
}
