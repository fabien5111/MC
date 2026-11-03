// Réordonnancement au doigt ou au stylet des listes à poignée (étapes,
// sous-étapes, ustensiles…).
//
// Le glisser-déposer HTML natif (`draggable` + `onDragStart`) reste utilisé à la
// souris, mais il ne marche pas au toucher sur iPadOS : appui long obligatoire,
// concurrence avec le défilement, poignée de 20 px difficile à saisir. Ces
// fonctions ajoutent un glissement par événements `pointer` sur la poignée
// (`touch-action: none`, donc le doigt ne fait pas défiler la page) ; la souris
// n'est pas concernée (`pointerType === 'mouse'`).
//
// Aucun état React : la ligne survolée est repérée par un attribut de DOM
// (`data-reordo-cible`, style dans globals.css), seul le dépôt appelle `onMove`.
import type { PointerEvent as ReactPointerEvent } from 'react';

type Options = {
  // Nom de la liste : deux listes imbriquées (étapes / sous-étapes) ou voisines
  // doivent avoir des noms différents, pour ne pas se déposer l'une dans l'autre.
  groupe: string;
  index: number;
  onMove: (from: number, to: number) => void;
};

const ZONE_DEFILEMENT = 80;
const VITESSE_DEFILEMENT = 14;

// Attributs de la LIGNE déplaçable (la cible du dépôt).
export function ligneReordonnable(groupe: string, index: number) {
  return { 'data-reordo-groupe': groupe, 'data-reordo-index': String(index) };
}

// Props de la POIGNÉE, à répandre à côté des props `draggable` existants.
export function poigneeTactile({ groupe, index, onMove }: Options) {
  return {
    style: { touchAction: 'none' } as const,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse' || (e.pointerType === 'touch' && !e.isPrimary)) return;
      const poignee = e.currentTarget;
      const ligneSource = poignee.closest<HTMLElement>(`[data-reordo-groupe="${groupe}"]`);
      // Coupe le glisser natif (iOS le déclencherait après un appui long).
      const etaitDeplacable = poignee.draggable;
      poignee.draggable = false;
      try {
        poignee.setPointerCapture(e.pointerId);
      } catch {
        // Sans capture, les événements suivent quand même le doigt.
      }
      ligneSource?.setAttribute('data-reordo-source', '');

      let cible: HTMLElement | null = null;
      let y = e.clientY;
      let enCours = true;

      const viser = (x: number, yy: number) => {
        const sous = document.elementFromPoint(x, yy);
        const ligne = sous?.closest<HTMLElement>(`[data-reordo-groupe="${groupe}"]`) ?? null;
        if (ligne === cible) return;
        cible?.removeAttribute('data-reordo-cible');
        cible = ligne && ligne !== ligneSource ? ligne : null;
        cible?.setAttribute('data-reordo-cible', '');
      };

      // Défilement automatique quand le doigt approche du bord de l'écran.
      const defiler = () => {
        if (!enCours) return;
        const h = window.visualViewport?.height ?? window.innerHeight;
        if (y < ZONE_DEFILEMENT) window.scrollBy(0, -VITESSE_DEFILEMENT);
        else if (y > h - ZONE_DEFILEMENT) window.scrollBy(0, VITESSE_DEFILEMENT);
        requestAnimationFrame(defiler);
      };
      requestAnimationFrame(defiler);

      const bouge = (ev: PointerEvent) => {
        y = ev.clientY;
        viser(ev.clientX, ev.clientY);
      };
      const fin = (ev: PointerEvent) => {
        enCours = false;
        poignee.removeEventListener('pointermove', bouge);
        poignee.removeEventListener('pointerup', fin);
        poignee.removeEventListener('pointercancel', fin);
        poignee.draggable = etaitDeplacable;
        ligneSource?.removeAttribute('data-reordo-source');
        const vers = cible ? Number(cible.getAttribute('data-reordo-index')) : NaN;
        cible?.removeAttribute('data-reordo-cible');
        cible = null;
        if (ev.type === 'pointerup' && Number.isInteger(vers) && vers !== index) onMove(index, vers);
      };
      poignee.addEventListener('pointermove', bouge);
      poignee.addEventListener('pointerup', fin);
      poignee.addEventListener('pointercancel', fin);
    },
  };
}
