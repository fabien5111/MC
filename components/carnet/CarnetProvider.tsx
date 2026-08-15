'use client';

// Transition partagée entre CarnetToolbar (qui la déclenche, recherche
// débouncée et tri) et CarnetContent (qui l'affiche via LoadingOverlay) —
// même motif que SearchProvider/SearchResults pour la recherche avancée :
// CarnetToolbar navigue par `router.replace()` depuis un composant distinct
// de celui qui rend la grille, donc son `useTransition` local ne peut pas
// être lu ailleurs sans être remonté.
import { createContext, useContext, useTransition, type ReactNode, type TransitionStartFunction } from 'react';

type CarnetContextValue = {
  pending: boolean;
  startTransition: TransitionStartFunction;
};

const CarnetContext = createContext<CarnetContextValue | null>(null);

export function useCarnetTransition(): CarnetContextValue {
  const ctx = useContext(CarnetContext);
  if (!ctx) throw new Error('useCarnetTransition doit être utilisé dans <CarnetProvider>');
  return ctx;
}

export function CarnetProvider({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <CarnetContext.Provider value={{ pending, startTransition }}>{children}</CarnetContext.Provider>;
}
