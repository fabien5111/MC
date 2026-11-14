'use client';

// Bouton rond « Lancer une fournée » de la rangée d'actions de la fiche
// recette (à gauche du cœur). Même geste et même picto que l'entrée du rail
// (RecetteToc) : il ouvre le panneau BatchWidget via PlanContext. Doit être
// monté sous <PlanProvider>. Gabarit identique aux autres boutons ronds
// (FavoriteButton, ShareButton, PrintButton).
import { usePlanCtx } from '@/components/recipe/PlanContext';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';

export function LancerFourneeButton() {
  const { open, editMode, openCreate, close } = usePlanCtx();
  return (
    <button
      type="button"
      onClick={() => (open && !editMode ? close() : openCreate())}
      aria-label="Lancer une fournée"
      title="Lancer une fournée"
      className="flex items-center justify-center w-10 h-10 sm:w-7 sm:h-7 border border-secondary rounded-full hover:bg-secondary-container transition-colors"
    >
      <PlanningIcon size={16} discFill={DISC.surface} />
    </button>
  );
}
