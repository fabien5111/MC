'use client';

// État partagé entre le bouton « Planifier » (rangée d'actions) et le
// panneau PlanWidget (positionné plus bas), pour reproduire la bascule
// bouton→panneau de recette.html sans imbriquer l'un dans l'autre.
import { createContext, useContext, useState } from 'react';

type PlanCtxValue = { open: boolean; toggle: () => void; close: () => void };

const PlanCtx = createContext<PlanCtxValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <PlanCtx.Provider value={{ open, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }}>
      {children}
    </PlanCtx.Provider>
  );
}

export function usePlanCtx(): PlanCtxValue {
  const ctx = useContext(PlanCtx);
  if (!ctx) throw new Error('usePlanCtx doit être utilisé dans un <PlanProvider>');
  return ctx;
}
