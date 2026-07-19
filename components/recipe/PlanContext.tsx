'use client';

// État partagé entre les déclencheurs « Planifier » / crayon d'édition (rangée
// d'actions et bandeau de contexte) et le panneau PlanWidget (positionné plus
// bas), pour reproduire la bascule bouton→panneau de recette.html sans
// imbriquer l'un dans l'autre. Deux modes : création (nouvelle entrée de
// planning) ou édition (modifie l'entrée de planning en cours).
import { createContext, useContext, useState } from 'react';

type PlanCtxValue = { open: boolean; editMode: boolean; openCreate: () => void; openEdit: () => void; close: () => void };

const PlanCtx = createContext<PlanCtxValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
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
