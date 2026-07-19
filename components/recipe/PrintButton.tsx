'use client';

// Bouton « Imprimer » (porté de recette.html).
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">print</span> Imprimer
    </button>
  );
}
