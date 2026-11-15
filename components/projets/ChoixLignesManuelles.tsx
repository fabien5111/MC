'use client';

// Fenêtre « Appliquer ce coefficient aux lignes ajustées à la main ? » (JEP-403).
//
// Quand on applique un coefficient à une préparation qui porte des lignes
// retouchées à la main, chacune est proposée avec une case, cochée par défaut :
// cochée, la ligne repasse au calcul (origine × coefficient) ; décochée, elle
// garde sa quantité. Portée dans `document.body` : le conteneur flouté de la
// page piégerait un `fixed` dans son propre repère.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export type LigneManuelleChoix = {
  id: number;
  nom: string;
  commentaire: string | null;
  actuelle: string;
  // Quantité qu'aurait la ligne avec le nouveau coefficient.
  proposee: string;
  // Origine inconnue (ligne retouchée avant JEP-403) : la quantité actuelle
  // sert alors de base.
  origineConnue: boolean;
};

export default function ChoixLignesManuelles({
  coefficient,
  lignes,
  onConfirm,
  onCancel,
}: {
  coefficient: string;
  lignes: LigneManuelleChoix[];
  onConfirm: (incluses: Set<number>) => void;
  onCancel: () => void;
}) {
  const [cochees, setCochees] = useState<Set<number>>(() => new Set(lignes.map((l) => l.id)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  const basculer = (id: number) =>
    setCochees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Lignes ajustées à la main"
      className="fixed inset-0 z-[115] flex items-center justify-center bg-background/40 px-6 backdrop-blur-[2px]"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-lg">
        <p className="font-body-md text-body-md text-on-surface">
          Appliquer le coefficient ×{coefficient} aussi aux lignes ajustées à la main ?
        </p>
        <p className="mt-1 text-[12.5px] text-on-surface-variant">
          Cochée, une ligne repasse au calcul (quantité d’origine × coefficient). Décochée, elle garde sa quantité.
        </p>
        <ul className="mt-4 space-y-1">
          {lignes.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-surface-container">
                <input
                  type="checkbox"
                  checked={cochees.has(l.id)}
                  onChange={() => basculer(l.id)}
                  className="accent-primary"
                />
                <span className="min-w-0 flex-1 text-on-surface">
                  {l.nom}
                  {l.commentaire && <span className="italic text-on-surface-variant"> — {l.commentaire}</span>}
                  {!l.origineConnue && (
                    <span className="block text-[11.5px] italic text-on-surface-variant">
                      origine inconnue : la quantité actuelle sert de base
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-on-surface-variant">
                  {l.actuelle} → <span className="font-semibold text-on-surface">{l.proposee}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(cochees)}
            className="rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
