'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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

// `capHref` (JEP-6) : le bouton ouvre alors un petit menu — « Fiche complète »
// (l'impression de toujours) ou « Carnet CAP », la page qui n'imprime que les
// ingrédients et leurs quantités, seul contenu autorisé à l'examen.
export function PrintButton({ capHref }: { capHref?: string } = {}) {
  usePrintDetailsExpansion();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', fermer);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);

  const bouton = 'flex items-center justify-center w-7 h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors';
  if (!capHref) {
    return (
      <button type="button" onClick={() => window.print()} aria-label="Imprimer" title="Imprimer" className={bouton}>
        <span className="material-symbols-outlined text-[16px]">print</span>
      </button>
    );
  }
  const entree = 'flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-surface-container-low';
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-label="Imprimer"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        title="Imprimer"
        className={bouton}
      >
        <span className="material-symbols-outlined text-[16px]">print</span>
      </button>
      {ouvert && (
        <span
          role="menu"
          className="absolute right-0 top-9 z-40 flex w-64 flex-col overflow-hidden rounded-lg border border-outline-variant bg-white py-1 text-on-surface shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOuvert(false);
              window.print();
            }}
            className={entree}
          >
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
              description
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-primary">Fiche complète</span>
              <span className="text-[12px] text-on-surface-variant">Ingrédients, étapes et conseils</span>
            </span>
          </button>
          <Link href={capHref} prefetch={false} role="menuitem" onClick={() => setOuvert(false)} className={entree}>
            <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
              school
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-primary">Carnet CAP</span>
              <span className="text-[12px] text-on-surface-variant">Ingrédients et quantités seuls, format d’examen</span>
            </span>
          </Link>
        </span>
      )}
    </span>
  );
}
