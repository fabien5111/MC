'use client';

// Fermeture d'une fenêtre par un clic sur son voile (JEP-403). Le clic doit
// COMMENCER et FINIR sur le voile : une sélection de texte commencée dans un
// champ et relâchée au-dehors produit un `click` sur le voile, qui fermerait
// la fenêtre en pleine saisie. À ne pas brancher sur une confirmation
// destructrice (`components/Dialog.tsx`) : elle garde une sortie explicite.
import { useRef } from 'react';

export function useVoile(fermer: () => void, inactif = false) {
  const pression = useRef(false);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      pression.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      const surVoile = pression.current && e.target === e.currentTarget;
      pression.current = false;
      if (surVoile && !inactif) fermer();
    },
  };
}
