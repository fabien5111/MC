'use client';

// Picto de planification affiché à côté de la « Durée totale » du Bloc
// technique — accès rapide en plus du rail d'actions (RecetteToc), qui passe
// en tiroir sous 700 px et n'est donc pas toujours visible sans un clic
// supplémentaire. Reprend la même bascule ouverture/fermeture que le bouton
// « Planifier » du rail pour partager un seul état de panneau via
// PlanContext plutôt que d'ajouter un second point de vérité.
import { usePlanCtx } from '@/components/recipe/PlanContext';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';

export function PlanTimeBadge() {
  const { open, editMode, openCreate, close } = usePlanCtx();

  return (
    <button
      type="button"
      onClick={() => (open && !editMode ? close() : openCreate())}
      title="Planifier cette recette"
      className="no-print inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 shadow hover:scale-110 transition-transform"
    >
      <PlanningIcon discFill={DISC.surfaceContainerLow} className="text-primary" />
    </button>
  );
}
