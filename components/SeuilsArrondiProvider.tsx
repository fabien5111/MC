'use client';

// Seuils d'arrondi à l'unité par unité de mesure (JEP-389, `units.round_from`),
// mis à disposition des écrans qui CALCULENT des quantités (ajustement d'une
// fournée, mode projet…) sans faire passer le référentiel en props. Chargés une
// fois au layout depuis le cache des référentiels. Une Map ne traverse pas la
// frontière serveur → client : on reçoit des paires, reconstruites ici.
import { createContext, useContext, useMemo } from 'react';
import type { SeuilsArrondi } from '@/lib/arrondi-unite';

const AUCUN: SeuilsArrondi = new Map();
const Ctx = createContext<SeuilsArrondi>(AUCUN);

export function SeuilsArrondiProvider({
  paires,
  children,
}: {
  paires: [string, number][];
  children: React.ReactNode;
}) {
  const seuils = useMemo<SeuilsArrondi>(() => new Map(paires), [paires]);
  return <Ctx.Provider value={seuils}>{children}</Ctx.Provider>;
}

export function useSeuilsArrondi(): SeuilsArrondi {
  return useContext(Ctx);
}
