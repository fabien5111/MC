// Attestation d'âge à la création du compte (JEP-34) — repères partagés entre
// le formulaire d'inscription (`LoginForm`), l'écran `/choix-pseudo`
// (`PseudoChooser`, première connexion Google) et `/api/pseudo/choisir`.
//
// Même doctrine que `lib/cgu.ts` : **la version est une donnée de preuve.**
// Elle est posée dans les métadonnées du compte avec l'horodatage
// (`age_attestation_version`, `age_attestation_at`) — c'est ce qui permet de
// savoir QUELLE phrase le membre a certifiée. Toute modification du texte
// ci-dessous impose donc une nouvelle version.
//
// Le seuil est celui des CGU (« 15 ans ou plus », `app/cgu/page.tsx`) : la
// spec du ticket disait « plus de 15 ans », ce qui excluait littéralement une
// personne de 15 ans tout juste — corrigé à la demande, aligné sur les CGU.
//
// Fichier pur (aucun import serveur) : il est lu par deux Client Components.

/** Version en vigueur du texte — la date de sa rédaction, au format ISO. */
export const AGE_ATTESTATION_VERSION = '2026-10-01';

/** Texte exact affiché à côté de la case. */
export const AGE_ATTESTATION_TEXTE =
  "Je certifie avoir 15 ans ou plus, ou disposer de l'accord de mon représentant légal pour créer ce compte.";

/** Message si l'envoi est tenté sans la case (bouton désactivé : filet seulement). */
export const AGE_ATTESTATION_ERREUR = 'Vous devez confirmer cette condition pour continuer.';

/**
 * La version transmise par le navigateur est-elle celle en vigueur ?
 *
 * Revérifiée côté serveur (`/api/pseudo/choisir`) : une case cochée seulement
 * dans le navigateur ne prouve rien, et un onglet resté ouvert sur une
 * ancienne phrase ne doit pas faire tracer un texte que le membre n'a pas lu.
 */
export function attestationAgeVersionValide(version: unknown): boolean {
  return version === AGE_ATTESTATION_VERSION;
}

/** Métadonnées de compte qui tracent l'attestation. */
export function metadonneesAttestationAge(atteste: string): {
  age_attestation_version: string;
  age_attestation_at: string;
} {
  return { age_attestation_version: AGE_ATTESTATION_VERSION, age_attestation_at: atteste };
}

/**
 * Les métadonnées d'un compte portent-elles l'attestation en vigueur ? (JEP-270)
 *
 * Garde du callback d'inscription par e-mail : `supabase.auth.signUp()` est
 * appelable depuis la console du navigateur, sans passer par la case de
 * `LoginForm`. Sans cette garde, un tel compte, une fois son adresse confirmée,
 * obtenait son pseudo sans jamais avoir déclaré son âge. Sans attestation en
 * version valide, le membre est renvoyé sur `/choix-pseudo`, qui l'exige.
 */
export function attestationAgeDansMetadonnees(meta: unknown): boolean {
  const m = (meta ?? {}) as { age_attestation_version?: unknown; age_attestation_at?: unknown };
  return (
    attestationAgeVersionValide(m.age_attestation_version) &&
    typeof m.age_attestation_at === 'string' &&
    !Number.isNaN(Date.parse(m.age_attestation_at))
  );
}

/**
 * Date de déclaration à inscrire sur le profil : celle des métadonnées, jamais
 * postérieure à `maintenant` (l'horodatage vient du navigateur) ; à défaut
 * `maintenant`. Pure, pour être testée.
 */
export function dateAttestationAge(meta: unknown, maintenant: Date): string {
  const brut = (meta as { age_attestation_at?: unknown } | null | undefined)?.age_attestation_at;
  const t = typeof brut === 'string' ? Date.parse(brut) : NaN;
  if (Number.isNaN(t) || t > maintenant.getTime()) return maintenant.toISOString();
  return new Date(t).toISOString();
}
