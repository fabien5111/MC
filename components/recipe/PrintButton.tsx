'use client';

import { useEffect } from 'react';

// Bouton « Imprimer » (porté de recette.html).
// Certains blocs (liste complète des ingrédients, conseils d'une étape) sont
// des <details> repliés par défaut : sans intervention, ils n'apparaissent
// jamais à l'impression. On les ouvre sur l'événement global `beforeprint` —
// déclenché aussi bien par ce bouton que par Ctrl+P ou le menu du
// navigateur — et on remet leur état initial sur `afterprint` (qui couvre
// aussi bien l'impression aboutie que son annulation).
function usePrintDetailsExpansion() {
  useEffect(() => {
    let toRestore: HTMLDetailsElement[] = [];
    const onBeforePrint = () => {
      toRestore = Array.from(document.querySelectorAll<HTMLDetailsElement>('main details:not([open])'));
      toRestore.forEach((d) => (d.open = true));
    };
    const onAfterPrint = () => {
      toRestore.forEach((d) => (d.open = false));
      toRestore = [];
    };
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);
}

export function PrintButton() {
  usePrintDetailsExpansion();
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 px-3 py-1 border border-secondary rounded-full font-label-md text-[10px] uppercase tracking-widest leading-none hover:bg-secondary-container transition-colors"
    >
      <span className="material-symbols-outlined text-[14px]">print</span> Imprimer
    </button>
  );
}
