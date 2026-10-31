// Hauteur d'une zone de texte calée sur son contenu — jamais de défilement
// interne, y compris pour un texte déjà rempli à l'ouverture (import, édition).
// Fonction simple, pas un hook d'état : utilisable en `ref` comme dans un
// gestionnaire `onChange`, y compris dans les `.map()` d'étapes ou
// d'ingrédients où un hook ne serait pas légal (ordre d'appel instable).
//
// Seule copie du site : `CreerForm`, `StepEditorCard`, `ComponentResolver`,
// `HelpBlocksManager` et `RelectureEditor` s'y réfèrent.
import { useEffect } from 'react';

const MARQUE = 'data-auto-grow';

export function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.setAttribute(MARQUE, '');
  el.style.height = 'auto';
  // `scrollHeight` ne compte pas la bordure : sans elle, un champ en
  // `border-box` restait 2 px trop court (donc désaligné de ses voisins).
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

/**
 * Recalcule la hauteur de toutes les zones passées par `autoGrow` quand la
 * largeur de la fenêtre change (rotation du téléphone, redimensionnement) : le
 * retour à la ligne se déplace, la hauteur calculée à la frappe devient fausse.
 * À monter une fois par écran d'édition.
 */
export function useAutoGrowOnResize() {
  useEffect(() => {
    let largeur = window.innerWidth;
    function surRedimensionnement() {
      if (window.innerWidth === largeur) return; // hauteur seule (clavier mobile) : rien à refaire
      largeur = window.innerWidth;
      document.querySelectorAll<HTMLTextAreaElement>(`textarea[${MARQUE}]`).forEach((el) => autoGrow(el));
    }
    window.addEventListener('resize', surRedimensionnement);
    return () => window.removeEventListener('resize', surRedimensionnement);
  }, []);
}
