'use client';

// Gestes rapides de la feuille « Que voulez-vous faire ? » (fiche recette,
// mobile) : Favori, Listes, Partager, Imprimer. Ils ACTIONNENT les boutons déjà
// présents sous le titre de la fiche (repérés par `data-action-rapide`) plutôt
// que d'en recoder le comportement : état du cœur, fenêtre des listes, partage,
// menu d'impression avec le carnet CAP restent ceux d'un seul composant chacun.
//
// Le bouton est d'abord ramené à l'écran quand son geste s'ouvre SOUS lui (menu
// d'impression) ou s'y lit (« Lien copié ») ; le favori bascule sur place.
// Deux images d'attente : la feuille vient de se fermer, et c'est à son
// démontage que le défilement de la page est rendu.

export type ActionRapide = 'favori' | 'listes' | 'partager' | 'imprimer';

function cible(cle: ActionRapide): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-action-rapide="${cle}"]`);
}

/** Le bouton existe-t-il sur la page (Listes : membre connecté seulement) ? */
export function actionRapideDisponible(cle: ActionRapide): boolean {
  return typeof document !== 'undefined' && cible(cle) !== null;
}

/** État d'un bouton à deux états (favori), lu sur `aria-pressed`. */
export function actionRapideActive(cle: ActionRapide): boolean {
  return cible(cle)?.getAttribute('aria-pressed') === 'true';
}

export function declencherActionRapide(cle: ActionRapide) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = cible(cle);
      if (!el) return;
      if (cle !== 'favori') el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      el.click();
    }),
  );
}
