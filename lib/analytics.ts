// Événements d'usage Google Analytics 4 (JEP-89, lot 2).
//
// Une seule porte d'entrée, `trackEvent`, typée par une liste FERMÉE
// d'événements : un nom ou un paramètre libre est impossible à écrire, donc
// aucune donnée personnelle ne peut y glisser par inadvertance. Jamais d'e-mail,
// de pseudo, de titre saisi, de texte d'avis ni d'identifiant de membre —
// l'identifiant d'une recette est admis. Ajouter un événement = l'ajouter ici,
// puis l'inscrire dans la liste du ticket JEP-89.
//
// Client uniquement. Ne fait rien tant que `window.gtag` n'existe pas, c'est-à-
// dire tant que le visiteur n'a pas accepté (le script n'est chargé qu'après
// « Accepter », cf. components/CookieConsent.tsx) : aucun appel ne part avant
// le choix, et aucune file d'attente ne rejoue après coup un événement émis
// pendant le refus (seule exception bornée : `trackEventQuandPret`, plus bas,
// qui laisse à GA le temps de se charger après une redirection). Un refus survenu dans la même page pose le drapeau
// `ga-disable-<ID>`, que GA respecte — on le relit ici plutôt que de pousser
// dans une `dataLayer` qui serait ignorée.
//
// Les chiffres sous-estiment donc l'usage réel : seuls comptent les visiteurs
// consentants.
import { GA_ID } from '@/lib/consent';

/** Événements autorisés et forme exacte de leurs paramètres (`null` : aucun). */
export type EvenementsAudience = {
  /** Ajustement appliqué à une fournée (quantité, moule, ingrédient ou IA). */
  ajuster_recette: { mode: 'quantite' | 'moule' | 'ingredient' | 'ia' };
  ajouter_favori: { recipe_id: string };
  retirer_favori: { recipe_id: string };
  creer_fournee: { recipe_id: string };
  terminer_fournee: null;
  generer_liste_courses: null;
  importer_recette: { source: 'texte' | 'photo' | 'pdf' };
  /** Compte dont l'inscription vient de se terminer (cf. lib/inscription.ts). */
  sign_up: { method: 'email' | 'google' };
};

export type NomEvenementAudience = keyof EvenementsAudience;

type Gtag = (commande: 'event', nom: string, params?: Record<string, unknown>) => void;

type ParamsDe<N extends NomEvenementAudience> = EvenementsAudience[N] extends null ? [] : [EvenementsAudience[N]];

/**
 * - `envoye` : l'appel est parti ;
 * - `absent` : GA n'est pas (encore) chargé, un nouvel essai peut réussir ;
 * - `refuse` : plus rien ne partira dans cette page (pas de navigateur, ou
 *   accord retiré).
 */
type Envoi = 'envoye' | 'absent' | 'refuse';

function envoyer(nom: string, params?: Record<string, unknown>): Envoi {
  if (typeof window === 'undefined') return 'refuse';
  const w = window as unknown as Record<string, unknown>;
  if (GA_ID && w[`ga-disable-${GA_ID}`] === true) return 'refuse';
  if (typeof w.gtag !== 'function') return 'absent';
  try {
    (w.gtag as Gtag)('event', nom, params);
  } catch {
    // La mesure ne doit jamais faire échouer le geste de l'utilisateur.
  }
  return 'envoye';
}

export function trackEvent<N extends NomEvenementAudience>(nom: N, ...params: ParamsDe<N>): void {
  envoyer(nom, params[0] as Record<string, unknown> | undefined);
}

/** Durée pendant laquelle `trackEventQuandPret` attend que GA se charge. */
export const DELAI_ATTENTE_GA_MS = 10_000;
const PAS_ATTENTE_GA_MS = 250;

/**
 * Comme `trackEvent`, mais patiente jusqu'à `DELAI_ATTENTE_GA_MS` que GA soit
 * chargé. Réservé au cas où l'événement est émis dès l'arrivée sur une page,
 * avant que le script de GA (chargé après l'hydratation, et seulement si le
 * visiteur a accepté) ait eu le temps de s'exécuter : c'est ce qui sépare
 * l'inscription par e-mail, qui revient d'une redirection, d'un favori, émis
 * longtemps après le chargement.
 *
 * Ne ressuscite rien : un refus (`ga-disable`) arrête l'attente, et sans accord
 * donné dans le délai l'événement est simplement perdu.
 */
export function trackEventQuandPret<N extends NomEvenementAudience>(nom: N, ...params: ParamsDe<N>): void {
  const debut = Date.now();
  const essayer = () => {
    if (envoyer(nom, params[0] as Record<string, unknown> | undefined) !== 'absent') return;
    if (Date.now() - debut >= DELAI_ATTENTE_GA_MS) return;
    setTimeout(essayer, PAS_ATTENTE_GA_MS);
  };
  essayer();
}
