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
// pendant le refus. Un refus survenu dans la même page pose le drapeau
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
};

export type NomEvenementAudience = keyof EvenementsAudience;

type Gtag = (commande: 'event', nom: string, params?: Record<string, unknown>) => void;

export function trackEvent<N extends NomEvenementAudience>(
  nom: N,
  ...params: EvenementsAudience[N] extends null ? [] : [EvenementsAudience[N]]
): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as Record<string, unknown>;
  if (typeof w.gtag !== 'function') return;
  if (GA_ID && w[`ga-disable-${GA_ID}`] === true) return;
  try {
    (w.gtag as Gtag)('event', nom, params[0] as Record<string, unknown> | undefined);
  } catch {
    // La mesure ne doit jamais faire échouer le geste de l'utilisateur.
  }
}
