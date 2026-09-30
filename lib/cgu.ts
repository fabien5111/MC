// Conditions générales d'utilisation — repères partagés entre la page `/cgu`,
// le formulaire d'inscription et l'écran `/choix-pseudo` (JEP-129).
//
// Même doctrine que `lib/cgv.ts` : **la version est une donnée de preuve, pas
// un libellé.** Elle est posée dans les métadonnées du compte à l'acceptation
// (`cgu_version`, `cgu_accepted_at`) — c'est ce qui permet de savoir QUEL
// texte le membre a accepté. Toute modification de fond de `app/cgu/page.tsx`
// impose donc une nouvelle valeur ici.
//
// Fichier pur (aucun import serveur) : il est lu par `LoginForm` et
// `PseudoChooser`, deux Client Components.

/** Version en vigueur — la date de mise à jour du texte, au format ISO. */
export const CGU_VERSION = '2026-09-30';

/** Date de mise à jour, telle qu'affichée en tête de la page. */
export const CGU_DATE_AFFICHEE = '30 septembre 2026';

/** Chemin public de la page. */
export const CGU_CHEMIN = '/cgu';

/**
 * La version transmise par le navigateur est-elle celle en vigueur ?
 *
 * Revérifiée côté serveur (`/api/pseudo/choisir`) : un onglet resté ouvert
 * sur une ancienne version ne doit pas faire tracer l'acceptation d'un texte
 * que le membre n'a pas eu sous les yeux.
 */
export function cguVersionValide(version: unknown): boolean {
  return version === CGU_VERSION;
}

/** Métadonnées de compte qui tracent l'acceptation. */
export function metadonneesAcceptationCgu(accepteLe: string): { cgu_version: string; cgu_accepted_at: string } {
  return { cgu_version: CGU_VERSION, cgu_accepted_at: accepteLe };
}
