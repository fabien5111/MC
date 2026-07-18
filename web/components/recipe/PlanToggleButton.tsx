'use client';

// Bouton pill « Planifier » de la rangée d'actions (porté de #btn-plan).
import { usePlanCtx } from '@/components/recipe/PlanContext';

export function PlanToggleButton() {
  const { toggle } = usePlanCtx();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors"
    >
      <span className="material-symbols-outlined text-[18px]">calendar_today</span> Planifier
    </button>
  );
}
