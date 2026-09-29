// Conditions générales de vente — repères partagés entre la page `/cgv`, la
// fenêtre de souscription et les routes de paiement.
//
// **La version est une donnée de preuve, pas un libellé.** Elle est posée en
// métadonnée de l'abonnement Stripe à chaque acceptation (`cgv_version`) :
// c'est ce qui permet, en cas de litige, de savoir QUEL texte le membre a
// accepté. Toute modification de fond du texte de `app/cgv/page.tsx` doit
// donc s'accompagner d'une nouvelle valeur ici — sans quoi deux textes
// différents porteraient la même version.
//
// Fichier pur (aucun import serveur) : il est lu par la fenêtre de
// souscription, un Client Component.

/** Version en vigueur — la date de mise à jour du texte, au format ISO. */
export const CGV_VERSION = '2026-09-27';

/** Date de mise à jour, telle qu'affichée en tête de la page. */
export const CGV_DATE_AFFICHEE = '27 septembre 2026';

/** Chemin public de la page. */
export const CGV_CHEMIN = '/cgv';

/** Délai légal de rétractation (art. L.221-18 du Code de la consommation). */
export const DELAI_RETRACTATION_JOURS = 14;

/**
 * La version transmise par le navigateur est-elle celle en vigueur ?
 *
 * Revérifiée côté serveur : un onglet resté ouvert sur une ancienne version
 * de la fenêtre de souscription ne doit pas faire tracer l'acceptation d'un
 * texte que le membre n'a pas eu sous les yeux.
 */
export function cgvVersionValide(version: unknown): boolean {
  return version === CGV_VERSION;
}
