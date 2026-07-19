'use client';

// Crayon du bandeau « Recette planifiée » — ouvre PlanWidget en mode édition
// (porté de mcEditPlan de recette.html).
import { usePlanCtx } from '@/components/recipe/PlanContext';

export function PlanEditButton() {
  const { openEdit } = usePlanCtx();
  return (
    <button
      type="button"
      onClick={openEdit}
      title="Modifier la planification (date, quantité produite ou coefficient)"
      className="text-primary hover:opacity-70 shrink-0"
    >
      <span className="material-symbols-outlined text-[18px]">edit</span>
    </button>
  );
}
