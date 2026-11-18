'use client';

import { useEffect, useState } from 'react';

// Flèches « avant / après » posées sur une photo d'une grille réordonnable
// (étapes d'un projet, d'une fournée) : le glisser-déposer ne se fait pas au
// doigt, ces flèches sont le geste du téléphone — et du clavier. Placées au
// bas de l'emplacement, à côté de l'`ImageSlot` (jamais dedans : un clic ne
// doit pas ouvrir le sélecteur de fichiers). Affichées sur appareil tactile
// seulement : à la souris, le glisser-déposer suffit, comme dans `/creer`.
export function BoutonsOrdrePhoto({
  index,
  total,
  onDeplacer,
}: {
  index: number;
  total: number;
  /** -1 : vers le début, +1 : vers la fin. */
  onDeplacer: (delta: -1 | 1) => void;
}) {
  const [tactile, setTactile] = useState(false);
  useEffect(() => {
    try {
      setTactile(window.matchMedia('(pointer: coarse)').matches);
    } catch {
      setTactile(false);
    }
  }, []);
  if (total < 2 || !tactile) return null;
  const classes =
    'flex h-8 w-8 items-center justify-center rounded-full bg-surface/90 text-on-surface shadow-md hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-30 disabled:hover:bg-surface/90 disabled:hover:text-on-surface';
  return (
    <div className="no-print absolute bottom-2 left-1/2 z-30 flex -translate-x-1/2 gap-2" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={index <= 0}
        onClick={() => onDeplacer(-1)}
        title="Déplacer avant"
        aria-label="Déplacer cette photo avant"
        className={classes}
      >
        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
      </button>
      <button
        type="button"
        disabled={index >= total - 1}
        onClick={() => onDeplacer(1)}
        title="Déplacer après"
        aria-label="Déplacer cette photo après"
        className={classes}
      >
        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
      </button>
    </div>
  );
}
