'use client';

// Actions de l'écran courant, déclarées pour le bouton central de la barre
// basse (proposition D de l'ergonomie mobile, étape 2).
//
// Un écran qui a des actions (fiche recette, fournée, /creer, relecture,
// projet) les déclare ici par `RecipeToc` ; le bouton central les lit et
// devient « Actions ». Sans déclaration, il propose « Créer ». La barre basse
// n'a donc rien à savoir de chaque écran, et un écran n'a rien à savoir de la
// barre : ils ne partagent que ce magasin.
//
// Magasin de module + `useSyncExternalStore` plutôt qu'un contexte React : la
// barre basse est rendue par le serveur, page par page, hors de tout
// fournisseur commun à l'écran qui déclare. Une seule déclaration à la fois
// (un écran monte un seul sommaire) ; la plus récente l'emporte, et seule
// celle qui l'a posée peut la retirer — un démontage tardif de l'écran
// précédent n'efface pas celle du suivant.
import { useSyncExternalStore } from 'react';
import type { TocAction } from '@/components/recipe/RecipeToc';

type Declaration = { proprietaire: symbol; actions: TocAction[] };

let courante: Declaration | null = null;
const abonnes = new Set<() => void>();

function prevenir() {
  abonnes.forEach((f) => f());
}

export function declarerActions(proprietaire: symbol, actions: TocAction[]) {
  courante = actions.length > 0 ? { proprietaire, actions } : null;
  prevenir();
}

export function retirerActions(proprietaire: symbol) {
  if (courante?.proprietaire !== proprietaire) return;
  courante = null;
  prevenir();
}

function sAbonner(f: () => void) {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
}

/** Actions déclarées par l'écran courant, ou `null`. */
export function useActionsEcran(): TocAction[] | null {
  return useSyncExternalStore(
    sAbonner,
    () => courante?.actions ?? null,
    // Rendu serveur : aucune déclaration (le bouton s'y rend en « Créer »,
    // puis bascule à l'hydratation si l'écran en déclare).
    () => null,
  );
}
