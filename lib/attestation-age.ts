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

/** Message d'aide affiché si l'on tente de valider sans cocher la case. */
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
