'use client';

// État partagé entre les déclencheurs « Planifier » / crayon d'édition (rangée
// d'actions et bandeau de contexte) et le panneau PlanWidget (positionné plus
// bas), pour reproduire la bascule bouton→panneau de recette.html sans
// imbriquer l'un dans l'autre. Deux modes : création (nouvelle entrée de
// planning) ou édition (modifie l'entrée de planning en cours).
import { createContext, useContext, useEffect, useState } from 'react';

type PlanCtxValue = { open: boolean; editMode: boolean; openCreate: () => void; openEdit: () => void; close: () => void };

const PlanCtx = createContext<PlanCtxValue | null>(null);

export function PlanProvider({
  children,
  autoOpen = false,
}: {
  children: React.ReactNode;
  // Ouvre le panneau au chargement (clic sur l'icône « calendrier » d'une
  // carte recette, avant même d'arriver sur la fiche) — même chemin que le
  // bouton « Planifier » (mode création), pour bénéficier du même
  // scrollIntoView dans PlanWidget.
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    if (autoOpen) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PlanCtx.Provider
      value={{
        open,
        editMode,
        openCreate: () => {
          setEditMode(false);
          setOpen(true);
        },
        openEdit: () => {
          setEditMode(true);
          setOpen(true);
        },
        close: () => setOpen(false),
      }}
    >
      {children}
    </PlanCtx.Provider>
  );
}

export function usePlanCtx(): PlanCtxValue {
  const ctx = useContext(PlanCtx);
  if (!ctx) throw new Error('usePlanCtx doit être utilisé dans un <PlanProvider>');
  return ctx;
}
